/**
 * Answers from the maps (`spec/counts.md`, `spec/tests/queries/README.md`). Every answer says its state: a count, zero
 * (the source covers the book whole and has no row), none (the source does not cover it) or partial (it covers it in
 * part: the count is "at least"). Imports no Node module.
 */
import type { CountRows } from '../codec/counts'
import { BOOKS, strongKey } from '../ids'
import type { BookModel, MapCore, MapPart, XmapCore, XmapPart } from '../model'

export type State = 'count' | 'zero' | 'none' | 'partial'
export type BookAnswer = { book: string; state: State; count?: number; verses?: number }
export type MapSet = {
  xmap?: { core: XmapCore; parts: Map<string, XmapPart> }
  map?: { core: MapCore; parts: Map<string, MapPart> }
  revision: number
  installed?: Map<string, BookModel>
}

type Cover = { whole: Set<string>; partial: Set<string> }

/** The last segment of a resource key (`unfoldingWord/en/tn` is `tn`). */
const idOf = (key: string): string => key.slice(key.lastIndexOf('/') + 1)

function cover(coverage: Map<string, { whole: string[]; partial: string[] }> | undefined, keep: (key: string) => boolean): Cover {
  const whole = new Set<string>()
  const partial = new Set<string>()
  for (const [key, c] of coverage ?? []) {
    if (!keep(key)) continue
    for (const b of c.whole) whole.add(b)
    for (const b of c.partial) partial.add(b)
  }
  for (const b of whole) partial.delete(b)
  return { whole, partial }
}

/** The sources a table of the common map is covered by: the notes by tN, the links by tWL, the occurrences by the originals. */
function xmapCover(core: XmapCore, table: 'strong' | 'links' | 'notes'): Cover {
  return cover(core.coverage, (key) => {
    const id = idOf(key)
    return table === 'notes' ? id === 'tn' : table === 'links' ? id === 'twl' : id !== 'tn' && id !== 'twl'
  })
}

function cell(book: string, c: Cover, rows: CountRows | undefined, key: string): BookAnswer {
  const pair = rows?.get(key)?.get(book)
  if (c.partial.has(book)) return { book, state: 'partial', count: pair?.[0] ?? 0, verses: pair?.[1] ?? 0 }
  if (!c.whole.has(book)) return { book, state: 'none' }
  if (pair === undefined) return { book, state: 'zero' }
  return { book, state: 'count', count: pair[0], verses: pair[1] }
}

function withCount(rows: CountRows | undefined, key: string): BookAnswer[] {
  const out: BookAnswer[] = []
  const byBook = rows?.get(key)
  if (byBook === undefined) return out
  for (const book of BOOKS) {
    const pair = byBook.get(book)
    if (pair !== undefined) out.push({ book, state: 'count', count: pair[0], verses: pair[1] })
  }
  return out
}

const sum = (list: BookAnswer[], f: 'count' | 'verses'): number => list.reduce((n, b) => n + (b[f] ?? 0), 0)

export function strongWhere(m: MapSet, key: string): { key: string; books: BookAnswer[]; count: number; verses: number } {
  const rows = m.xmap?.core.strong.rows
  let found = key
  if (rows?.has(key) !== true && /^G\d{4}$/.test(key) && rows?.has(`${key}0`) === true) found = `${key}0`
  const books = withCount(rows, found)
  return { key: found, books, count: sum(books, 'count'), verses: sum(books, 'verses') }
}

export function conceptWhere(m: MapSet, id: string): { id: string; links: BookAnswer[]; notes: BookAnswer[] } {
  return { id, links: withCount(m.xmap?.core.links?.rows, id), notes: withCount(m.xmap?.core.notes?.rows, id) }
}

export function usage(m: MapSet, concept: string, source: 'xmap' | 'map'): { source: string; revision: number; books: BookAnswer[] } {
  let c: Cover
  let rows: CountRows | undefined
  if (source === 'xmap') {
    c = m.xmap === undefined ? { whole: new Set(), partial: new Set() } : xmapCover(m.xmap.core, 'notes')
    rows = m.xmap?.core.notes?.rows
  } else {
    c = cover(m.map?.core.coverage, () => true)
    rows = m.map?.core.usage?.rows
  }
  return { source, revision: m.revision, books: BOOKS.map((book) => cell(book, c, rows, concept)) }
}

export function bookCoverage(m: MapSet, book: string): Record<string, State> {
  const out: Record<string, State> = {}
  for (const coverage of [m.xmap?.core.coverage, m.map?.core.coverage]) {
    for (const [key, c] of coverage ?? []) {
      const state: State = c.whole.includes(book) ? 'count' : c.partial.includes(book) ? 'partial' : 'none'
      if (out[key] === undefined || state === 'count' || (state === 'partial' && out[key] === 'none')) out[key] = state
    }
  }
  return out
}

export function keyTerms(m: MapSet, book: string): { concept: string; links: [number, number]; candidates: number; otherBooks: string[] }[] {
  const core = m.xmap?.core
  const part = m.xmap?.parts.get(book)
  const out: { concept: string; links: [number, number]; candidates: number; otherBooks: string[] }[] = []
  for (const [concept, byBook] of core?.links?.rows ?? []) {
    if (!concept.startsWith('tw:kt/')) continue
    const here = byBook.get(book)
    if (here === undefined) continue
    const verses = new Set<number>()
    for (const s of core?.strongs?.[concept] ?? []) for (const v of part?.strong.get(strongKey(s)) ?? []) verses.add(v)
    out.push({ concept, links: [here[0], here[1]], candidates: verses.size, otherBooks: BOOKS.filter((b) => b !== book && byBook.has(b)) })
  }
  return out.sort((a, b) => b.links[0] - a.links[0] || (a.concept < b.concept ? -1 : a.concept > b.concept ? 1 : 0))
}

export function revisionAnswer(m: MapSet, concept: string, book: string): { fromMap: number; revision: number; installed?: number } {
  const fromBook = usage(m, concept, 'map').books.find((b) => b.book === book)
  const out: { fromMap: number; revision: number; installed?: number } = { fromMap: fromBook?.count ?? 0, revision: m.revision }
  const seg = m.installed?.get(book)
  if (seg !== undefined) out.installed = (seg.notes?.rows ?? []).filter((r) => r.concept === concept).length
  return out
}

export function answer(m: MapSet, query: { kind: string; [k: string]: unknown }): unknown {
  switch (query.kind) {
    case 'strong':
      return strongWhere(m, String(query.key))
    case 'concept':
      return conceptWhere(m, String(query.id))
    case 'usage':
      return usage(m, String(query.concept), query.source === 'map' ? 'map' : 'xmap')
    case 'book':
      return bookCoverage(m, String(query.book))
    case 'keyterms':
      return keyTerms(m, String(query.book))
    case 'revision':
      return revisionAnswer(m, String(query.concept), String(query.book))
    default:
      throw new Error(`Unknown query kind ${JSON.stringify(query.kind)}`)
  }
}
