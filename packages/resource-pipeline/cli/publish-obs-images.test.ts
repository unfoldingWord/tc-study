import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { cpSync, existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { catalogView, hex, KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { memoryBucket, IMMUTABLE, NO_CACHE, type PackBucket } from '../src/language/publishLanguage'
import { publishStandalone, readPublishedCatalog, V3_KEYS } from '../src/language/publishV3'
import { main as buildV3 } from './build-v3'
import { deps, zipOf } from './obsImagesFixture'
import { main as publish } from './publish-obs-images'
import { testKey } from './testKey'

const NAME = 'zxx-obsimg'
const temps: string[] = []
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'publish-obsimg-'))
  temps.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

let built: string
beforeAll(async () => {
  built = temp()
  const code = await buildV3(['--obs-images', '--out', built, '--built', '2026-11-01T10:00:00Z'], { log: () => {}, error: (l) => { throw new Error(l) } }, undefined, deps(await zipOf()))
  expect(code).toBe(0)
})

const copy = (): string => {
  const dir = temp()
  cpSync(built, dir, { recursive: true })
  return dir
}
const keys = (b: ReturnType<typeof memoryBucket>) => b.puts.map((p) => p.key)
const put = (b: PackBucket, dir: string, signer?: { keyId: string; publicKey: Uint8Array }) => publishStandalone({ bucket: b, outDir: dir, name: NAME, signer, log: () => {} })

describe('publishStandalone', () => {
  test('segments first (in id order), then the catalog; nothing else', async () => {
    const bucket = memoryBucket()
    const r = await put(bucket, copy())
    expect(r.outcome).toBe('published')
    const order = keys(bucket)
    const segs = order.filter((k) => k.startsWith('v3/seg/'))
    expect(segs).toHaveLength(50)
    expect(segs).toEqual([...segs].sort())
    expect(order).toEqual([...segs, V3_KEYS.catalog(NAME)])
    expect(order.some((k) => k.includes('registry') || k.endsWith('common.seg'))).toBe(false)
    for (const p of bucket.puts) {
      expect([p.contentType, p.cacheControl]).toEqual(p.key.startsWith('v3/seg/') ? ['application/octet-stream', IMMUTABLE] : ['application/octet-stream', NO_CACHE])
    }
    expect((await readPublishedCatalog(bucket, NAME))?.revision).toBe(1)
  })

  test('unchanged: the same content puts nothing', async () => {
    const bucket = memoryBucket()
    await put(bucket, copy())
    bucket.puts.length = 0
    const r = await put(bucket, copy())
    expect(r.outcome).toBe('unchanged')
    expect(bucket.puts).toEqual([])
  })

  test('only the missing segments are put', async () => {
    const first = memoryBucket()
    await put(first, copy())
    const segs = first.puts.filter((p) => p.key.startsWith('v3/seg/')).map((p) => p.key)
    const bucket = memoryBucket()
    await bucket.put(segs[0], first.bytes(segs[0])!, { contentType: 'x', cacheControl: 'x' })
    bucket.puts.length = 0
    const r = await put(bucket, copy())
    expect(r.skipped).toEqual([segs[0]])
    expect(keys(bucket)).not.toContain(segs[0])
    expect(keys(bucket)).toHaveLength(segs.length)
  })

  test('no catalog is put when a named segment is missing from the bucket after the upload', async () => {
    const inner = memoryBucket()
    const lost: PackBucket = { ...inner, has: async (k) => (k.startsWith('v3/seg/') ? false : inner.has(k)), put: inner.put, getBytes: inner.getBytes, getJson: inner.getJson, stat: inner.stat }
    await expect(put(lost, copy())).rejects.toThrow(/not in the bucket/)
    expect(keys(inner).some((k) => k.startsWith('v3/catalog/'))).toBe(false)
  })

  test('refuses a catalog with requires, a bad name and a missing folder file', async () => {
    await expect(publishStandalone({ bucket: memoryBucket(), outDir: copy(), name: 'common', log: () => {} })).rejects.toThrow(/Not a catalog name/)
    await expect(publishStandalone({ bucket: memoryBucket(), outDir: temp(), name: NAME, log: () => {} })).rejects.toThrow(/no catalog-zxx-obsimg\.seg/)
  })

  test('a signer that did not sign the catalog uploads nothing', async () => {
    const key = testKey()
    temps.push(key.dir)
    const bucket = memoryBucket()
    await expect(put(bucket, copy(), { keyId: 'k', publicKey: key.publicKey })).rejects.toThrow(/does not verify/)
    expect(bucket.puts).toEqual([])
  })
})

describe('publish-obs-images', () => {
  async function runCli(args: string[], env: Record<string, string> = {}, zip?: Uint8Array) {
    const out: string[] = []
    const err: string[] = []
    const code = await publish(args, env, { log: (l) => err.push(l), error: (l) => err.push(l), out: (l) => out.push(l) }, deps(zip ?? (await zipOf())))
    return { code, out, err }
  }

  test('first run publishes revision 1; a second run is unchanged; a changed picture is revision 2 with previous', async () => {
    const bucketDir = temp()
    const work = temp()
    const a = await runCli(['--work', work, '--bucket-dir', bucketDir])
    expect(a.code).toBe(0)
    const first = JSON.parse(a.out.at(-1)!)
    expect([first.outcome, first.catalog, first.revision, first.segments]).toEqual(['published', NAME, 1, { uploaded: 50, present: 0 }])

    const b = await runCli(['--work', work, '--bucket-dir', bucketDir])
    const second = JSON.parse(b.out.at(-1)!)
    expect([second.outcome, second.revision, second.id]).toEqual(['unchanged', 1, first.id])

    const c = await runCli(['--work', work, '--bucket-dir', bucketDir], {}, await zipOf({ '360px/obs-en-02-01.jpg': 'a different picture' }))
    expect(c.code).toBe(0)
    const third = JSON.parse(c.out.at(-1)!)
    expect([third.outcome, third.revision, third.segments]).toEqual(['published', 2, { uploaded: 1, present: 49 }])
    const catalog = await readSegment(new Uint8Array(readFileSync(join(bucketDir, V3_KEYS.catalog(NAME)))), { known: KNOWN.catalog, expectedClass: 'catalog' })
    const model = catalogView(catalog.seg)
    expect(model.about.revision).toBe(2)
    expect(hex(model.about.previous!)).toBe(first.id)
  })

  test('--no-upload builds and reports, uploads nothing', async () => {
    const r = await runCli(['--work', temp(), '--no-upload'])
    expect(r.code).toBe(0)
    expect(JSON.parse(r.out.at(-1)!)).toMatchObject({ outcome: 'built', revision: 1 })
  })

  test('arguments: --work is required, a bucket is required without --no-upload, half the R2 variables fail', async () => {
    expect((await runCli([])).code).toBe(2)
    expect((await runCli(['--work', temp()])).code).toBe(2)
    expect((await runCli(['--work', temp()], { R2_BUCKET: 'b' })).code).toBe(2)
    expect((await runCli(['--work', temp(), '--bucket-dir'])).code).toBe(2)
  })

  test('a build failure (a zip that is not the pin) is exit 1 and uploads nothing', async () => {
    const bucketDir = temp()
    const d = deps(await zipOf())
    d.pin = { ...d.pin!, sha256: '0'.repeat(64) } as typeof d.pin
    const err: string[] = []
    const code = await publish(['--work', temp(), '--bucket-dir', bucketDir], {}, { log: (l) => err.push(l), error: (l) => err.push(l), out: () => {} }, d)
    expect(code).toBe(1)
    expect(existsSync(join(bucketDir, 'v3'))).toBe(false)
  })
})
