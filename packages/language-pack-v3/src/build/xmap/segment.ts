/**
 * The segment of the common map (`spec/cddl/xmap.cddl`): the core (counts, concepts, relations) or the part of one book
 * (the verses behind the counts). The reader is `read/xmap.ts`. No Node module is used.
 */
import type { CborValue } from '../../codec/cbor'
import { compareCodePoints, encodeUvarints } from '../../codec/columns'
import type { Segment } from '../../codec/container'
import { encodeCounts, encodeCoverage, encodeVerseLists } from '../../codec/counts'
import { CONCEPT_KINDS, type CountTable, TW_CATEGORIES, type XmapCore, type XmapPart } from '../../model'

type Built = { tables: Record<string, [number, boolean]>; t: Record<string, CborValue> }

function sortedRecord<T>(r: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const key of Object.keys(r).sort(compareCodePoints)) out[key] = r[key]
  return out
}

function coreTables(m: XmapCore): Built {
  if (m.res.length === 0) throw new Error('A core needs at least one resource (res)')
  const resIndex = new Map<string, number>()
  m.res.forEach(([key], i) => {
    if (resIndex.has(key)) throw new Error(`The resource ${JSON.stringify(key)} is in res twice`)
    resIndex.set(key, i)
  })
  const res = (key: string, what: string): number => {
    const i = resIndex.get(key)
    if (i === undefined) throw new Error(`${what}: the resource ${JSON.stringify(key)} is not in res`)
    return i
  }
  const counts = (c: CountTable): CborValue => encodeCounts(c.unit, c.rows)

  const ids = [...m.concepts.keys()].sort(compareCodePoints)
  const number = new Map(ids.map((id, i) => [id, i]))
  const tables: Built['tables'] = { coverage: [1, true], strong: [1, true], concepts: [1, true] }
  const t: Built['t'] = {
    coverage: encodeCoverage(m.coverage),
    strong: counts(m.strong),
    concepts: {
      ids,
      kind: encodeUvarints(ids.map((id) => index(CONCEPT_KINDS, m.concepts.get(id)!.kind, `concept ${id}: kind`))),
      tw: encodeUvarints(ids.map((id) => index(TW_CATEGORIES, m.concepts.get(id)!.tw, `concept ${id}: tw`))),
      source: encodeUvarints(ids.map((id) => res(m.concepts.get(id)!.source, `concept ${id}`))),
    },
  }
  if (m.links !== undefined) {
    tables.links = [1, false]
    t.links = counts(m.links)
  }
  if (m.notes !== undefined) {
    tables.notes = [1, false]
    t.notes = counts(m.notes)
  }
  if (m.relations !== undefined) {
    const concept = (id: string): number => {
      const n = number.get(id)
      if (n === undefined) throw new Error(`relation: ${JSON.stringify(id)} is not a concept`)
      return n
    }
    for (const r of m.relations) {
      if (!Number.isInteger(r.confidence) || r.confidence < 0 || r.confidence > 100) throw new Error('relation: confidence is not an integer from 0 to 100')
    }
    const types: string[] = []
    const typeIndex = new Map<string, number>()
    for (const r of m.relations) {
      if (!typeIndex.has(r.type)) {
        typeIndex.set(r.type, types.length)
        types.push(r.type)
      }
    }
    tables.relations = [1, false]
    t.relations = {
      types,
      from: encodeUvarints(m.relations.map((r) => concept(r.from))),
      to: encodeUvarints(m.relations.map((r) => concept(r.to))),
      type: encodeUvarints(m.relations.map((r) => typeIndex.get(r.type)!)),
      source: encodeUvarints(m.relations.map((r) => res(r.source, 'relation'))),
      confidence: encodeUvarints(m.relations.map((r) => r.confidence)),
    }
  }
  if (m.aliases !== undefined) {
    tables.aliases = [1, false]
    t.aliases = sortedRecord(m.aliases)
  }
  if (m.strongs !== undefined) {
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(sortedRecord(m.strongs))) out[k] = [...v].sort(compareCodePoints)
    tables.strongs = [1, false]
    t.strongs = out
  }
  return { tables, t }
}

function index(list: readonly string[], value: string, what: string): number {
  const i = list.indexOf(value)
  if (i < 0) throw new Error(`${what} is ${JSON.stringify(value)}, which is not known`)
  return i
}

function partTables(m: XmapPart): Built {
  const tables: Built['tables'] = { strong: [1, true] }
  const t: Built['t'] = { strong: encodeVerseLists(m.part, m.strong) }
  if (m.links !== undefined) {
    tables.links = [1, false]
    t.links = encodeVerseLists(m.part, m.links)
  }
  if (m.notes !== undefined) {
    tables.notes = [1, false]
    t.notes = encodeVerseLists(m.part, m.notes)
  }
  return { tables, t }
}

/** The segment of a core or of a book's part, the same bytes for the same model. Throws on an inconsistent model. */
export function xmapSegment(m: XmapCore | XmapPart): Segment {
  if (m.part === 'core') {
    const core = m as XmapCore
    const { tables, t } = coreTables(core)
    return { h: { class: 'xmap', v: 1, tables, part: 'core', res: core.res.map(([k, s]) => [k, s]) }, t }
  }
  const { tables, t } = partTables(m as XmapPart)
  return { h: { class: 'xmap', v: 1, tables, part: m.part, book: m.part, res: [] }, t }
}
