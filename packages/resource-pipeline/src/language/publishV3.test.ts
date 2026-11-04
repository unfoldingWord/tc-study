import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { main } from '../../cli/build-v3'
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

let built: string
beforeAll(async () => {
  built = temp()
  const args = ['--list', join(DATA, LANG, 'list.json'), '--originals', join(DATA, 'originals', 'list.json'), '--parts', join(DATA, 'parts'), '--out', built, '--built', '2026-11-01T10:00:00Z']
  const code = await main(args, { log: () => {}, error: (line) => { throw new Error(line) } })
  expect(code).toBe(0)
  writeFileSync(join(built, `registry-${LANG}.json`), JSON.stringify({ sections: { a: 1 } }))
})

/** A fresh copy of the built folder. */
const copy = (): string => {
  const dir = temp()
  cpSync(built, dir, { recursive: true })
  return dir
}
const run = (bucket: PackBucket, outDir: string, publishCommon = true) => publishV3({ bucket, outDir, lang: LANG, publishCommon, log: () => {} })
const keys = (bucket: ReturnType<typeof memoryBucket>) => bucket.puts.map((put) => put.key)

describe('publishV3', () => {
  test('uploads segments, then common, then the language catalog, then the registry', async () => {
    const bucket = memoryBucket()
    const result = await run(bucket, copy())
    expect(result.outcome).toBe('published')
    const order = keys(bucket)
    expect(order.every((key) => KEY.test(key))).toBe(true)
    const segs = order.filter((key) => key.startsWith('v3/seg/'))
    expect(segs.length).toBeGreaterThan(2)
    expect(segs).toEqual([...segs].sort())
    expect(order.slice(segs.length)).toEqual([V3_KEYS.catalog('common'), V3_KEYS.catalog(LANG), V3_KEYS.registry(LANG)])
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

  test('publishCommon false never writes common', async () => {
    const bucket = memoryBucket()
    await run(bucket, copy(), false)
    expect(keys(bucket)).not.toContain(V3_KEYS.catalog('common'))
    expect(keys(bucket)).toContain(V3_KEYS.catalog(LANG))
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
