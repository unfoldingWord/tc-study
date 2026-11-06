/**
 * The segments of the topics classes: `xtopics` (`spec/cddl/xtopics.cddl`, the common topics) and `topics`
 * (`spec/cddl/topics.cddl`, a language's). Each is a core or the part of one book. The readers are in `read/topics.ts`.
 * No Node module is used.
 */
import type { CborValue } from '../../codec/cbor'
import { compareCodePoints, encodeUvarints } from '../../codec/columns'
import type { Segment } from '../../codec/container'
import { encodeBookSet, encodeCounts, encodeCoverage, encodeVerseLists } from '../../codec/counts'
import { put } from '../../codec/values'
import { TOPIC_KINDS, TOPIC_NAME_SOURCES, type TopicsCore, type TopicsPart, type XtopicsCore, type XtopicsPart } from '../../model'

type Built = { tables: Record<string, [number, boolean]>; t: Record<string, CborValue> }

function sortedRecord<T>(r: Record<string, T>): Record<string, T> {
  const out: Record<string, T> = {}
  for (const key of Object.keys(r).sort(compareCodePoints)) put(out, key, r[key])
  return out
}

function xtopicsCoreTables(m: XtopicsCore): Built {
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

  const ids = [...m.topics.keys()].sort(compareCodePoints)
  const number = new Map(ids.map((id, i) => [id, i]))
  const refs: string[] = []
  const refIndex = new Map<string, number>()
  const refOf = ids.map((id) => {
    const ref = m.topics.get(id)!.ref
    let i = refIndex.get(ref)
    if (i === undefined) {
      i = refs.length
      refIndex.set(ref, i)
      refs.push(ref)
    }
    return i
  })
  const kind = (id: string): number => {
    const k = TOPIC_KINDS.indexOf(m.topics.get(id)!.kind)
    if (k < 1) throw new Error(`topic ${id}: kind is ${JSON.stringify(m.topics.get(id)!.kind)}, which is not known`)
    return k
  }
  for (const key of m.occurrences.keys()) {
    if (!number.has(key)) throw new Error(`occurrences: ${JSON.stringify(key)} is not a topic`)
    for (const [book, [count, verses]] of m.occurrences.get(key)!) {
      if (count !== verses) throw new Error(`occurrences: ${JSON.stringify(key)} in ${book} has count ${count} and ${verses} verses`)
    }
  }
  const tables: Built['tables'] = { coverage: [1, true], topics: [1, true], occurrences: [1, true] }
  const t: Built['t'] = {
    coverage: encodeCoverage(m.coverage),
    topics: {
      ids,
      kind: encodeUvarints(ids.map(kind)),
      source: encodeUvarints(ids.map((id) => res(m.topics.get(id)!.source, `topic ${id}`))),
      ref: encodeUvarints(refOf),
      refs,
      title: ids.map((id) => m.topics.get(id)!.title),
      ustrong: ids.map((id) => m.topics.get(id)!.ustrong),
    },
    occurrences: encodeCounts('verses', m.occurrences),
  }
  if (m.relations !== undefined) {
    for (const r of m.relations) {
      if (!Number.isInteger(r.confidence) || r.confidence < 0 || r.confidence > 100) throw new Error('relation: confidence is not an integer from 0 to 100')
    }
    const external = [...new Set(m.relations.flatMap((r) => [r.from, r.to]).filter((id) => !number.has(id)))].sort(compareCodePoints)
    const externalIndex = new Map(external.map((id, i) => [id, ids.length + i]))
    const end = (id: string): number => number.get(id) ?? externalIndex.get(id)!
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
      external,
      from: encodeUvarints(m.relations.map((r) => end(r.from))),
      to: encodeUvarints(m.relations.map((r) => end(r.to))),
      type: encodeUvarints(m.relations.map((r) => typeIndex.get(r.type)!)),
      source: encodeUvarints(m.relations.map((r) => res(r.source, 'relation'))),
      confidence: encodeUvarints(m.relations.map((r) => r.confidence)),
    }
  }
  if (m.strongs !== undefined) {
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(sortedRecord(m.strongs))) {
      if (!number.has(k)) throw new Error(`strongs: ${JSON.stringify(k)} is not a topic`)
      if (v.length === 0) throw new Error(`strongs: ${JSON.stringify(k)} has no Strong key`)
      const sorted = [...v].sort(compareCodePoints)
      if (sorted.some((x, i) => i > 0 && x === sorted[i - 1])) throw new Error(`strongs: ${JSON.stringify(k)} repeats a Strong key`)
      put(out, k, sorted)
    }
    tables.strongs = [1, false]
    t.strongs = out
  }
  if (m.ranges !== undefined) {
    const out: Record<string, number[][]> = {}
    for (const [k, v] of Object.entries(sortedRecord(m.ranges))) {
      if (!number.has(k)) throw new Error(`ranges: ${JSON.stringify(k)} is not a topic`)
      if (v.length === 0) throw new Error(`ranges: ${JSON.stringify(k)} has no range`)
      for (const [a, b] of v) {
        for (const n of [a, b]) {
          if (!Number.isSafeInteger(n) || n < 1_000_000 || n >= 67_000_000) throw new Error(`ranges: ${JSON.stringify(k)} has ${n}, which is not a verse id`)
        }
        if (a > b) throw new Error(`ranges: ${JSON.stringify(k)} has a range that runs backwards`)
      }
      put(out, k, v.map(([a, b]) => [a, b]))
    }
    tables.ranges = [1, false]
    t.ranges = out
  }
  return { tables, t }
}

/** The segment of a core or of a book's part of the common topics, the same bytes for the same model. Throws on an inconsistent model. */
export function xtopicsSegment(m: XtopicsCore | XtopicsPart): Segment {
  if (m.part === 'core') {
    const core = m as XtopicsCore
    const { tables, t } = xtopicsCoreTables(core)
    return { h: { class: 'xtopics', v: 1, tables, part: 'core', res: core.res.map(([k, s]) => [k, s]) }, t }
  }
  const p = m as XtopicsPart
  return {
    h: { class: 'xtopics', v: 1, tables: { occurrences: [1, true] }, part: p.part, book: p.part, res: [] },
    t: { occurrences: encodeVerseLists(p.part, p.occurrences) },
  }
}

function topicsCoreTables(m: TopicsCore): Built {
  const tables: Built['tables'] = { names: [1, true], coverage: [1, true] }
  const names: Record<string, CborValue> = {}
  for (const [k, list] of Object.entries(sortedRecord(m.names))) {
    if (list.length === 0) throw new Error(`names of ${JSON.stringify(k)} is empty`)
    const seen = new Set<string>()
    put(
      names,
      k,
      [...list]
        .sort((a, b) => b[2] - a[2] || compareCodePoints(a[0], b[0]))
        .map(([name, source, count, books]) => {
        if (name === '') throw new Error(`names of ${JSON.stringify(k)} has an empty name`)
        if (!TOPIC_NAME_SOURCES.includes(source)) throw new Error(`names of ${JSON.stringify(k)}: the source ${JSON.stringify(source)} is not known`)
        if (!Number.isInteger(count) || count < 1) throw new Error(`names of ${JSON.stringify(k)}: the count of ${JSON.stringify(name)} is below 1`)
        if (seen.has(`${source}\0${name}`)) throw new Error(`names of ${JSON.stringify(k)}: ${JSON.stringify(name)} is listed twice for ${source}`)
        seen.add(`${source}\0${name}`)
        return [name, source, count, encodeBookSet(books)]
      }),
    )
  }
  const t: Built['t'] = { names, coverage: encodeCoverage(m.coverage) }
  if (m.local !== undefined) {
    tables.local = [1, false]
    const local: Record<string, CborValue> = {}
    for (const [k, v] of Object.entries(sortedRecord(m.local))) {
      if (v.names.length === 0) throw new Error(`local: ${JSON.stringify(k)} has no names`)
      const row: Record<string, CborValue> = { names: [...v.names] }
      if (v.refs !== undefined) row.refs = v.refs.map(([a, b]) => [a, b])
      if (v.related !== undefined) row.related = [...v.related]
      put(local, k, row)
    }
    t.local = local
  }
  return { tables, t }
}

/** The segment of a core or of a book's part of a language's topics. Throws on an inconsistent model. */
export function topicsSegment(m: TopicsCore | TopicsPart): Segment {
  if (m.part === 'core') {
    const core = m as TopicsCore
    const { tables, t } = topicsCoreTables(core)
    return { h: { class: 'topics', v: 1, tables, lang: core.lang, part: 'core', res: core.res.map(([k, s]) => [k, s]) }, t }
  }
  const p = m as TopicsPart
  const tables: Built['tables'] = {}
  const t: Built['t'] = {}
  if (p.names !== undefined) {
    tables.names = [1, false]
    t.names = encodeVerseLists(p.part, p.names)
  }
  return { h: { class: 'topics', v: 1, tables, lang: p.lang, part: p.part, book: p.part, res: [] }, t }
}

