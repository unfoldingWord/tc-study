/**
 * The segments of the topics classes: `xtopics` (`spec/cddl/xtopics.cddl`, the common topics) and `topics`
 * (`spec/cddl/topics.cddl`, a language's). Each is a core or the part of one book. The readers are in `read/topics.ts`.
 * No Node module is used.
 */
import type { CborValue } from '../../codec/cbor'
import { compareCodePoints, encodeDeltas, encodeUvarints } from '../../codec/columns'
import type { Segment } from '../../codec/container'
import { encodeBookSet, encodeCounts, encodeCoverage, encodeVerseLists } from '../../codec/counts'
import { put } from '../../codec/values'
import { chunksTable } from './chunks'
import { OBS_FRAME_KEY } from '../../read/topics'
import { TOPIC_KINDS, TOPIC_NAME_SOURCES, type TopicsCore, type TopicsPart, type TopicsPeople, type XtopicsCore, type XtopicsPart } from '../../model'

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
  if (m.chunks !== undefined) {
    const byBook = new Map(Object.entries(m.chunks))
    for (const [book, list] of byBook) if (list.length === 0) throw new Error(`chunks: ${JSON.stringify(book)} has no section`)
    tables.chunks = [1, false]
    t.chunks = chunksTable(byBook)
  }
  if (m.obsFrames !== undefined) {
    const out: Record<string, number[][]> = {}
    for (const [k, v] of Object.entries(sortedRecord(m.obsFrames))) {
      if (!OBS_FRAME_KEY.test(k)) throw new Error(`obs-frames: ${JSON.stringify(k)} is not a frame "N:F"`)
      if (v.length === 0) throw new Error(`obs-frames: ${JSON.stringify(k)} has no range`)
      for (const [a, b] of v) {
        for (const n of [a, b]) {
          if (!Number.isSafeInteger(n) || n < 1_000_000 || n >= 67_000_000) throw new Error(`obs-frames: ${JSON.stringify(k)} has ${n}, which is not a verse id`)
        }
        if (a > b) throw new Error(`obs-frames: ${JSON.stringify(k)} has a range that runs backwards`)
        if (Math.floor(a / 1000) !== Math.floor(b / 1000)) throw new Error(`obs-frames: ${JSON.stringify(k)} has a range across two chapters`)
      }
      put(out, k, v.map(([a, b]) => [a, b]))
    }
    tables['obs-frames'] = [1, false]
    t['obs-frames'] = out
  }
  if (m.gender !== undefined) {
    for (const [k, v] of Object.entries(m.gender)) {
      if (!number.has(k)) throw new Error(`gender: ${JSON.stringify(k)} is not a topic`)
      if (m.topics.get(k)!.kind !== 'person' || !k.startsWith('per:')) throw new Error(`gender: ${JSON.stringify(k)} is not a person (per:)`)
      if (v !== 1 && v !== 2) throw new Error(`gender: ${JSON.stringify(k)} is ${String(v)}, not 1 or 2`)
    }
    tables.gender = [1, false]
    t.gender = encodeUvarints(ids.map((id) => m.gender![id] ?? 0))
  }
  if (m.geo !== undefined) {
    for (const k of Object.keys(m.geo)) if (!number.has(k)) throw new Error(`geo: ${JSON.stringify(k)} is not a topic`)
    const sure: number[] = []
    const form: number[] = []
    const lat: number[] = []
    const lon: number[] = []
    for (const id of ids) {
      const g = m.geo[id]
      if (m.topics.get(id)!.kind !== 'place') {
        if (g !== undefined) throw new Error(`geo: ${JSON.stringify(id)} is not a place`)
        sure.push(0), form.push(0), lat.push(0), lon.push(0)
        continue
      }
      if (g === undefined) throw new Error(`geo: the place ${JSON.stringify(id)} has no entry`)
      if (![0, 1, 2, 3].includes(g.sure)) throw new Error(`geo: ${JSON.stringify(id)} has sure ${String(g.sure)}`)
      if (![1, 2, 3, 4, 5].includes(g.form)) throw new Error(`geo: ${JSON.stringify(id)} has form ${String(g.form)}`)
      if (!Number.isSafeInteger(g.lat) || !Number.isSafeInteger(g.lon)) throw new Error(`geo: ${JSON.stringify(id)} has a point that is not two integers`)
      if (g.sure === 0 && (g.lat !== 0 || g.lon !== 0)) throw new Error(`geo: ${JSON.stringify(id)} has a point and sure 0`)
      if (g.sure > 0 && (g.lat < -9000 || g.lat > 9000 || g.lon < -18000 || g.lon > 18000)) throw new Error(`geo: ${JSON.stringify(id)} is outside the globe`)
      sure.push(g.sure), form.push(g.form), lat.push(g.lat), lon.push(g.lon)
    }
    tables.geo = [1, false]
    t.geo = { lat: encodeDeltas(lat), lon: encodeDeltas(lon), sure: encodeUvarints(sure), form: encodeUvarints(form) }
  }
  if (m.routes !== undefined) {
    const events = new Set<string>()
    const event: number[] = []
    const count: number[] = []
    const stops: number[] = []
    for (const r of m.routes) {
      const e = number.get(r.event)
      if (e === undefined || m.topics.get(r.event)!.kind !== 'event') throw new Error(`routes: ${JSON.stringify(r.event)} is not an event of the topics`)
      if (events.has(r.event)) throw new Error(`routes: ${JSON.stringify(r.event)} has two routes`)
      events.add(r.event)
      if (r.stops.length < 2) throw new Error(`routes: ${JSON.stringify(r.event)} has fewer than 2 stops`)
      r.stops.forEach((id, i) => {
        if (!number.has(id) || m.topics.get(id)!.kind !== 'place') throw new Error(`routes: the stop ${JSON.stringify(id)} of ${JSON.stringify(r.event)} is not a place of the topics`)
        if (i > 0 && r.stops[i - 1] === id) throw new Error(`routes: ${JSON.stringify(r.event)} has the stop ${JSON.stringify(id)} twice in a row`)
        stops.push(number.get(id)!)
      })
      event.push(e)
      count.push(r.stops.length)
    }
    tables.routes = [1, false]
    t.routes = { event: encodeUvarints(event), count: encodeUvarints(count), stops: encodeUvarints(stops) }
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

/** The table `people` or `places` as written: the shape of {@link TopicsPeople}, every id with `prefix`, no empty text, the ids of an alias sorted. Throws on a defect. */
function namesTable(m: TopicsPeople, name: 'people' | 'places', prefix: 'per:' | 'lug:'): Record<string, CborValue> {
  const check = (id: string, what: string): void => {
    if (!id.startsWith(prefix)) throw new Error(`${name}: ${what} ${JSON.stringify(id)} is not a ${prefix} id`)
  }
  const text = (v: string, what: string): string => {
    if (typeof v !== 'string' || v === '') throw new Error(`${name}: ${what} is empty`)
    return v
  }
  const names: Record<string, string> = {}
  for (const [k, v] of Object.entries(sortedRecord(m.names))) {
    check(k, 'the name of')
    put(names, k, text(v, `the name of ${k}`))
  }
  const notes: Record<string, string> = {}
  for (const [k, v] of Object.entries(sortedRecord(m.notes))) {
    check(k, 'the note of')
    put(notes, k, text(v, `the note of ${k}`))
  }
  const aliases: Record<string, string[]> = {}
  for (const [k, v] of Object.entries(sortedRecord(m.aliases))) {
    text(k, 'an alias')
    if (v.length === 0) throw new Error(`${name}: the alias ${JSON.stringify(k)} names no one`)
    const ids = [...v].sort(compareCodePoints)
    ids.forEach((id, i) => {
      check(id, `the alias ${JSON.stringify(k)} names`)
      if (i > 0 && ids[i - 1] === id) throw new Error(`${name}: the alias ${JSON.stringify(k)} names ${id} twice`)
    })
    put(aliases, k, ids)
  }
  return { names, notes, aliases }
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
  if (m.people !== undefined) {
    tables.people = [1, false]
    t.people = namesTable(m.people, 'people', 'per:')
  }
  if (m.places !== undefined) {
    tables.places = [1, false]
    t.places = namesTable(m.places, 'places', 'lug:')
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

