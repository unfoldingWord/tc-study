import { expect, test } from 'bun:test'
import type { Call, Decision } from './decision'
import { interpret } from './interpret'

const table: Record<string, string> = { tit: 'Tito', jhn: 'Juan', 'tw:names/abraham': 'Abraham', 'tw:names/john': 'Juan', 'tw:kt/grace': 'gracia' }
const names = (id: string): string | undefined => table[id]
const call = (query: Call['query'], args: Record<string, unknown>): Call => ({ query, args })
const one = (c: Call): Decision => ({ kind: 'call', call: c, via: 'rule', interpretation: '' })
const choose = (...options: Call[]): Decision => ({ kind: 'choose', options, interpretation: '' })

test('a passage shows the book by its name, or the code when the map has none', () => {
  expect(interpret(one(call('passage', { ref: 'tit 2:11' })), 'es', names)).toBe('Pasaje: Tito 2:11')
  expect(interpret(one(call('passage', { ref: 'xyz 1:1' })), 'es-419', names)).toBe('Pasaje: xyz 1:1')
})

test('a concept shows its first name, in the language of the label', () => {
  expect(interpret(one(call('concept', { id: 'tw:names/abraham' })), 'en', names)).toBe('Concept: Abraham')
  expect(interpret(one(call('concept', { id: 'tw:names/abraham' })), 'pt-BR', names)).toBe('Conceito: Abraham')
})

test('an unknown language uses the English labels', () => {
  expect(interpret(one(call('concept', { id: 'tw:names/abraham' })), 'fr', names)).toBe('Concept: Abraham')
})

test('a choose between a book and a person', () => {
  const d = choose(call('passage', { ref: 'jhn front:intro' }), call('concept', { id: 'tw:names/john' }))
  expect(interpret(d, 'es', names)).toBe('¿Juan, el libro, o Juan, la persona?')
  expect(interpret(d, 'en', names)).toBe('Juan, the book, or Juan, the person?')
})

test('a choose of renderings by Strong keys', () => {
  const d = choose(call('renderings', { strong: 'G54850' }), call('renderings', { strong: 'H25800' }), call('renderings', { strong: 'G12340' }))
  expect(interpret(d, 'es', names)).toBe('¿Cuál de estas palabras del original: G5485, H2580, G1234…?')
})

test('a choose of a concept and a search', () => {
  const d = choose(call('concept', { id: 'tw:kt/grace' }), call('search', { text: 'qué es la gracia' }))
  expect(interpret(d, 'es', names)).toBe('¿El artículo sobre gracia, o buscar «qué es la gracia»?')
})
