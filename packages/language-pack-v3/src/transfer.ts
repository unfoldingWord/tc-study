/**
 * The transfer file of format 3 (`spec/transfer.md`, `spec/cddl/transfer.cddl`): whole segment files and complements behind an
 * index that is not compressed, to carry them from one device to another without a network.
 *
 * ```text
 * 89 54 4C 50 | 03 | 00 | 02 | 00 | I (u32, big-endian) | index (CBOR map, I bytes) | entry | entry | …
 * ```
 *
 * - {@link writeTransfer} writes the whole file. The catalogs come first among the entries, then the others in the order given;
 *   the offsets count from `12 + I` and the entries have no gaps.
 * - {@link readTransfer} checks the first 12 bytes and the index, then every entry as if it had been downloaded. A file cut short
 *   keeps the entries that are whole and lists the others as missing; a file cut before the end of its catalogs is rejected.
 *
 * No Node module is used: builders and readers run in a browser and in a Worker.
 */
import type { BuiltSegment } from './build/catalog'
import { type CborValue, encodeDeterministic } from './codec/cbor'
import { CLASS_NAMES, FORMAT_MAJOR, FORMAT_MINOR, hex, KIND_SEGMENT, KIND_TRANSFER, readHeader, readSegment } from './codec/container'
import { FormatError, type FormatErrorCode } from './codec/errors'
import { type CborMap, hasOwn, isMap } from './codec/values'

/** `\x89TLP`, as in `container.ts`. */
const MAGIC = [0x89, 0x54, 0x4c, 0x50] as const
/** Bytes before the index: the 8 of a segment file and the index length. */
const FIXED_BYTES = 12

const HEX_ID = /^[0-9a-f]{64}$/

/** A complement for the transfer file: `id` is the sha256 of `bytes` in hex, as the catalog gives it. The caller vouches for it. */
export type ComplementFile = { id: string; bytes: Uint8Array; kind: 'complement' }

/** An entry of the index (`transfer.cddl`, `transfer-entry`), with the id in lowercase hex. */
export type TransferIndexEntry = { id: string; kind: 'segment' | 'complement'; class?: string; offset: number; size: number }

/**
 * The index of a transfer file (`transfer.cddl`), with the ids in lowercase hex. `extra` holds the keys of the index this code
 * does not know (a later minor version adds them), as they are.
 */
export type TransferIndex = {
  mode: 'full' | 'update'
  catalogs: string[]
  base?: [catalog: string, revision: number][]
  entries: TransferIndexEntry[]
  made?: string
  by?: string
  extra: Record<string, CborValue>
}

/**
 * What the reader says of an entry: `status` is `'ok'` (the whole entry is in the file and verifies), `'missing'` (the file ends before
 * the entry's end) or the error code the entry fails with. `bytes` is there only when `ok`, and is a view of the file's bytes.
 */
export type TransferEntry = {
  id: string
  kind: 'segment' | 'complement'
  class?: string
  status: 'ok' | 'missing' | FormatErrorCode
  bytes?: Uint8Array
}

// Writer

const isUint = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

function idBytes(id: unknown, what: string): Uint8Array {
  if (typeof id !== 'string' || !HEX_ID.test(id)) throw new Error(`${what} is not 64 lowercase hex digits`)
  const out = new Uint8Array(32)
  for (let i = 0; i < 32; i++) out[i] = parseInt(id.slice(2 * i, 2 * i + 2), 16)
  return out
}

type Item = { id: string; kind: 'segment' | 'complement'; class?: string; bytes: Uint8Array }

function segmentItem(built: BuiltSegment): Item {
  const { kind, header } = readHeader(built.bytes)
  if (kind !== KIND_SEGMENT) throw new Error(`The file of the segment ${built.id} is not a segment file`)
  if (!(header.id instanceof Uint8Array) || hex(header.id) !== built.id) throw new Error(`The file of the segment ${built.id} has another id in its header`)
  idBytes(built.id, 'the id of a segment')
  return { id: built.id, kind: 'segment', class: built.seg.h.class, bytes: built.bytes }
}

/**
 * The whole transfer file (`transfer.md`). The catalogs come first, in the order given, then `entries` in the order given: a segment
 * is a {@link BuiltSegment}, a complement is `{ id, bytes, kind: 'complement' }` and its `id` is the one given (the sha256 of its bytes,
 * as the catalog lists it; the receiver checks it). `made` is RFC 3339 and `by` the app and its version: informative.
 *
 * `base` (`[catalog, revision]` of each catalog the receiver must already have) is required in `update` mode and not allowed in `full`.
 *
 * Throws `Error` for an id twice, a catalog that is not of class `catalog`, a segment of class `catalog` among `entries`, no catalog,
 * a segment whose file does not have the id given, an id that is not 64 lowercase hex digits and a `base` that is not a list of
 * `[text, revision]`.
 */
export function writeTransfer(o: {
  mode: 'full' | 'update'
  catalogs: BuiltSegment[]
  entries: (BuiltSegment | ComplementFile)[]
  base?: [string, number][]
  made: string
  by: string
}): Uint8Array {
  if (o.mode !== 'full' && o.mode !== 'update') throw new Error(`The mode ${JSON.stringify(o.mode)} is not "full" or "update"`)
  if (o.mode === 'update' && o.base === undefined) throw new Error('An update transfer file needs its base')
  if (o.mode === 'full' && o.base !== undefined) throw new Error('A full transfer file has no base')
  if (typeof o.made !== 'string' || o.made === '') throw new Error('made is not text')
  if (typeof o.by !== 'string' || o.by === '') throw new Error('by is not text')
  if (o.catalogs.length === 0) throw new Error('A transfer file needs at least one catalog')

  const items: Item[] = []
  const seen = new Set<string>()
  const add = (item: Item): void => {
    if (seen.has(item.id)) throw new Error(`The id ${item.id} is in the transfer file twice`)
    seen.add(item.id)
    items.push(item)
  }
  for (const catalog of o.catalogs) {
    if (catalog.seg.h.class !== 'catalog') throw new Error(`The segment ${catalog.id} is of class ${catalog.seg.h.class}, not a catalog`)
    add(segmentItem(catalog))
  }
  for (const entry of o.entries) {
    if ('seg' in entry) {
      if (entry.seg.h.class === 'catalog') throw new Error(`The catalog ${entry.id} has to be in catalogs, not in entries`)
      add(segmentItem(entry))
    } else {
      idBytes(entry.id, 'the id of a complement')
      if (entry.kind !== 'complement') throw new Error(`The entry ${entry.id} has the kind ${JSON.stringify(entry.kind)}`)
      if (!(entry.bytes instanceof Uint8Array)) throw new Error(`The complement ${entry.id} has no bytes`)
      add({ id: entry.id, kind: 'complement', bytes: entry.bytes })
    }
  }

  let offset = 0
  const entries = items.map((item): CborValue => {
    const out: Record<string, CborValue> = { id: idBytes(item.id, 'an id'), kind: item.kind, offset, size: item.bytes.length }
    if (item.class !== undefined) out.class = item.class
    offset += item.bytes.length
    return out
  })
  const index: Record<string, CborValue> = {
    mode: o.mode,
    catalogs: o.catalogs.map((catalog) => idBytes(catalog.id, 'an id')),
    entries,
    made: o.made,
    by: o.by,
  }
  if (o.base !== undefined) {
    index.base = o.base.map((pair): CborValue => {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !isUint(pair[1])) throw new Error('base is not a list of [catalog, revision]')
      return [pair[0], pair[1]]
    })
  }
  const encoded = encodeDeterministic(index)

  const out = new Uint8Array(FIXED_BYTES + encoded.length + offset)
  out.set(MAGIC, 0)
  out[4] = FORMAT_MAJOR
  out[5] = FORMAT_MINOR
  out[6] = KIND_TRANSFER
  out[7] = 0
  new DataView(out.buffer).setUint32(8, encoded.length)
  out.set(encoded, FIXED_BYTES)
  let at = FIXED_BYTES + encoded.length
  for (const item of items) {
    out.set(item.bytes, at)
    at += item.bytes.length
  }
  return out
}

// Reader

function malformed(what: string): FormatError {
  return new FormatError('E_HEADER', `the index is malformed: ${what}`)
}

/** The first bytes of the file, each one as soon as it is there, in the order of `container.md`; kind 2 is the only one this reads. */
function checkFixed(bytes: Uint8Array): void {
  const truncated = () => new FormatError('E_TRUNCATED', 'the file ends inside the first 12 bytes')
  for (let i = 0; i < Math.min(bytes.length, MAGIC.length); i++) {
    if (bytes[i] !== MAGIC[i]) throw new FormatError('E_MAGIC', 'the file does not start with the magic number')
  }
  if (bytes.length < 5) throw truncated()
  if (bytes[4] !== FORMAT_MAJOR) throw new FormatError('E_VERSION', `major version ${bytes[4]} is not ${FORMAT_MAJOR}`)
  if (bytes.length < 7) throw truncated()
  if (bytes[6] !== KIND_TRANSFER) throw new FormatError('E_KIND', `kind ${bytes[6]} is not a transfer file`)
  if (bytes.length < FIXED_BYTES) throw truncated()
}

function idOf(value: unknown, what: string): string {
  if (!(value instanceof Uint8Array) || value.length !== 32) throw malformed(`${what} is not 32 bytes`)
  return hex(value)
}

function optionalText(index: CborMap, key: 'made' | 'by'): string | undefined {
  if (!hasOwn(index, key)) return undefined
  if (typeof index[key] !== 'string') throw malformed(`${key} is not text`)
  return index[key] as string
}

const KNOWN_KEYS = ['mode', 'catalogs', 'base', 'entries', 'made', 'by']

/** The index against `transfer.cddl`, and the layout of `transfer.md`: contiguous from 0, the catalogs first. */
function parseIndex(index: CborMap): TransferIndex {
  if (index.mode !== 'full' && index.mode !== 'update') throw malformed('mode is not "full" or "update"')
  if (!Array.isArray(index.catalogs) || index.catalogs.length === 0) throw malformed('catalogs is not a list with at least one id')
  if (!Array.isArray(index.entries) || index.entries.length === 0) throw malformed('entries is not a list with at least one entry')

  const catalogs = index.catalogs.map((value, i) => idOf(value, `catalogs[${i}]`))
  if (new Set(catalogs).size !== catalogs.length) throw malformed('catalogs lists an id twice')

  const position = new Map<string, number>()
  let next = 0
  const entries = index.entries.map((value, i): TransferIndexEntry => {
    const what = `entries[${i}]`
    if (!isMap(value)) throw malformed(`${what} is not a map`)
    const id = idOf(value.id, `${what}.id`)
    if (position.has(id)) throw malformed(`the id ${id} is in entries twice`)
    position.set(id, i)
    if (value.kind !== 'segment' && value.kind !== 'complement') throw malformed(`${what}.kind is not "segment" or "complement"`)
    if (!isUint(value.offset)) throw malformed(`${what}.offset is not an unsigned integer`)
    if (!isUint(value.size)) throw malformed(`${what}.size is not an unsigned integer`)
    if (value.offset !== next) throw malformed(`${what}.offset is ${value.offset}, and the entry before ends at ${next}`)
    next += value.size
    if (!Number.isSafeInteger(next)) throw malformed('the entries are larger than 2^53 - 1 bytes')

    const entry: TransferIndexEntry = { id, kind: value.kind, offset: value.offset, size: value.size }
    if (hasOwn(value, 'class')) {
      if (value.kind !== 'segment') throw malformed(`${what} is a complement and has a class`)
      if (typeof value.class !== 'string' || !(CLASS_NAMES as readonly string[]).includes(value.class)) throw malformed(`${what}.class is not a class`)
      entry.class = value.class
    }
    return entry
  })

  catalogs.forEach((id, i) => {
    const at = position.get(id)
    if (at === undefined) throw malformed(`catalogs[${i}] is not one of the entries`)
    if (at >= catalogs.length) throw malformed(`the catalog ${id} is not among the first ${catalogs.length} entries`)
    const entry = entries[at]
    if (entry.kind !== 'segment' || (entry.class !== undefined && entry.class !== 'catalog')) throw malformed(`the catalog ${id} is not a segment of class catalog`)
  })

  const out: TransferIndex = { mode: index.mode, catalogs, entries, extra: {} }
  if (hasOwn(index, 'base')) {
    const base = index.base
    if (!Array.isArray(base)) throw malformed('base is not a list')
    out.base = base.map((pair, i): [string, number] => {
      if (!Array.isArray(pair) || pair.length !== 2 || typeof pair[0] !== 'string' || !isUint(pair[1])) throw malformed(`base[${i}] is not [catalog, revision]`)
      return [pair[0], pair[1]]
    })
  }
  const made = optionalText(index, 'made')
  if (made !== undefined) out.made = made
  const by = optionalText(index, 'by')
  if (by !== undefined) out.by = by
  for (const [key, value] of Object.entries(index)) {
    if (!KNOWN_KEYS.includes(key)) out.extra[key] = value
  }
  return out
}

async function sha256(data: Uint8Array): Promise<Uint8Array> {
  return new Uint8Array(await crypto.subtle.digest('SHA-256', data as Uint8Array<ArrayBuffer>))
}

/** The tables the segment's own header lists, so that no `E_TABLE` can arise: a transfer file is not a place to judge what a reader knows. */
function knownOf(h: CborValue): Record<string, number[]> {
  const known: Record<string, number[]> = {}
  const tables = isMap(h) ? h.tables : undefined
  if (!isMap(tables)) return known
  for (const [name, entry] of Object.entries(tables)) {
    if (Array.isArray(entry) && isUint(entry[0])) known[name] = [entry[0]]
  }
  return known
}

/** Checks one entry as if it had been downloaded (`container.md`); throws the {@link FormatError} it fails with. */
async function verify(entry: TransferIndexEntry, data: Uint8Array): Promise<void> {
  if (entry.kind === 'complement') {
    if (hex(await sha256(data)) !== entry.id) throw new FormatError('E_ID', 'the sha256 of the complement is not the id in the index')
    return
  }
  const { kind, header } = readHeader(data)
  if (kind !== KIND_SEGMENT) throw new FormatError('E_KIND', 'the entry is a transfer file, not a segment file')
  if (!(header.id instanceof Uint8Array) || hex(header.id) !== entry.id) throw new FormatError('E_ID', 'the id in the entry header is not the id in the index')
  await readSegment(data, { known: knownOf(header.h), expectedId: entry.id })
}

/**
 * Reads a transfer file (`transfer.md`, "Receiving").
 *
 * - The first 12 bytes and the index are checked first: `E_MAGIC`, `E_VERSION`, `E_KIND`, then `E_TRUNCATED` for a file that ends
 *   inside them, and `E_HEADER` for an index that is not what `transfer.cddl` and the layout say (a mode other than `full` and
 *   `update`, ids that are not 32 bytes or are repeated, offsets that are not contiguous from 0, catalogs that are not the first
 *   entries). Keys of the index that are not known are kept in `index.extra`.
 * - A file that ends before the end of any catalog is `E_TRUNCATED`; one with bytes after the last entry is `E_TRAILING`.
 * - A catalog that fails its check throws its error: a bad catalog makes the file unusable.
 * - Every other entry is checked on its own: `entries` has one object per entry of the index, in its order, with the `status` of
 *   {@link TransferEntry}. An entry that fails does not discard the others. `missing` lists, in order, the ids with status `missing`
 *   (the file ends before the entry's end, so every entry after the first one missing is missing too).
 *
 * A segment is `ok` when its header id is the index's, `readSegment` accepts it (with the tables its own header lists, and the id of the
 * index as `expectedId`) and its length is the entry's size; a complement is `ok` when the sha256 of its bytes is the index's id.
 */
export async function readTransfer(bytes: Uint8Array): Promise<{ index: TransferIndex; entries: TransferEntry[]; missing: string[] }> {
  checkFixed(bytes)
  const { header, headerEnd } = readHeader(bytes)
  const index = parseIndex(header)

  const available = bytes.length - headerEnd
  const last = index.entries[index.entries.length - 1]
  const catalogsEnd = (() => {
    const end = index.entries[index.catalogs.length - 1]
    return end.offset + end.size
  })()
  if (available < catalogsEnd) throw new FormatError('E_TRUNCATED', 'the file ends before the end of its catalogs')
  if (available > last.offset + last.size) throw new FormatError('E_TRAILING', 'the file is longer than the index says')

  const entries: TransferEntry[] = []
  const missing: string[] = []
  for (let i = 0; i < index.entries.length; i++) {
    const entry = index.entries[i]
    const result: TransferEntry = { id: entry.id, kind: entry.kind, status: 'ok' }
    if (entry.class !== undefined) result.class = entry.class
    entries.push(result)

    if (entry.offset + entry.size > available) {
      result.status = 'missing'
      missing.push(entry.id)
      continue
    }
    const data = bytes.subarray(headerEnd + entry.offset, headerEnd + entry.offset + entry.size)
    try {
      await verify(entry, data)
      result.bytes = data
    } catch (error) {
      if (!(error instanceof FormatError)) throw error
      // A bad catalog makes the file unusable; any other entry only loses itself.
      if (i < index.catalogs.length) throw error
      result.status = error.code
    }
  }
  return { index, entries, missing }
}
