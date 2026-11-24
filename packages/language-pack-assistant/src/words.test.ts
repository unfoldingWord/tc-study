import { expect, test } from 'bun:test'
import { contentWords, contentWordsOutside } from './words'

test('content words drop stop words, frame words and phrase words', () => {
  expect(contentWords('¿Dónde dice la palabra amor y gracia?', 'es-419')).toEqual(['amor', 'gracia'])
  expect(contentWords('where does it say love', 'en')).toEqual(['love'])
  expect(contentWords('la de los', 'es')).toEqual([])
  expect(contentWords('amor amor', 'xx')).toEqual(['amor'])
})

test('question and request words are not content words (es, pt, en)', () => {
  expect(contentWords('cuáles son los personajes, dame más info por favor', 'es-419')).toEqual([])
  expect(contentWords('quais são os personagens, há mais info sobre', 'pt-BR')).toEqual([])
  expect(contentWords('what places are there, please tell me about it', 'en')).toEqual([])
})

test('content words outside spans are dropped by position, not by value', () => {
  // "juan" is inside the span at 0 and outside at 2: it stays.
  expect(contentWordsOutside('Juan dijo Juan', 'es-419', ['juan', 'dijo', 'juan'], [{ start: 0, end: 1 }])).toEqual(['juan', 'dijo'])
  expect(contentWordsOutside('Juan dijo', 'es-419', ['juan', 'dijo'], [{ start: 0, end: 1 }])).toEqual(['dijo'])
})
