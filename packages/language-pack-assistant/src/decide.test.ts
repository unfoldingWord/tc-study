import { expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { train } from './classifier'
import { type ClassifierComplement, loadComplement, type NumbersComplement } from './complements'
import { type DecideCtx, decide, decideStep, DEFAULT_MARGIN } from './decide'
import { buildLexicon } from './lexicon'
import { phrasesFor } from './phrases'
import { ES } from './rules.fixture'

const file = (name: string) => new Uint8Array(readFileSync(join(import.meta.dir, '../complements', name)))
const nums = loadComplement(file('es.numbers.json'))
const numbers = (nums.ok ? nums.value : undefined) as NumbersComplement
const base: DecideCtx = {
  lexicon: buildLexicon(ES, 'es-419', numbers),
  phrases: phrasesFor('es-419'),
  margin: DEFAULT_MARGIN,
  listed: () => true,
  lastVerse: () => undefined,
  strongsOf: () => [],
}

test('without a classifier the rules decide, and search is the fallback', () => {
  expect(decide('Tito 2:11', base)).toEqual({ kind: 'call', call: { query: 'passage', args: { ref: 'tit 2:11' } }, via: 'rule', interpretation: '' })
  expect(decide('el hijo pródigo', base)).toEqual({ kind: 'call', call: { query: 'search', args: { text: 'el hijo pródigo' } }, via: 'search', interpretation: '' })
})

test('Review Focus 5: a classifier for other queries is refused, and decide still answers', () => {
  const raw = JSON.parse(new TextDecoder().decode(file('es.classifier.json')))
  const loaded = loadComplement(new TextEncoder().encode(JSON.stringify({ ...raw, for: 'queries/2' })))
  expect(loaded.ok).toBe(false)
  if (!loaded.ok) expect(loaded.problem).toMatchObject({ code: 'E_COMPLEMENT', kind: 'classifier', lang: 'es' })
  const classifier = loaded.ok ? (loaded.value as ClassifierComplement) : undefined
  expect(decide('¿Qué es la gracia?', { ...base, classifier })).toMatchObject({ kind: 'call', call: { query: 'concept' }, via: 'rule' })
  // Handed over directly, a model for other queries is not used either.
  const other = { ...(raw as ClassifierComplement), for: 'queries/2' }
  expect(decideStep('el hijo pródigo', { ...base, classifier: other }).step).toBe('search')
})

test('the classifier decides what the rules leave, when its first query can be filled', () => {
  const model = train(
    [
      ['tw', 'concept'],
      ['el tw', 'concept'],
      ['el tw de dios', 'concept'],
      ['busca el hijo', 'search'],
    ],
    { lang: 'es', version: 't' },
  )
  const r = decideStep('el pacto', { ...base, classifier: model })
  expect(r.step).toBe('classifier')
  expect(r.decision).toMatchObject({ kind: 'call', call: { query: 'concept', args: { id: 'tw:kt/covenant' } }, via: 'classifier' })
  // its first query has no argument here: search
  expect(decideStep('el hijo pródigo', { ...base, classifier: train([['nada', 'concept'], ['algo', 'search']], { lang: 'es', version: 't' }) }).step).toBe('search')
})

test('close classifier scores give a choice of both when both can be filled', () => {
  const model = train(
    [
      ['tw', 'concept'],
      ['tw', 'books'],
    ],
    { lang: 'es', version: 't' },
  )
  const r = decideStep('pacto', { ...base, classifier: model })
  expect(r.step).toBe('choose')
  expect(r.decision.kind).toBe('choose')
})

test('below the margin with an unfillable second query, the chain searches', () => {
  // concept and passage tie on "tw": the second (passage) has no reference to fill
  const model = train(
    [
      ['tw', 'concept'],
      ['tw', 'passage'],
    ],
    { lang: 'es', version: 't' },
  )
  const r = decideStep('pacto', { ...base, classifier: model, margin: 0.5 })
  expect(r.step).toBe('search')
  expect(r.decision).toEqual({ kind: 'call', call: { query: 'search', args: { text: 'pacto' } }, via: 'search', interpretation: '' })
})

test('with a tag and names, decide fills the interpretation (R4)', () => {
  const names = (id: string): string | undefined => (id === 'tit' ? 'Tito' : undefined)
  expect(decide('Tito 2:11', { ...base, tag: 'es', names }).interpretation).toBe('Pasaje: Tito 2:11')
})

test('R37 f: a name inside a free description goes to search, not to the classifier', () => {
  const raw = JSON.parse(new TextDecoder().decode(file('es.classifier.json'))) as ClassifierComplement
  const ctx: DecideCtx = { ...base, classifier: raw, tag: 'es-419', descriptionWords: 2 }
  // A name and three other content words, no concept phrase: search.
  expect(decideStep('Moisés y la zarza ardiente grande', ctx)).toMatchObject({ step: 'search', decision: { call: { query: 'search' } } })
  // Two other content words is not more than N = 2: the chain goes on as before.
  expect(decideStep('Moisés zarza ardiente', ctx).step).not.toBe('search')
  expect(decideStep('Moisés zarza ardiente', { ...ctx, descriptionWords: 1 }).step).toBe('search')
  // A concept phrase keeps the rule: "quién fue" asks what the name is.
  expect(decideStep('quién fue Moisés el que vio la zarza ardiente', ctx)).toMatchObject({ step: 'rule', decision: { call: { query: 'concept' } } })
  // No name: unchanged.
  expect(decideStep('la gracia y la fe de los creyentes', ctx).step).toBe(decideStep('la gracia y la fe de los creyentes', { ...ctx, descriptionWords: 99 }).step)
})
