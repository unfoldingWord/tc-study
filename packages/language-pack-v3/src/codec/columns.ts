/**
 * Column encodings of format 3 (`spec/container.md`, "Column encodings").
 *
 * Tables keep their data by columns; these are the codecs of one column. Everything here is plain arithmetic on
 * numbers and bytes, with no Node module, so builders and readers run in a browser and in a Worker.
 *
 * Numbers go up to 2^53 - 1, so every varint step uses `Math.floor(n / 128)` and `n % 128`. JavaScript's bit
 * operators work on 32 bits and would corrupt verse ids and positions silently once they pass 2^31.
 */

/** Largest value a varint can hold, so that JavaScript reads it exactly. */
const MAX_SAFE = Number.MAX_SAFE_INTEGER // 2^53 - 1

/** 8 groups of 7 bits cover 56 bits, enough for 2^53 - 1. A ninth byte is never needed. */
const MAX_VARINT_BYTES = 8

/** Thrown on a malformed column. The reader maps it to `E_BODY`. */
export class ColumnError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ColumnError'
  }
}

// uvarints

function pushUvarint(out: number[], value: number): void {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new ColumnError(`uvarint: ${String(value)} is not an integer between 0 and 2^53 - 1`)
  }
  let rest = value
  while (rest >= 128) {
    out.push((rest % 128) + 128)
    rest = Math.floor(rest / 128)
  }
  out.push(rest)
}

/** Unsigned LEB128 numbers, one after the other. Each must be an integer from 0 to 2^53 - 1. */
export function encodeUvarints(values: Iterable<number>): Uint8Array {
  const out: number[] = []
  for (const value of values) pushUvarint(out, value)
  return Uint8Array.from(out)
}

/** The inverse of {@link encodeUvarints}. Rejects a varint that is cut short, not minimal, too long or too big. */
export function decodeUvarints(bytes: Uint8Array): number[] {
  const out: number[] = []
  let i = 0
  while (i < bytes.length) {
    let value = 0
    let scale = 1
    let count = 0
    for (;;) {
      if (i >= bytes.length) throw new ColumnError('uvarint: the byte string ends inside a number')
      const byte = bytes[i++]
      count++
      value += (byte % 128) * scale
      if (byte < 128) {
        if (byte === 0 && count > 1) throw new ColumnError('uvarint: not minimal (trailing 0x80 bytes)')
        break
      }
      if (count === MAX_VARINT_BYTES) throw new ColumnError(`uvarint: longer than ${MAX_VARINT_BYTES} bytes`)
      scale *= 128
    }
    if (value > MAX_SAFE) throw new ColumnError('uvarint: above 2^53 - 1')
    out.push(value)
  }
  return out
}

// svarints

/** Zigzag: n >= 0 becomes 2n, n < 0 becomes -2n - 1. The result has to stay within 2^53 - 1. */
export function zigzag(n: number): number {
  if (!Number.isSafeInteger(n)) {
    throw new ColumnError(`svarint: ${String(n)} is not an integer within 2^53 - 1`)
  }
  const z = n >= 0 ? n * 2 : -n * 2 - 1
  if (z > MAX_SAFE) throw new ColumnError(`svarint: ${String(n)} is too big to zigzag within 2^53 - 1`)
  return z
}

export function unzigzag(z: number): number {
  return z % 2 === 0 ? z / 2 : -(z + 1) / 2
}

/** Signed numbers as uvarints after zigzag. Each must be an integer from -2^52 to 2^52 - 1. */
export function encodeSvarints(values: Iterable<number>): Uint8Array {
  const out: number[] = []
  for (const value of values) pushUvarint(out, zigzag(value))
  return Uint8Array.from(out)
}

export function decodeSvarints(bytes: Uint8Array): number[] {
  return decodeUvarints(bytes).map(unzigzag)
}

// deltas

/** Svarints of each value minus the previous one; the first minus 0. */
export function encodeDeltas(values: number[]): Uint8Array {
  const out: number[] = []
  let previous = 0
  for (const value of values) {
    if (!Number.isSafeInteger(value)) {
      throw new ColumnError(`deltas: ${String(value)} is not an integer within 2^53 - 1`)
    }
    pushUvarint(out, zigzag(value - previous))
    previous = value
  }
  return Uint8Array.from(out)
}

export function decodeDeltas(bytes: Uint8Array): number[] {
  const out = decodeSvarints(bytes)
  let sum = 0
  for (let i = 0; i < out.length; i++) {
    sum += out[i]
    if (!Number.isSafeInteger(sum)) throw new ColumnError('deltas: a running value leaves the 2^53 - 1 range')
    out[i] = sum
  }
  return out
}

// bits

/** `ceil(n / 8)` bytes; row `i` is bit `i mod 8` (least significant first) of byte `i div 8`. Unused bits are 0. */
export function encodeBits(flags: boolean[]): Uint8Array {
  const out = new Uint8Array(Math.ceil(flags.length / 8))
  for (let i = 0; i < flags.length; i++) {
    if (flags[i]) out[Math.floor(i / 8)] += 2 ** (i % 8)
  }
  return out
}

/** The inverse of {@link encodeBits}. The byte string must be `ceil(n / 8)` long with its unused bits at 0. */
export function decodeBits(bytes: Uint8Array, n: number): boolean[] {
  if (!Number.isSafeInteger(n) || n < 0) throw new ColumnError(`bits: ${String(n)} is not a row count`)
  if (bytes.length !== Math.ceil(n / 8)) {
    throw new ColumnError(`bits: ${n} rows need ${Math.ceil(n / 8)} bytes, found ${bytes.length}`)
  }
  const out: boolean[] = new Array<boolean>(n)
  for (let i = 0; i < n; i++) {
    out[i] = Math.floor(bytes[Math.floor(i / 8)] / 2 ** (i % 8)) % 2 === 1
  }
  const unused = n % 8
  if (unused !== 0 && Math.floor(bytes[bytes.length - 1] / 2 ** unused) !== 0) {
    throw new ColumnError('bits: an unused bit is set')
  }
  return out
}

// texts

const utf8Encoder = new TextEncoder()
// `ignoreBOM: true` keeps a leading U+FEFF: text is kept as published. `fatal` rejects invalid UTF-8.
const utf8Decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true })

function hasLoneSurrogate(s: string): boolean {
  for (let i = 0; i < s.length; i++) {
    const unit = s.charCodeAt(i)
    if (unit >= 0xd800 && unit <= 0xdbff) {
      const next = s.charCodeAt(i + 1) // NaN at the end of the string
      if (next >= 0xdc00 && next <= 0xdfff) i++
      else return true
    } else if (unit >= 0xdc00 && unit <= 0xdfff) {
      return true
    }
  }
  return false
}

/** The strings joined in UTF-8, and the byte length of each. */
export function encodeTexts(strings: string[]): { utf8: Uint8Array; len: Uint8Array } {
  const chunks: Uint8Array[] = []
  const lengths: number[] = []
  let total = 0
  for (const s of strings) {
    // A lone surrogate has no UTF-8 form; TextEncoder would swap it for U+FFFD and change the text.
    if (hasLoneSurrogate(s)) throw new ColumnError('texts: a string has a lone surrogate, so it is not valid UTF-8')
    const chunk = utf8Encoder.encode(s)
    chunks.push(chunk)
    lengths.push(chunk.length)
    total += chunk.length
  }
  const utf8 = new Uint8Array(total)
  let offset = 0
  for (const chunk of chunks) {
    utf8.set(chunk, offset)
    offset += chunk.length
  }
  return { utf8, len: encodeUvarints(lengths) }
}

/** The inverse of {@link encodeTexts}. The lengths must add up to `utf8` and each string must be valid UTF-8. */
export function decodeTexts(t: { utf8: Uint8Array; len: Uint8Array }): string[] {
  const lengths = decodeUvarints(t.len)
  const out: string[] = []
  let offset = 0
  for (const length of lengths) {
    if (offset + length > t.utf8.length) throw new ColumnError('texts: the lengths run past the end of utf8')
    try {
      out.push(utf8Decoder.decode(t.utf8.subarray(offset, offset + length)))
    } catch {
      throw new ColumnError('texts: a string is not valid UTF-8')
    }
    offset += length
  }
  if (offset !== t.utf8.length) throw new ColumnError('texts: utf8 is longer than the lengths add up to')
  return out
}

// string tables

/** Compares by Unicode code point. JavaScript's `<` compares UTF-16 code units, which puts U+1D538 before U+FFFF. */
export function compareCodePoints(a: string, b: string): number {
  let i = 0
  while (i < a.length && i < b.length) {
    const ca = a.codePointAt(i)!
    const cb = b.codePointAt(i)!
    if (ca !== cb) return ca < cb ? -1 : 1
    i += ca > 0xffff ? 2 : 1 // equal code points take the same number of code units in both strings
  }
  if (i < a.length) return 1
  if (i < b.length) return -1
  return 0
}

/** A string table: most used first, ties by code point. `index` maps each string to its number in `list`. */
export function stringTable(uses: Iterable<string>): { list: string[]; index: Map<string, number> } {
  const counts = new Map<string, number>()
  for (const use of uses) counts.set(use, (counts.get(use) ?? 0) + 1)
  const list = [...counts.keys()].sort((x, y) => counts.get(y)! - counts.get(x)! || compareCodePoints(x, y))
  const index = new Map<string, number>()
  list.forEach((s, i) => index.set(s, i))
  return { list, index }
}
