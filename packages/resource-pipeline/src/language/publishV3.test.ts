import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, readdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { main } from '../../cli/build-v3'
import { testKey } from '../../cli/testKey'
import { dirBucket } from './dirBucket'
import { IMMUTABLE, memoryBucket, NO_CACHE, type PackBucket } from './publishLanguage'
import { publishV3, readPublishedV3, V3_KEYS } from './publishV3'

const DATA = join(import.meta.dir, '..', '..', '..', 'language-pack-v3', 'spec', 'tests', 'data')
const KEY = /^v3\/(seg\/[0-9a-f]{64}\.seg|catalog\/(common|[a-z0-9-]+)\.seg|registry\/[a-z0-9-]+\.json)$/
const LANG = 'es-419'

const temps: string[] = []
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-v3-'))
  temps.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

async function build(extra: string[] = []): Promise<string> {
  const out = temp()
  const args = ['--list', join(DATA, LANG, 'list.json'), '--originals', join(DATA, 'originals', 'list.json'), '--parts', join(DATA, 'parts'), '--out', out, '--built', '2026-11-01T10:00:00Z', ...extra]
  const code = await main(args, { log: () => {}, error: (line) => { throw new Error(line) } })
  expect(code).toBe(0)
  writeFileSync(join(out, `registry-${LANG}.json`), JSON.stringify({ sections: { a: 1 } }))
  return out
}

let built: string
beforeAll(async () => {
  built = await build()
})

/** A bucket holding the common catalog (and, unless `withSegments` is false, every segment of the first build) but no language catalog. */
async function bucketWithCommon(withSegments = true) {
  const full = memoryBucket()
  await run(full, copy())
  const bucket = memoryBucket()
  const put = (key: string) => bucket.put(key, full.bytes(key)!, { contentType: 'x', cacheControl: 'x' })
  await put(V3_KEYS.catalog('common'))
  if (withSegments) for (const { key } of full.puts.filter((p) => p.key.startsWith('v3/seg/'))) await put(key)
  bucket.puts.length = 0
  return bucket
}

/** A fresh copy of the built folder. */
const copy = (): string => {
  const dir = temp()
  cpSync(built, dir, { recursive: true })
  return dir
}
const run = (bucket: PackBucket, outDir: string, publishCommon = true) => publishV3({ bucket, outDir, lang: LANG, publishCommon, log: () => {} })
const keys = (bucket: ReturnType<typeof memoryBucket>) => bucket.puts.map((put) => put.key)

describe('publishV3', () => {
  test('uploads segments, then the registry, then common, then the language catalog', async () => {
    const bucket = memoryBucket()
    const result = await run(bucket, copy())
    expect(result.outcome).toBe('published')
    const order = keys(bucket)
    expect(order.every((key) => KEY.test(key))).toBe(true)
    const segs = order.filter((key) => key.startsWith('v3/seg/'))
    expect(segs.length).toBeGreaterThan(2)
    expect(segs).toEqual([...segs].sort())
    expect(order.slice(segs.length)).toEqual([V3_KEYS.registry(LANG), V3_KEYS.catalog('common'), V3_KEYS.catalog(LANG)])
    expect(order.slice(0, segs.length)).toEqual(segs)
    expect(result.uploaded).toEqual(order)
  })

  test('content types and cache', async () => {
    const bucket = memoryBucket()
    await run(bucket, copy())
    for (const put of bucket.puts) {
      if (put.key.startsWith('v3/seg/')) expect([put.contentType, put.cacheControl]).toEqual(['application/octet-stream', IMMUTABLE])
      else if (put.key.startsWith('v3/catalog/')) expect([put.contentType, put.cacheControl]).toEqual(['application/octet-stream', NO_CACHE])
      else expect([put.contentType, put.cacheControl]).toEqual(['application/json', NO_CACHE])
    }
  })

  test('skips segments already present', async () => {
    const first = memoryBucket()
    await run(first, copy())
    const segs = first.puts.filter((put) => put.key.startsWith('v3/seg/')).map((put) => put.key)
    const bucket = memoryBucket()
    await bucket.put(segs[0], first.bytes(segs[0])!, { contentType: 'x', cacheControl: 'x' })
    bucket.puts.length = 0
    const result = await run(bucket, copy())
    expect(keys(bucket)).not.toContain(segs[0])
    expect(result.skipped).toEqual([segs[0]])
    expect(keys(bucket).filter((key) => key.startsWith('v3/seg/'))).toHaveLength(segs.length - 1)
  })

  test('checks every named segment exists before a catalog', async () => {
    const inner = memoryBucket()
    const lost: PackBucket = { ...inner, has: async (key) => (key.startsWith('v3/seg/') ? false : inner.has(key)), put: inner.put, getBytes: inner.getBytes, getJson: inner.getJson, stat: inner.stat }
    await expect(run(lost, copy())).rejects.toThrow(/not in the bucket/)
    expect(keys(inner).some((key) => key.startsWith('v3/catalog/') || key.startsWith('v3/registry/'))).toBe(false)
  })

  test('a failed put stops before the catalogs, and a second run completes it', async () => {
    const inner = memoryBucket()
    let count = 0
    const flaky: PackBucket = {
      ...inner,
      has: inner.has,
      put: async (key, body, m) => {
        if (++count === 3) throw new Error('boom')
        return inner.put(key, body, m)
      },
      getBytes: inner.getBytes,
      getJson: inner.getJson,
      stat: inner.stat,
    }
    const dir = copy()
    await expect(run(flaky, dir)).rejects.toThrow('boom')
    expect(keys(inner)).toHaveLength(2)
    expect(keys(inner).every((key) => key.startsWith('v3/seg/'))).toBe(true)
    const result = await run(inner, dir)
    expect(result.outcome).toBe('published')
    expect(result.skipped).toHaveLength(2)
    for (const key of [V3_KEYS.catalog('common'), V3_KEYS.catalog(LANG), V3_KEYS.registry(LANG)]) expect(await inner.has(key)).toBe(true)
  })

  test('unchanged: a catalog equal apart from about, and the same registry, put nothing', async () => {
    const bucket = memoryBucket()
    await run(bucket, copy())
    bucket.puts.length = 0
    const published = await readPublishedV3(bucket, LANG)
    expect(published.common?.revision).toBe(1)
    expect(published.lang?.id).toMatch(/^[0-9a-f]{64}$/)
    expect(published.registry).toEqual({ sections: { a: 1 } })
    const result = await run(bucket, copy())
    expect(result.outcome).toBe('unchanged')
    expect(bucket.puts).toEqual([])
  })

  test('unchanged: a rebuild with another revision and previous but equal tables puts nothing', async () => {
    const bucket = memoryBucket()
    await run(bucket, copy())
    bucket.puts.length = 0
    const published = await readPublishedV3(bucket, LANG)
    const again = await build(['--revision-lang', '2', '--previous-lang', published.lang!.id])
    const result = await run(bucket, again)
    expect(result.outcome).toBe('unchanged')
    expect(bucket.puts).toEqual([])
  })

  test('publishCommon true with an unchanged common but a language catalog that requires the new common id throws, nothing put', async () => {
    const bucket = memoryBucket()
    await run(bucket, copy())
    bucket.puts.length = 0
    const rebuilt = await build(['--revision', '2'])
    await expect(run(bucket, rebuilt)).rejects.toThrow(/requires common revision 2 id [0-9a-f]{64}, and the common catalog of the bucket after this run is revision 1 id [0-9a-f]{64}/)
    expect(bucket.puts).toEqual([])
  })

  test('a changed registry alone is put, without segments or catalogs', async () => {
    const bucket = memoryBucket()
    await run(bucket, copy())
    bucket.puts.length = 0
    const dir = copy()
    writeFileSync(join(dir, `registry-${LANG}.json`), JSON.stringify({ sections: { a: 2 } }))
    const result = await run(bucket, dir)
    expect(result.outcome).toBe('published')
    expect(keys(bucket)).toEqual([V3_KEYS.registry(LANG)])
  })

  test('publishCommon false never writes common, and checks the published one', async () => {
    const bucket = await bucketWithCommon()
    await run(bucket, copy(), false)
    expect(keys(bucket)).not.toContain(V3_KEYS.catalog('common'))
    expect(keys(bucket)).toContain(V3_KEYS.catalog(LANG))
  })

  test('publishCommon false: no published common catalog throws, nothing is put', async () => {
    const bucket = memoryBucket()
    await expect(run(bucket, copy(), false)).rejects.toThrow(/common catalog is not published/)
    expect(keys(bucket).some((key) => key.startsWith('v3/catalog/'))).toBe(false)
  })

  test('publishCommon false: a published common with another id or revision throws', async () => {
    const bucket = await bucketWithCommon()
    const other = await build(['--revision', '2'])
    await expect(run(bucket, other, false)).rejects.toThrow(/requires common revision 2/)
    expect(keys(bucket).some((key) => key.startsWith('v3/catalog/'))).toBe(false)
  })

  test('publishCommon false: a common segment missing from the bucket throws before the language catalog', async () => {
    const bucket = await bucketWithCommon(false)
    await expect(run(bucket, copy(), false)).rejects.toThrow(/not in the bucket/)
    expect(keys(bucket).some((key) => key.startsWith('v3/catalog/'))).toBe(false)
  })

  test('a lang that is common or not a language code throws; publishCommon true needs catalog-common.seg', async () => {
    for (const lang of ['common', 'a/b', '..', 'ES', 'a--b', '-a']) await expect(publishV3({ bucket: memoryBucket(), outDir: copy(), lang, publishCommon: true, log: () => {} })).rejects.toThrow(/Not a language/)
    const dir = copy()
    rmSync(join(dir, 'catalog-common.seg'))
    await expect(run(memoryBucket(), dir)).rejects.toThrow(/no catalog-common.seg/)
  })

  test('uploads only builder output', async () => {
    const dir = copy()
    writeFileSync(join(dir, 'report.txt'), 'x')
    mkdirSync(join(dir, 'tipnr'))
    writeFileSync(join(dir, 'tipnr', 'x.txt'), 'x')
    writeFileSync(join(dir, 'segments', 'notes.txt'), 'x')
    const bucket = memoryBucket()
    await run(bucket, dir)
    expect(keys(bucket).every((key) => KEY.test(key))).toBe(true)
  })

  test("each uploaded segment's id equals sha256 of its decompressed body and its file name", async () => {
    const dir = copy()
    const bucket = dirBucket(temp())
    const result = await run(bucket, dir)
    const segs = result.uploaded.filter((key) => key.startsWith('v3/seg/'))
    expect(segs.length).toBeGreaterThan(2)
    for (const key of segs) {
      const bytes = (await bucket.getBytes(key))!
      let read: Awaited<ReturnType<typeof readSegment>> | undefined
      for (const known of Object.values(KNOWN)) read ??= await readSegment(bytes, { known }).catch(() => undefined)
      const { id, seg } = read!
      expect(key).toBe(V3_KEYS.seg(id))
      expect(seg.h.class).toBeDefined()
      // The stored bytes are the built file, whose name is the id (readSegment hashes the decompressed body).
      expect(Buffer.from(bytes).equals(readFileSync(join(dir, 'segments', `${id}.seg`)))).toBe(true)
    }
  })
})

describe('dirBucket', () => {
  test('writes and reads <root>/<key>, and refuses ..', async () => {
    const bucket = dirBucket(temp())
    await bucket.put('v3/registry/x.json', '{"a":1}', { contentType: 'application/json', cacheControl: NO_CACHE })
    expect(await bucket.getJson('v3/registry/x.json')).toEqual({ a: 1 })
    expect(await bucket.has('v3/nope')).toBe(false)
    expect(await bucket.getBytes('v3/nope')).toBeNull()
    await expect(bucket.put('v3/../x', 'x', { contentType: 'a', cacheControl: 'b' })).rejects.toThrow(/Refused/)
    await expect(bucket.has('..\\x')).rejects.toThrow(/Refused/)
  })
})

describe('publishV3: signing key', () => {
  const log = () => {}
  const signed = async (key: { pem: string }) => build(['--sign-key', key.pem])
  const signerOf = async (key: { pem: string }) => {
    const { readSigningKey } = await import('./signKey')
    const { publicKey, keyId } = await readSigningKey(key.pem)
    return { publicKey, keyId }
  }

  test('puts catalogs signed by the key', async () => {
    const key = testKey()
    const bucket = memoryBucket()
    const result = await publishV3({ bucket, outDir: await signed(key), lang: LANG, publishCommon: true, signer: await signerOf(key), log })
    expect(result.outcome).toBe('published')
    expect(keys(bucket)).toContain(V3_KEYS.catalog('common'))
  })

  test('a catalog of the build that does not verify against the key is refused before any upload', async () => {
    const key = testKey()
    const bucket = memoryBucket()
    await expect(publishV3({ bucket, outDir: copy(), lang: LANG, publishCommon: true, signer: await signerOf(key), log })).rejects.toThrow(/does not verify against the signing key/)
    expect(bucket.puts).toEqual([])
    const other = testKey()
    await expect(publishV3({ bucket, outDir: await signed(other), lang: LANG, publishCommon: true, signer: await signerOf(key), log })).rejects.toThrow(/does not verify/)
    expect(bucket.puts).toEqual([])
  })

  test('a language catalog over a published common catalog signed by another key, or by none, is refused and nothing is put', async () => {
    const key = testKey()
    const other = testKey()
    const out = await signed(key)
    // The same build, its common catalog signed by another key / unsigned, in the bucket.
    for (const common of [await signed(other), built]) {
      const bucket = memoryBucket()
      const bytes = new Uint8Array(readFileSync(join(common, 'catalog-common.seg')))
      await bucket.put(V3_KEYS.catalog('common'), bytes, { contentType: 'x', cacheControl: 'x' })
      bucket.puts.length = 0
      await expect(publishV3({ bucket, outDir: out, lang: LANG, publishCommon: false, signer: await signerOf(key), log })).rejects.toThrow(/not signed by the signing key/)
      expect(bucket.puts).toEqual([])
    }
  })

  test('over a published common catalog signed by the same key the language catalog is put', async () => {
    const key = testKey()
    const out = await signed(key)
    const bucket = memoryBucket()
    await bucket.put(V3_KEYS.catalog('common'), new Uint8Array(readFileSync(join(out, 'catalog-common.seg'))), { contentType: 'x', cacheControl: 'x' })
    for (const f of readdirSync(join(out, 'segments'))) await bucket.put(`v3/seg/${f}`, new Uint8Array(readFileSync(join(out, 'segments', f))), { contentType: 'x', cacheControl: 'x' })
    bucket.puts.length = 0
    const result = await publishV3({ bucket, outDir: out, lang: LANG, publishCommon: false, signer: await signerOf(key), log })
    expect(result.outcome).toBe('published')
    expect(keys(bucket)).toContain(V3_KEYS.catalog(LANG))
  })

  test('without a signer nothing changes: an unsigned build is put', async () => {
    const bucket = memoryBucket()
    expect((await run(bucket, copy())).outcome).toBe('published')
  })
})
