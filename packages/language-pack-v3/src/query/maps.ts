/**
 * Answers from the maps, in the shapes of `spec/tests/queries/README.md` (the authority; `spec/counts.md` for the counting). A
 * cell is the answer for one key, one source and one book: `count`, `zero` (the source covers the book whole and has no row),
 * `none` (the source does not cover it) or `partial` (it covers it in part: the count is "at least"). Every answer is a plain
 * value that {@link canonicalJson} writes as the reader output does. Imports no Node module.
 */
import { compareCodePoints } from '../codec/columns'
import type { CountRows, Coverage } from '../codec/counts'
import { BOOKS, bookNumber } from '../ids'
import type { MapCore, MapPart, TopicsCore, TopicsPart, XmapCore, XmapPart, XtopicsCore, XtopicsPart } from '../model'

export type State = 'count' | 'zero' | 'none' | 'partial'
export type Cell = { state: State; count?: number; verses?: number }
export type MapSet = {
  xmap?: { core: XmapCore; parts: Map<string, XmapPart> }
  map?: { core: MapCore; parts: Map<string, MapPart> }
  /** The common topics (optional module: the map never reads them). */
  xtopics?: { core: XtopicsCore; parts: Map<string, XtopicsPart> }
  /** The topics of a language (optional module). */
  topics?: { core: TopicsCore; parts: Map<string, TopicsPart> }
  /** The revision of the catalog the maps belong to. */
  revision: number
}

export const TWL = 'unfoldingWord/en/twl'
export const TN = 'unfoldingWord/en/tn'
export const UHB = 'unfoldingWord/hbo/uhb'
export const UGNT = 'unfoldingWord/el-x-koine/ugnt'

/** The last segment of a resource key (`unfoldingWord/en/tn` is `tn`). */
const idOf = (key: string): string => key.slice(key.lastIndexOf('/') + 1)

/** The original that covers a book: the Hebrew Bible for the 39 books of the Old Testament, the Greek New Testament for the rest. */
const originalOf = (book: string): string => (bookNumber(book) <= 39 ? UHB : UGNT)

function cell(book: string, coverage: Coverage | undefined, source: string, rows: CountRows | undefined, key: string): Cell {
  const c = coverage?.get(source)
  const pair = rows?.get(key)?.get(book)
  if (c?.partial.includes(book)) return { state: 'partial', count: pair?.[0] ?? 0, verses: pair?.[1] ?? 0 }
  if (c === undefined || !c.whole.includes(book)) return { state: 'none' }
  if (pair === undefined) return { state: 'zero', count: 0, verses: 0 }
  return { state: 'count', count: pair[0], verses: pair[1] }
}

function strongAnswer(m: MapSet, key: string): unknown {
  const rows = m.xmap?.core.strong.rows
  let found = key
  if (rows?.has(key) !== true && /^G\d{4}$/.test(key) && rows?.has(`${key}0`) === true) found = `${key}0`
  const books: Record<string, Cell> = {}
  for (const book of BOOKS) books[book] = cell(book, m.xmap?.core.coverage, originalOf(book), rows, found)
  return { kind: 'strong', key: found, unit: m.xmap?.core.strong.unit ?? 'occurrences', books }
}

/** Where a usage source reads from: its coverage, its table (`links`, `notes`, `usage`) and that table's rows. */
function tableOf(m: MapSet, source: string): { coverage: Coverage; unit: string; rows: CountRows | undefined } | undefined {
  const x = m.xmap?.core
  if (x !== undefined && source === TWL && x.coverage.has(source)) return { coverage: x.coverage, unit: x.links?.unit ?? 'links', rows: x.links?.rows }
  if (x !== undefined && source === TN && x.coverage.has(source)) return { coverage: x.coverage, unit: x.notes?.unit ?? 'notes', rows: x.notes?.rows }
  const c = m.map?.core
  if (c !== undefined && source !== TN && idOf(source) === 'tn' && c.coverage.has(source)) return { coverage: c.coverage, unit: c.usage?.unit ?? 'notes', rows: c.usage?.rows }
  return undefined
}

function usageAnswer(m: MapSet, concept: string, source: string): unknown {
  const t = tableOf(m, source)
  const books: Record<string, Cell> = {}
  for (const book of BOOKS) books[book] = t === undefined ? { state: 'none' } : cell(book, t.coverage, source, t.rows, concept)
  return t === undefined ? { kind: 'usage', concept, source, books } : { kind: 'usage', concept, source, unit: t.unit, books }
}

function bookAnswer(m: MapSet, book: string): unknown {
  bookNumber(book)
  const coverage: Record<string, string> = {}
  for (const cov of [m.xmap?.core.coverage, m.map?.core.coverage]) {
    for (const [source, c] of cov ?? []) {
      const state = c.whole.includes(book) ? 'whole' : c.partial.includes(book) ? 'partial' : 'none'
      if (coverage[source] === undefined || state === 'whole' || (state === 'partial' && coverage[source] === 'none')) coverage[source] = state
    }
  }
  const tables: Record<string, { unit: string; keys: number }> = {}
  const keysOf = (rows: CountRows): number => [...rows.values()].filter((byBook) => byBook.has(book)).length
  const x = m.xmap?.core
  if (x !== undefined) {
    tables.strong = { unit: x.strong.unit, keys: keysOf(x.strong.rows) }
    if (x.links !== undefined) tables.links = { unit: x.links.unit, keys: keysOf(x.links.rows) }
    if (x.notes !== undefined) tables.notes = { unit: x.notes.unit, keys: keysOf(x.notes.rows) }
  }
  const u = m.map?.core.usage
  if (u !== undefined) tables.usage = { unit: u.unit, keys: keysOf(u.rows) }
  return { kind: 'book', book, coverage, tables }
}

function keytermsAnswer(m: MapSet, book: string): unknown {
  bookNumber(book)
  const core = m.xmap?.core
  const present = new Set<string>()
  for (const [key, byBook] of core?.strong.rows ?? []) if (byBook.has(book)) present.add(key)
  const candidates: { concept: string; strongs: string[]; matched: string[] }[] = []
  for (const [concept, list] of Object.entries(core?.strongs ?? {})) {
    if (!concept.startsWith('tw:kt/')) continue
    const matched = list.filter((s) => present.has(s)).sort(compareCodePoints)
    if (matched.length > 0) candidates.push({ concept, strongs: [...list].sort(compareCodePoints), matched })
  }
  candidates.sort((a, b) => b.matched.length - a.matched.length || compareCodePoints(a.concept, b.concept))
  return { kind: 'keyterms', book, candidates }
}

function conceptAnswer(m: MapSet, asked: string): unknown {
  const core = m.xmap?.core
  const moved = core?.aliases?.[asked]
  const id = moved !== undefined && core?.concepts.has(moved) ? moved : asked
  const concept = core?.concepts.get(id)
  if (concept === undefined) return { kind: 'concept', id: asked, found: false }
  const relations = (core?.relations ?? [])
    .filter((r) => r.from === id || r.to === id)
    .map((r) => ({ from: r.from, to: r.to, type: r.type, source: r.source, confidence: r.confidence }))
    .sort((a, b) => compareCodePoints(a.type, b.type) || compareCodePoints(a.from, b.from) || compareCodePoints(a.to, b.to))
  const out: Record<string, unknown> = {
    kind: 'concept',
    id,
    found: true,
    concept: { kind: concept.kind, tw: concept.tw, source: concept.source },
    names: m.map?.core.names[id] ?? [],
    relations,
  }
  if (id !== asked) out.alias = asked
  return out
}

function revisionAnswer(m: MapSet, concept: string, book: string): unknown {
  bookNumber(book)
  const sources: Record<string, Cell> = {}
  const verses = new Set<number>()
  const take = (lists: Map<string, number[]> | undefined): void => {
    for (const v of lists?.get(concept) ?? []) verses.add(v)
  }
  const cellOf = (source: string): Cell => {
    const t = tableOf(m, source)
    return t === undefined ? { state: 'none' } : cell(book, t.coverage, source, t.rows, concept)
  }
  if (concept.startsWith('tw:')) {
    sources[TWL] = cellOf(TWL)
    take(m.xmap?.parts.get(book)?.links)
  } else if (concept.startsWith('ta:')) {
    sources[TN] = cellOf(TN)
    take(m.xmap?.parts.get(book)?.notes)
    for (const source of m.map?.core.coverage.keys() ?? []) {
      if (idOf(source) !== 'tn') continue
      sources[source] = cellOf(source)
      take(m.map?.parts.get(book)?.usage)
    }
  }
  return { kind: 'revision', concept, book, revision: m.revision, verses: [...verses].sort((a, b) => a - b), sources }
}

const STORY_HOLDERS = new Set(['person', 'place', 'event', 'topic'])

/**
 * A topic (`per:abraham`, `ev:plagues-of-egypt`; README.md of the queries). With no `xtopics` in the set the module is not on
 * the device: `{installed: false}` and nothing else, never a state. `types` keeps only the relations of those types.
 */
function topicAnswer(m: MapSet, id: string, types?: string[]): unknown {
  const x = m.xtopics
  if (x === undefined) return { kind: 'topic', id, installed: false }
  const topic = x.core.topics.get(id)
  if (topic === undefined) return { kind: 'topic', id, installed: true, found: false }
  const books: Record<string, Cell> = {}
  for (const book of BOOKS) books[book] = cell(book, x.core.coverage, topic.source, x.core.occurrences, id)
  const verses = [...x.parts.values()].flatMap((part) => part.occurrences.get(id) ?? []).sort((a, b) => a - b)
  const stories: string[] = []
  if (STORY_HOLDERS.has(topic.kind)) {
    for (const [story, ranges] of Object.entries(x.core.ranges ?? {})) {
      if (story.startsWith('obs:') && ranges.some(([a, z]) => verses.some((v) => a <= v && v <= z))) stories.push(story)
    }
    stories.sort((a, b) => Number(a.slice(4)) - Number(b.slice(4)))
  }
  const relations = (x.core.relations ?? [])
    .filter((r) => (r.from === id || r.to === id) && (types === undefined || types.includes(r.type)))
    .map((r) => ({ from: r.from, to: r.to, type: r.type, source: r.source, confidence: r.confidence }))
    .sort((a, b) => compareCodePoints(a.type, b.type) || compareCodePoints(a.from, b.from) || compareCodePoints(a.to, b.to))
  const shown: Record<string, string> = { kind: topic.kind, source: topic.source, ref: topic.ref }
  if (topic.title !== '') shown.title = topic.title
  if (topic.ustrong !== '') shown.ustrong = topic.ustrong
  // A name under two sources is listed once, at its first place (most frequent first)
  const names = [...new Set((m.topics?.core.names[id] ?? []).map((n) => n[0]))]
  return { kind: 'topic', id, installed: true, found: true, topic: shown, unit: 'verses', books, verses, stories, relations, names }
}

/** The ids of one kind of topic (`person place event topic story section`), sorted by code point. */
function categoryAnswer(m: MapSet, topicKind: string): unknown {
  if (m.xtopics === undefined) return { kind: 'category', topicKind, installed: false }
  const ids = [...m.xtopics.core.topics].filter(([, t]) => t.kind === topicKind).map(([id]) => id).sort(compareCodePoints)
  return { kind: 'category', topicKind, installed: true, ids }
}

/** The answer to a fixed query (`spec/tests/queries/README.md`): a plain value, written with `canonicalJson`. */
export function answer(m: MapSet, query: { kind: string; [k: string]: unknown }): unknown {
  switch (query.kind) {
    case 'strong':
      return strongAnswer(m, String(query.key))
    case 'concept':
      return conceptAnswer(m, String(query.id))
    case 'usage':
      return usageAnswer(m, String(query.concept), String(query.source))
    case 'book':
      return bookAnswer(m, String(query.book))
    case 'keyterms':
      return keytermsAnswer(m, String(query.book))
    case 'revision':
      return revisionAnswer(m, String(query.concept), String(query.book))
    case 'topic':
      return topicAnswer(m, String(query.id), Array.isArray(query.types) ? query.types.map(String) : undefined)
    case 'category':
      return categoryAnswer(m, String(query.topicKind))
    default:
      throw new Error(`Unknown query kind ${JSON.stringify(query.kind)}`)
  }
}
