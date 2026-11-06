import { describe, expect, test } from 'bun:test'
import { hasOwn, hexToBytes, isMap, isUint, sha256Digest } from './values'

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

describe('isUint', () => {
  test('is true for the integers from 0 to 2^53 - 1 and false for anything else', () => {
    for (const value of [0, 1, 255, 2 ** 40, Number.MAX_SAFE_INTEGER]) expect(isUint(value)).toBe(true)
    for (const value of [-1, 1.5, 2 ** 53, Number.NaN, Number.POSITIVE_INFINITY, '1', null, undefined, 1n, [1]]) expect(isUint(value)).toBe(false)
  })
})

describe('hexToBytes', () => {
  test('reads two digits per byte, in either case', () => {
    expect(Array.from(hexToBytes('00ff10aB'))).toEqual([0, 255, 16, 171])
    expect(hexToBytes('')).toEqual(new Uint8Array(0))
  })

  test('throws for an odd length or a character that is not a hex digit', () => {
    for (const text of ['abc', 'zz', '0x', ' 0', '0g']) expect(() => hexToBytes(text)).toThrow(Error)
  })
})

describe('sha256Digest', () => {
  test('is the sha256 of the bytes', async () => {
    const hex = (bytes: Uint8Array) => Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('')
    expect(hex(await sha256Digest(new Uint8Array(0)))).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
    expect(hex(await sha256Digest(new TextEncoder().encode('abc')))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })
})
