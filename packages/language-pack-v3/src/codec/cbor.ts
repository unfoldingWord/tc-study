/**
 * Deterministic CBOR for format 3 (`spec/container.md`, "Deterministic encoding").
 *
 * The encoder follows RFC 8949 section 4.2.1: integers and lengths in their shortest form, definite lengths only,
 * map keys sorted by the bytes of their encoding. It also refuses what the format forbids: floats, tags, `null` and
 * `undefined`. The decoder is written by hand for the same reason: a library decoder reads a float64 `1.0` as the
 * integer 1, so it cannot tell a body that breaks the "no floats" rule from one that keeps it. This one reads only
 * what the encoder writes (integers, byte strings, text, arrays, maps with text keys, booleans) and throws
 * {@link ColumnError} on anything else.
 *
 * No Node module is used, so builders and readers run in a browser and in a Worker.
 */
import { ColumnError } from './columns'

/** What a format 3 header or body may hold. Integers only: a number with a fraction is not a `CborValue`. */
export type CborValue = number | string | boolean | Uint8Array | CborValue[] | { [key: string]: CborValue }

/** Nesting of arrays and maps a header or body may have (`spec/container.md`, "Limits"). */
const MAX_DEPTH = 16

/** Integers go from -2^53 to 2^53 - 1, so that JavaScript reads them exactly. */
const MAX_INT = Number.MAX_SAFE_INTEGER // 2^53 - 1
const MIN_INT = -(2 ** 53)

const TWO_32 = 2 ** 32

// Encoder

/** A byte buffer that grows as the encoder writes into it. */
class Writer {
  private buf = new Uint8Array(256)
  private len = 0

  private reserve(extra: number): void {
    const need = this.len + extra
    if (need <= this.buf.length) return
    let size = this.buf.length * 2
    while (size < need) size *= 2
    const bigger = new Uint8Array(size)
    bigger.set(this.buf.subarray(0, this.len))
    this.buf = bigger
  }

  byte(b: number): void {
    this.reserve(1)
    this.buf[this.len++] = b
  }

  bytes(b: Uint8Array): void {
    this.reserve(b.length)
    this.buf.set(b, this.len)
    this.len += b.length
  }

  /** The head of a data item: major type in the top 3 bits, then `n` in the shortest form that holds it. */
  head(major: number, n: number): void {
    const m = major << 5
    if (n < 24) {
      this.byte(m | n)
    } else if (n < 0x100) {
      this.byte(m | 24)
      this.byte(n)
    } else if (n < 0x10000) {
      this.byte(m | 25)
      this.byte(Math.floor(n / 0x100))
      this.byte(n % 0x100)
    } else if (n < TWO_32) {
      this.byte(m | 26)
      this.u32(n)
    } else {
      // n is below 2^53, so the two halves are exact. No 32-bit bit operations on the whole number.
      this.byte(m | 27)
      this.u32(Math.floor(n / TWO_32))
      this.u32(n % TWO_32)
    }
  }

  private u32(n: number): void {
    this.byte(Math.floor(n / 0x1000000))
    this.byte(Math.floor(n / 0x10000) % 0x100)
    this.byte(Math.floor(n / 0x100) % 0x100)
    this.byte(n % 0x100)
  }

  result(): Uint8Array {
    return this.buf.slice(0, this.len)
  }
}

const utf8Encoder = new TextEncoder()

const SURROGATE = /[\ud800-\udfff]/

/** TextEncoder turns a lone surrogate into U+FFFD without a word; the text of a translator must not change. */
function assertWellFormed(text: string): void {
  if (!SURROGATE.test(text)) return
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i)
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = text.charCodeAt(i + 1)
      if (next >= 0xdc00 && next <= 0xdfff) {
        i++
        continue
      }
    }
    if (c >= 0xd800 && c <= 0xdfff) {
      throw new TypeError(`CBOR text has a lone surrogate at index ${i}`)
    }
  }
}

function encodeText(out: Writer, text: string): void {
  assertWellFormed(text)
  const utf8 = utf8Encoder.encode(text)
  out.head(3, utf8.length)
  out.bytes(utf8)
}

function compareBytes(a: Uint8Array, b: Uint8Array): number {
  const n = Math.min(a.length, b.length)
  for (let i = 0; i < n; i++) {
    if (a[i] !== b[i]) return a[i] - b[i]
  }
  return a.length - b.length
}

function isPlainObject(value: object): boolean {
  const proto = Object.getPrototypeOf(value)
  return proto === Object.prototype || proto === null
}

function encodeInto(out: Writer, value: unknown, depth: number): void {
  switch (typeof value) {
    case 'number': {
      if (!Number.isInteger(value) || value > MAX_INT || value < MIN_INT) {
        throw new TypeError(`CBOR number ${String(value)} is not an integer between -2^53 and 2^53 - 1`)
      }
      if (value >= 0) out.head(0, value)
      else out.head(1, -1 - value)
      return
    }
    case 'string':
      encodeText(out, value)
      return
    case 'boolean':
      out.byte(value ? 0xf5 : 0xf4)
      return
    case 'object': {
      if (value === null) throw new TypeError('CBOR null is not allowed: leave the key out')
      if (value instanceof Uint8Array) {
        out.head(2, value.length)
        out.bytes(value)
        return
      }
      if (Array.isArray(value)) {
        if (depth + 1 > MAX_DEPTH) throw new TypeError(`CBOR nesting is deeper than ${MAX_DEPTH}`)
        out.head(4, value.length)
        for (let i = 0; i < value.length; i++) encodeInto(out, value[i], depth + 1)
        return
      }
      if (!isPlainObject(value)) throw new TypeError('CBOR can only hold plain objects, arrays and byte strings')
      if (depth + 1 > MAX_DEPTH) throw new TypeError(`CBOR nesting is deeper than ${MAX_DEPTH}`)
      const record = value as Record<string, unknown>
      // Sort by the bytes of the encoded key (RFC 8949 4.2.1), not by UTF-16 order of the strings.
      const entries = Object.keys(record).map((key) => {
        const keyOut = new Writer()
        encodeText(keyOut, key)
        return { key, bytes: keyOut.result() }
      })
      entries.sort((a, b) => compareBytes(a.bytes, b.bytes))
      out.head(5, entries.length)
      for (const entry of entries) {
        out.bytes(entry.bytes)
        encodeInto(out, record[entry.key], depth + 1)
      }
      return
    }
    case 'undefined':
      throw new TypeError('CBOR undefined is not allowed: leave the key out')
    default:
      throw new TypeError(`CBOR cannot hold a ${typeof value}`)
  }
}

/**
 * Encodes a value as core deterministic CBOR. Throws `TypeError` on a number that is not an integer between -2^53 and
 * 2^53 - 1, on `null` and `undefined`, on text with a lone surrogate, on anything that is not a plain object, and on
 * nesting deeper than 16.
 */
export function encodeDeterministic(value: CborValue): Uint8Array {
  const out = new Writer()
  encodeInto(out, value, 0)
  return out.result()
}

// Decoder

const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

class Reader {
  private pos = 0

  constructor(private readonly data: Uint8Array) {}

  private need(n: number): void {
    if (n > this.data.length - this.pos) throw new ColumnError('CBOR: the data ends before the item does')
  }

  private byte(): number {
    this.need(1)
    return this.data[this.pos++]
  }

  private u32(): number {
    this.need(4)
    const d = this.data
    const p = this.pos
    this.pos += 4
    return d[p] * 0x1000000 + d[p + 1] * 0x10000 + d[p + 2] * 0x100 + d[p + 3]
  }

  /** The argument of a head, for the majors that take an integer. Rejects the forms the format does not use. */
  private argument(info: number): number {
    if (info < 24) return info
    if (info === 24) return this.byte()
    if (info === 25) return this.byte() * 0x100 + this.byte()
    if (info === 26) return this.u32()
    if (info === 27) {
      const high = this.u32()
      const low = this.u32()
      if (high > 0x1fffff) throw new ColumnError('CBOR: integer beyond 2^53 - 1')
      return high * TWO_32 + low
    }
    if (info === 31) throw new ColumnError('CBOR: indefinite lengths are not allowed')
    throw new ColumnError(`CBOR: reserved additional information ${info}`)
  }

  private take(n: number): Uint8Array {
    this.need(n)
    const start = this.pos
    this.pos += n
    // A copy into a plain Uint8Array: slice() on a Node Buffer would give a Buffer that shares memory.
    const out = new Uint8Array(n)
    out.set(this.data.subarray(start, start + n))
    return out
  }

  private text(n: number): string {
    this.need(n)
    const start = this.pos
    this.pos += n
    try {
      return utf8Decoder.decode(this.data.subarray(start, start + n))
    } catch {
      throw new ColumnError('CBOR: text is not valid UTF-8')
    }
  }

  value(depth: number): CborValue {
    const initial = this.byte()
    const major = initial >> 5
    const info = initial & 0x1f
    switch (major) {
      case 0:
        return this.argument(info)
      case 1:
        return -1 - this.argument(info)
      case 2:
        return this.take(this.argument(info))
      case 3:
        return this.text(this.argument(info))
      case 4: {
        const count = this.argument(info)
        if (depth + 1 > MAX_DEPTH) throw new ColumnError(`CBOR: nesting is deeper than ${MAX_DEPTH}`)
        // Every item takes a byte at least, so a count beyond the rest of the data is cut short.
        this.need(count)
        const items: CborValue[] = []
        for (let i = 0; i < count; i++) items.push(this.value(depth + 1))
        return items
      }
      case 5: {
        const count = this.argument(info)
        if (depth + 1 > MAX_DEPTH) throw new ColumnError(`CBOR: nesting is deeper than ${MAX_DEPTH}`)
        this.need(count * 2)
        const map: { [key: string]: CborValue } = {}
        for (let i = 0; i < count; i++) {
          const keyInitial = this.byte()
          if (keyInitial >> 5 !== 3) throw new ColumnError('CBOR: a map key is not text')
          const key = this.text(this.argument(keyInitial & 0x1f))
          if (Object.prototype.hasOwnProperty.call(map, key)) throw new ColumnError(`CBOR: duplicate map key "${key}"`)
          const item = this.value(depth + 1)
          // Plain assignment of "__proto__" would set the prototype instead of adding a key.
          if (key === '__proto__') {
            Object.defineProperty(map, key, { value: item, enumerable: true, writable: true, configurable: true })
          } else {
            map[key] = item
          }
        }
        return map
      }
      case 6:
        throw new ColumnError('CBOR: tags are not allowed')
      default:
        return this.simple(info)
    }
  }

  private simple(info: number): boolean {
    if (info === 20) return false
    if (info === 21) return true
    if (info === 22) throw new ColumnError('CBOR: null is not allowed')
    if (info === 23) throw new ColumnError('CBOR: undefined is not allowed')
    if (info >= 25 && info <= 27) throw new ColumnError('CBOR: floats are not allowed')
    if (info === 31) throw new ColumnError('CBOR: unexpected break')
    throw new ColumnError(`CBOR: simple value ${info} is not allowed`)
  }

  assertDone(): void {
    if (this.pos !== this.data.length) throw new ColumnError('CBOR: bytes after the end of the item')
  }
}

/**
 * Decodes one CBOR item that is a {@link CborValue}. Byte strings come back as plain `Uint8Array`. Throws
 * {@link ColumnError} on floats (in every width, even for a whole number), tags, `null`, `undefined`, other simple
 * values, integers outside -2^53 .. 2^53 - 1, indefinite lengths, map keys that are not text or are repeated, text that
 * is not valid UTF-8, nesting deeper than 16, data cut short and bytes after the item.
 *
 * It does not check that heads are the shortest form or that map keys are sorted: the identity of a body is the
 * sha256 of its bytes, and a reader need not encode again to check it.
 */
export function decodeCbor(bytes: Uint8Array): CborValue {
  const reader = new Reader(bytes)
  const value = reader.value(0)
  reader.assertDone()
  return value
}
