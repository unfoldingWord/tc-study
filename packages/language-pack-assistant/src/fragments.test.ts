import { beforeAll, expect, test } from 'bun:test'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { LINK, sampleReader } from './card.fixture'
import { canonId, canonStrong, fragmentsOf } from './fragments'

let reader: PackReader
beforeAll(async () => {
  reader = await sampleReader()
}, 120_000)

test('canonical ids (R29)', () => {
  expect(canonId('verse:es-419_gl/es-419/glt tit 1:1')).toBe('verse:glt tit 1:1')
  expect(canonId('verse:glt tit 1:1')).toBe('verse:glt tit 1:1')
  expect(canonId('rendering:g54850/Gracia')).toBe('rendering:G5485/gracia')
  expect(canonStrong('G0026')).toBe('G26')
  expect(canonStrong('G00260')).toBe('G26')
  expect(canonStrong('H2617a')).toBe('H2617a')
  expect(canonStrong('G5485')).toBe('G5485')
  expect(canonId('note:tit/m2jl')).toBe('note:tit/m2jl')
})

test('a passage: the literal text first, then the notes, questions and links of the verse; cites and links from the answer', async () => {
  const call = { query: 'passage' as const, args: { ref: 'tit 1:1' } }
  const a = await reader.passage('tit 1:1')
  const f = fragmentsOf(call, a, reader)
  expect(f[0]!.id).toBe('verse:glt tit 1:1')
  expect(f[0]!.link).toBe('ref:tit 1:1')
  const kinds = f.map((x) => x.kind)
  const firstOf = (k: string) => kinds.indexOf(k as never)
  expect(firstOf('note')).toBe(1)
  expect(firstOf('note')).toBeLessThan(firstOf('question'))
  expect(firstOf('question')).toBeLessThan(firstOf('link'))
  expect(f.filter((x) => x.kind === 'note').length).toBe(a.data!.notes.length)
  for (const x of f) {
    expect(a.cites).toContain(x.cite)
    expect(x.link).toMatch(LINK)
    expect(x.length).toBeGreaterThan(0)
  }
  expect(f.filter((x) => x.kind === 'note').every((x) => x.ref === 'tit 1:1' && x.id.startsWith('note:tit/'))).toBe(true)
})

test('an article: its sections in the answer order, with articulo links', async () => {
  const id = (await reader.articles('tw:kt'))![0]!.id
  const a = await reader.article(id, 'all')
  const f = fragmentsOf({ query: 'article', args: { id } }, a, reader)
  expect(f.length).toBeGreaterThan(1)
  expect(f.map((x) => x.id)).toEqual(a.data!.sections.map((s) => `section:${id}#${s.sid}`))
  for (const x of f) {
    expect(a.cites).toContain(x.cite)
    expect(x.link.startsWith(`articulo:${id}#`)).toBe(true)
  }
})

test('an answer with no data gives no fragments', async () => {
  const a = await reader.passage('gen 1:1')
  expect(fragmentsOf({ query: 'passage', args: { ref: 'gen 1:1' } }, a, reader)).toEqual([])
})

test('a section hit keeps the id section:<article>#<section> and links to the article by its role', () => {
  const hit = { kind: 'section', book: '', ref: '', res: 'r/tw', id: 'tw:kt/grace#definicion', role: 'definition', snippet: 's', score: 1 }
  const answer = { query: 'search', data: [hit, { ...hit, id: 'tw:kt/grace#otra', role: undefined }], cites: [{ res: 'r/tw', release: '1', id: 'tw:kt/grace' }, { res: 'r/tw', release: '1', id: 'tw:kt/grace' }], notInstalled: [] } as never
  const f = fragmentsOf({ query: 'search', args: { text: 'x' } }, answer, reader)
  expect(f.map((x) => x.id)).toEqual(['section:tw:kt/grace#definicion', 'section:tw:kt/grace#otra'])
  expect(f[0]!.link).toBe('articulo:tw:kt/grace#definition')
  expect(f[1]!.link).toBe('pieza:section:tw:kt/grace#otra')
})
