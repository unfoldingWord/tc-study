import { describe, expect, test } from 'bun:test'
import { sha256, sha256Hex, sha256Prefix32, toHex } from './sha256'

const utf8 = (text: string) => new TextEncoder().encode(text)
const reference = async (bytes: Uint8Array) => toHex(new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)))

describe('sha256 against FIPS 180-4', () => {
  test('the empty message', () => {
    expect(sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855')
  })

  test('"abc"', () => {
    expect(sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad')
  })

  test('the 448-bit message', () => {
    expect(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq')).toBe(
      '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1',
    )
  })

  test('the 896-bit message', () => {
    expect(sha256Hex('abcdefghbcdefghicdefghijdefghijkefghijklfghijklmghijklmnhijklmnoijklmnopjklmnopqklmnopqrlmnopqrsmnopqrstnopqrstu')).toBe(
      'cf5b16a778af8380036ce59e7b0492370b249b11e8f07a51afac45037afee9d1',
    )
  })

  test('a million "a"', () => {
    expect(toHex(sha256(utf8('a'.repeat(1_000_000))))).toBe('cdc76e5c9914fb9281a1c7e284d73e67f1809a48a497200e046d39ccc7112cd0')
  })
})

describe('sha256 against Web Crypto', () => {
  test('lengths around the block boundaries: 0, 1, 54 to 66, 119 to 129', async () => {
    const lengths = [0, 1, ...Array.from({ length: 13 }, (_, i) => 54 + i), ...Array.from({ length: 11 }, (_, i) => 119 + i)]
    for (const length of lengths) {
      const bytes = Uint8Array.from({ length }, (_, i) => (i * 7 + 3) & 0xff)
      expect(toHex(sha256(bytes))).toBe(await reference(bytes))
    }
  })

  test('55, 56, 63, 64 and 65 bytes of "a"', async () => {
    for (const length of [55, 56, 63, 64, 65]) {
      const bytes = utf8('a'.repeat(length))
      expect(toHex(sha256(bytes))).toBe(await reference(bytes))
    }
  })

  test('20 random inputs of random length (a fixed seed)', async () => {
    let seed = 12345
    const next = () => (seed = (Math.imul(seed, 1103515245) + 12345) & 0x7fffffff)
    for (let n = 0; n < 20; n++) {
      const bytes = Uint8Array.from({ length: next() % 600 }, () => next() & 0xff)
      expect(toHex(sha256(bytes))).toBe(await reference(bytes))
    }
  })

  test('does not change its input, and the same input gives the same digest twice', () => {
    const bytes = utf8('Pablo, siervo de Dios')
    const copy = bytes.slice()
    const first = sha256(bytes)
    expect(bytes).toEqual(copy)
    expect(sha256(bytes)).toEqual(first)
  })
})

describe('sha256Prefix32', () => {
  test('is the first four bytes of the digest, big-endian, unsigned', () => {
    // sha256("abc") starts with ba 78 16 bf; sha256("") with e3 b0 c4 42 (above 2^31, so it must not be negative).
    expect(sha256Prefix32('abc')).toBe(0xba7816bf)
    expect(sha256Prefix32('')).toBe(0xe3b0c442)
  })
})
