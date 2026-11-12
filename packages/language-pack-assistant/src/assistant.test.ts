import { beforeAll, expect, test } from 'bun:test'
import type { PackReader } from '@bt-synergy/language-pack-client'
import { createAssistant } from './assistant'
import { LINK, sampleReader } from './card.fixture'

let reader: PackReader
let noBook: PackReader
beforeAll(async () => {
  reader = await sampleReader()
  noBook = await sampleReader(['book:tit'])
}, 120_000)

test("ask('Tito 1:1'): the verse first, then the notes of 1:1", async () => {
  const a = await createAssistant({ reader, tag: 'es-419' })
  const card = await a.ask('Tito 1:1')
  expect(card.decision.kind).toBe('call')
  expect(card.decision.kind === 'call' && card.decision.call).toEqual({ query: 'passage', args: { ref: 'tit 1:1' } })
  expect(card.pieces[0]!.kind).toBe('verse')
  expect(card.pieces[1]!.kind).toBe('note')
  expect(card.pieces[1]!.ref).toBe('tit 1:1')
  expect(card.pieces.length).toBe(8)
  expect(card.interpretation).not.toBe('')
  expect(card.coverage).toBeDefined()
  const answer = await reader.passage('tit 1:1')
  for (const p of card.pieces) {
    expect(answer.cites).toContainEqual(p.cite)
    expect(p.link).toMatch(LINK)
  }
  expect(card.elapsed).toBeGreaterThanOrEqual(0)
  expect(typeof card.elapsed).toBe('number')
})

test('Review Focus 2: a book listed but not installed gives no pieces and names the book with its bytes', async () => {
  const a = await createAssistant({ reader: noBook, tag: 'es-419' })
  const card = await a.ask('Tito 1:1')
  expect(card.pieces).toEqual([])
  expect(card.missing.length).toBeGreaterThan(0)
  const tit = card.missing.find((m) => m.unit === 'book:tit')!
  expect(tit.bytes).toBe(noBook.size('book:tit'))
  expect(tit.bytes).toBeGreaterThan(0)
})

test('run gives the card ask gives for the same call', async () => {
  const a = await createAssistant({ reader, tag: 'es-419' })
  const asked = await a.ask('Tito 1:1')
  if (asked.decision.kind !== 'call') throw new Error('not a call')
  const ran = await a.run(asked.decision.call)
  expect(ran.pieces).toEqual(asked.pieces)
  expect(ran.missing).toEqual(asked.missing)
  expect(ran.coverage).toEqual(asked.coverage)
  expect(ran.interpretation).toBe(asked.interpretation)
  expect(ran.decision.kind === 'call' && ran.decision.via).toBe('chosen')
  expect(ran.elapsed).toBeGreaterThanOrEqual(0)
})

test('complements: a bad one is a problem, one of another language is not used, nothing throws', async () => {
  const enc = new TextEncoder()
  const bad = enc.encode('{ not json')
  const other = enc.encode(JSON.stringify({ kind: 'numbers', lang: 'pt', version: '1', for: 'queries/1', words: { um: 1 } }))
  const a = await createAssistant({ reader, tag: 'es-419', complements: [bad, other] })
  expect(a.problems.map((p) => p.code)).toEqual(['E_COMPLEMENT'])
  expect((await a.ask('Tito 1:1')).pieces.length).toBeGreaterThan(0)
})

test('a chapter reference reads its last verse from the installed book', async () => {
  const a = await createAssistant({ reader, tag: 'es-419' })
  const card = await a.ask('Tito 1')
  expect(card.decision.kind === 'call' && card.decision.call).toEqual({ query: 'passage', args: { ref: 'tit 1:1-16' } })
})
