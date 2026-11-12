import { beforeAll, expect, test } from 'bun:test'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { cardOf, normalizeStrong, now, piecesOf, renderingsOf } from './card'
import { contentWords } from './words'
import { LINK, sampleReader } from './card.fixture'
import type { Decision } from './decision'

let reader: PackReader
/** A tW article of the sample that is used in Titus. */
let used: string
beforeAll(async () => {
  reader = await sampleReader()
  for (const a of (await reader.articles('tw:kt'))!) {
    if ((await reader.books({ article: a.id })).data!.books.tit!.state === 'count') {
      used = a.id
      break
    }
  }
}, 120_000)

test('a choose card has no pieces', async () => {
  const d: Decision = { kind: 'choose', options: [{ query: 'passage', args: { ref: 'tit 1:1' } }, { query: 'search', args: { text: 'Tito' } }], interpretation: '¿…?' }
  const card = await cardOf(reader, 'Tito', d, 8, now())
  expect(card.pieces).toEqual([])
  expect(card.missing).toEqual([])
  expect(card.interpretation).toBe('¿…?')
})

test('a concept card: the concept, its definition within the first 3, then the books by count; every cite is a real cite', async () => {
  const id = used
  const { pieces } = await piecesOf(reader, { query: 'concept', args: { id } }, 8)
  expect(pieces[0]!.id).toBe(`concept:${id}`)
  const section = pieces.findIndex((p) => p.kind === 'section')
  expect(section).toBeGreaterThan(0)
  expect(section).toBeLessThan(3)
  const article = await reader.article(id)
  expect(pieces[section]!.cite).toEqual(article.cites[0]!)
  const books = pieces.filter((p) => p.kind === 'book')
  expect(books.length).toBeGreaterThan(0)
  for (const p of pieces) expect(p.link).toMatch(LINK)
  // The concept and book pieces cite the resources the maps name (the maps' answers carry no cites of their own).
  const m = await reader.maps()
  expect(m.xmap!.core.res.some(([k, r]) => k === pieces[0]!.cite.res && r === pieces[0]!.cite.release)).toBe(true)
})

test('books: cells by count, none and zero left out', async () => {
  const id = used
  const { pieces } = await piecesOf(reader, { query: 'books', args: { article: id } }, 8)
  const books = (await reader.books({ article: id })).data!.books
  const counted = Object.entries(books).filter(([, c]) => c.state !== 'none' && c.state !== 'zero')
  expect(pieces.map((p) => p.id).sort()).toEqual(counted.map(([b]) => `book:${b}`).sort())
})

test('an empty search is a card with no pieces, not an error', async () => {
  const { pieces } = await piecesOf(reader, { query: 'search', args: { text: '' } }, 8)
  expect(pieces).toEqual([])
})

test('the limit cuts the pieces', async () => {
  const { pieces } = await piecesOf(reader, { query: 'passage', args: { ref: 'tit 1:1' } }, 3)
  expect(pieces.length).toBe(3)
})

const answerOf = (query: string, data: unknown, cites: unknown[] = []) => ({ query, data, cites, notInstalled: [] }) as never

test('R31: a Strong key is padded to four digits, and a bare key tries the suffixes a, b, c', async () => {
  expect(normalizeStrong('G26')).toBe('G0026')
  expect(normalizeStrong('H853')).toBe('H0853')
  expect(normalizeStrong('H2617a')).toBe('H2617a')
  expect(normalizeStrong('G39720')).toBe('G39720')
  const asked: string[] = []
  // A table that keys G00260 (the reader resolves G0026) and H2617a only.
  const stub = {
    renderings: async ({ strong }: { strong: string }) => {
      asked.push(strong)
      const has = strong === 'G0026' || strong === 'H2617a'
      return answerOf('renderings', { strong, renderings: has ? [{ text: 'amor', count: 3, refs: ['tit 1:1'] }] : [] })
    },
  } as unknown as PackReader
  expect((await renderingsOf(stub, 'G26')).data!.renderings).toHaveLength(1)
  expect(asked).toEqual(['G0026'])
  asked.length = 0
  const h = await renderingsOf(stub, 'H2617')
  expect(h.data!.strong).toBe('H2617a')
  expect(asked).toEqual(['H2617', 'H2617a'])
  expect((await renderingsOf(stub, 'H9999')).data!.renderings).toEqual([])
})

test('R33: search sends the content words; with no hits, each word alone and the hits merge by score', async () => {
  const sent: string[] = []
  const hit = (id: string, score: number) => ({ kind: 'note', res: 'r', book: 'tit', ref: '1:1', id, snippet: 's', score })
  const cite = (id: string) => ({ res: 'r', release: '1', ref: id })
  const stub = {
    search: async (t: string) => {
      sent.push(t)
      if (t === 'amor') return answerOf('search', [hit('a', 1), hit('b', 5)], [cite('a'), cite('b')])
      if (t === 'gracia') return answerOf('search', [hit('c', 3), hit('a', 1)], [cite('c'), cite('a')])
      return answerOf('search', [])
    },
    resources: undefined,
  } as unknown as PackReader
  const words = (t: string) => contentWords(t, 'es-419')
  expect(words('¿Dónde dice la palabra amor y gracia?')).toEqual(['amor', 'gracia'])
  const r = await piecesOf(stub, { query: 'search', args: { text: '¿Dónde dice la palabra amor y gracia?' } }, 8, words)
  expect(sent).toEqual(['amor gracia', 'gracia', 'amor'])
  expect(r.pieces.map((p) => p.id)).toEqual(['note:tit/b', 'note:tit/c', 'note:tit/a'])
})
