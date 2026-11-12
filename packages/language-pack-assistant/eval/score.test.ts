import { expect, test } from 'bun:test'
import type { Call, Decision } from '../src/decision'
import { type Item, scoreQuestion } from './score'

const call = (query: Call['query'], args: Record<string, unknown>): Call => ({ query, args })
const decide = (c: Call): Decision => ({ kind: 'call', call: c, via: 'rule', interpretation: 'x' })
const choose = (...options: Call[]): Decision => ({ kind: 'choose', options, interpretation: 'x' })
const item = (expectation: Item['expect'], pieces: string[] = []): Item => ({ q: 'q', expect: expectation, pieces })

const tit = call('passage', { ref: 'tit 2:11' })
const grace = call('concept', { id: 'tw:kt/grace' })

test('a call equal to the expected one is correct and accepted', () => {
  expect(scoreQuestion(item({ call: tit }), decide(tit), [])).toEqual({ callCorrect: true, accepted: true, top3: null })
})

test('a different query or different args is not correct, but still accepted', () => {
  expect(scoreQuestion(item({ call: tit }), decide(grace), [])).toEqual({ callCorrect: false, accepted: true, top3: null })
  expect(scoreQuestion(item({ call: tit }), decide(call('passage', { ref: 'tit 2:12' })), []).callCorrect).toBe(false)
})

test('strings in args are folded: case, accents and edges', () => {
  expect(scoreQuestion(item({ call: call('search', { text: 'El Hijo Pródigo' }) }), decide(call('search', { text: ' el hijo prodigo ' })), []).callCorrect).toBe(true)
})

test('objects compare key by key: an extra or a missing key is a difference', () => {
  const a = call('article', { id: 'ta:translate/figs-metaphor', section: 'x' })
  expect(scoreQuestion(item({ call: a }), decide(call('article', { id: 'ta:translate/figs-metaphor' })), []).callCorrect).toBe(false)
  expect(scoreQuestion(item({ call: call('article', { id: 'a' }) }), decide(call('article', { id: 'a', section: undefined })), []).callCorrect).toBe(true)
  expect(scoreQuestion(item({ call: call('renderings', { book: 'tit', word: 3 }) }), decide(call('renderings', { word: 3, book: 'TIT' })), []).callCorrect).toBe(true)
})

test('a choose holds the expected call: correct, and not accepted', () => {
  expect(scoreQuestion(item({ call: tit }), choose(grace, tit), [])).toEqual({ callCorrect: true, accepted: false, top3: null })
  expect(scoreQuestion(item({ call: tit }), choose(grace), []).callCorrect).toBe(false)
})

test('an expected choose set is matched as a set, in any order, and exactly', () => {
  const j = call('passage', { ref: 'jhn front:intro' })
  expect(scoreQuestion(item({ choose: [j, grace] }), choose(grace, j), []).callCorrect).toBe(true)
  expect(scoreQuestion(item({ choose: [j, grace] }), choose(j), []).callCorrect).toBe(false)
  expect(scoreQuestion(item({ choose: [j, grace] }), choose(j, grace, tit), []).callCorrect).toBe(false)
  expect(scoreQuestion(item({ choose: [j, grace] }), decide(j), []).callCorrect).toBe(false)
})

test('{ search: true } expects a search call whatever its text', () => {
  expect(scoreQuestion(item({ search: true }), decide(call('search', { text: 'viuda' })), []).callCorrect).toBe(true)
  expect(scoreQuestion(item({ search: true }), decide(tit), []).callCorrect).toBe(false)
  expect(scoreQuestion(item({ search: true }), choose(call('search', { text: 'a' })), []).callCorrect).toBe(false)
})

test('top3 is null with no pieces, else whether the first piece is among the first three cards', () => {
  const p = ['verse:glt tit 2:11', 'note:tit/abcd']
  expect(scoreQuestion(item({ call: tit }, p), decide(tit), ['a', 'b', 'verse:glt tit 2:11']).top3).toBe(true)
  expect(scoreQuestion(item({ call: tit }, p), decide(tit), ['a', 'b', 'c', 'verse:glt tit 2:11']).top3).toBe(false)
  expect(scoreQuestion(item({ call: tit }, p), decide(tit), []).top3).toBe(false)
  expect(scoreQuestion(item({ call: tit }, p.slice(1)), decide(tit), ['x', 'note:tit/abcd']).top3).toBe(true)
})
