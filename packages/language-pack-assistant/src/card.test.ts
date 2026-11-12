import { beforeAll, expect, test } from 'bun:test'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { cardOf, now, piecesOf } from './card'
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
