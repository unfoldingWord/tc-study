import { describe, expect, test } from 'bun:test'
import { buildUsjBookIndex, usjScriptureKey } from '@bt-synergy/scripture-loader'
import { tnCacheKey } from '../notes/notesPreparer'
import { tqCacheKey } from '../questions/questionsPreparer'
import { twlCacheKey } from '../wordsLinks/wordsLinksPreparer'
import { chaptersFromStore } from './chaptersFromStore'

const ULT = 'es-419_gl/es-419/glt'
const TN = 'es-419_gl/es-419/tn'
const TQ = 'es-419_gl/es-419/tq'
const TWL = 'es-419_gl/es-419/twl'
const TA = 'es-419_gl/es-419/ta'

function store(rows: Record<string, unknown>) {
  return { get: async (key: string) => rows[key] ?? null }
}

// The rows as the loaders write them: the scripture index next to its chapter rows (wrapped as writeUsjChapters wraps
// it), a legacy whole-book blob, and the TSV book rows the TN/TQ/TWL parsers produce.
const index = (chapters: number[]) => ({
  content: buildUsjBookIndex({
    book: 'rut',
    bookCode: 'rut',
    metadata: {} as never,
    usj: { type: 'USJ', version: '3.0', content: [] },
    chapters: chapters.map((number) => ({ number, content: [] })),
  } as never),
  timestamp: 1,
})
const notes = (chaptersWithNotes: number[]) => ({
  bookCode: 'rut',
  bookName: 'Rut',
  notes: [],
  notesByChapter: Object.fromEntries(chaptersWithNotes.map((c) => [String(c), []])),
  metadata: { bookCode: 'rut', bookName: 'Rut', totalNotes: 0, chaptersWithNotes, statistics: {} },
})

describe('chaptersFromStore', () => {
  test("a scripture book: the chapters of its index row", async () => {
    const cache = store({ [usjScriptureKey(ULT, 'rut')]: index([1, 2]) })
    expect(await chaptersFromStore(cache, ULT, 'RUT')).toEqual([1, 2])
  })

  test('a scripture book stored whole (legacy blob): the chapters it carries', async () => {
    const book = {
      book: 'rut',
      bookCode: 'rut',
      metadata: {},
      usj: { type: 'USJ', version: '3.0', content: [] },
      chapters: [1, 2, 3].map((number) => ({ number, content: [] })),
    }
    const cache = store({ [usjScriptureKey(ULT, 'rut')]: { content: book, timestamp: 1 } })
    expect(await chaptersFromStore(cache, ULT, 'rut')).toEqual([1, 2, 3])
  })

  test('chapters past the book\'s known count are left out, as the whole build never plans them', async () => {
    const cache = store({ [usjScriptureKey(ULT, 'rut')]: index([1, 2, 3, 4, 5]) })
    expect(await chaptersFromStore(cache, ULT, 'rut')).toEqual([1, 2, 3, 4])
  })

  test('a TSV book (TN, TQ, TWL): every chapter of the book, because a chapter without notes still has its empty prepared rows', async () => {
    const cache = store({
      [tnCacheKey(TN, 'rut')]: notes([1, 3]),
      [tqCacheKey(TQ, 'rut')]: { bookCode: 'rut', questions: [], questionsByChapter: { '2': [] } },
      [twlCacheKey(TWL, 'rut')]: { content: { bookCode: 'rut', links: [], linksByChapter: { '4': [] } }, timestamp: 1 },
    })
    expect(await chaptersFromStore(cache, TN, 'rut')).toEqual([1, 2, 3, 4])
    expect(await chaptersFromStore(cache, TQ, 'rut')).toEqual([1, 2, 3, 4])
    expect(await chaptersFromStore(cache, TWL, 'rut')).toEqual([1, 2, 3, 4])
  })

  test('no row for the book: null', async () => {
    const cache = store({ [usjScriptureKey(ULT, 'rut')]: index([1, 2, 3, 4]), [tnCacheKey(TN, 'rut')]: notes([1]) })
    expect(await chaptersFromStore(cache, ULT, 'jon')).toBeNull()
    expect(await chaptersFromStore(cache, TN, 'jon')).toBeNull()
    expect(await chaptersFromStore(cache, TQ, 'rut')).toBeNull()
  })

  test('a resource that is not book-scoped: null', async () => {
    expect(await chaptersFromStore(store({}), TA, 'rut')).toBeNull()
  })
})
