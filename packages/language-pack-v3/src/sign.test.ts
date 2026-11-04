import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { readHeader, readSegment, writeSegment } from './codec/container'
import { FormatError } from './codec/errors'
import { BOOK_TABLES } from './read/book'
import { CATALOG_TABLES } from './read/catalog'
import { canonicalJson, readerOutput } from './read/output'
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
