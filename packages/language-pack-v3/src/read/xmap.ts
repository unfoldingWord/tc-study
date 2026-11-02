/**
 * The reader of the common map segment (`spec/cddl/xmap.cddl`): a {@link Segment} that `readSegment` has accepted, back into
 * the core or the part of a book. It rejects the segment with `E_BODY` at the first defect. No Node module is used.
 */
import { ColumnError, compareCodePoints, decodeUvarints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { decodeCounts, decodeCoverage, decodeVerseLists } from '../codec/counts'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap } from '../codec/values'
import { bookNumber } from '../ids'
import { CONCEPT_KINDS, type Concept, type Relation, TW_CATEGORIES, type XmapCore, type XmapPart } from '../model'

/** The tables this reader knows, as `readSegment` takes them in `known`. `topics` is not known yet (optional, skipped). */
export const XMAP_TABLES: Record<string, number[]> = {
  coverage: [1],
  strong: [1],
  concepts: [1],
  links: [1],
  notes: [1],
  relations: [1],
  aliases: [1],
  strongs: [1],
}

const CORE_ONLY = ['coverage', 'concepts', 'relations', 'aliases', 'strongs']

function bad(what: string): never {
  throw new FormatError('E_BODY', `the xmap segment is malformed: ${what}`)
}

function column(value: unknown, what: string): number[] {
  if (!(value instanceof Uint8Array)) bad(`${what} is not a byte string`)
  return decodeUvarints(value)
}

function sortedUnique(keys: string[], what: string): void {
  for (let i = 1; i < keys.length; i++) {
    if (compareCodePoints(keys[i - 1], keys[i]) >= 0) bad(`${what} are not sorted by code point or one is repeated`)
  }
}

function texts(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) bad(`${what} is not a list of text`)
  return value as string[]
}

function table(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function readConcepts(value: unknown, res: [string, string][]): Map<string, Concept> {
  const c = table(value, 'concepts')
  const ids = texts(c.ids, 'concepts.ids')
  sortedUnique(ids, 'concepts.ids')
  const kind = column(c.kind, 'concepts.kind')
  const tw = column(c.tw, 'concepts.tw')
  const source = column(c.source, 'concepts.source')
  if (kind.length !== ids.length || tw.length !== ids.length || source.length !== ids.length) bad('the columns of concepts have different lengths')
  const out = new Map<string, Concept>()
  ids.forEach((id, i) => {
    if (kind[i] >= CONCEPT_KINDS.length) bad(`concepts.kind of ${JSON.stringify(id)} is ${kind[i]}`)
    if (tw[i] >= TW_CATEGORIES.length) bad(`concepts.tw of ${JSON.stringify(id)} is ${tw[i]}`)
    if (source[i] >= res.length) bad(`concepts.source of ${JSON.stringify(id)} is ${source[i]}, and the header has ${res.length} resources`)
    out.set(id, { kind: CONCEPT_KINDS[kind[i]], tw: TW_CATEGORIES[tw[i]], source: res[source[i]][0] })
  })
  return out
}

function readRelations(value: unknown, ids: string[], res: [string, string][]): Relation[] {
  const r = table(value, 'relations')
  const types = texts(r.types, 'relations.types')
  const from = column(r.from, 'relations.from')
  const to = column(r.to, 'relations.to')
  const type = column(r.type, 'relations.type')
  const source = column(r.source, 'relations.source')
  const confidence = column(r.confidence, 'relations.confidence')
  const n = from.length
  if ([to, type, source, confidence].some((c) => c.length !== n)) bad('the columns of relations have different lengths')
  return from.map((f, i) => {
    if (f >= ids.length || to[i] >= ids.length) bad(`relation ${i} names a concept outside concepts`)
    if (type[i] >= types.length) bad(`relation ${i} names a type outside types`)
    if (source[i] >= res.length) bad(`relation ${i} names a source outside res`)
    if (confidence[i] > 100) bad(`relation ${i} has confidence ${confidence[i]}`)
    return { from: ids[f], to: ids[to[i]], type: types[type[i]], source: res[source[i]][0], confidence: confidence[i] }
  })
}

function readCore(seg: Segment): XmapCore {
  const { h, t } = seg
  if (h.book !== undefined) bad('a core has a book')
  if (h.res === undefined || h.res.length === 0) bad('the header of a core has no resource (res)')
  for (const key of ['coverage', 'strong', 'concepts']) if (!hasOwn(t, key)) bad(`the table "${key}" is missing`)
  const res = h.res.map(([k, s]) => [k, s] as [string, string])
  const concepts = readConcepts(t.concepts, res)
  const core: XmapCore = {
    part: 'core',
    res,
    coverage: decodeCoverage(t.coverage),
    strong: { unit: 'occurrences', rows: decodeCounts(t.strong, 'occurrences') },
    concepts,
  }
  if (hasOwn(t, 'links')) core.links = { unit: 'links', rows: decodeCounts(t.links, 'links') }
  if (hasOwn(t, 'notes')) core.notes = { unit: 'notes', rows: decodeCounts(t.notes, 'notes') }
  if (hasOwn(t, 'relations')) core.relations = readRelations(t.relations, [...concepts.keys()], res)
  if (hasOwn(t, 'aliases')) {
    const a = table(t.aliases, 'aliases')
    sortedUnique(Object.keys(a), 'aliases keys')
    const out: Record<string, string> = {}
    for (const [k, v] of Object.entries(a)) {
      if (typeof v !== 'string') bad(`aliases[${JSON.stringify(k)}] is not text`)
      if (!concepts.has(v)) bad(`aliases[${JSON.stringify(k)}] names ${JSON.stringify(v)}, which is not a concept`)
      out[k] = v
    }
    core.aliases = out
  }
  if (hasOwn(t, 'strongs')) {
    const s = table(t.strongs, 'strongs')
    sortedUnique(Object.keys(s), 'strongs keys')
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(s)) {
      const list = texts(v, `strongs[${JSON.stringify(k)}]`)
      if (list.length === 0) bad(`strongs[${JSON.stringify(k)}] is empty`)
      if (!concepts.has(k)) bad(`strongs names ${JSON.stringify(k)}, which is not a concept`)
      sortedUnique(list, `strongs[${JSON.stringify(k)}]`)
      out[k] = [...list]
    }
    core.strongs = out
  }
  return core
}

function readPart(seg: Segment, part: string): XmapPart {
  const { h, t } = seg
  try {
    bookNumber(part)
  } catch {
    bad(`the part ${JSON.stringify(part)} is not a book code`)
  }
  if (h.book !== part) bad(`the part is ${JSON.stringify(part)} and the book ${JSON.stringify(h.book)}`)
  if (h.res !== undefined && h.res.length > 0) bad('a part has resources (res)')
  for (const key of CORE_ONLY) if (hasOwn(t, key)) bad(`the table "${key}" belongs to the core`)
  if (!hasOwn(t, 'strong')) bad('the table "strong" is missing')
  const out: XmapPart = { part, strong: decodeVerseLists(part, t.strong) }
  if (hasOwn(t, 'links')) out.links = decodeVerseLists(part, t.links)
  if (hasOwn(t, 'notes')) out.notes = decodeVerseLists(part, t.notes)
  return out
}

/**
 * The core or the part a common map segment holds. Throws {@link FormatError} `E_BODY` when the segment is not an xmap
 * segment or a table is not what `xmap.cddl` says.
 */
export function xmapView(seg: Segment): XmapCore | XmapPart {
  if (seg.h.class !== 'xmap') bad(`the class is "${seg.h.class}"`)
  if (seg.h.part === undefined) bad('the header has no part')
  try {
    return seg.h.part === 'core' ? readCore(seg) : readPart(seg, seg.h.part)
  } catch (error) {
    if (error instanceof ColumnError) bad(error.message)
    throw error
  }
}
