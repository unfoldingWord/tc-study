import { readFileSync } from 'node:fs'
import { keyId, publicKeyOf } from '@bt-synergy/language-pack-v3'

/**
 * The signing key of format 3 catalogs: a PKCS#8 PEM file of an Ed25519 key. It is read here and kept in memory only; no message of
 * this module (or of the commands that use it) carries any of its content, only the path of the file.
 */
export type SigningKey = { pkcs8: Uint8Array; publicKey: Uint8Array; keyId: string }

const PEM = /^-----BEGIN PRIVATE KEY-----([A-Za-z0-9+/=\s]+)-----END PRIVATE KEY-----\s*$/

export async function readSigningKey(file: string): Promise<SigningKey> {
  let text: string
  try {
    text = readFileSync(file, 'utf8')
  } catch {
    throw new Error(`Cannot read the signing key file ${file}`)
  }
  const match = PEM.exec(text.trim())
  if (match === null) throw new Error(`${file} is not a PKCS#8 PEM private key (BEGIN PRIVATE KEY)`)
  try {
    const pkcs8 = new Uint8Array(Buffer.from(match[1].replace(/\s+/g, ''), 'base64'))
    const publicKey = await publicKeyOf(pkcs8)
    return { pkcs8, publicKey, keyId: keyId(publicKey) }
  } catch {
    throw new Error(`${file} is not an Ed25519 private key in PKCS#8`)
  }
}
