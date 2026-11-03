/**
 * The catalog of format 3 (`spec/catalog.md`, `spec/cddl/catalog.cddl`): where reading starts. It lists the segments of a
 * language (or the common ones), the units a device installs, what each unit needs, the resources, the licenses and the
 * complements.
 *
 * - {@link builtSegment} writes any segment and keeps what a catalog needs of it ({@link BuiltSegment}).
 * - {@link unitsOf} groups segments in units; {@link needsOfBook} is what a book segment needs.
 * - {@link buildCatalog} turns built segments into the catalog segment, the same bytes for the same inputs.
 *
 * The reader of the segment is `read/catalog.ts`. No Node module is used.
 *
 * ## Order (so that the same inputs give the same catalog)
 *
 * - **segments**: by class in the order of `class-name` (catalog, xmap, map, xtopics, topics, aligned, book, orig, art, lex, obs, gen), then by book number
 *   (a segment without a book first), then by part (`core` first, then by book number), then by group by code point, then by id.
 * - **units**: by id by code point (`lex:G10` before `lex:G5`). A unit lists its segments by index, ascending.
 * - **resources**: by key. **requires**: by catalog and revision. **complements**: by kind, lang and id. All by code point.
 * - An optional table with no rows (`requires`, `complements`) is left out, as an absent one is.
 *
 * The catalog is written unsigned: signing is phase 3 and belongs to whoever holds the key (`catalog.md`, "Signatures").
 */
import type { CborValue } from '../codec/cbor'
import { compareCodePoints } from '../codec/columns'
import { CLASS_NAMES, hex, readHeader, type Segment, writeSegment } from '../codec/container'
import { sha256 } from '../codec/sha256'
import { hexToBytes, isUint as isCount } from '../codec/values'
import { bookNumber } from '../ids'
import type { About, BookModel, CatalogResource, Complement, Unit } from '../model'

/**
 * A segment as a builder leaves it: the segment, its file, its id (lowercase hex) and its `inputs`, the fingerprint of what it
 * was built from (64 lowercase hex digits; `catalog.md`, "What changes when an input changes").
 */
export type BuiltSegment = { seg: Segment; bytes: Uint8Array; id: string; inputs: string }

const HEX_ID = /^[0-9a-f]{64}$/
/** RFC 3339 date and time: `2026-11-01T10:00:00Z`, with optional fraction and offset. */
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

function bytesOfHex(text: unknown, what: string): Uint8Array {
  if (typeof text !== 'string' || !HEX_ID.test(text)) throw new Error(`${what} is not 64 lowercase hex digits`)
  return hexToBytes(text)
}

function needText(value: unknown, what: string): string {
  if (typeof value !== 'string' || value === '') throw new Error(`${what} is not text (or is empty)`)
  return value
}

function needBytes(value: unknown, length: number, what: string): Uint8Array {
  if (!(value instanceof Uint8Array) || value.length !== length) throw new Error(`${what} is not ${length} bytes`)
  return value
}

/** `[key, value]` of an optional text of `source`, left out when `undefined`. */
function optionalTexts<T extends Record<string, unknown>>(out: Record<string, CborValue>, source: T, keys: readonly string[], where: string): void {
  for (const key of keys) {
    const value = source[key]
    if (value === undefined) continue
    if (typeof value !== 'string') throw new Error(`${where}: ${key} is not text`)
    out[key] = value
  }
}

// Built segments

/**
 * Writes `seg` (unsigned) and keeps what the catalog needs of it. `inputs` is the fingerprint of what the segment was built from:
 * 64 lowercase hex digits (the builder of each class decides what it hashes). Throws `Error` when it is not.
 */
export async function builtSegment(seg: Segment, inputs: string): Promise<BuiltSegment> {
  bytesOfHex(inputs, 'inputs')
  const { bytes, id } = await writeSegment(seg)
  return { seg, bytes, id, inputs }
}

// Units

/** The unit a segment belongs to (`catalog.md`, "Units and dependencies"). Throws `Error` for a class that is not a unit. */
function unitIdOf(seg: Segment): string {
  const { class: cls, book, group } = seg.h
  const need = (value: string | undefined, key: string): string => {
    if (value === undefined || value === '') throw new Error(`A segment of class ${cls} has no ${key} in its header`)
    return value
  }
  switch (cls) {
    case 'book':
      return `book:${need(book, 'book')}`
    case 'orig':
      return `orig:${need(book, 'book')}`
    case 'art':
      return `art:${need(group, 'group')}`
    case 'lex':
      return `lex:${need(group, 'group')}`
    case 'aligned':
      return `aligned:${need(group, 'group')}`
    case 'obs':
      return 'obs'
    case 'map':
    case 'xmap':
    case 'xtopics':
    case 'topics':
      return cls
    default:
      throw new Error(`A segment of class ${cls} is not part of a unit`)
  }
}

/**
 * The units of `segments` (`catalog.md`): one per book, orig book, art group, lex group, `obs`, `map`, `xmap`, `xtopics` and `topics`, ordered by id by
 * code point. A unit's `segments` are indexes in `segments`, ascending. `needs(segment)` gives the ids of the units a segment needs;
 * the unit's `needs` are the sorted union over its segments, left out when empty.
 *
 * Throws `Error` for a segment of class `catalog` or `gen`, two segments that give the same unit id (the core of a `map` or an `xmap`
 * and its parts are one unit, but a part twice is an error) and a `needs` that is not a list of text.
 */
export function unitsOf(segments: BuiltSegment[], needs: (s: BuiltSegment) => string[]): Unit[] {
  const units = new Map<string, { indexes: number[]; needs: Set<string>; parts: Set<string | undefined> }>()
  segments.forEach((built, index) => {
    const id = unitIdOf(built.seg)
    let unit = units.get(id)
    if (unit === undefined) {
      unit = { indexes: [], needs: new Set(), parts: new Set() }
      units.set(id, unit)
    } else if (id !== 'map' && id !== 'xmap' && id !== 'xtopics' && id !== 'topics') {
      throw new Error(`The segments ${built.id} and ${segments[unit.indexes[0]].id} are both the unit ${id}`)
    }
    const { part } = built.seg.h
    if (unit.parts.has(part)) throw new Error(`The segment ${built.id} repeats the part ${JSON.stringify(part)} of the unit ${id}`)
    unit.parts.add(part)
    unit.indexes.push(index)

    const wanted = needs(built)
    if (!Array.isArray(wanted) || !wanted.every((item) => typeof item === 'string' && item !== '')) {
      throw new Error(`needs of the segment ${built.id} is not a list of unit ids`)
    }
    if (wanted.some((item) => item.startsWith('aligned:'))) throw new Error(`needs of the segment ${built.id} lists an aligned unit, which is optional`)
    if (id.startsWith('aligned:')) {
      if (wanted.length > 0) throw new Error(`needs of the aligned segment ${built.id} is not empty, and an aligned unit lists no needs`)
    } else for (const item of wanted) unit.needs.add(item)
  })

  return [...units.keys()].sort(compareCodePoints).map((id): Unit => {
    const unit = units.get(id)!
    const out: Unit = { id, segments: unit.indexes }
    if (unit.needs.size > 0) out.needs = [...unit.needs].sort(compareCodePoints)
    if (id.startsWith('aligned:')) out.optional = true
    return out
  })
}

/** `tw:kt/grace` and `ta:translate/figs-metaphor`: the kind, the category or manual, and the rest. */
const ARTICLE_CONCEPT = /^(tw|ta):([^/:]+)\//

/**
 * The units a book segment needs (`catalog.md`): its original (`orig:tit`), the language map (`map`) and the article groups its
 * notes and word links point to (`tw:kt/grace` is `art:tw:kt`, `ta:translate/figs-metaphor` is `art:ta:translate`). Sorted by code
 * point, without repeats. A concept of another kind (`per:abraham`) needs no article group. The links inside the text of a note are
 * not read: the concept of the row is what the note is about.
 *
 * With `groups` (the units `art:...` the catalog builds) a need on another article group is left out: a unit activates only when
 * every unit it needs is complete (`catalog.md`), and a group no segment of this catalog supplies would keep the book from ever
 * activating. Without it every group is listed.
 */
export function needsOfBook(book: BookModel, groups?: ReadonlySet<string>): string[] {
  const needs = new Set<string>([`orig:${book.book}`, 'map'])
  for (const table of [book.notes, book.links]) {
    for (const row of table?.rows ?? []) {
      const m = row.concept === undefined ? null : ARTICLE_CONCEPT.exec(row.concept)
      if (m !== null && (groups === undefined || groups.has(`art:${m[1]}:${m[2]}`))) needs.add(`art:${m[1]}:${m[2]}`)
    }
  }
  return [...needs].sort(compareCodePoints)
}

// Segments

/** Where a segment goes in the list: class, book, part (`core` first), group, id. */
function sortKey(built: BuiltSegment): [number, number, number, string, string] {
  const { class: cls, book, part, group } = built.seg.h
  return [
    (CLASS_NAMES as readonly string[]).indexOf(cls),
    book === undefined ? 0 : bookNumber(book),
    part === undefined ? -1 : part === 'core' ? 0 : bookNumber(part),
    group ?? '',
    built.id,
  ]
}

/** The order `buildCatalog` lists segments in (the top of this file): a caller that returns segments in it uses this. */
export function compareSegments(a: BuiltSegment, b: BuiltSegment): number {
  const [ka, kb] = [sortKey(a), sortKey(b)]
  return ka[0] - kb[0] || ka[1] - kb[1] || ka[2] - kb[2] || compareCodePoints(ka[3], kb[3]) || compareCodePoints(ka[4], kb[4])
}

function encodeSegmentEntry(built: BuiltSegment): CborValue {
  const parsed = readHeader(built.bytes)
  const { id, ulen } = parsed.header
  if (parsed.kind !== 1) throw new Error(`The file of ${built.id} is not a segment file`)
  if (!(id instanceof Uint8Array) || hex(id) !== built.id) throw new Error(`The file of ${built.id} has another id in its header`)
  if (!isCount(ulen)) throw new Error(`The file of ${built.id} has no ulen`)

  const { class: cls, book, part, group } = built.seg.h
  const out: Record<string, CborValue> = {
    id: bytesOfHex(built.id, 'the id of a segment'),
    class: cls,
    size: built.bytes.length,
    ulen,
    inputs: bytesOfHex(built.inputs, `inputs of ${built.id}`),
  }
  if (book !== undefined) out.book = book
  if (part !== undefined) out.part = part
  if (group !== undefined) out.group = group
  return out
}

// Other tables

function encodeAbout(about: About): CborValue {
  if (about.format !== '3.0') throw new Error('about.format is not "3.0"')
  if (about.origin !== 'published' && about.origin !== 'local') throw new Error('about.origin is not "published" or "local"')
  if (!isCount(about.revision)) throw new Error('about.revision is not an integer from 0 to 2^53 - 1')
  if (typeof about.built !== 'string' || !RFC3339.test(about.built)) throw new Error('about.built is not an RFC 3339 date and time')
  if (about.direction !== undefined && about.direction !== 'ltr' && about.direction !== 'rtl') throw new Error('about.direction is not "ltr" or "rtl"')
  const out: Record<string, CborValue> = {
    format: '3.0',
    catalog: needText(about.catalog, 'about.catalog'),
    publisher: needText(about.publisher, 'about.publisher'),
    origin: about.origin,
    revision: about.revision,
    built: about.built,
    builder: needText(about.builder, 'about.builder'),
  }
  if (about.previous !== undefined) out.previous = needBytes(about.previous, 32, 'about.previous')
  if (about.name !== undefined) out.name = needText(about.name, 'about.name')
  if (about.direction !== undefined) out.direction = about.direction
  return out
}

function encodeResources(resources: CatalogResource[]): CborValue[] {
  const keys = new Set<string>()
  const ordered = [...resources].sort((a, b) => compareCodePoints(a.key, b.key))
  return ordered.map((resource): CborValue => {
    const key = needText(resource.key, 'the key of a resource')
    if (keys.has(key)) throw new Error(`The resource ${JSON.stringify(key)} is listed twice`)
    keys.add(key)
    const where = `The resource ${JSON.stringify(key)}`
    const out: Record<string, CborValue> = { key, books: needBytes(resource.books, 9, `${where}: books`) }
    for (const field of ['title', 'subject', 'release', 'license'] as const) {
      if (typeof resource[field] !== 'string') throw new Error(`${where}: ${field} is not text`)
      out[field] = resource[field]
    }
    optionalTexts(out, resource, ['rights', 'attribution'], where)
    return out
  })
}

function encodeComplements(complements: Complement[]): CborValue[] {
  const checked = complements.map((complement) => {
    const where = `The complement ${JSON.stringify(complement.kind)}`
    const out: Record<string, CborValue> = {
      kind: needText(complement.kind, 'the kind of a complement'),
      id: needBytes(complement.id, 32, `${where}: id`),
      media: needText(complement.media, `${where}: media`),
      version: needText(complement.version, `${where}: version`),
    }
    if (!isCount(complement.size)) throw new Error(`${where}: size is not an integer from 0 to 2^53 - 1`)
    out.size = complement.size
    optionalTexts(out, complement, ['lang', 'for', 'license'], where)
    return { out, order: [complement.kind, complement.lang ?? '', hex(complement.id)] as const }
  })
  checked.sort((a, b) => compareCodePoints(a.order[0], b.order[0]) || compareCodePoints(a.order[1], b.order[1]) || compareCodePoints(a.order[2], b.order[2]))
  for (let i = 1; i < checked.length; i++) {
    if (checked[i].order.join('\0') === checked[i - 1].order.join('\0')) {
      throw new Error(`The complement ${JSON.stringify(checked[i].order[0])} ${checked[i].order[2]} is listed twice`)
    }
  }
  return checked.map(({ out }) => out)
}

/** What the catalog itself says it was built from: see {@link buildCatalog}. */
function catalogInputs(ids: string[]): string {
  const sorted = [...new Set(ids)].sort()
  return hex(sha256(new TextEncoder().encode(sorted.join('\n'))))
}

/**
 * The catalog segment (`catalog.cddl`): the tables `about`, `resources`, `segments` and `units` (all required), and `requires` and
 * `complements` when they have rows. The header has `lang` for a language catalog (`about.catalog` is not `"common"`) and has none
 * for the common catalog. Written without signature.
 *
 * - `segments` are the built segments of the catalog, ordered as the top of this file says; `size` is the length of the file and
 *   `ulen` the one of its header. A catalog is not listed in a catalog.
 * - `needs(segment)` gives the units a segment needs (`unitsOf`, `needsOfBook`); without it no unit has `needs`.
 * - `requires` is `[catalog, revision, id]` with the id in hex (the common catalog a language catalog was built against).
 * - The same inputs give the same catalog and id, `about.built` included: the caller passes the date.
 * - The catalog's own `inputs` is the sha256, in hex, of the ids of its segments, of the `requires` and of its complements (as 64
 *   lowercase hex digits each, without repeats, sorted, joined by a line feed). `about` and `resources` are not in it.
 *
 * Throws `Error` when something cannot go in the catalog: a segment twice or of a class that is not a unit, a unit twice, an id that is
 * not 32 bytes, a resource, a catalog in `requires` or a complement twice, a field of the wrong type.
 */
export async function buildCatalog(o: {
  about: About
  resources: CatalogResource[]
  segments: BuiltSegment[]
  requires?: [string, number, string][]
  complements?: Complement[]
  needs?: (s: BuiltSegment) => string[]
}): Promise<BuiltSegment> {
  const about = encodeAbout(o.about)
  const resources = encodeResources(o.resources)

  const ordered = [...o.segments].sort(compareSegments)
  const ids = new Set<string>()
  for (const built of ordered) {
    if (ids.has(built.id)) throw new Error(`The segment ${built.id} is listed twice`)
    ids.add(built.id)
  }
  const units = unitsOf(ordered, o.needs ?? (() => []))
  const segments = ordered.map(encodeSegmentEntry)

  const requires = (o.requires ?? [])
    .map(([catalog, revision, id]): [string, number, Uint8Array] => {
      if (!isCount(revision)) throw new Error(`The revision of ${JSON.stringify(catalog)} in requires is not an integer from 0 to 2^53 - 1`)
      return [needText(catalog, 'a catalog in requires'), revision, bytesOfHex(id, `the id of ${JSON.stringify(catalog)} in requires`)]
    })
    .sort((a, b) => compareCodePoints(a[0], b[0]) || a[1] - b[1])
  for (let i = 1; i < requires.length; i++) {
    if (requires[i][0] === requires[i - 1][0]) throw new Error(`The catalog ${JSON.stringify(requires[i][0])} is in requires twice`)
  }
  const complements = encodeComplements(o.complements ?? [])

  const tables: Record<string, [number, boolean]> = { about: [1, true], resources: [1, true], segments: [1, true], units: [1, true] }
  const t: Record<string, CborValue> = { about, resources, segments, units: units.map((unit): CborValue => ({ ...unit }) as CborValue) }
  if (requires.length > 0) {
    tables.requires = [1, false]
    t.requires = requires
  }
  if (complements.length > 0) {
    tables.complements = [1, false]
    t.complements = complements
  }
  const seg: Segment = { h: { class: 'catalog', v: 1, tables }, t }
  if (o.about.catalog !== 'common') seg.h.lang = o.about.catalog

  const inputs = catalogInputs([...ordered.map((built) => built.id), ...requires.map(([, , id]) => hex(id)), ...complements.map((c) => hex((c as { id: Uint8Array }).id))])
  return builtSegment(seg, inputs)
}
