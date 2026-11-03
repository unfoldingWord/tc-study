/**
 * The container of format 3 (`spec/container.md`): the segment file writer and its strict reader.
 *
 * ```text
 * 89 54 4C 50 | major | minor | kind | reserved | H (u32, big-endian) | header (CBOR map, H bytes) | body (clen bytes)
 * ```
 *
 * The header says what the file is without inflating anything. The body is the CBOR map `{h, t}` compressed with
 * deflate-raw; the id of the segment is the sha256 of the body before compression.
 *
 * {@link readSegment} rejects the whole file at the first defect, in this order (the codes are those of
 * `container.md`, "Errors"):
 *
 * 1. `E_MAGIC`, then `E_VERSION` (major is not 3; any minor is read), then `E_KIND` (not a segment). A file that ends
 *    before one of these bytes is `E_TRUNCATED`. The reserved byte is not checked.
 * 2. `E_LIMIT` if `H` is over 65 536, before the header bytes are read. `E_TRUNCATED` if fewer than `12 + H` bytes.
 * 3. `E_HEADER`: not a map, or `h`, `codec`, `clen`, `ulen` or `id` missing or of the wrong type. `E_LIMIT` for CBOR
 *    nested deeper than `MAX_DEPTH`.
 * 4. `E_LIMIT` if `clen` or `ulen` is over 64 MiB. Then the exact length `12 + H + clen`: shorter is `E_TRUNCATED`,
 *    longer is `E_TRAILING`.
 * 5. `E_CODEC`.
 * 6. `E_INFLATE`: the stream fails, does not end exactly at the end of the body, or gives other than `ulen` bytes.
 * 7. `E_ID`: the sha256 of the inflated body is not the header's `id`, or not `expectedId`.
 * 8. `E_BODY`: the body is not a map with `h` and `t`, both maps (any other key of the root is ignored), does not decode (the
 *    whole body is decoded, also the tables that will be skipped), has a malformed `h` or `h.tables`, has a class other than
 *    `opts.expectedClass` when that is given, or has tables that differ from the ones `h.tables` lists. `E_LIMIT` for CBOR
 *    nested deeper than `MAX_DEPTH`.
 * 9. `E_HMISMATCH`: the body's `h` and the header's `h` differ.
 * 10. `E_TABLE`: a required table, or its version, is not one the caller knows.
 *
 * No Node module is used, so builders and readers run in a browser and in a Worker.
 */
import { deflateRaw, Inflate } from 'pako'
import { CborNestingError, type CborValue, decodeCbor, encodeDeterministic, MAX_DEPTH } from './cbor'
import { ColumnError } from './columns'
import { FormatError, type FormatErrorCode } from './errors'
import { type CborMap, hasOwn, isMap, isUint, sha256Digest } from './values'

// Limits and fixed values (`container.md`, "Layout" and "Limits")

/** `\x89TLP`. The first byte is not ASCII, so a text-mode copy fails at once. */
export const MAGIC = [0x89, 0x54, 0x4c, 0x50] as const

/** The only major version this code reads and writes. */
export const FORMAT_MAJOR = 3
/** The minor version this code writes. A reader reads any minor of its major. */
export const FORMAT_MINOR = 0

export const KIND_SEGMENT = 1
export const KIND_TRANSFER = 2

/** Bytes before the header: magic, major, minor, kind, reserved and the header length. */
export const FIXED_BYTES = 12

/** Largest header a segment has. */
export const MAX_HEADER_BYTES = 65_536
/** Largest compressed body (`clen`): 64 MiB. */
export const MAX_COMPRESSED_BYTES = 67_108_864
/** Largest uncompressed body (`ulen`): 64 MiB. */
export const MAX_UNCOMPRESSED_BYTES = 67_108_864

// Types

export const CLASS_NAMES = ['catalog', 'xmap', 'map', 'xtopics', 'topics', 'book', 'orig', 'art', 'lex', 'obs', 'gen'] as const
export type ClassName = (typeof CLASS_NAMES)[number]

/** The header inside the body, and again in the file header (`container.md`, "Logical header"). */
export type LogicalHeader = {
  class: ClassName
  v: number
  /** Every table in `t`: name → `[version, required]`. */
  tables: Record<string, [number, boolean]>
  lang?: string
  book?: string
  part?: string
  group?: string
  /** `[resource key, stamp]` of the original book the positions belong to. */
  orig?: [string, string]
  /** The resources whose data is inside: `[resource key, release stamp]`. Tables name one by its index here. */
  res?: [string, string][]
}

/** `ulen` is the length of the body; `readSegment` sets it so the views can bound a table's row count by it. */
export type Segment = { h: LogicalHeader; t: Record<string, CborValue>; ulen?: number }

// Small helpers

const isText = (value: unknown): value is string => typeof value === 'string'

/** Lowercase hex, two digits per byte. This is how ids are printed. */
export function hex(bytes: Uint8Array): string {
  let out = ''
  for (let i = 0; i < bytes.length; i++) out += bytes[i].toString(16).padStart(2, '0')
  return out
}

function equalBytes(a: Uint8Array, b: Uint8Array): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) {
    if (a[i] !== b[i]) return false
  }
  return true
}

/** Deep equality of two decoded CBOR values. The order of the keys of a map does not matter. */
function cborEqual(a: CborValue, b: CborValue): boolean {
  if (a === b) return true
  if (a instanceof Uint8Array) return b instanceof Uint8Array && equalBytes(a, b)
  if (Array.isArray(a)) {
    return Array.isArray(b) && a.length === b.length && a.every((item, i) => cborEqual(item, b[i]))
  }
  if (isMap(a)) {
    if (!isMap(b)) return false
    const keys = Object.keys(a)
    if (keys.length !== Object.keys(b).length) return false
    return keys.every((key) => hasOwn(b, key) && cborEqual(a[key], b[key]))
  }
  return false
}

/** A decode failure of the header or the body becomes a FormatError: a limit for nesting, `code` for the rest. */
function decodeFailure(error: unknown, code: FormatErrorCode, what: string): never {
  if (error instanceof CborNestingError) throw new FormatError('E_LIMIT', `${what} is nested deeper than ${MAX_DEPTH} levels`)
  if (error instanceof ColumnError) throw new FormatError(code, `${what} is not valid CBOR: ${error.message}`)
  throw error
}

// Header

/**
 * The first 12 bytes. The checks go in file order (`E_MAGIC`, `E_VERSION`, `E_KIND`); a byte that is not there yet makes the file
 * `E_TRUNCATED`. `kinds` are the kinds the caller reads.
 */
export function readFixed(bytes: Uint8Array, kinds: readonly number[]): { kind: number; length: number } {
  const truncated = () => new FormatError('E_TRUNCATED', 'the file ends inside the first 12 bytes')
  // A file shorter than the magic is cut short only if what is there matches the start of the magic.
  for (let i = 0; i < Math.min(bytes.length, MAGIC.length); i++) {
    if (bytes[i] !== MAGIC[i]) throw new FormatError('E_MAGIC', 'the file does not start with the magic number')
  }
  if (bytes.length < 5) throw truncated()
  if (bytes[4] !== FORMAT_MAJOR) throw new FormatError('E_VERSION', `major version ${bytes[4]} is not ${FORMAT_MAJOR}`)
  if (bytes.length < 7) throw truncated()
  const kind = bytes[6]
  if (!kinds.includes(kind)) throw new FormatError('E_KIND', `kind ${kind} is not the one expected`)
  if (bytes.length < FIXED_BYTES) throw truncated()
  const length = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(8)
  return { kind, length }
}

interface SegmentFields {
  h: CborMap
  codec: string
  clen: number
  ulen: number
  id: Uint8Array
}

/** The keys a segment header must have, with their types. Other keys are ignored. */
function segmentFields(header: CborMap): SegmentFields {
  const { h, codec, clen, ulen, id } = header
  if (!isMap(h)) throw new FormatError('E_HEADER', 'the header lacks h, or h is not a map')
  if (!isText(codec)) throw new FormatError('E_HEADER', 'the header lacks codec, or codec is not text')
  if (!isUint(clen)) throw new FormatError('E_HEADER', 'the header lacks clen, or clen is not an unsigned integer')
  if (!isUint(ulen)) throw new FormatError('E_HEADER', 'the header lacks ulen, or ulen is not an unsigned integer')
  if (!(id instanceof Uint8Array) || id.length !== 32) {
    throw new FormatError('E_HEADER', 'the header lacks id, or id is not 32 bytes')
  }
  return { h, codec, clen, ulen, id }
}

interface ParsedHeader {
  kind: number
  header: CborMap
  headerEnd: number
}

function parseHeader(bytes: Uint8Array, kinds: readonly number[]): ParsedHeader {
  const { kind, length } = readFixed(bytes, kinds)
  if (kind === KIND_SEGMENT && length > MAX_HEADER_BYTES) {
    throw new FormatError('E_LIMIT', `the header is ${length} bytes, over ${MAX_HEADER_BYTES}`)
  }
  const headerEnd = FIXED_BYTES + length
  if (bytes.length < headerEnd) throw new FormatError('E_TRUNCATED', 'the file ends inside the header')
  let header: CborValue
  try {
    header = decodeCbor(bytes.subarray(FIXED_BYTES, headerEnd))
  } catch (error) {
    return decodeFailure(error, 'E_HEADER', 'the header')
  }
  if (!isMap(header)) throw new FormatError('E_HEADER', 'the header is not a CBOR map')
  if (kind === KIND_SEGMENT) segmentFields(header)
  return { kind, header, headerEnd }
}

/**
 * Reads the fixed bytes and the header of a segment (kind 1) or a transfer file (kind 2), and nothing else: no body is
 * looked at. Checks the magic number, the major version and the kind, then decodes the CBOR map that follows. For a
 * segment it also applies the 65 536 byte limit and the `E_HEADER` checks of the keys; for a transfer file it applies
 * neither, and `header` is the index of the transfer file.
 *
 * `headerEnd` is where the header ends: `12 + H`.
 */
export function readHeader(bytes: Uint8Array): { kind: 1 | 2; header: Record<string, CborValue>; headerEnd: number } {
  const { kind, header, headerEnd } = parseHeader(bytes, [KIND_SEGMENT, KIND_TRANSFER])
  return { kind: kind as 1 | 2, header, headerEnd }
}

// Inflate

/** What this code reads of a pako `Inflate`: pako 2.1.0 (pinned) keeps these on the instance but does not type them. */
interface InflateState {
  ended: boolean
  err: number
  strm: { avail_in: number }
}

/**
 * Inflates a raw deflate stream that must fill `compressed` exactly and give exactly `ulen` bytes. The output is
 * collected in chunks of at most 64 KiB and the inflate stops as soon as it passes `ulen`, so the memory used never
 * depends on what the header says.
 */
function inflateBody(compressed: Uint8Array, ulen: number): Uint8Array {
  const inflator = new Inflate({ raw: true })
  const chunks: Uint8Array[] = []
  let total = 0
  inflator.onData = (chunk) => {
    const part = chunk as Uint8Array
    total += part.length
    if (total > ulen) throw new FormatError('E_INFLATE', 'the body inflates to more than ulen bytes')
    chunks.push(part)
  }
  let ok: boolean
  try {
    // No flush mode: pako stalls with Z_FINISH on an output that fills a whole chunk (64 KiB) when all the input is
    // already consumed, and reports a complete stream as not ended. The end is checked below instead.
    ok = inflator.push(compressed)
  } catch (error) {
    if (error instanceof FormatError) throw error
    throw new FormatError('E_INFLATE', 'the body does not inflate')
  }
  const state = inflator as unknown as InflateState
  if (!ok || state.err !== 0 || !state.ended) throw new FormatError('E_INFLATE', 'the body is not a complete deflate stream')
  if (state.strm.avail_in > 0) throw new FormatError('E_INFLATE', 'there are bytes after the deflate stream')
  if (total !== ulen) throw new FormatError('E_INFLATE', `the body inflates to ${total} bytes, not ulen (${ulen})`)
  const body = new Uint8Array(ulen)
  let at = 0
  for (const chunk of chunks) {
    body.set(chunk, at)
    at += chunk.length
  }
  return body
}

// Body

const TABLE_NAME = /^[a-z][a-z0-9-]*$/

function malformed(what: string): FormatError {
  return new FormatError('E_BODY', `the logical header is malformed: ${what}`)
}

const isTextPair = (value: unknown): boolean => Array.isArray(value) && value.length === 2 && value.every(isText)

/** The logical header against `container.md`, "Logical header". Keys it does not list are left alone. */
function checkLogicalHeader(h: CborMap): LogicalHeader {
  if (!isText(h.class) || !(CLASS_NAMES as readonly string[]).includes(h.class)) throw malformed('class')
  if (!isUint(h.v)) throw malformed('v')
  if (!isMap(h.tables)) throw malformed('tables')
  for (const [name, entry] of Object.entries(h.tables)) {
    if (!TABLE_NAME.test(name)) throw malformed(`table name "${name}"`)
    if (!Array.isArray(entry) || entry.length !== 2 || !isUint(entry[0]) || typeof entry[1] !== 'boolean') {
      throw malformed(`tables["${name}"] is not [version, required]`)
    }
  }
  for (const key of ['lang', 'book', 'part', 'group']) {
    if (hasOwn(h, key) && !isText(h[key])) throw malformed(key)
  }
  if (hasOwn(h, 'orig') && !isTextPair(h.orig)) throw malformed('orig')
  if (hasOwn(h, 'res') && !(Array.isArray(h.res) && h.res.every(isTextPair))) throw malformed('res')
  return h as unknown as LogicalHeader
}

/**
 * The body is a map with `h` and `t`; other keys of the root are ignored (a later minor version may add them). Checks its shape,
 * the class when one is expected, and that `t` has the tables `h.tables` lists, no more, no fewer.
 */
function parseBody(body: Uint8Array, expectedClass?: ClassName): { h: CborMap; t: CborMap; logical: LogicalHeader } {
  let value: CborValue
  try {
    value = decodeCbor(body)
  } catch (error) {
    return decodeFailure(error, 'E_BODY', 'the body')
  }
  if (!isMap(value) || !hasOwn(value, 'h') || !hasOwn(value, 't')) {
    throw new FormatError('E_BODY', 'the body is not a map with h and t')
  }
  const { h, t } = value
  if (!isMap(h)) throw new FormatError('E_BODY', 'h is not a map')
  if (!isMap(t)) throw new FormatError('E_BODY', 't is not a map')
  const logical = checkLogicalHeader(h)
  if (expectedClass !== undefined && logical.class !== expectedClass) {
    throw new FormatError('E_BODY', `the class is "${logical.class}", and "${expectedClass}" is expected`)
  }
  const listed = Object.keys(logical.tables)
  for (const name of listed) {
    if (!hasOwn(t, name)) throw new FormatError('E_BODY', `table "${name}" is in h.tables and not in t`)
  }
  for (const name of Object.keys(t)) {
    if (!hasOwn(logical.tables, name)) throw new FormatError('E_BODY', `table "${name}" is in t and not in h.tables`)
  }
  return { h, t, logical }
}

// Reader

/**
 * Reads and checks a segment file. The whole file is rejected with a {@link FormatError} at the first defect (see the
 * order at the top of this file); nothing of a rejected file is returned.
 *
 * `known` maps a table name to the versions of it the caller understands. A required table that is not there, or in
 * another version, rejects the file with `E_TABLE`. An optional one is left out of `seg.t` and its name is added to
 * `skipped`; `seg.h` stays as the file has it. Which other tables depend on a skipped one is class knowledge and
 * belongs to the readers of each class.
 *
 * `expectedId`, when given, is the id the catalog gives, in hex (either case is compared as lowercase). `expectedClass`, when given, is the class the body's
 * `h` must have (`E_BODY` otherwise, before `E_HMISMATCH` and the tables): a catalog inside a transfer file must be a catalog.
 *
 * `header` is the file header as it is, with the keys this code does not know and the catalog's `sig`.
 */
export async function readSegment(
  bytes: Uint8Array,
  opts: { known: Record<string, number[]>; expectedId?: string; expectedClass?: ClassName },
): Promise<{ seg: Segment; id: string; header: Record<string, CborValue>; skipped: string[] }> {
  const { header, headerEnd } = parseHeader(bytes, [KIND_SEGMENT])
  const fields = segmentFields(header)

  if (fields.clen > MAX_COMPRESSED_BYTES) {
    throw new FormatError('E_LIMIT', `clen is ${fields.clen}, over ${MAX_COMPRESSED_BYTES}`)
  }
  if (fields.ulen > MAX_UNCOMPRESSED_BYTES) {
    throw new FormatError('E_LIMIT', `ulen is ${fields.ulen}, over ${MAX_UNCOMPRESSED_BYTES}`)
  }
  const fileEnd = headerEnd + fields.clen
  if (bytes.length < fileEnd) throw new FormatError('E_TRUNCATED', 'the file is shorter than 12 + H + clen')
  if (bytes.length > fileEnd) throw new FormatError('E_TRAILING', 'the file is longer than 12 + H + clen')

  if (fields.codec !== 'deflate-raw') throw new FormatError('E_CODEC', `codec "${fields.codec}" is not deflate-raw`)

  const body = inflateBody(bytes.subarray(headerEnd, fileEnd), fields.ulen)

  const digest = await sha256Digest(body)
  const id = hex(digest)
  if (!equalBytes(digest, fields.id)) throw new FormatError('E_ID', 'the sha256 of the body is not the id in the header')
  if (opts.expectedId !== undefined && opts.expectedId.toLowerCase() !== id) {
    throw new FormatError('E_ID', 'the sha256 of the body is not the id the catalog gives')
  }

  const parsed = parseBody(body, opts.expectedClass)
  if (!cborEqual(parsed.h, fields.h)) throw new FormatError('E_HMISMATCH', "the body's h differs from the header's h")

  const skipped: string[] = []
  for (const [name, [version, required]] of Object.entries(parsed.logical.tables)) {
    if (hasOwn(opts.known, name) && opts.known[name].includes(version)) continue
    if (required) throw new FormatError('E_TABLE', `required table "${name}" version ${version} is not known`)
    skipped.push(name)
  }
  for (const name of skipped) delete parsed.t[name]

  // `ulen` is not an enumerable key: a segment read equals the segment written, and only the views look at it.
  const seg: Segment = { h: parsed.logical, t: parsed.t }
  Object.defineProperty(seg, 'ulen', { value: fields.ulen, enumerable: false })
  return { seg, id, header, skipped }
}

// Writer

/** Throws when `h.tables` and `t` do not list the same tables: the reader would reject the file (`E_BODY`). */
function assertSameTables(seg: Segment): void {
  const listed = Object.keys(seg.h.tables)
  const present = Object.keys(seg.t)
  const missing = listed.filter((name) => !hasOwn(seg.t, name))
  const extra = present.filter((name) => !hasOwn(seg.h.tables, name))
  if (missing.length > 0 || extra.length > 0) {
    throw new Error(
      `h.tables and t list different tables (in h.tables only: ${missing.join(', ') || 'none'}; in t only: ${extra.join(', ') || 'none'})`,
    )
  }
}

/**
 * Writes a segment file. The body is the deterministic CBOR of `{h, t}`, so the same content gives the same id; the
 * compressed bytes are not part of it. Throws a {@link FormatError} `E_BODY` when the logical header `h` is not what the reader accepts (the
 * class, `v`, `tables`, `lang`, `book`, `part`, `group`, `orig`, `res`), `Error` when `h.tables` and `t` list different tables, and a
 * {@link FormatError} `E_LIMIT` when the header, `clen` or `ulen` would be over its limit (a reader would reject it).
 *
 * `extra.sig` is the catalog's list of signatures; it goes in the header and not in the body.
 */
export async function writeSegment(
  seg: Segment,
  extra?: { sig?: { key: string; alg: 'ed25519'; s: Uint8Array }[] },
): Promise<{ bytes: Uint8Array; id: string; body: Uint8Array }> {
  // The reader's own check of the logical header, so that no file is written that it would reject with E_BODY.
  checkLogicalHeader(seg.h as unknown as CborMap)
  assertSameTables(seg)
  if (extra?.sig !== undefined && extra.sig.length === 0) throw new Error('sig must list at least one signature')

  const body = encodeDeterministic({ h: seg.h, t: seg.t } as unknown as CborValue)
  if (body.length > MAX_UNCOMPRESSED_BYTES) {
    throw new FormatError('E_LIMIT', `the body is ${body.length} bytes, over ${MAX_UNCOMPRESSED_BYTES}`)
  }
  const compressed = deflateRaw(body, { level: 9 })
  if (compressed.length > MAX_COMPRESSED_BYTES) {
    throw new FormatError('E_LIMIT', `the compressed body is ${compressed.length} bytes, over ${MAX_COMPRESSED_BYTES}`)
  }
  const digest = await sha256Digest(body)

  const headerMap: CborMap = {
    h: seg.h as unknown as CborMap,
    codec: 'deflate-raw',
    clen: compressed.length,
    ulen: body.length,
    id: digest,
  }
  if (extra?.sig !== undefined) headerMap.sig = extra.sig.map(({ key, alg, s }) => ({ key, alg, s }))
  const header = encodeDeterministic(headerMap)
  if (header.length > MAX_HEADER_BYTES) {
    throw new FormatError('E_LIMIT', `the header is ${header.length} bytes, over ${MAX_HEADER_BYTES}`)
  }

  const out = new Uint8Array(FIXED_BYTES + header.length + compressed.length)
  out.set(MAGIC, 0)
  out[4] = FORMAT_MAJOR
  out[5] = FORMAT_MINOR
  out[6] = KIND_SEGMENT
  out[7] = 0
  new DataView(out.buffer).setUint32(8, header.length)
  out.set(header, FIXED_BYTES)
  out.set(compressed, FIXED_BYTES + header.length)
  return { bytes: out, id: hex(digest), body }
}
