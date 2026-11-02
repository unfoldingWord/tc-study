import { describe, expect, test } from 'bun:test'
import minimal from '../../spec/tests/container/minimal.expected.json'
import { CborNestingError, type CborValue, decodeCbor, encodeDeterministic, MAX_DEPTH } from './cbor'
import { ColumnError, encodeUvarints, stringTable } from './columns'

const bytes = (...b: number[]) => Uint8Array.from(b)

const hex = (data: Uint8Array) => Array.from(data, (b) => b.toString(16).padStart(2, '0')).join('')

async function sha256Hex(data: Uint8Array): Promise<string> {
  return hex(new Uint8Array(await crypto.subtle.digest('SHA-256', data)))
}

/** `levels` arrays inside each other, the innermost one empty. */
function nestedArrays(levels: number): CborValue {
  let value: CborValue = []
  for (let i = 1; i < levels; i++) value = [value]
  return value
}

describe('encodeDeterministic', () => {
  test('integers take the shortest head', () => {
    const cases: Array<[number, number[]]> = [
      [0, [0x00]],
      [23, [0x17]],
      [24, [0x18, 0x18]],
      [255, [0x18, 0xff]],
      [256, [0x19, 0x01, 0x00]],
      [500, [0x19, 0x01, 0xf4]],
      [65535, [0x19, 0xff, 0xff]],
      [65536, [0x1a, 0x00, 0x01, 0x00, 0x00]],
      [2 ** 32 - 1, [0x1a, 0xff, 0xff, 0xff, 0xff]],
      [2 ** 32, [0x1b, 0, 0, 0, 1, 0, 0, 0, 0]],
      [2 ** 53 - 1, [0x1b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]],
      [-1, [0x20]],
      [-24, [0x37]],
      [-25, [0x38, 0x18]],
      [-(2 ** 53), [0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff]],
    ]
    for (const [value, expected] of cases) {
      expect(Array.from(encodeDeterministic(value))).toEqual(expected)
    }
  })

  test('500 and -1', () => {
    expect(encodeDeterministic(500)).toEqual(bytes(0x19, 0x01, 0xf4))
    expect(encodeDeterministic(-1)).toEqual(bytes(0x20))
  })

  test('booleans, text, bytes, arrays', () => {
    expect(encodeDeterministic(false)).toEqual(bytes(0xf4))
    expect(encodeDeterministic(true)).toEqual(bytes(0xf5))
    expect(encodeDeterministic('a')).toEqual(bytes(0x61, 0x61))
    expect(encodeDeterministic('é')).toEqual(bytes(0x62, 0xc3, 0xa9))
    expect(encodeDeterministic(bytes(1, 2, 3))).toEqual(bytes(0x43, 1, 2, 3))
    expect(encodeDeterministic([1, 2, 3])).toEqual(bytes(0x83, 1, 2, 3))
    expect(encodeDeterministic([])).toEqual(bytes(0x80))
    expect(encodeDeterministic({})).toEqual(bytes(0xa0))
  })

  test('lengths take the shortest head too', () => {
    expect(Array.from(encodeDeterministic('x'.repeat(23)).subarray(0, 1))).toEqual([0x77])
    expect(Array.from(encodeDeterministic('x'.repeat(24)).subarray(0, 2))).toEqual([0x78, 0x18])
    expect(Array.from(encodeDeterministic('x'.repeat(255)).subarray(0, 2))).toEqual([0x78, 0xff])
    expect(Array.from(encodeDeterministic('x'.repeat(256)).subarray(0, 3))).toEqual([0x79, 0x01, 0x00])
    expect(Array.from(encodeDeterministic(new Uint8Array(256)).subarray(0, 3))).toEqual([0x59, 0x01, 0x00])
    expect(Array.from(encodeDeterministic(new Array(24).fill(0)).subarray(0, 2))).toEqual([0x98, 0x18])
  })

  test('map keys are sorted by the bytes of their encoding', () => {
    const encoded = encodeDeterministic({ tables: 1, h: 2, id: 3 })
    expect(encoded).toEqual(bytes(0xa3, 0x61, 0x68, 0x02, 0x62, 0x69, 0x64, 0x03, 0x66, 0x74, 0x61, 0x62, 0x6c, 0x65, 0x73, 0x01))
    const decoded = decodeCbor(encoded) as Record<string, number>
    expect(Object.keys(decoded)).toEqual(['h', 'id', 'tables'])
  })

  test('encoded bytes decide the order, not the code points of the keys', () => {
    // "é" is two bytes, so its head is 0x62 and it comes before "zzz" (0x63), though "zzz" < "é" by code point.
    expect(Object.keys(decodeCbor(encodeDeterministic({ zzz: 1, é: 2 })) as object)).toEqual(['é', 'zzz'])
    // A key of 24 bytes or more has a longer head and goes after the short ones; among them, shorter goes first.
    const k24 = 'a'.repeat(24)
    const k30 = 'a'.repeat(30)
    const encoded = encodeDeterministic({ [k30]: 1, zzz: 2, [k24]: 3 })
    expect(Object.keys(decodeCbor(encoded) as object)).toEqual(['zzz', k24, k30])
  })

  test('rejects a number that is not an integer', () => {
    expect(() => encodeDeterministic(1.5)).toThrow(TypeError)
    expect(() => encodeDeterministic(Number.NaN)).toThrow(TypeError)
    expect(() => encodeDeterministic(Number.POSITIVE_INFINITY)).toThrow(TypeError)
    expect(() => encodeDeterministic(2 ** 53)).toThrow(TypeError)
    expect(() => encodeDeterministic(-(2 ** 53) - 2)).toThrow(TypeError)
  })

  test('rejects null and undefined, alone or inside a value', () => {
    expect(() => encodeDeterministic(null as unknown as CborValue)).toThrow(TypeError)
    expect(() => encodeDeterministic(undefined as unknown as CborValue)).toThrow(TypeError)
    expect(() => encodeDeterministic([1, null] as unknown as CborValue)).toThrow(TypeError)
    expect(() => encodeDeterministic({ a: undefined } as unknown as CborValue)).toThrow(TypeError)
  })

  test('rejects what is not plain data', () => {
    expect(() => encodeDeterministic(10n as unknown as CborValue)).toThrow(TypeError)
    expect(() => encodeDeterministic(new Map() as unknown as CborValue)).toThrow(TypeError)
    expect(() => encodeDeterministic(new Date(0) as unknown as CborValue)).toThrow(TypeError)
    expect(() => encodeDeterministic((() => 1) as unknown as CborValue)).toThrow(TypeError)
  })

  test('rejects text with a lone surrogate instead of replacing it', () => {
    expect(() => encodeDeterministic('a\ud800b')).toThrow(TypeError)
    expect(() => encodeDeterministic('\udc00')).toThrow(TypeError)
    expect(() => encodeDeterministic({ '\ud800': 1 })).toThrow(TypeError)
    expect(encodeDeterministic('\u{1D538}')).toEqual(bytes(0x64, 0xf0, 0x9d, 0x94, 0xb8))
  })

  test('MAX_DEPTH is the 64 levels of spec/container.md', () => {
    expect(MAX_DEPTH).toBe(64)
  })

  test('nesting: MAX_DEPTH levels pass, MAX_DEPTH + 1 throw', () => {
    expect(() => encodeDeterministic(nestedArrays(MAX_DEPTH))).not.toThrow()
    expect(() => encodeDeterministic(nestedArrays(MAX_DEPTH + 1))).toThrow(TypeError)
    let map: CborValue = {}
    for (let i = 1; i < MAX_DEPTH; i++) map = { a: map }
    expect(() => encodeDeterministic(map)).not.toThrow()
    expect(() => encodeDeterministic({ a: map })).toThrow(TypeError)
  })

  test('the text of the translator is kept as written', () => {
    const text = '﻿é   \n'
    expect(decodeCbor(encodeDeterministic(text))).toBe(text)
  })

  test('sha256 of the body of minimal.seg', async () => {
    // Rebuilt as make_examples.py does: Titus 1:1, "Pablo, siervo de Dios".
    const pieces: Array<[string, boolean]> = [
      ['Pablo', true],
      [', ', false],
      ['siervo', true],
      [' ', false],
      ['de', true],
      [' ', false],
      ['Dios', true],
    ]
    const events: Array<[number, number, string | null]> = [
      [0, 0, '1'],
      [0, 2, 'para:p'],
      [0, 1, '1'],
      [7, 3, null],
    ]
    const uses = [...pieces.map(([p]) => p), ...events.flatMap(([, , arg]) => (arg === null ? [] : [arg]))]
    const { list: strings, index } = stringTable(uses)
    const tok = encodeUvarints(pieces.map(([p, w]) => (index.get(p) as number) * 2 + (w ? 1 : 0)))
    const ev: number[] = []
    let last = 0
    for (const [pos, code, arg] of events) {
      ev.push(pos - last, code, arg === null ? 0 : (index.get(arg) as number))
      last = pos
    }
    const t = { strings, texts: [{ res: 0, tok, ev: encodeUvarints(ev) }] }
    const body = encodeDeterministic({ h: minimal.h as CborValue, t })
    expect(await sha256Hex(body)).toBe('644fd73e8b75f16563e6adf91301f5f7727339f3e405ab9ce9ebf3dfe7e52ea7')
    expect(await sha256Hex(body)).toBe(minimal.id)
  })
})

describe('decodeCbor', () => {
  const sample: CborValue = {
    class: 'book',
    v: 1,
    flags: [true, false, true],
    tok: bytes(0, 1, 2, 255),
    nested: { list: [1, -1, 500, 2 ** 40, 2 ** 53 - 1, -(2 ** 53)], text: 'Pablo, siervo de Dios', empty: [] },
    acentos: 'ñandú \u{1D538}',
  }

  test('decodeCbor(encodeDeterministic(x)) deep-equals x', () => {
    expect(decodeCbor(encodeDeterministic(sample))).toEqual(sample)
  })

  test('a map key longer than 23 bytes and a text longer than 255 bytes round trip', () => {
    const key = 'k'.repeat(30)
    const value: CborValue = { [key]: 'x'.repeat(300), short: 'y'.repeat(24), mid: 'z'.repeat(256) }
    const encoded = encodeDeterministic(value)
    // The key's head is 78 1e, the long text's head is 79 01 2c.
    const encodedHex = hex(encoded)
    expect(encodedHex).toContain('781e' + '6b'.repeat(30) + '79012c')
    expect(decodeCbor(encoded)).toEqual(value)
  })

  test('byte strings come back as plain Uint8Array, whatever the input is', () => {
    const encoded = encodeDeterministic({ b: bytes(1, 2, 3) })
    for (const input of [encoded, Buffer.from(encoded)]) {
      const out = (decodeCbor(input) as { b: Uint8Array }).b
      expect(Object.getPrototypeOf(out)).toBe(Uint8Array.prototype)
      expect(out).toEqual(bytes(1, 2, 3))
    }
    // A copy: it does not share memory with the input.
    const input = Buffer.from(encoded)
    const out = (decodeCbor(input) as { b: Uint8Array }).b
    input.fill(0)
    expect(out).toEqual(bytes(1, 2, 3))
  })

  test('keeps a byte order mark at the start of a text', () => {
    expect(decodeCbor(encodeDeterministic('﻿abc'))).toBe('﻿abc')
  })

  test('a key called __proto__ is a key', () => {
    const value = JSON.parse('{"__proto__": 1, "a": 2}') as CborValue
    const decoded = decodeCbor(encodeDeterministic(value)) as Record<string, number>
    // "a" has the shorter head (0x61), so it comes first.
    expect(Object.keys(decoded)).toEqual(['a', '__proto__'])
    expect(Object.getOwnPropertyDescriptor(decoded, '__proto__')?.value).toBe(1)
    expect(Object.getPrototypeOf(decoded)).toBe(Object.prototype)
  })

  test('integers at the edges of 2^53', () => {
    expect(decodeCbor(bytes(0x1b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))).toBe(2 ** 53 - 1)
    expect(decodeCbor(bytes(0x3b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))).toBe(-(2 ** 53))
    expect(decodeCbor(bytes(0x1b, 0, 0, 0, 1, 0, 0, 0, 0))).toBe(2 ** 32)
  })

  test('rejects an integer above 2^53 - 1 or below -2^53', () => {
    expect(() => decodeCbor(bytes(0x1b, 0x00, 0x20, 0, 0, 0, 0, 0, 0))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x3b, 0x00, 0x20, 0, 0, 0, 0, 0, 0))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x1b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x3b, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))).toThrow(ColumnError)
  })

  test('rejects every float encoding, even for a whole number', () => {
    expect(() => decodeCbor(bytes(0xf9, 0x3c, 0x00))).toThrow(ColumnError) // float16 1.0
    expect(() => decodeCbor(bytes(0xfa, 0x3f, 0x80, 0x00, 0x00))).toThrow(ColumnError) // float32 1.0
    expect(() => decodeCbor(bytes(0xfb, 0x3f, 0xf0, 0, 0, 0, 0, 0, 0))).toThrow(ColumnError) // float64 1.0
    expect(() => decodeCbor(bytes(0xfb, 0x3f, 0xf8, 0, 0, 0, 0, 0, 0))).toThrow(ColumnError) // float64 1.5
    expect(() => decodeCbor(bytes(0xfb, 0x7f, 0xf8, 0, 0, 0, 0, 0, 0))).toThrow(ColumnError) // NaN
    expect(() => decodeCbor(bytes(0x81, 0xfb, 0x40, 0, 0, 0, 0, 0, 0, 0))).toThrow(ColumnError) // [2.0]
  })

  test('rejects tags', () => {
    expect(() => decodeCbor(bytes(0xc1, 0x00))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xd8, 0x18, 0x41, 0x00))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xd9, 0xd9, 0xf7, 0x00))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x81, 0xc2, 0x41, 0x01))).toThrow(ColumnError)
  })

  test('rejects null and undefined, alone or inside a value', () => {
    expect(() => decodeCbor(bytes(0xf6))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xf7))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x81, 0xf6))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xa1, 0x61, 0x61, 0xf7))).toThrow(ColumnError)
  })

  test('rejects other simple values and a stray break', () => {
    expect(() => decodeCbor(bytes(0xf0))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xf8, 0x20))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xff))).toThrow(ColumnError)
  })

  test('rejects nesting deeper than MAX_DEPTH', () => {
    const arrays = (levels: number) => bytes(...new Array(levels - 1).fill(0x81), 0x80)
    expect(decodeCbor(arrays(MAX_DEPTH))).toEqual(nestedArrays(MAX_DEPTH))
    expect(() => decodeCbor(arrays(MAX_DEPTH + 1))).toThrow(ColumnError)
    expect(() => decodeCbor(arrays(MAX_DEPTH + 1))).toThrow(CborNestingError) // the container maps this one to E_LIMIT
    expect(() => decodeCbor(bytes(0xf6))).toThrow(ColumnError)
    try {
      decodeCbor(bytes(0xf6))
    } catch (error) {
      expect(error).not.toBeInstanceOf(CborNestingError) // other failures stay E_HEADER or E_BODY
    }
    const maps = (levels: number) => bytes(...new Array(levels - 1).fill([0xa1, 0x61, 0x61]).flat(), 0xa0)
    expect(() => decodeCbor(maps(MAX_DEPTH))).not.toThrow()
    expect(() => decodeCbor(maps(MAX_DEPTH + 1))).toThrow(ColumnError)
    expect(() => decodeCbor(maps(MAX_DEPTH + 1))).toThrow(CborNestingError)
  })

  test('nesting far beyond MAX_DEPTH fails fast with the nesting error, not a stack overflow', () => {
    // 100 000 opening array heads and nothing else: the decoder must stop at the first level over the limit.
    expect(() => decodeCbor(new Uint8Array(100_000).fill(0x81))).toThrow(CborNestingError)
    const mapHeads = new Uint8Array(300_000)
    for (let i = 0; i < mapHeads.length; i += 3) mapHeads.set([0xa1, 0x61, 0x61], i)
    expect(() => decodeCbor(mapHeads)).toThrow(CborNestingError)
  })

  test('rejects indefinite lengths', () => {
    for (const head of [0x5f, 0x7f, 0x9f, 0xbf]) {
      expect(() => decodeCbor(bytes(head, 0xff))).toThrow(ColumnError)
    }
  })

  test('rejects indefinite lengths everywhere: well-formed items, nested ones, in a key position, and on integer heads', () => {
    const items: number[][] = [
      [0x9f, 0x01, 0xff], // [_ 1]
      [0xbf, 0x61, 0x61, 0x01, 0xff], // {_ "a": 1}
      [0x5f, 0x41, 0x01, 0xff], // (_ h'01')
      [0x7f, 0x61, 0x61, 0xff], // (_ "a")
    ]
    for (const item of items) {
      expect(() => decodeCbor(bytes(...item))).toThrow(ColumnError)
      expect(() => decodeCbor(bytes(0x81, ...item))).toThrow(ColumnError) // inside an array
      expect(() => decodeCbor(bytes(0xa1, 0x61, 0x61, ...item))).toThrow(ColumnError) // as a map value
      expect(() => decodeCbor(bytes(0xa1, ...item, 0x01))).toThrow(ColumnError) // in the place of a key
    }
    for (const head of [0x1f, 0x3f, 0xdf]) expect(() => decodeCbor(bytes(head))).toThrow(ColumnError)
  })

  test('rejects map keys that are not text, and repeated keys', () => {
    expect(() => decodeCbor(bytes(0xa1, 0x01, 0x02))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xa1, 0x41, 0x61, 0x02))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0xa2, 0x61, 0x61, 0x01, 0x61, 0x61, 0x02))).toThrow(ColumnError)
  })

  test('rejects data cut short, bytes after the item, and an empty input', () => {
    expect(() => decodeCbor(bytes())).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x19, 0x01))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x62, 0x61))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x82, 0x01))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x5a, 0xff, 0xff, 0xff, 0xff, 0x01))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x9b, 0x00, 0x1f, 0xff, 0xff, 0xff, 0xff, 0xff, 0xff))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x00, 0x00))).toThrow(ColumnError)
  })

  test('rejects text that is not UTF-8 and reserved additional information', () => {
    expect(() => decodeCbor(bytes(0x61, 0xff))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x61, 0xc3))).toThrow(ColumnError)
    expect(() => decodeCbor(bytes(0x1c))).toThrow(ColumnError)
  })
})
