/** Test helper: a key pair made now with WebCrypto; nothing is written anywhere. */
import { keyId, publicKeyOf, signCatalog } from '@bt-synergy/language-pack-v3'

export type TestKey = {
  publicKey: Uint8Array
  keyId: string
  trusted: Record<string, Uint8Array>
  sign(bytes: Uint8Array): Promise<Uint8Array>
}

export async function newKey(): Promise<TestKey> {
  const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const publicKey = await publicKeyOf(pkcs8)
  const id = keyId(publicKey)
  return { publicKey, keyId: id, trusted: { [id]: publicKey }, sign: (bytes) => signCatalog(bytes, pkcs8) }
}
