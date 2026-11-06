/**
 * The Ed25519 primitive for the signature rules of `sign.ts` in `language-pack-v3`: WebCrypto when the runtime has Ed25519,
 * else the pure-JS `@noble/curves` (strict, RFC 8032: `zip215: false`). Only the primitive is chosen here; the canonical-point and
 * small-order rules run in `checkSignatures` before either one, so they are the same for both.
 */
import type { Ed25519Verify } from '@bt-synergy/language-pack-v3'
import { ed25519 } from '@noble/curves/ed25519.js'
import { sha512 } from '@noble/hashes/sha2.js'

const unhex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))

/** RFC 8032 section 7.1, test 1 (empty message): used to find out whether WebCrypto really verifies Ed25519. */
const PROBE_KEY = unhex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
const PROBE_SIG = unhex(
  'e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b',
)

const copy = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes)

export const subtlePrimitive: Ed25519Verify = async (publicKey, signature, message) => {
  const imported = await crypto.subtle.importKey('raw', copy(publicKey), { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', imported, copy(signature), copy(message))
}

const Point = ed25519.Point
const L = Point.Fn.ORDER

const fromLE = (bytes: Uint8Array): bigint => {
  let n = 0n
  for (let i = bytes.length - 1; i >= 0; i--) n = (n << 8n) | BigInt(bytes[i])
  return n
}
const times = (point: InstanceType<typeof Point>, n: bigint) => (n === 0n ? Point.ZERO : point.multiply(n))

/**
 * The cofactorless equation of RFC 8032 5.1.7, `[S]B = R + [k]A`, which `catalog.md` requires. noble's own `verify` clears the cofactor
 * (it also accepts a signature off by a point of order 2, 4 or 8), so the equation is checked here with noble's point arithmetic.
 * Strict: a non-canonical point or `S >= L` is rejected (the canonical and small-order rules of `sign.ts` have already run).
 */
export const noblePrimitive: Ed25519Verify = async (publicKey, signature, message) => {
  if (publicKey.length !== 32 || signature.length !== 64) return false
  const rBytes = signature.subarray(0, 32)
  const s = fromLE(signature.subarray(32))
  if (s >= L) return false
  const A = Point.fromBytes(publicKey, false)
  const R = Point.fromBytes(rBytes, false)
  const input = new Uint8Array(64 + message.length)
  input.set(rBytes, 0)
  input.set(publicKey, 32)
  input.set(message, 64)
  const k = fromLE(sha512(input)) % L
  return times(Point.BASE, s).equals(R.add(times(A, k)))
}

let chosen: Promise<Ed25519Verify> | undefined

/** The primitive of this process, chosen once. */
export function ed25519Verify(): Promise<Ed25519Verify> {
  chosen ??= (async () => {
    try {
      if (await subtlePrimitive(PROBE_KEY, PROBE_SIG, new Uint8Array(0))) return subtlePrimitive
      return noblePrimitive
    } catch {
      return noblePrimitive
    }
  })()
  return chosen
}
