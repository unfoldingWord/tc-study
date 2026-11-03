/**
 * The readers of the topics segments: `xtopics` (`spec/cddl/xtopics.cddl`) and `topics` (`spec/cddl/topics.cddl`), each a
 * {@link Segment} that `readSegment` has accepted, back into the core or the part of a book. They reject the segment with
 * `E_BODY` at the first defect. No Node module is used.
 */
import { ColumnError, compareCodePoints, decodeUvarints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { decodeBookSet, decodeCounts, decodeCoverage, decodeVerseLists } from '../codec/counts'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap, put } from '../codec/values'
import { BOOKS, bookNumber } from '../ids'
import {
  TOPIC_KINDS,
  TOPIC_NAME_SOURCES,
  type Topic,
  type TopicName,
  type TopicRelation,
  type TopicsCore,
  type TopicsPart,
  type XtopicsCore,
  type XtopicsPart,
} from '../model'

/** The tables the `xtopics` reader knows, as `readSegment` takes them in `known`. */
export const XTOPICS_TABLES: Record<string, number[]> = {
  coverage: [1],
  topics: [1],
  relations: [1],
  strongs: [1],
  occurrences: [1],
  ranges: [1],
}

/** The tables the `topics` reader knows. */
export const TOPICS_TABLES: Record<string, number[]> = {
  names: [1],
  local: [1],
  coverage: [1],
}

const XTOPICS_CORE_ONLY = ['coverage', 'topics', 'relations', 'strongs', 'ranges']
const TOPICS_CORE_ONLY = ['local', 'coverage'] // "names" is in both: a map in the core, verse lists in a part

type Bad = (what: string) => never

function fail(cls: string, what: string): never {
  throw new FormatError('E_BODY', `the ${cls} segment is malformed: ${what}`)
}

function column(value: unknown, what: string, bad: Bad): number[] {
  if (!(value instanceof Uint8Array)) bad(`${what} is not a byte string`)
  return decodeUvarints(value)
}

function texts(value: unknown, what: string, bad: Bad): string[] {
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string')) bad(`${what} is not a list of text`)
  return value as string[]
}

function table(value: unknown, what: string, bad: Bad): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function sortedUnique(keys: string[], what: string, bad: Bad): void {
  for (let i = 1; i < keys.length; i++) {
    if (compareCodePoints(keys[i - 1], keys[i]) >= 0) bad(`${what} are not sorted by code point or one is repeated`)
  }
}

function checkPart(seg: Segment, part: string, bad: Bad): void {
  const { h } = seg
  try {
    bookNumber(part)
  } catch {
    bad(`the part ${JSON.stringify(part)} is not a book code`)
  }
  if (h.book !== undefined && h.book !== part) bad(`the part is ${JSON.stringify(part)} and the book ${JSON.stringify(h.book)}`)
  if (!Array.isArray(h.res) || h.res.length > 0) bad('a part has resources (res), or none is written')
}

function isVerseId(n: unknown): n is number {
  return typeof n === 'number' && Number.isSafeInteger(n) && n >= 1_000_000 && n < (BOOKS.length + 1) * 1_000_000
}

// xtopics

const xbad: Bad = (what) => fail('xtopics', what)

function readTopics(value: unknown, res: [string, string][]): Map<string, Topic> {
  const c = table(value, 'topics', xbad)
  const ids = texts(c.ids, 'topics.ids', xbad)
  sortedUnique(ids, 'topics.ids', xbad)
  const kind = column(c.kind, 'topics.kind', xbad)
  const source = column(c.source, 'topics.source', xbad)
  const ref = column(c.ref, 'topics.ref', xbad)
  const refs = texts(c.refs, 'topics.refs', xbad)
  const title = texts(c.title, 'topics.title', xbad)
  const ustrong = texts(c.ustrong, 'topics.ustrong', xbad)
  const n = ids.length
  if ([kind, source, ref].some((col) => col.length !== n)) xbad('the columns of topics have different lengths')
  if (title.length !== n) xbad('topics.title does not have one entry per id')
  if (ustrong.length !== n) xbad('topics.ustrong does not have one entry per id')
  if (new Set(refs).size !== refs.length) xbad('topics.refs has a text twice')
  let next = 0
  ref.forEach((r, i) => {
    if (r >= refs.length) xbad(`topics.ref of ${JSON.stringify(ids[i])} is ${r}, and refs has ${refs.length} entries`)
    if (r > next) xbad('topics.refs is not in the order of first use')
    if (r === next) next++
  })
  if (next !== refs.length) xbad('topics.refs has a text that no id uses')
  const out = new Map<string, Topic>()
  ids.forEach((id, i) => {
    if (kind[i] < 1 || kind[i] >= TOPIC_KINDS.length) xbad(`topics.kind of ${JSON.stringify(id)} is ${kind[i]}`)
    if (source[i] >= res.length) xbad(`topics.source of ${JSON.stringify(id)} is ${source[i]}, and the header has ${res.length} resources`)
    out.set(id, { kind: TOPIC_KINDS[kind[i]], source: res[source[i]][0], ref: refs[ref[i]], title: title[i], ustrong: ustrong[i] })
  })
  return out
}

function readRelations(value: unknown, ids: string[], res: [string, string][]): TopicRelation[] {
  const r = table(value, 'relations', xbad)
  const types = texts(r.types, 'relations.types', xbad)
  const external = texts(r.external, 'relations.external', xbad)
  sortedUnique(external, 'relations.external', xbad)
  const from = column(r.from, 'the from column of relations', xbad)
  const to = column(r.to, 'relations.to', xbad)
  const type = column(r.type, 'relations.type', xbad)
  const source = column(r.source, 'relations.source', xbad)
  const confidence = column(r.confidence, 'relations.confidence', xbad)
  const n = from.length
  if ([to, type, source, confidence].some((c) => c.length !== n)) xbad('the columns of relations have different lengths')
  const all = [...ids, ...external]
  return from.map((f, i) => {
    if (f >= all.length || to[i] >= all.length) xbad(`relation ${i} names an end beyond the topics and external`)
    if (type[i] >= types.length) xbad(`relation ${i} names a type outside types`)
    if (source[i] >= res.length) xbad(`relation ${i} names a source outside res`)
    if (confidence[i] > 100) xbad(`relation ${i} has confidence ${confidence[i]}`)
    return { from: all[f], to: all[to[i]], type: types[type[i]], source: res[source[i]][0], confidence: confidence[i] }
  })
}

function readXCore(seg: Segment): XtopicsCore {
  const { h, t } = seg
  if (h.book !== undefined) xbad('a core has a book')
  if (h.res === undefined || h.res.length === 0) xbad('the header of a core has no resource (res)')
  for (const key of ['coverage', 'topics', 'occurrences']) if (!hasOwn(t, key)) xbad(`the table "${key}" is missing`)
  const res = h.res.map(([k, s]) => [k, s] as [string, string])
  const topics = readTopics(t.topics, res)
  const occurrences = decodeCounts(t.occurrences, 'verses')
  for (const [key, books] of occurrences) {
    if (!topics.has(key)) xbad(`occurrences names ${JSON.stringify(key)}, which is not a topic`)
    for (const [book, [count, verses]] of books) {
      if (count !== verses) xbad(`occurrences of ${JSON.stringify(key)} in ${book} has count ${count} and ${verses} verses`)
    }
  }
  const core: XtopicsCore = { part: 'core', res, coverage: decodeCoverage(t.coverage), topics, occurrences }
  if (hasOwn(t, 'relations')) core.relations = readRelations(t.relations, [...topics.keys()], res)
  if (hasOwn(t, 'strongs')) {
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(table(t.strongs, 'strongs', xbad))) {
      const list = texts(v, `strongs[${JSON.stringify(k)}]`, xbad)
      if (list.length === 0) xbad(`strongs[${JSON.stringify(k)}] is empty`)
      if (!topics.has(k)) xbad(`strongs names ${JSON.stringify(k)}, which is not a topic`)
      sortedUnique(list, `strongs[${JSON.stringify(k)}]`, xbad)
      put(out, k, [...list])
    }
    core.strongs = out
  }
  if (hasOwn(t, 'ranges')) {
    const out: Record<string, [number, number][]> = {}
    for (const [k, v] of Object.entries(table(t.ranges, 'ranges', xbad))) {
      if (!topics.has(k)) xbad(`ranges names ${JSON.stringify(k)}, which is not a topic`)
      if (!Array.isArray(v) || v.length === 0) xbad(`ranges[${JSON.stringify(k)}] is not a non-empty list`)
      put(
        out,
        k,
        v.map((pair) => {
          if (!Array.isArray(pair) || pair.length !== 2 || !isVerseId(pair[0]) || !isVerseId(pair[1])) {
            xbad(`ranges[${JSON.stringify(k)}] has a pair that is not two verse ids`)
          }
          const [a, b] = pair as [number, number]
          if (a > b) xbad(`ranges[${JSON.stringify(k)}] has a range that runs backwards`)
          return [a, b] as [number, number]
        }),
      )
    }
    core.ranges = out
  }
  return core
}

function readXPart(seg: Segment, part: string): XtopicsPart {
  checkPart(seg, part, xbad)
  for (const key of XTOPICS_CORE_ONLY) if (hasOwn(seg.t, key)) xbad(`the table "${key}" belongs to the core`)
  if (!hasOwn(seg.t, 'occurrences')) xbad('the table "occurrences" is missing')
  return { part, occurrences: decodeVerseLists(part, seg.t.occurrences) }
}

/**
 * The core or the part a common topics segment holds. Throws {@link FormatError} `E_BODY` when the segment is not an
 * xtopics segment or a table is not what `xtopics.cddl` says.
 */
export function xtopicsView(seg: Segment): XtopicsCore | XtopicsPart {
  if (seg.h.class !== 'xtopics') xbad(`the class is "${seg.h.class}"`)
  if (seg.h.part === undefined) xbad('the header has no part')
  try {
    return seg.h.part === 'core' ? readXCore(seg) : readXPart(seg, seg.h.part)
  } catch (error) {
    if (error instanceof ColumnError) xbad(error.message)
    throw error
  }
}

// topics

const tbad: Bad = (what) => fail('topics', what)

function readNames(value: unknown): Record<string, TopicName[]> {
  const out: Record<string, TopicName[]> = {}
  for (const [k, v] of Object.entries(table(value, 'names', tbad))) {
    if (!Array.isArray(v) || v.length === 0) tbad(`names[${JSON.stringify(k)}] is not a non-empty list`)
    put(
      out,
      k,
      v.map((row, i) => {
        const where = `names[${JSON.stringify(k)}][${i}]`
        if (!Array.isArray(row) || row.length !== 4) tbad(`${where} is not [name, source, count, books]`)
        const [name, source, count, books] = row
        if (typeof name !== 'string' || name === '') tbad(`${where} has no name`)
        if (typeof source !== 'string' || !(TOPIC_NAME_SOURCES as readonly string[]).includes(source)) {
          tbad(`${where} has the source ${JSON.stringify(source)}`)
        }
        if (typeof count !== 'number' || !Number.isSafeInteger(count) || count < 1) tbad(`${where} has the count ${String(count)}`)
        return [name, source, count, decodeBookSet(books)] as TopicName
      }),
    )
  }
  return out
}

function readTCore(seg: Segment): TopicsCore {
  const { h, t } = seg
  if (h.book !== undefined) tbad('a core has a book')
  if (h.res === undefined) tbad('the header of a core has no resource list (res)')
  for (const key of ['names', 'coverage']) if (!hasOwn(t, key)) tbad(`the table "${key}" is missing`)
  const core: TopicsCore = {
    lang: h.lang!,
    part: 'core',
    res: h.res.map(([k, s]) => [k, s] as [string, string]),
    names: readNames(t.names),
    coverage: decodeCoverage(t.coverage),
  }
  if (hasOwn(t, 'local')) {
    const out: NonNullable<TopicsCore['local']> = {}
    for (const [k, v] of Object.entries(table(t.local, 'local', tbad))) {
      const where = `local[${JSON.stringify(k)}]`
      const row = table(v, where, tbad)
      const entry: NonNullable<TopicsCore['local']>[string] = { names: texts(row.names, `${where}.names`, tbad) }
      if (entry.names.length === 0) tbad(`${where}.names is empty`)
      if (hasOwn(row, 'refs')) {
        const refs = row.refs
        if (!Array.isArray(refs)) tbad(`${where}.refs is not a list`)
        entry.refs = refs.map((p) => {
          if (!Array.isArray(p) || p.length !== 2 || !isVerseId(p[0]) || !isVerseId(p[1])) tbad(`${where}.refs has a pair that is not two verse ids`)
          return [p[0], p[1]] as [number, number]
        })
      }
      if (hasOwn(row, 'related')) entry.related = [...texts(row.related, `${where}.related`, tbad)]
      put(out, k, entry)
    }
    core.local = out
  }
  return core
}

function readTPart(seg: Segment, part: string): TopicsPart {
  checkPart(seg, part, tbad)
  for (const key of TOPICS_CORE_ONLY) if (hasOwn(seg.t, key)) tbad(`the table "${key}" belongs to the core`)
  const out: TopicsPart = { lang: seg.h.lang!, part }
  if (hasOwn(seg.t, 'names')) out.names = decodeVerseLists(part, seg.t.names)
  return out
}

/**
 * The core or the part a language topics segment holds. Throws {@link FormatError} `E_BODY` when the segment is not a
 * topics segment or a table is not what `topics.cddl` says.
 */
export function topicsView(seg: Segment): TopicsCore | TopicsPart {
  if (seg.h.class !== 'topics') tbad(`the class is "${seg.h.class}"`)
  if (seg.h.part === undefined) tbad('the header has no part')
  if (typeof seg.h.lang !== 'string' || seg.h.lang === '') tbad('the header has no lang')
  try {
    return seg.h.part === 'core' ? readTCore(seg) : readTPart(seg, seg.h.part)
  } catch (error) {
    if (error instanceof ColumnError) tbad(error.message)
    throw error
  }
}
