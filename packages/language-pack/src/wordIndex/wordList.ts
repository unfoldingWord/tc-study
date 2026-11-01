/**
 * A sorted list of word numbers as short text: each number is written as its gap from the one before minus one (the
 * first from −1), in unsigned LEB128, and the bytes in base64 (standard alphabet, with padding). Consecutive words
 * are zero bytes; the empty list is `''`. Runs anywhere (browser, Worker, Bun): no `Buffer`.
 */

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const VALUE_OF = new Map([...ALPHABET].map((c, i) => [c, i]))

function toBase64(bytes: readonly number[]): string {
  let out = ''
  for (let i = 0; i < bytes.length; i += 3) {
    const n = (bytes[i] << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0)
    out += ALPHABET[(n >> 18) & 63] + ALPHABET[(n >> 12) & 63]
    out += i + 1 < bytes.length ? ALPHABET[(n >> 6) & 63] : '='
    out += i + 2 < bytes.length ? ALPHABET[n & 63] : '='
  }
  return out
}

function fromBase64(text: string): number[] {
  if (text.length % 4 !== 0) throw new Error(`Not base64: its length ${text.length} is not a multiple of 4`)
  const pad = text.endsWith('==') ? 2 : text.endsWith('=') ? 1 : 0
  const bytes: number[] = []
  for (let i = 0; i < text.length; i += 4) {
    const last = i + 4 === text.length
    let n = 0
    for (let j = 0; j < 4; j++) {
      const c = text[i + j]
      const value = last && j >= 4 - pad ? 0 : VALUE_OF.get(c)
      if (value === undefined) throw new Error(`Not base64: ${JSON.stringify(c)} at ${i + j}`)
      n = (n << 6) | value
    }
    bytes.push((n >> 16) & 255)
    if (!last || pad < 2) bytes.push((n >> 8) & 255)
    if (!last || pad < 1) bytes.push(n & 255)
  }
  return bytes
}

export function encodeWords(words: readonly number[]): string {
  const bytes: number[] = []
  let previous = -1
  for (const word of words) {
    if (!Number.isSafeInteger(word) || word < 0) throw new Error(`A word number must be a non-negative integer, not ${word}`)
    if (word <= previous) throw new Error(`Word numbers must be sorted and distinct: ${word} after ${previous}`)
    // Division, not shifts: gaps can pass 32 bits.
    let gap = word - previous - 1
    while (gap >= 128) {
      bytes.push((gap % 128) | 128)
      gap = Math.floor(gap / 128)
    }
    bytes.push(gap)
    previous = word
  }
  return toBase64(bytes)
}

export function decodeWords(text: string): number[] {
  const words: number[] = []
  let previous = -1
  let gap = 0
  let scale = 1
  let inside = false
  for (const byte of fromBase64(text)) {
    gap += (byte & 127) * scale
    if (byte & 128) {
      scale *= 128
      inside = true
      continue
    }
    const word = previous + gap + 1
    if (!Number.isSafeInteger(word)) throw new Error(`A word number in the list is past ${Number.MAX_SAFE_INTEGER}`)
    words.push(word)
    previous = word
    gap = 0
    scale = 1
    inside = false
  }
  if (inside) throw new Error('The word list ends inside a number')
  return words
}
