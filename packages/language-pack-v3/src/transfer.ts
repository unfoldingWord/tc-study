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
import { CLASS_NAMES, type ClassName, FIXED_BYTES, FORMAT_MAJOR, FORMAT_MINOR, hex, KIND_SEGMENT, KIND_TRANSFER, MAGIC, readFixed, readHeader, readSegment } from './codec/container'
import { FormatError, type FormatErrorCode } from './codec/errors'
import { type CborMap, hasOwn, hexToBytes, isMap, isUint, sha256Digest } from './codec/values'
import { CATALOG_TABLES } from './read/catalog'

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

function idBytes(id: unknown, what: string): Uint8Array {
  if (typeof id !== 'string' || !HEX_ID.test(id)) throw new Error(`${what} is not 64 lowercase hex digits`)
  return hexToBytes(id)
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
    if (entry.kind !== 'segment' || entry.class !== 'catalog') throw malformed(`the catalog ${id} is not a segment that says class catalog`)
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
    // defineProperty and not `=`: assigning to "__proto__" would set the prototype and lose the key.
    if (!KNOWN_KEYS.includes(key)) Object.defineProperty(out.extra, key, { value, enumerable: true, writable: true, configurable: true })
  }
  return out
}

/** The tables the segment's own header lists: the check of its structure, with nothing a reader may not know. */
function knownOf(h: CborValue): Record<string, number[]> {
  const known: Record<string, number[]> = {}
  const tables = isMap(h) ? h.tables : undefined
  if (!isMap(tables)) return known
  for (const [name, entry] of Object.entries(tables)) {
    if (Array.isArray(entry) && isUint(entry[0])) known[name] = [entry[0]]
  }
  return known
}

/** The tables a reader knows, by class: what `readSegment` takes as `known`, for each class of segment. */
export type KnownTables = Partial<Record<ClassName, Record<string, number[]>>>

/**
 * Checks one entry as if it had been downloaded (`container.md`, "Order of checks"); throws the {@link FormatError} it fails with.
 * The id of the index is checked by `readSegment` where the container puts `E_ID`, after `E_INFLATE`.
 *
 * - A catalog is checked against {@link CATALOG_TABLES}, the tables `catalogView` understands, and its own header must say class
 *   `catalog` (`E_BODY`, before the tables: `transfer.md`, "Order of checks", step 5).
 * - Another segment is checked against `known[class]` (its own `h.class`; no tables if the class is missing) when `known` is given,
 *   and against the tables its own header lists, which checks its structure only, when it is not.
 * - With `known`, a class the receiver knows no tables of is `E_TABLE` (step 5 of the order of checks), also when all the tables of
 *   the segment are optional: the receiver cannot read a segment of that class. The checks of the tables' shape are the app's.
 */
async function verify(entry: TransferIndexEntry, data: Uint8Array, isCatalog: boolean, known?: KnownTables): Promise<void> {
  if (entry.kind === 'complement') {
    if (hex(await sha256Digest(data)) !== entry.id) throw new FormatError('E_ID', 'the sha256 of the complement is not the id in the index')
    return
  }
  // The kind byte comes before any header is parsed: a transfer file is E_KIND whatever its index holds (`container.md`, step 1).
  readFixed(data, [KIND_SEGMENT])
  const { header } = readHeader(data)
  let tables: Record<string, number[]>
  if (isCatalog) {
    tables = CATALOG_TABLES as Record<string, number[]>
  } else if (known !== undefined) {
    const cls = isMap(header.h) ? header.h.class : undefined
    tables = typeof cls === 'string' && hasOwn(known, cls) ? (known[cls as ClassName] ?? {}) : {}
  } else {
    tables = knownOf(header.h)
  }
  await readSegment(data, { known: tables, expectedId: entry.id, ...(isCatalog ? { expectedClass: 'catalog' as const } : {}) })
  if (!isCatalog && known !== undefined && Object.keys(tables).length === 0) {
    throw new FormatError('E_TABLE', 'the receiver knows no table of this class of segment')
  }
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
 * A segment is `ok` when `readSegment` accepts it, with the id of the index as `expectedId` (so `E_ID` comes where the container puts
 * it) and its length is the entry's size; a complement is `ok` when the sha256 of its bytes is the index's id.
 *
 * **Tables.** A catalog is always checked against the tables `catalogView` understands (`CATALOG_TABLES`): a catalog with a required
 * table it does not know throws `E_TABLE`. With `opts.known`, every other segment is checked against `known[class]` as a receiver
 * would: a class missing from `known` has no known tables, and its segments are `E_TABLE` (also when all their tables are optional); a
 * required table of a class that has some gives the status `E_TABLE`; an optional one is skipped. Without `opts.known` the check is of structure only (the segment is read with the tables its own header lists, so no
 * `E_TABLE` can arise): pass `known` to verify as a receiver would.
 */
export async function readTransfer(
  bytes: Uint8Array,
  opts?: { known?: KnownTables },
): Promise<{ index: TransferIndex; entries: TransferEntry[]; missing: string[] }> {
  // The first bytes of the file, each one as soon as it is there, in the order of `container.md`; kind 2 is the only one this reads.
  readFixed(bytes, [KIND_TRANSFER])
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
      await verify(entry, data, i < index.catalogs.length, opts?.known)
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
