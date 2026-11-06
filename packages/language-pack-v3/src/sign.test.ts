import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readHeader, readSegment, writeSegment } from './codec/container'
import { FormatError } from './codec/errors'
import { BOOK_TABLES } from './read/book'
import { CATALOG_TABLES } from './read/catalog'
import { canonicalJson, readerOutput } from './read/output'
import { buildCatalog } from './build/catalog'
import { writeTransfer } from './transfer'
import { keyId, publicKeyOf, signCatalog, verifyCatalog } from './sign'

const CASES = join(import.meta.dir, '..', 'spec', 'tests')
const fileOf = (name: string): Uint8Array => new Uint8Array(readFileSync(join(CASES, name)))
const published = fileOf('revisiones-mixtas/catalog.seg')
const local = fileOf('paquete-viejo/catalog.seg')

type Pair = { privateKey: Uint8Array; publicKey: Uint8Array; id: string }
type Sig = { key: unknown; alg: unknown; s: Uint8Array }

/** A key made now: nothing secret is kept anywhere. */
async function newKey(): Promise<Pair> {
  const { privateKey } = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
  const pkcs8 = new Uint8Array(await crypto.subtle.exportKey('pkcs8', privateKey))
  const publicKey = await publicKeyOf(pkcs8)
  return { privateKey: pkcs8, publicKey, id: keyId(publicKey) }
}
const trust = (...pairs: Pair[]): Record<string, Uint8Array> => Object.fromEntries(pairs.map((p) => [p.id, p.publicKey]))

async function codeOf(promise: Promise<unknown>): Promise<string> {
  try {
    await promise
  } catch (error) {
    if (error instanceof FormatError) return error.code
    throw error
  }
  return 'no error'
}

const sigsOf = (file: Uint8Array): Sig[] => structuredClone(readHeader(file).header.sig) as unknown as Sig[]

/** `file` with its signature list replaced by `sig`, the header written again by the writer (the body is the file's). */
async function withSig(file: Uint8Array, sig: Sig[]): Promise<Uint8Array> {
  const { seg } = await readSegment(file, { known: CATALOG_TABLES })
  return (await writeSegment(seg, { sig: sig as never })).bytes
}

describe('key id', () => {
  test('is the first 16 hex digits of the sha256 of the public key', () => {
    // sha256 of 32 zero bytes starts 66687aadf862bd776c8fc18b8e9f8e20...
    expect(keyId(new Uint8Array(32))).toBe('66687aadf862bd77')
  })
})

describe('signing a catalog', () => {
  test('sign then verify', async () => {
    const k = await newKey()
    const signed = await signCatalog(published, k.privateKey)
    expect(await verifyCatalog(signed, trust(k))).toEqual({ key: k.id, valid: true })
  })

  test('the id is unchanged by signing (the body is the same; H and the file are not)', async () => {
    const k = await newKey()
    const signed = await signCatalog(published, k.privateKey)
    const before = await readSegment(published, { known: CATALOG_TABLES })
    const after = await readSegment(signed, { known: CATALOG_TABLES })
    expect(after.id).toBe(before.id)
    expect(after.seg).toEqual(before.seg)
    expect(signed.length).toBeGreaterThan(published.length)
    expect(readHeader(signed).header.id).toEqual(readHeader(published).header.id)
    expect(readHeader(signed).headerEnd).toBeGreaterThan(readHeader(published).headerEnd)
  })

  test('signing twice with two keys keeps both, and either verifies', async () => {
    const a = await newKey()
    const b = await newKey()
    const signed = await signCatalog(await signCatalog(published, a.privateKey), b.privateKey)
    expect(sigsOf(signed).length).toBe(2)
    expect((await verifyCatalog(signed, trust(a))).key).toBe(a.id)
    expect((await verifyCatalog(signed, trust(b))).key).toBe(b.id)
  })

  test('a local catalog is not signed', async () => {
    const k = await newKey()
    await expect(signCatalog(local, k.privateKey)).rejects.toThrow('local')
  })

  test('a flipped bit in s is E_SIGNATURE', async () => {
    const k = await newKey()
    const sig = sigsOf(await signCatalog(published, k.privateKey))
    sig[0].s[10] ^= 1
    const bad = await withSig(published, sig)
    expect(await codeOf(verifyCatalog(bad, trust(k)))).toBe('E_SIGNATURE')
    expect(await readerOutput(bad, { trustedKeys: trust(k) })).toEqual({ error: 'E_SIGNATURE' })
  })

  test('unknown key is E_SIGNATURE', async () => {
    const k = await newKey()
    const other = await newKey()
    const signed = await signCatalog(published, k.privateKey)
    expect(await codeOf(verifyCatalog(signed, trust(other)))).toBe('E_SIGNATURE')
    expect(await codeOf(verifyCatalog(signed, {}))).toBe('E_SIGNATURE')
  })

  test('a key listed under an id that is not its own is not trusted', async () => {
    const k = await newKey()
    const other = await newKey()
    const signed = await signCatalog(published, k.privateKey)
    expect(await codeOf(verifyCatalog(signed, { [k.id]: other.publicKey }))).toBe('E_SIGNATURE')
  })

  test('the signature of another catalog does not verify', async () => {
    const k = await newKey()
    const sig = sigsOf(await signCatalog(published, k.privateKey))
    const { seg } = await readSegment(published, { known: CATALOG_TABLES })
    const about = { ...(seg.t.about as Record<string, unknown>), revision: 999 }
    const changed = (await writeSegment({ h: seg.h, t: { ...seg.t, about } as never }, { sig: sig as never })).bytes
    expect(await codeOf(verifyCatalog(changed, trust(k)))).toBe('E_SIGNATURE')
  })

  test('an unknown key beside a verifying one is ignored; a bad signature of a trusted key is not', async () => {
    const a = await newKey()
    const b = await newKey()
    const signed = await signCatalog(await signCatalog(published, a.privateKey), b.privateKey)
    expect((await verifyCatalog(signed, trust(b))).key).toBe(b.id)
    const sig = sigsOf(signed)
    sig[0].s[0] ^= 1
    expect(await codeOf(verifyCatalog(await withSig(published, sig), trust(a, b)))).toBe('E_SIGNATURE')
  })

  test('a malformed sig is E_SIGNATURE', async () => {
    const k = await newKey()
    const [element] = sigsOf(await signCatalog(published, k.privateKey))
    const lists = [[{ ...element, s: new Uint8Array(63) }], [{ ...element, alg: 'rsa' }], [{ ...element, key: 5 }], [{ ...element, s: 'text' as unknown as Uint8Array }]]
    for (const sig of lists) expect(await codeOf(verifyCatalog(await withSig(published, sig), trust(k)))).toBe('E_SIGNATURE')
  })
})

describe('the reader', () => {
  test('published and unsigned with keys is E_SIGNATURE', async () => {
    const k = await newKey()
    expect(await readerOutput(published, { trustedKeys: trust(k) })).toEqual({ error: 'E_SIGNATURE' })
  })

  test('local and unsigned with keys is ok, and has no sig in its output', async () => {
    const k = await newKey()
    const out = (await readerOutput(local, { trustedKeys: trust(k) })) as Record<string, unknown>
    expect(out.error).toBeUndefined()
    expect(out.sig).toBeUndefined()
    expect(canonicalJson(out)).toBe(canonicalJson(await readerOutput(local)))
  })

  test('no keys: sig is ignored and the output is unchanged', async () => {
    const k = await newKey()
    const signed = await signCatalog(published, k.privateKey)
    expect(canonicalJson(await readerOutput(signed))).toBe(canonicalJson(await readerOutput(published)))
    expect(canonicalJson(await readerOutput(signed, {}))).toBe(canonicalJson(await readerOutput(published)))
  })

  test('with keys, a verified catalog gains sig and nothing else', async () => {
    const k = await newKey()
    const signed = await signCatalog(published, k.privateKey)
    const { sig, ...rest } = (await readerOutput(signed, { trustedKeys: trust(k) })) as Record<string, unknown>
    expect(sig).toEqual({ key: k.id, valid: true })
    expect(canonicalJson(rest)).toBe(canonicalJson(await readerOutput(published)))
  })

  test('an earlier error wins over E_SIGNATURE', async () => {
    const k = await newKey()
    expect(await readerOutput(published.slice(0, published.length - 5), { trustedKeys: trust(k) })).toEqual({ error: 'E_TRUNCATED' })
  })

  test('sig on a non-catalog segment is ignored, with keys or not', async () => {
    const k = await newKey()
    const book = fileOf('tito-es419/book.seg')
    const { seg } = await readSegment(book, { known: BOOK_TABLES })
    const withBadSig = (await writeSegment(seg, { sig: [{ key: k.id, alg: 'ed25519', s: new Uint8Array(64) }] })).bytes
    const plain = canonicalJson(await readerOutput(book))
    expect(canonicalJson(await readerOutput(withBadSig))).toBe(plain)
    expect(canonicalJson(await readerOutput(withBadSig, { trustedKeys: trust(k) }))).toBe(plain)
  })
})

describe('encodings and precedence the spec fixes', () => {
  const unhex = (text: string): Uint8Array => Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
  const withKey = async (publicKey: Uint8Array, s: Uint8Array): Promise<Uint8Array> =>
    withSig(published, [{ key: keyId(publicKey), alg: 'ed25519', s }])
  const sig01 = unhex('01' + '00'.repeat(63))

  test('a public key with x = 0 and the sign bit set is E_SIGNATURE', async () => {
    const key = unhex('01' + '00'.repeat(30) + '80')
    const file = await withKey(key, sig01)
    expect(await codeOf(verifyCatalog(file, { [keyId(key)]: key }))).toBe('E_SIGNATURE')
  })

  test('a public key with y >= p is E_SIGNATURE', async () => {
    const key = unhex('ee' + 'ff'.repeat(30) + '7f')
    const file = await withKey(key, sig01)
    expect(await codeOf(verifyCatalog(file, { [keyId(key)]: key }))).toBe('E_SIGNATURE')
  })

  test('a non-canonical R is E_SIGNATURE', async () => {
    const k = await newKey()
    const s = sigsOf(await signCatalog(published, k.privateKey))[0].s
    s.set(unhex('01' + '00'.repeat(30) + '80'), 0)
    expect(await codeOf(verifyCatalog(await withSig(published, [{ key: k.id, alg: 'ed25519', s }]), trust(k)))).toBe('E_SIGNATURE')
  })

  test('S >= L is E_SIGNATURE (the same signature to the group, S + L)', async () => {
    const k = await newKey()
    const s = sigsOf(await signCatalog(published, k.privateKey))[0].s
    const L = 2n ** 252n + 27742317777372353535851937790883648493n
    let value = 0n
    for (let i = 63; i >= 32; i--) value = (value << 8n) | BigInt(s[i])
    value += L
    expect(value < 2n ** 256n).toBe(true)
    for (let i = 32; i < 64; i++) {
      s[i] = Number(value & 0xffn)
      value >>= 8n
    }
    expect(await codeOf(verifyCatalog(await withSig(published, [{ key: k.id, alg: 'ed25519', s }]), trust(k)))).toBe('E_SIGNATURE')
  })

  test('a public key or an R of small order is E_SIGNATURE, whatever the runtime does', async () => {
    // A = R = identity and S = 0 satisfies [S]B = R + [k]A for every message; Bun accepts it, WebCrypto of other runtimes does not.
    const identity = unhex('01' + '00'.repeat(31))
    const file = await withKey(identity, unhex('01' + '00'.repeat(31) + '00'.repeat(32)))
    expect(await codeOf(verifyCatalog(file, { [keyId(identity)]: identity }))).toBe('E_SIGNATURE')
    // an honest key with R of order 4
    const k = await newKey()
    const s = sigsOf(await signCatalog(published, k.privateKey))[0].s
    s.set(unhex('00'.repeat(32)), 0)
    expect(await codeOf(verifyCatalog(await withSig(published, [{ key: k.id, alg: 'ed25519', s }]), trust(k)))).toBe('E_SIGNATURE')
  })

  /** A published catalog whose `about.revision` is text (not valid), written by the writer so the hashes are right. */
  const badBody = async (): Promise<Uint8Array> => {
    const { seg } = await readSegment(published, { known: CATALOG_TABLES })
    const about = { ...(seg.t.about as Record<string, unknown>), revision: 'bad' }
    return (await writeSegment({ h: seg.h, t: { ...seg.t, about } as never }, { sig: [{ key: '0123456789abcdef', alg: 'ed25519', s: new Uint8Array(64) }] })).bytes
  }

  test('verifyCatalog: an invalid body is E_BODY, before the signature', async () => {
    const k = await newKey()
    expect(await codeOf(verifyCatalog(await badBody(), trust(k)))).toBe('E_BODY')
  })

  test('a transfer with an unsigned catalog and then an invalid one is E_BODY, not E_SIGNATURE', async () => {
    const k = await newKey()
    const about = { format: '3.0', catalog: 'es-419', publisher: 'unfoldingWord', origin: 'published', revision: 4, built: '2026-11-01T10:00:00Z', builder: 'test' }
    const first = await buildCatalog({ about: about as never, resources: [], segments: [], needs: () => [] })
    const second = await buildCatalog({ about: { ...about, catalog: 'common' } as never, resources: [], segments: [], needs: () => [] })
    const { seg } = await readSegment(second.bytes, { known: CATALOG_TABLES })
    const badSeg = { h: seg.h, t: { ...seg.t, about: { ...(seg.t.about as object), revision: 'bad' } } as never }
    const written = await writeSegment(badSeg)
    const bad = { ...second, seg: badSeg, bytes: written.bytes, id: written.id }
    const bytes = writeTransfer({ mode: 'full', catalogs: [first, bad], entries: [], made: '2026-11-01T10:00:00Z', by: 'test' })
    expect(await readerOutput(bytes, { trustedKeys: trust(k) })).toEqual({ error: 'E_BODY' })
  })
})

describe('a local catalog in a transfer file', () => {
  const transfer = (): Uint8Array => fileOf('transferencia-catalogo-local/local.tcpack')

  test('with keys it is E_SIGNATURE, with none it is accepted, and the plain catalog file is unchanged', async () => {
    const k = await newKey()
    expect(await readerOutput(transfer(), { trustedKeys: trust(k) })).toEqual({ error: 'E_SIGNATURE' })
    expect((await readerOutput(transfer())) as Record<string, unknown>).not.toHaveProperty('error')
    expect((await readerOutput(local, { trustedKeys: trust(k) })) as Record<string, unknown>).not.toHaveProperty('error')
  })
})
