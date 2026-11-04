import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

/** A fresh Ed25519 key for a test: its PKCS#8 PEM file (in a new temp folder), the raw public key and its hex. Never a real key. */
export function testKey(): { pem: string; publicKey: Uint8Array; publicHex: string; dir: string } {
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const dir = mkdtempSync(join(tmpdir(), 'sign-key-'))
  const pem = join(dir, 'sign.pem')
  writeFileSync(pem, privateKey.export({ type: 'pkcs8', format: 'pem' }) as string)
  const raw = new Uint8Array(Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url'))
  return { pem, publicKey: raw, publicHex: Buffer.from(raw).toString('hex'), dir }
}
