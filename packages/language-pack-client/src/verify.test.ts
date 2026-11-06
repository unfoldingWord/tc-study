import { beforeAll, describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CATALOG_TABLES, readHeader, readSegment, readTransfer, writeSegment } from '@bt-synergy/language-pack-v3'
import { newKey } from '../test/keys'
import { sha512 } from '@noble/hashes/sha2.js'
import { ed25519 } from '@noble/curves/ed25519.js'
import { ed25519Verify, noblePrimitive, subtlePrimitive } from './ed25519'
import { ClientError } from './errors'
import { checkRevision, type InstalledCatalog, verifyCatalogFile } from './verify'

const SPEC = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests')
const fileOf = (path: string): Uint8Array => new Uint8Array(readFileSync(join(SPEC, path)))
const published = fileOf('revisiones-mixtas/catalog.seg')
const unhex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))

async function codeOf(p: Promise<unknown> | (() => unknown)): Promise<string> {
  try {
    await (typeof p === 'function' ? p() : p)
  } catch (e) {
    return (e as { code?: string }).code ?? String(e)
  }
  return 'no error'
}

async function withSig(file: Uint8Array, sig: unknown[]): Promise<Uint8Array> {
  const { seg } = await readSegment(file, { known: CATALOG_TABLES })
  return (await writeSegment(seg, { sig: sig as never })).bytes
}

test('the process primitive is WebCrypto here', async () => {
  expect(await ed25519Verify()).toBe(subtlePrimitive)
  expect(await ed25519Verify()).toBe(await ed25519Verify())
})

describe.each([
  ['WebCrypto', subtlePrimitive],
  ['noble', noblePrimitive],
])('verifyCatalogFile with %s', (_name, verify) => {
  const from = 'network' as const

  test('a trusted key verifies, with signedBy', async () => {
    const k = await newKey()
    const v = await verifyCatalogFile(await k.sign(published), { trustedKeys: k.trusted }, { from, verify })
    expect(v.signedBy).toBe(k.keyId)
    expect(v.origin).toBe('published')
  })

  test('only an untrusted key is E_SIGNATURE', async () => {
    const k = await newKey()
    const other = await newKey()
    expect(await codeOf(verifyCatalogFile(await k.sign(published), { trustedKeys: other.trusted }, { from, verify }))).toBe('E_SIGNATURE')
  })

  test('a flipped signature byte is E_SIGNATURE', async () => {
    const k = await newKey()
    const sig = structuredClone(readHeader(await k.sign(published)).header.sig) as unknown as { s: Uint8Array }[]
    sig[0].s[10] ^= 1
    expect(await codeOf(verifyCatalogFile(await withSig(published, sig), { trustedKeys: k.trusted }, { from, verify }))).toBe('E_SIGNATURE')
  })

  test('an unknown signature beside a valid trusted one is ok', async () => {
    const a = await newKey()
    const b = await newKey()
    const v = await verifyCatalogFile(await b.sign(await a.sign(published)), { trustedKeys: b.trusted }, { from, verify })
    expect(v.signedBy).toBe(b.keyId)
  })

  test('unsigned: E_SIGNATURE with keys, ok without', async () => {
    const k = await newKey()
    expect(await codeOf(verifyCatalogFile(published, { trustedKeys: k.trusted }, { from, verify }))).toBe('E_SIGNATURE')
    expect((await verifyCatalogFile(published, {}, { from, verify })).signedBy).toBeUndefined()
  })

  test('an empty map of keys rejects published catalogs, signed or not', async () => {
    const k = await newKey()
    expect(await codeOf(verifyCatalogFile(await k.sign(published), { trustedKeys: {} }, { from, verify }))).toBe('E_SIGNATURE')
    expect(await codeOf(verifyCatalogFile(published, { trustedKeys: {} }, { from, verify }))).toBe('E_SIGNATURE')
  })

  test('a body that changed (another id than expectedId) is E_ID', async () => {
    const { id, seg } = await readSegment(published, { known: CATALOG_TABLES })
    const about = { ...(seg.t.about as Record<string, unknown>), revision: 999 }
    const changed = (await writeSegment({ h: seg.h, t: { ...seg.t, about } as never })).bytes
    expect(await codeOf(verifyCatalogFile(changed, {}, { from, verify, expectedId: id }))).toBe('E_ID')
  })

  test('a point of small order is E_SIGNATURE (the rule runs before the primitive)', async () => {
    const k = await newKey()
    const sig = structuredClone(readHeader(await k.sign(published)).header.sig) as unknown as { s: Uint8Array }[]
    sig[0].s.set(new Uint8Array(32), 0)
    expect(await codeOf(verifyCatalogFile(await withSig(published, sig), { trustedKeys: k.trusted }, { from, verify }))).toBe('E_SIGNATURE')
  })
})

describe('a local catalog', () => {
  const dir = 'transferencia-catalogo-local'
  const trustedKeys = Object.fromEntries(
    Object.entries(JSON.parse(readFileSync(join(SPEC, dir, 'local.keys.json'), 'utf8')) as Record<string, string>).map(([k, v]) => [k, unhex(v)]),
  )
  const catalogBytes = async (): Promise<Uint8Array> => (await readTransfer(fileOf(`${dir}/local.tcpack`), { known: {} })).entries[0].bytes!

  test('from a transfer or the network is E_SIGNATURE, from the bridge or the store ok', async () => {
    const bytes = await catalogBytes()
    expect(await codeOf(verifyCatalogFile(bytes, { trustedKeys }, { from: 'transfer' }))).toBe('E_SIGNATURE')
    expect(await codeOf(verifyCatalogFile(bytes, { trustedKeys }, { from: 'network' }))).toBe('E_SIGNATURE')
    expect((await verifyCatalogFile(bytes, { trustedKeys }, { from: 'bridge' })).origin).toBe('local')
    expect((await verifyCatalogFile(bytes, { trustedKeys }, { from: 'store' })).origin).toBe('local')
    expect((await verifyCatalogFile(bytes, {}, { from: 'transfer' })).origin).toBe('local')
  })

  test('an empty map of keys is still keys: a local catalog from a transfer is E_SIGNATURE', async () => {
    expect(await codeOf(verifyCatalogFile(await catalogBytes(), { trustedKeys: {} }, { from: 'transfer' }))).toBe('E_SIGNATURE')
  })
})

describe('checkRevision', () => {
  const A = 'a'.repeat(64)
  const B = 'b'.repeat(64)
  const installed = (revision: number, id = A): InstalledCatalog => ({ publisher: 'pub', name: 'es-419', revision, id })
  const incoming = async (revision: number, id = B, publisher = 'pub') => ({
    ...(await verifyCatalogFile(published, {}, { from: 'store' })),
    revision,
    id,
    publisher,
    name: 'es-419',
  })

  test('12 over 9 is newer', async () => {
    expect(checkRevision(installed(9), await incoming(12))).toBe('newer')
  })
  test('9 over 12 is E_DOWNGRADE, ok when confirmed', async () => {
    expect(await codeOf(() => checkRevision(installed(12), incoming9))).toBe('E_DOWNGRADE')
    expect(checkRevision(installed(12), incoming9, true)).toBe('newer')
  })
  test('other publisher or nothing installed is first', async () => {
    expect(checkRevision(installed(12), await incoming(9, B, 'other'))).toBe('first')
    expect(checkRevision(undefined, await incoming(9))).toBe('first')
  })
  test('same revision, other id is E_DOWNGRADE even confirmed', async () => {
    expect(await codeOf(() => checkRevision(installed(12), incoming12, true))).toBe('E_DOWNGRADE')
  })
  test('same id is same', async () => {
    expect(checkRevision(installed(12, B), incoming12)).toBe('same')
  })
  test('errors are ClientError', () => {
    expect(() => checkRevision(installed(12), incoming9)).toThrow(ClientError)
  })

  let incoming9: Awaited<ReturnType<typeof incoming>>
  let incoming12: Awaited<ReturnType<typeof incoming>>
  beforeAll(async () => {
    incoming9 = await incoming(9)
    incoming12 = await incoming(12)
  })
})

describe('the cofactorless equation', () => {
  // A = B (private scalar 1), R = B + T with T the point of order 2, S = 1 + k: [S]B - R - [k]A = -T, not 0.
  const P = ed25519.Point
  const L = P.Fn.ORDER
  const le = (bytes: Uint8Array): bigint => bytes.reduceRight((n, b) => (n << 8n) | BigInt(b), 0n)
  const toLE32 = (n: bigint): Uint8Array => Uint8Array.from({ length: 32 }, (_, i) => Number((n >> BigInt(8 * i)) & 0xffn))
  const message = new TextEncoder().encode('m')

  test('a signature off by a point of order 2 is rejected by both primitives', async () => {
    const order2 = P.fromAffine({ x: 0n, y: 2n ** 255n - 20n })
    const A = P.BASE.toBytes()
    const R = P.BASE.add(order2).toBytes()
    const input = new Uint8Array([...R, ...A, ...message])
    const k = le(sha512(input)) % L
    const sig = new Uint8Array([...R, ...toLE32((1n + k) % L)])
    // noble's own verify (cofactored) accepts this signature: that is why noblePrimitive checks the equation itself.
    expect(ed25519.verify(sig, message, A, { zip215: false })).toBe(true)
    expect(await noblePrimitive(A, sig, message)).toBe(false)
    expect(await subtlePrimitive(A, sig, message)).toBe(false)
  })

  test('a valid RFC 8032 signature (test 1) is accepted by both', async () => {
    const key = unhex('d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a')
    const sig = unhex('e5564300c360ac729086e2cc806e828a84877f1eb8e5d974d873e065224901555fb8821590a33bacc61e39701cf9b46bd25bf5f0595bbe24655141438e7a100b')
    expect(await noblePrimitive(key, sig, new Uint8Array(0))).toBe(true)
    expect(await subtlePrimitive(key, sig, new Uint8Array(0))).toBe(true)
  })
})
