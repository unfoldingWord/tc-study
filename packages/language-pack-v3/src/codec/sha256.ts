/**
 * SHA-256 (FIPS 180-4) in plain TypeScript, synchronous, with no Node module and no Web Crypto.
 *
 * The container hashes bodies with Web Crypto (`container.ts`), which is asynchronous. The section registry needs a hash
 * inside synchronous code (one for every word trigram of every section), so this one is separate. It is the same
 * function: the tests check it against the FIPS vectors and against `crypto.subtle.digest`.
 */

const K = Int32Array.from([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01,
  0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc,
  0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147,
  0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08,
  0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208,
  0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
])

const INITIAL = Int32Array.from([0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19])

// Scratch space, reused: the function is synchronous, so two calls never overlap.
const W = new Int32Array(64)
const H = new Int32Array(8)

/** Mixes the 64 bytes of `data` at `offset` into the state `H`. */
function compress(data: Uint8Array, offset: number): void {
  for (let i = 0; i < 16; i++) {
    const j = offset + i * 4
    W[i] = (data[j] << 24) | (data[j + 1] << 16) | (data[j + 2] << 8) | data[j + 3]
  }
  for (let i = 16; i < 64; i++) {
    const a = W[i - 15]
    const b = W[i - 2]
    const s0 = ((a >>> 7) | (a << 25)) ^ ((a >>> 18) | (a << 14)) ^ (a >>> 3)
    const s1 = ((b >>> 17) | (b << 15)) ^ ((b >>> 19) | (b << 13)) ^ (b >>> 10)
    W[i] = (W[i - 16] + s0 + W[i - 7] + s1) | 0
  }
  let a = H[0]
  let b = H[1]
  let c = H[2]
  let d = H[3]
  let e = H[4]
  let f = H[5]
  let g = H[6]
  let h = H[7]
  for (let i = 0; i < 64; i++) {
    const t1 = (h + (((e >>> 6) | (e << 26)) ^ ((e >>> 11) | (e << 21)) ^ ((e >>> 25) | (e << 7))) + ((e & f) ^ (~e & g)) + K[i] + W[i]) | 0
    const t2 = ((((a >>> 2) | (a << 30)) ^ ((a >>> 13) | (a << 19)) ^ ((a >>> 22) | (a << 10))) + ((a & b) ^ (a & c) ^ (b & c))) | 0
    h = g
    g = f
    f = e
    e = (d + t1) | 0
    d = c
    c = b
    b = a
    a = (t1 + t2) | 0
  }
  H[0] = (H[0] + a) | 0
  H[1] = (H[1] + b) | 0
  H[2] = (H[2] + c) | 0
  H[3] = (H[3] + d) | 0
  H[4] = (H[4] + e) | 0
  H[5] = (H[5] + f) | 0
  H[6] = (H[6] + g) | 0
  H[7] = (H[7] + h) | 0
}

/** The SHA-256 of `bytes`: 32 bytes. */
export function sha256(bytes: Uint8Array): Uint8Array {
  H.set(INITIAL)
  const whole = bytes.length - (bytes.length % 64)
  for (let offset = 0; offset < whole; offset += 64) compress(bytes, offset)

  // The rest, then 0x80, zeros, and the length in bits as 64 bits big-endian.
  const rest = bytes.length - whole
  const tail = new Uint8Array(rest < 56 ? 64 : 128)
  tail.set(bytes.subarray(whole))
  tail[rest] = 0x80
  const bits = bytes.length * 8
  const view = new DataView(tail.buffer)
  view.setUint32(tail.length - 8, Math.floor(bits / 4_294_967_296))
  view.setUint32(tail.length - 4, bits % 4_294_967_296)
  compress(tail, 0)
  if (tail.length === 128) compress(tail, 64)

  const out = new Uint8Array(32)
  const outView = new DataView(out.buffer)
  for (let i = 0; i < 8; i++) outView.setInt32(i * 4, H[i])
  return out
}

const HEX = '0123456789abcdef'

/** Lowercase hex of bytes. */
export function toHex(bytes: Uint8Array): string {
  let out = ''
  for (const byte of bytes) out += HEX[byte >> 4] + HEX[byte & 15]
  return out
}

const ENCODER = new TextEncoder()

/** The SHA-256 of the UTF-8 bytes of `text`, in lowercase hex. */
export function sha256Hex(text: string): string {
  return toHex(sha256(ENCODER.encode(text)))
}

/** A message of up to 55 bytes is one block with its padding: the block is built here, without allocating. */
const BLOCK = new Uint8Array(64)
const BLOCK_VIEW = new DataView(BLOCK.buffer)
const MESSAGE = BLOCK.subarray(0, 55)

/**
 * The first 32 bits of the SHA-256 of the UTF-8 bytes of `text`, big-endian, as an unsigned number. The builders call it
 * for every word trigram of every section, so a text that is up to 55 bytes in UTF-8 (one block) takes a path with no
 * allocation.
 */
export function sha256Prefix32(text: string): number {
  BLOCK.fill(0)
  const { read, written } = ENCODER.encodeInto(text, MESSAGE)
  if (read === text.length) {
    BLOCK[written] = 0x80
    BLOCK_VIEW.setUint32(60, written * 8)
    H.set(INITIAL)
    compress(BLOCK, 0)
    return H[0] >>> 0
  }
  const digest = sha256(ENCODER.encode(text))
  return digest[0] * 16_777_216 + (digest[1] << 16) + (digest[2] << 8) + digest[3]
}
