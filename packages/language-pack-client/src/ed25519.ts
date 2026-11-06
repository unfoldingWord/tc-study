/**
 * The Ed25519 primitive for the signature rules of `sign.ts` in `language-pack-v3`: WebCrypto when the runtime has Ed25519,
 * else the pure-JS `@noble/curves` (strict, RFC 8032: `zip215: false`). Only the primitive is chosen here; the canonical-point and
 * small-order rules run in `checkSignatures` before either one, so they are the same for both.
 */
import type { Ed25519Verify } from '@bt-synergy/language-pack-v3'
import { ed25519 } from '@noble/curves/ed25519.js'

/** A fixed valid public key (the RFC 8032 test 1 key), used only to find out whether WebCrypto knows Ed25519. */
const PROBE_KEY = Uint8Array.from(
  'd75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a'.match(/../g)!,
  (pair) => parseInt(pair, 16),
)

const copy = (bytes: Uint8Array): Uint8Array<ArrayBuffer> => new Uint8Array(bytes)

export const subtlePrimitive: Ed25519Verify = async (publicKey, signature, message) => {
  const imported = await crypto.subtle.importKey('raw', copy(publicKey), { name: 'Ed25519' }, false, ['verify'])
  return crypto.subtle.verify('Ed25519', imported, copy(signature), copy(message))
}

export const noblePrimitive: Ed25519Verify = async (publicKey, signature, message) =>
  ed25519.verify(signature, message, publicKey, { zip215: false })

let chosen: Promise<Ed25519Verify> | undefined

/** The primitive of this process, chosen once. */
export function ed25519Verify(): Promise<Ed25519Verify> {
  chosen ??= (async () => {
    try {
      await crypto.subtle.importKey('raw', copy(PROBE_KEY), { name: 'Ed25519' }, false, ['verify'])
      return subtlePrimitive
    } catch {
      return noblePrimitive
    }
  })()
  return chosen
}
