/** `concept`, `topics` and `books`: answers from the maps (`answer` of language-pack-v3), in the envelope of the queries. No Node module here. */
import { answer, BOOKS, type Cell, type MapSet, TN, TWL } from '@bt-synergy/language-pack-v3'
import { ClientError } from '../errors'
import type { PackReader } from '../reader'
import { type Answer, type CellState, missingUnit, newAnswer, usedUnit } from './envelope'

export const TOPIC_CATEGORIES = ['person', 'place', 'event', 'topic', 'story', 'section'] as const

export type BookCell = { state: CellState; count?: number; verses?: number; installed: boolean; bytes?: number }
/** `installed: false` (and no states) when the map that answers is not on the device: `xtopics` for a topic, `xmap` for `tw:`, `map` for `ta:`. */
export type BooksData = { installed?: false; books: Record<string, BookCell> }

/**
 * Whether the map unit a query needs (`xmap` for `tw:` and the Strong table, `map` for `ta:`) was read. When it was not (not
 * installed, or its bytes are bad) the unit goes to `notInstalled`, with its size when a catalog lists it: "nobody looked" is not
 * `none` (counts.md).
 */
export function haveMap(out: Answer<unknown>, reader: PackReader, m: MapSet, unit: 'xmap' | 'map'): boolean {
  if (m[unit] !== undefined) return true
  missingUnit(out, { unit, bytes: reader.listed(unit) ? reader.size(unit) : 0 })
  return false
}

/** The map unit the usage of an article comes from: the English TWL of the `xmap` for `tw:`, the language's tN of the `map` for `ta:`. */
export const usageUnit = (concept: string): 'xmap' | 'map' => (concept.startsWith('tw:') ? 'xmap' : 'map')

/** Notes the units of the maps an answer read. */
async function usedMaps(out: Answer<unknown>, reader: PackReader): Promise<MapSet> {
  const m = await reader.maps()
  for (const unit of ['xmap', 'map', 'xtopics', 'topics'] as const) if (m[unit] !== undefined) usedUnit(out, reader, unit)
  return m
}

function isBook(b: unknown): b is string {
  return typeof b === 'string' && (BOOKS as readonly string[]).includes(b)
}

/** The language's own tN: a source of the language map's coverage whose last segment is `tn` (not the English one). */
export function languageTn(m: MapSet): string | undefined {
  for (const [key] of m.map?.core.res ?? []) if (key !== TN && key.slice(key.lastIndexOf('/') + 1) === 'tn') return key
  return undefined
}

/** The language of the English tN (`unfoldingWord/en/tn`): for a map in this language, that tN is the language's own. */
const TN_LANG = TN.split('/')[1]

/**
 * The usage cells of a `ta:` / `tw:` article: the English TWL for `tw:`; for `ta:`, the language's own tN. For English the own
 * tN is the English one, whose counts are the `notes` of the `xmap`. Any other language with no tN of its own gets every cell
 * `none`: the English notes are not its usage.
 */
export function usageBooks(m: MapSet, concept: string): Record<string, Cell> {
  const usage = (source: string) => (answer(m, { kind: 'usage', concept, source }) as { books: Record<string, Cell> }).books
  if (concept.startsWith('tw:')) return usage(TWL)
  const own = languageTn(m)
  if (own !== undefined) return usage(own)
  if (m.map?.core.lang === TN_LANG) return usage(TN)
  return Object.fromEntries(BOOKS.map((b) => [b, { state: 'none' } as Cell]))
}

/** The per-book cells of a concept: the usage in tN / TWL for an article, the occurrences for a topic. */
function cellsOf(m: MapSet, concept: string): Record<string, Cell> {
  if (concept.startsWith('ta:') || concept.startsWith('tw:')) {
    return usageBooks(m, concept)
  }
  const t = answer(m, { kind: 'topic', id: concept }) as { books?: Record<string, Cell> }
  return t.books ?? {}
}

const counted = (c: Cell | undefined): boolean => c !== undefined && (c.state === 'count' || c.state === 'partial')

export async function conceptQuery(reader: PackReader, id: string): Promise<Answer<unknown>> {
  if (typeof id !== 'string' || id === '') throw new ClientError('E_ARG', 'concept needs an id')
  const out = newAnswer<unknown>(reader, 'concept')
  const m = await usedMaps(out, reader)
  const article = id.startsWith('ta:') || id.startsWith('tw:')
  if (article && !haveMap(out, reader, m, 'xmap')) {
    out.data = { kind: 'concept', id, installed: false }
    return out
  }
  out.data = answer(m, { kind: 'concept', id })
  const found = out.data as { found: boolean; id: string }
  if (found.found && (!article || haveMap(out, reader, m, usageUnit(found.id)))) {
    for (const [book, c] of Object.entries(cellsOf(m, found.id))) {
      const unit = `book:${book}`
      if (counted(c) && reader.listed(unit) && !reader.installed(unit)) missingUnit(out, { book, unit, bytes: reader.size(unit), what: found.id })
    }
  }
  return out
}

export async function booksQuery(reader: PackReader, q: { article: string } | { concept: string }): Promise<Answer<BooksData>> {
  const article = (q as { article?: unknown } | null)?.article
  const concept = (q as { concept?: unknown } | null)?.concept
  if ((article === undefined) === (concept === undefined)) throw new ClientError('E_ARG', 'books needs exactly one of article and concept')
  const id = article ?? concept
  if (typeof id !== 'string' || id === '') throw new ClientError('E_ARG', 'books needs an id')
  if (article !== undefined && !id.startsWith('ta:') && !id.startsWith('tw:')) throw new ClientError('E_ARG', `not an article id: ${JSON.stringify(id)}`)
  const out = newAnswer<BooksData>(reader, 'books')
  const m = await usedMaps(out, reader)
  if (article === undefined && !id.startsWith('ta:') && !id.startsWith('tw:') && m.xtopics === undefined) {
    out.data = { installed: false, books: {} }
    return out
  }
  if ((id.startsWith('ta:') || id.startsWith('tw:')) && !haveMap(out, reader, m, usageUnit(id))) {
    out.data = { installed: false, books: {} }
    return out
  }
  const cells = cellsOf(m, id)
  const books: Record<string, BookCell> = {}
  for (const book of BOOKS) {
    const c = cells[book] ?? { state: 'none' as const }
    const unit = `book:${book}`
    const installed = reader.installed(unit)
    // `none` stays `none`: the source does not cover the book, which is not a zero.
    const cell: BookCell = { state: c.state, installed }
    if (c.count !== undefined) cell.count = c.count
    if (c.verses !== undefined) cell.verses = c.verses
    if (!installed && reader.listed(unit)) cell.bytes = reader.size(unit)
    books[book] = cell
  }
  out.data = { books }
  return out
}

export async function topicsQuery(reader: PackReader, q: { category?: string; book?: string } = {}): Promise<Answer<unknown>> {
  const { category, book } = q ?? {}
  if (category !== undefined && book !== undefined) throw new ClientError('E_ARG', 'topics takes a category or a book, not both')
  if (category !== undefined && !(TOPIC_CATEGORIES as readonly string[]).includes(category)) throw new ClientError('E_ARG', `not a category: ${JSON.stringify(category)}`)
  if (book !== undefined && !isBook(book)) throw new ClientError('E_ARG', `not a book: ${JSON.stringify(book)}`)
  const out = newAnswer<unknown>(reader, 'topics')
  const m = await usedMaps(out, reader)
  // The module decides: without `xtopics` the answer is `installed: false`, never "not found" or a state.
  if (m.xtopics === undefined) {
    out.data = category !== undefined ? { kind: 'category', topicKind: category, installed: false } : { installed: false }
    return out
  }
  const x = m.xtopics
  if (category !== undefined) {
    out.data = answer(m, { kind: 'category', topicKind: category })
  } else if (book !== undefined) {
    const topics: { id: string; kind: string; title?: string; names: string[]; verses: number }[] = []
    for (const [id, verses] of x.parts.get(book)?.occurrences ?? []) {
      const t = x.core.topics.get(id)
      if (t === undefined) continue
      const names = [...new Set((m.topics?.core.names[id] ?? []).map((n) => n[0]))]
      topics.push({ id, kind: t.kind, ...(t.title !== '' ? { title: t.title } : {}), names, verses: verses.length })
    }
    topics.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    out.data = { installed: true, book, topics }
  } else {
    const categories: Record<string, number> = Object.fromEntries(TOPIC_CATEGORIES.map((c) => [c, 0]))
    for (const t of x.core.topics.values()) if (t.kind in categories) categories[t.kind]!++
    out.data = { installed: true, categories }
  }
  return out
}
