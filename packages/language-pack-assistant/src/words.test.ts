import { expect, test } from 'bun:test'
import { contentWords } from './words'

test('content words drop stop words, frame words and phrase words', () => {
  expect(contentWords('¿Dónde dice la palabra amor y gracia?', 'es-419')).toEqual(['amor', 'gracia'])
  expect(contentWords('where does it say love', 'en')).toEqual(['love'])
  expect(contentWords('la de los', 'es')).toEqual([])
  expect(contentWords('amor amor', 'xx')).toEqual(['amor'])
})
