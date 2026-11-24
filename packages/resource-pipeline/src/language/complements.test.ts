import { afterAll, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildCatalog, catalogView, hex, KNOWN, readSegment, type Complement } from '@bt-synergy/language-pack-v3'
import { main as transfer } from '../../cli/transfer-v3'
import { IMMUTABLE, memoryBucket, NO_CACHE } from './publishLanguage'
import { publishStandalone, putComplements, V3_KEYS } from './publishV3'

const temps: string[] = []
const temp = (): string => {
  const dir = mkdtempSync(join(tmpdir(), 'complements-'))
  temps.push(dir)
  return dir
}
afterAll(() => {
  for (const dir of temps) rmSync(dir, { recursive: true, force: true })
})

const sha = (bytes: Uint8Array): string => createHash('sha256').update(bytes).digest('hex')
const unhex = (h: string): Uint8Array => Uint8Array.from(h.match(/../g)!, (pair) => parseInt(pair, 16))
const BYTES = new Uint8Array([1, 2, 3, 4, 5, 6, 7])
const OTHER = new Uint8Array([9, 9, 9])

function complementOf(bytes: Uint8Array, kind = 'basemap'): Complement {
  return { kind, id: unhex(sha(bytes)), size: bytes.length, media: 'application/cbor', version: '1', license: 'Public domain' }
}

/** A build folder of a catalog that requires nothing, lists the complements and has no segment. */
async function folder(name: string, complements: Complement[], files: Record<string, Uint8Array> = {}, revision = 1): Promise<string> {
  const dir = temp()
  const catalog = await buildCatalog({
    about: { format: '3.0', catalog: name, publisher: 'unfoldingWord', origin: 'published', revision, built: '2026-11-01T10:00:00Z', builder: 'test' },
    resources: [],
    segments: [],
    complements,
  })
  writeFileSync(join(dir, `catalog-${name}.seg`), catalog.bytes)
  mkdirSync(join(dir, 'complements'), { recursive: true })
  for (const [file, bytes] of Object.entries(files)) writeFileSync(join(dir, 'complements', file), bytes)
  return dir
}

async function model(dir: string, name: string) {
  const { seg } = await readSegment(new Uint8Array(readFileSync(join(dir, `catalog-${name}.seg`))), { known: KNOWN.catalog, expectedClass: 'catalog' })
  return catalogView(seg)
}

describe('putComplements', () => {
  test('puts each complement once under v3/complement/<id>, immutable, and skips what the bucket has', async () => {
    const dir = await folder('zz-one', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: BYTES })
    const m = await model(dir, 'zz-one')
    const bucket = memoryBucket()
    const first = await putComplements({ bucket, outDir: dir, models: [m, m], log: () => {} })
    expect(first.uploaded).toEqual([V3_KEYS.complement(sha(BYTES))])
    expect(V3_KEYS.complement(sha(BYTES))).toBe(`v3/complement/${sha(BYTES)}`)
    expect(bucket.puts.map((p) => [p.contentType, p.cacheControl])).toEqual([['application/octet-stream', IMMUTABLE]])
    expect(Array.from(bucket.bytes(V3_KEYS.complement(sha(BYTES)))!)).toEqual(Array.from(BYTES))
    const second = await putComplements({ bucket, outDir: dir, models: [m], log: () => {} })
    expect(second).toEqual({ uploaded: [], skipped: [V3_KEYS.complement(sha(BYTES))] })
    expect(bucket.puts).toHaveLength(1)
  })

  test('refuses a file of another length, another hash, or no file, and puts nothing', async () => {
    const bucket = memoryBucket()
    const c = complementOf(BYTES)
    const short = await folder('zz-short', [c], { [`${sha(BYTES)}.basemap`]: BYTES.slice(0, 3) })
    await expect(putComplements({ bucket, outDir: short, models: [await model(short, 'zz-short')], log: () => {} })).rejects.toThrow(/has 3 bytes and the catalog says/)
    const wrong = await folder('zz-wrong', [c], { [`${sha(BYTES)}.basemap`]: new Uint8Array([7, 6, 5, 4, 3, 2, 1]) })
    await expect(putComplements({ bucket, outDir: wrong, models: [await model(wrong, 'zz-wrong')], log: () => {} })).rejects.toThrow(/does not hash to the id/)
    const none = await folder('zz-none', [c])
    await expect(putComplements({ bucket, outDir: none, models: [await model(none, 'zz-none')], log: () => {} })).rejects.toThrow(/neither in the bucket nor at/)
    expect(bucket.puts).toEqual([])
  })

  test('a kind that is not a file extension is refused (nothing leaves complements/)', async () => {
    const dir = await folder('zz-kind', [complementOf(BYTES, '..%2fx')], {})
    await expect(putComplements({ bucket: memoryBucket(), outDir: dir, models: [await model(dir, 'zz-kind')], log: () => {} })).rejects.toThrow(/not a file extension/)
  })

  test('the same id in two catalogs with two kinds is an error', async () => {
    const a = await folder('zz-a', [complementOf(BYTES, 'basemap')], { [`${sha(BYTES)}.basemap`]: BYTES })
    const b = await folder('zz-b', [complementOf(BYTES, 'images')], { [`${sha(BYTES)}.images`]: BYTES })
    await expect(putComplements({ bucket: memoryBucket(), outDir: a, models: [await model(a, 'zz-a'), await model(b, 'zz-b')], log: () => {} })).rejects.toThrow(/two kinds or sizes/)
  })
})

describe('publishStandalone with a complement', () => {
  test('the complement is put before the catalog, and a second run is unchanged', async () => {
    const dir = await folder('zz-pub', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: BYTES })
    const bucket = memoryBucket()
    const first = await publishStandalone({ bucket, outDir: dir, name: 'zz-pub', log: () => {} })
    expect(first.outcome).toBe('published')
    expect(bucket.puts.map((p) => p.key)).toEqual([V3_KEYS.complement(sha(BYTES)), V3_KEYS.catalog('zz-pub')])
    expect(bucket.puts[1].cacheControl).toBe(NO_CACHE)
    const second = await publishStandalone({ bucket, outDir: dir, name: 'zz-pub', log: () => {} })
    expect(second.outcome).toBe('unchanged')
  })

  test('a bad complement stops before the catalog is put', async () => {
    const dir = await folder('zz-bad', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: OTHER })
    const bucket = memoryBucket()
    await expect(publishStandalone({ bucket, outDir: dir, name: 'zz-bad', log: () => {} })).rejects.toThrow()
    expect(bucket.puts.some((p) => p.key.startsWith('v3/catalog/'))).toBe(false)
  })
})

describe('transfer-v3 with a complement', () => {
  async function run(args: string[]) {
    const out: string[] = []
    const err: string[] = []
    const code = await transfer(args, { log: (l) => err.push(l), error: (l) => err.push(l), out: (l) => out.push(l) })
    return { code, err, result: out.length > 0 ? JSON.parse(out[out.length - 1]) : undefined }
  }

  test('full export carries the complement and import writes complements/<id>.<kind>', async () => {
    const dir = await folder('zz-tr', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: BYTES })
    const file = join(temp(), 'x.tcpack')
    const exported = await run(['export', '--from', dir, '--mode', 'full', '--out', file])
    expect(exported.err).toEqual([])
    expect(exported.result.catalogs).toBe(1)
    const into = temp()
    const imported = await run(['import', '--file', file, '--into', into])
    expect(imported.code).toBe(0)
    expect(imported.result).toMatchObject({ ok: true, complete: true, complementsWritten: 1, complements: [] })
    const written = join(into, 'complements', `${sha(BYTES)}.basemap`)
    expect(existsSync(written)).toBe(true)
    expect(Array.from(new Uint8Array(readFileSync(written)))).toEqual(Array.from(BYTES))
    // A second import is a no-op, and a different file under that name is refused.
    expect((await run(['import', '--file', file, '--into', into])).result).toMatchObject({ complementsWritten: 0, unchanged: 2 })
    writeFileSync(written, OTHER)
    expect((await run(['import', '--file', file, '--into', into])).code).toBe(1)
  })

  test('export refuses a complement file that is not the one the catalog lists', async () => {
    const dir = await folder('zz-trbad', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: OTHER })
    const result = await run(['export', '--from', dir, '--mode', 'full', '--out', join(temp(), 'x.tcpack')])
    expect(result.code).toBe(1)
    expect(result.err.join('\n')).toMatch(/bytes and the catalog says|does not hash/)
  })

  test('an update leaves out a complement the base catalog already lists', async () => {
    const dir1 = await folder('zz-up', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: BYTES }, 1)
    const dir2 = await folder('zz-up', [complementOf(BYTES), complementOf(OTHER, 'images')], { [`${sha(BYTES)}.basemap`]: BYTES, [`${sha(OTHER)}.images`]: OTHER }, 2)
    const file = join(temp(), 'u.tcpack')
    const exported = await run(['export', '--from', dir2, '--mode', 'update', '--base', join(dir1, 'catalog-zz-up.seg'), '--out', file])
    expect(exported.code).toBe(0)
    expect(exported.result.complements).toBe(1)
    const full = join(temp(), 'f.tcpack')
    await run(['export', '--from', dir1, '--mode', 'full', '--out', full])
    const into = temp()
    await run(['import', '--file', full, '--into', into])
    const imported = await run(['import', '--file', file, '--into', into])
    expect(imported.code).toBe(0)
    expect(imported.result.complementsWritten).toBe(1)
    expect(existsSync(join(into, 'complements', `${sha(OTHER)}.images`))).toBe(true)
  })
})

describe('an unchanged catalog still gets its complements', () => {
  test('a catalog put by an older publisher (no complement in the bucket) is repaired by a second run', async () => {
    const dir = await folder('zz-fix', [complementOf(BYTES)], { [`${sha(BYTES)}.basemap`]: BYTES })
    const full = memoryBucket()
    await publishStandalone({ bucket: full, outDir: dir, name: 'zz-fix', log: () => {} })
    const bucket = memoryBucket()
    const catalogKey = V3_KEYS.catalog('zz-fix')
    await bucket.put(catalogKey, full.bytes(catalogKey)!, { contentType: 'x', cacheControl: 'x' })
    const again = await publishStandalone({ bucket, outDir: dir, name: 'zz-fix', log: () => {} })
    expect(again.outcome).toBe('unchanged')
    expect(again.uploaded).toEqual([V3_KEYS.complement(sha(BYTES))])
    expect(await bucket.has(V3_KEYS.complement(sha(BYTES)))).toBe(true)
  })
})
