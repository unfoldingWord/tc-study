import { beforeAll, expect, test } from 'bun:test'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { booksOf, cardOf, normalizeStrong, now, piecesOf, renderingsOf, versesOf } from './card'
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

test('a concept card: the default section first, the other sections in article order, the concept, then the books by count; every cite is a real cite', async () => {
  const id = used
  const { pieces } = await piecesOf(reader, { query: 'concept', args: { id } }, 50)
  const lead = await reader.article(id)
  const all = await reader.article(id, 'all')
  const leadIds = lead.data!.sections.map((s) => `section:${id}#${s.sid}`)
  const restIds = all.data!.sections.filter((s) => !lead.data!.sections.some((l) => l.sid === s.sid)).map((s) => `section:${id}#${s.sid}`)
  expect(restIds.length).toBeGreaterThan(0)
  const n = leadIds.length + restIds.length
  expect(pieces.slice(0, n).map((p) => p.id)).toEqual([...leadIds, ...restIds])
  expect(pieces[0]!.cite).toEqual(lead.cites[0]!)
  for (const p of pieces.slice(0, n)) expect(all.cites).toContainEqual(p.cite)
  expect(pieces[n]!.id).toBe(`concept:${id}`)
  const books = pieces.slice(n + 1).filter((p) => p.kind === 'book')
  expect(books.length).toBeGreaterThan(0)
  expect(pieces.slice(n + 1, n + 1 + books.length)).toEqual(books)
  for (const p of pieces) expect(p.link).toMatch(LINK)
  // The concept and book pieces cite the resources the maps name (the maps' answers carry no cites of their own).
  const m = await reader.maps()
  expect(m.xmap!.core.res.some(([k, r]) => k === pieces[n]!.cite.res && r === pieces[n]!.cite.release)).toBe(true)
})

test('an article card: the default section first, then every other section in article order', async () => {
  const id = used
  const { pieces } = await piecesOf(reader, { query: 'article', args: { id } }, 50)
  const lead = (await reader.article(id)).data!.sections.map((s) => s.sid)
  const all = (await reader.article(id, 'all')).data!.sections.map((s) => s.sid)
  expect(pieces.map((p) => p.id)).toEqual([...lead, ...all.filter((s) => !lead.includes(s))].map((s) => `section:${id}#${s}`))
})

test('an article card for one section: that section first, then the others', async () => {
  const id = used
  const all = (await reader.article(id, 'all')).data!.sections.map((s) => s.sid)
  const asked = all[all.length - 1]!
  const { pieces } = await piecesOf(reader, { query: 'article', args: { id, section: asked } }, 50)
  expect(pieces.map((p) => p.id)).toEqual([asked, ...all.filter((s) => s !== asked)].map((s) => `section:${id}#${s}`))
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

test('books by a Strong key pad and try the suffixes like renderings', async () => {
  const asked: string[] = []
  const stub = {
    books: async ({ strong }: { strong: string }) => {
      asked.push(strong)
      return answerOf('books', { books: { tit: { state: strong === 'G0026' || strong === 'H2617a' ? 'count' : 'none' } } })
    },
  } as unknown as PackReader
  expect((await booksOf(stub, 'G26')).data!.books.tit!.state).toBe('count')
  expect(asked).toEqual(['G0026'])
  asked.length = 0
  await booksOf(stub, 'H2617')
  expect(asked).toEqual(['H2617', 'H2617a'])
})

test('the books card cites the Strong key that answered (padded, or with a suffix)', async () => {
  const stub = {
    books: async ({ strong }: { strong: string }) => answerOf('books', { books: { tit: { state: strong === 'H2617a' ? 'count' : 'none' } } }),
    maps: async () => ({ xmap: { core: { res: [['unfoldingWord/hbo/uhb', '1']] } } }),
  } as unknown as PackReader
  const r = await piecesOf(stub, { query: 'books', args: { strong: 'H2617' } }, 8)
  const ids = r.pieces.map((p) => p.cite?.id).filter((x) => x !== undefined)
  expect(ids).toContain('H2617a')
  expect(ids).not.toContain('H2617')
  const g = await piecesOf(stub, { query: 'books', args: { strong: 'g26' } }, 8)
  expect(g.pieces.map((p) => p.cite?.id).filter((x) => x !== undefined)).not.toContain('g26')
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

test('a passage range: one verse fragment per verse in text order, then the notes, questions and links (R37 a)', async () => {
  const { pieces } = await piecesOf(reader, { query: 'passage', args: { ref: 'tit 1:1-3' } }, 20)
  const verses = pieces.filter((p) => p.kind === 'verse')
  for (const p of verses) expect(p.id).not.toMatch(/\d+-\d+$/)
  const leads = pieces.slice(0, 3)
  expect(leads.map((p) => p.kind)).toEqual(['verse', 'verse', 'verse'])
  expect(leads.map((p) => p.ref)).toEqual(['tit 1:1', 'tit 1:2', 'tit 1:3'])
  // The literal text leads each verse: the three ids share one resource.
  expect(new Set(leads.map((p) => p.id.split(' ')[0])).size).toBe(1)
  const firstHelp = pieces.findIndex((p) => p.kind !== 'verse')
  expect(firstHelp).toBeGreaterThanOrEqual(3)
  const single = await reader.passage('tit 1:2')
  expect(leads[1]!.cite).toEqual(single.cites.find((c) => c.res === leads[1]!.cite.res && c.id === undefined)!)
})

test('a whole chapter reads no more verses than the card shows', async () => {
  const { pieces } = await piecesOf(reader, { query: 'passage', args: { ref: 'tit 1:1-999' } }, 4)
  expect(pieces.map((p) => p.ref)).toEqual(['tit 1:1', 'tit 1:2', 'tit 1:3', 'tit 1:4'])
})

test('versesOf splits a range in one chapter only', () => {
  expect(versesOf('jon 3:5-7', 8)).toEqual(['jon 3:5', 'jon 3:6', 'jon 3:7'])
  expect(versesOf('jon 3:5', 8)).toBeUndefined()
  expect(versesOf('jon 3:5-4:2', 8)).toBeUndefined()
  expect(versesOf('jon 3:1-999', 2)).toEqual(['jon 3:1', 'jon 3:2'])
})
