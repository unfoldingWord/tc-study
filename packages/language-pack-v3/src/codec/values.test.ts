import { describe, expect, test } from 'bun:test'
import { hasOwn, isMap } from './values'

describe('isMap', () => {
  test('is true for a map and false for every other value', () => {
    expect(isMap({})).toBe(true)
    expect(isMap({ a: 1, b: [2] })).toBe(true)
    for (const other of [null, undefined, [], [1], new Uint8Array(2), 'text', 7, true]) expect(isMap(other)).toBe(false)
  })
})

describe('hasOwn', () => {
  test('finds own keys only, not the ones of the prototype', () => {
    expect(hasOwn({ a: 1 }, 'a')).toBe(true)
    expect(hasOwn({ a: 1 }, 'b')).toBe(false)
    for (const key of ['constructor', 'toString', 'hasOwnProperty', '__proto__']) expect(hasOwn({}, key)).toBe(false)
  })

  test('finds a key named "__proto__" when the map has it as its own', () => {
    expect(hasOwn(JSON.parse('{"__proto__": 1}'), '__proto__')).toBe(true)
  })
})
