import 'fake-indexeddb/auto'
import { afterAll, describe, expect, test } from 'bun:test'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compatKeyOf, partPath, partsListPath, PARTS_FORMAT_VERSION, serializePartsList, type PartsList } from '@bt-synergy/language-pack'
import { buildLanguageParts } from './buildLanguageParts'
import { PACK_VERSIONS } from './packVersions'
import { discoverWith, fakeDoor43, GLT, LANG, lexiconFetch, LEXICONS_REF, MACULA_STAMP, maculaFolder, reposCopy, type CatalogOverrides } from './partsFixture'
import { memoryBucket, type PackBucket } from './publishLanguage'
import { publishLanguageParts } from './publishLanguageParts'

const COMPAT = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
const LANGUAGE_LIST = partsListPath(COMPAT, LANG)
const ORIGINALS_LATEST = partsListPath(COMPAT, 'originals')
// MACULA's stamp as the fixture's builds have it: the commit's first ten characters and its date.
const MACULA = { commit: `${MACULA_STAMP.version}${'0'.repeat(30)}`, date: MACULA_STAMP.publishedAt }

const dirs: string[] = []
afterAll(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function freshDir(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`))
  dirs.push(dir)
  return dir
}

type Fixture = { repos?: Record<string, Record<string, string>>; catalog?: CatalogOverrides; fail?: (repo: string) => Error | undefined }

/** The real parts build, over the fixture's Door43 (changed by `f`) instead of the real one. */
function fixtureBuild(f: Fixture = {}): typeof buildLanguageParts {
  return (o) =>
    buildLanguageParts({
      ...o,
      fetch: lexiconFetch,
      door43Client: fakeDoor43({ repos: f.repos, catalog: f.catalog, fail: f.fail }) as never,
      discover: discoverWith(f.catalog),
      wait: async () => {},
    })
}

function publish(bucket: PackBucket | undefined, over: Partial<Parameters<typeof publishLanguageParts>[0]> & { fixture?: Fixture } = {}) {
  const { fixture, ...rest } = over
  const lines: string[] = []
  const workDir = freshDir('publish-parts')
  const run = publishLanguageParts({
    language: LANG,
    workDir,
    macula: { folder: maculaFolder(freshDir('macula')), ...MACULA },
    lexiconsRef: LEXICONS_REF,
    ...(bucket ? { bucket } : {}),
    build: fixtureBuild(fixture),
    log: (line) => lines.push(line),
    ...rest,
  })
  return { run, lines, workDir }
}

const keysOf = (bucket: { puts: Array<{ key: string }> }) => bucket.puts.map((p) => p.key)
const catalogKeys = (bucket: { puts: Array<{ key: string }> }) => keysOf(bucket).filter((k) => k.startsWith('catalog/'))

/** Every sha256 a published language list and the originals list it names point at. */
function namedParts(bucket: ReturnType<typeof memoryBucket>): string[] {
  const list = bucket.json<PartsList>(LANGUAGE_LIST)!
  const originals = bucket.json<PartsList>(list.originals!.path)!
  return [...list.parts, ...originals.parts].map((p) => p.sha256)
}

/** A bucket after one publish of the fixture as it is. */
async function published() {
  const bucket = memoryBucket()
  const first = publish(bucket)
  const result = await first.run
  return { bucket, result, workDir: first.workDir }
}

describe('publishLanguageParts', () => {
  test('first publish: every part, then the originals list by content, then originals.json, then the language list last', async () => {
    const { bucket, result, workDir } = await published()

    expect(result.outcome).toBe('published')
    const keys = keysOf(bucket)
    const firstCatalog = keys.findIndex((k) => k.startsWith('catalog/'))
    expect(keys.slice(0, firstCatalog).every((k) => /^parts\/[0-9a-f]{64}\.part\.gz$/.test(k))).toBe(true)
    const list = bucket.json<PartsList>(LANGUAGE_LIST)!
    expect(list.originals!.path).toMatch(new RegExp(`^catalog/${COMPAT}/originals/[0-9a-f]{64}\\.json$`))
    expect(keys.slice(firstCatalog)).toEqual([list.originals!.path, ORIGINALS_LATEST, LANGUAGE_LIST])

    // Every part of both lists, each once.
    const shas = new Set(namedParts(bucket))
    expect(new Set(keys.slice(0, firstCatalog))).toEqual(new Set([...shas].map(partPath)))
    expect(firstCatalog).toBe(shas.size)
    expect(result.parts).toEqual({ language: list.parts.length, originals: bucket.json<PartsList>(ORIGINALS_LATEST)!.parts.length, put: shas.size, present: 0 })
    expect(result.units.carried).toBe(0)
    expect(result.units.built).toBe(list.units!.length)
    expect(result.failures).toBe(0)
    expect(result.compat).toBe(COMPAT)

    const meta = Object.fromEntries(bucket.puts.map((p) => [p.key, `${p.contentType} | ${p.cacheControl}`]))
    for (const key of keys.slice(0, firstCatalog)) expect(meta[key]).toBe('application/gzip | public, max-age=31536000, immutable')
    expect(meta[list.originals!.path]).toBe('application/json | public, max-age=31536000, immutable')
    expect(meta[ORIGINALS_LATEST]).toBe('application/json | no-cache')
    expect(meta[LANGUAGE_LIST]).toBe('application/json | no-cache')

    // What was put is what the build wrote: the lists' texts and the parts' bytes.
    expect(bucket.text(list.originals!.path)).toBe(bucket.text(ORIGINALS_LATEST)!)
    expect(bucket.text(LANGUAGE_LIST)).toBe(readFileSync(join(workDir, LANGUAGE_LIST), 'utf8'))
    expect(bucket.text(ORIGINALS_LATEST)).toBe(readFileSync(join(workDir, ORIGINALS_LATEST), 'utf8'))
    const sha = list.parts[0].sha256
    expect(bucket.bytes(partPath(sha))).toEqual(new Uint8Array(readFileSync(join(workDir, partPath(sha)))))
  })

  test('second publish of the same inputs: unchanged, every unit carried, nothing put', async () => {
    const { bucket } = await published()
    const before = bucket.puts.length

    const result = await publish(bucket).run

    expect(result.outcome).toBe('unchanged')
    expect(bucket.puts.length).toBe(before)
    expect(result.units.built).toBe(0)
    expect(result.units.carried).toBe(bucket.json<PartsList>(LANGUAGE_LIST)!.units!.length)
    expect(result.parts.put).toBe(0)
  })

  test('a GLT tag bump only: the language list alone is put (the originals list and its address did not change)', async () => {
    const { bucket } = await published()
    const before = bucket.puts.length
    const oldText = bucket.text(LANGUAGE_LIST)

    const result = await publish(bucket, { fixture: { catalog: { tags: { [GLT]: 'v13' } } } }).run

    expect(result.outcome).toBe('published')
    expect(keysOf(bucket).slice(before)).toEqual([LANGUAGE_LIST])
    expect(bucket.text(LANGUAGE_LIST)).not.toBe(oldText)
    expect(result.units.built).toBe(0)
  })

  test('over a list published before lists had stamps: every unit carried, no part put, the list alone put with them', async () => {
    const { bucket } = await published()
    const { stamps, ...old } = bucket.json<PartsList>(LANGUAGE_LIST)!
    expect(Object.keys(stamps ?? {}).length).toBeGreaterThan(0)
    await bucket.put(LANGUAGE_LIST, new TextEncoder().encode(serializePartsList(old)), { contentType: 'application/json', cacheControl: 'no-cache' })
    const before = bucket.puts.length

    const result = await publish(bucket).run

    expect(result.outcome).toBe('published')
    expect(result.units.built).toBe(0)
    expect(result.parts.put).toBe(0)
    expect(keysOf(bucket).slice(before)).toEqual([LANGUAGE_LIST])
    expect(bucket.json<PartsList>(LANGUAGE_LIST)!.stamps).toEqual(stamps)
  })

  test('a part the bucket already has is not put again', async () => {
    const { bucket: full } = await published()
    const sha = full.json<PartsList>(LANGUAGE_LIST)!.parts[0].sha256
    const bucket = memoryBucket()
    await bucket.put(partPath(sha), full.bytes(partPath(sha))!, { contentType: 'application/gzip', cacheControl: 'x' })
    bucket.puts.length = 0

    const result = await publish(bucket).run

    expect(result.outcome).toBe('published')
    expect(keysOf(bucket)).not.toContain(partPath(sha))
    expect(result.parts.present).toBe(1)
    expect(result.parts.put).toBe(new Set(namedParts(bucket)).size - 1)
  })

  test('a put that fails on the 3rd part: the error goes up and no catalog key is written', async () => {
    const inner = memoryBucket()
    let partPuts = 0
    const bucket: PackBucket = {
      ...inner,
      async put(key, body, m) {
        if (key.startsWith('parts/') && ++partPuts === 3) throw new Error('connection reset')
        return inner.put(key, body, m)
      },
    }

    await expect(publish(bucket).run).rejects.toThrow('connection reset')

    expect(inner.puts.length).toBeGreaterThan(0)
    expect(catalogKeys(inner)).toEqual([])
  })

  test('cut short over an earlier publish: the lists stay the earlier ones, and every part they name is still there', async () => {
    const { bucket: inner } = await published()
    const listText = inner.text(LANGUAGE_LIST)
    const latestText = inner.text(ORIGINALS_LATEST)
    const before = inner.puts.length
    const bucket: PackBucket = {
      ...inner,
      async put(key, body, m) {
        if (key.startsWith('parts/')) throw new Error('connection reset')
        return inner.put(key, body, m)
      },
    }
    const repos = reposCopy()
    repos['test_gl/es-419_tn']['tn_RUT.tsv'] = repos['test_gl/es-419_tn']['tn_RUT.tsv'].replace('Una nota de Rut', 'Otra nota de Rut')

    await expect(publish(bucket, { fixture: { repos } }).run).rejects.toThrow('connection reset')

    expect(inner.puts.length).toBe(before)
    expect(inner.text(LANGUAGE_LIST)).toBe(listText)
    expect(inner.text(ORIGINALS_LATEST)).toBe(latestText)
    for (const sha of namedParts(inner)) expect(await inner.has(partPath(sha))).toBe(true)
  })

  test('a carried part the bucket no longer has: its unit is built and the part put again', async () => {
    const { bucket: full } = await published()
    const list = full.json<PartsList>(LANGUAGE_LIST)!
    const lost = list.parts.find((p) => p.book === 'rut')!
    // The same bucket without that one part.
    const bucket = memoryBucket()
    for (const key of [list.originals!.path, ORIGINALS_LATEST, LANGUAGE_LIST]) {
      await bucket.put(key, full.text(key)!, { contentType: 'application/json', cacheControl: 'x' })
    }
    for (const sha of namedParts(full)) {
      if (sha !== lost.sha256) await bucket.put(partPath(sha), full.bytes(partPath(sha))!, { contentType: 'application/gzip', cacheControl: 'x' })
    }
    bucket.puts.length = 0

    const result = await publish(bucket).run

    expect(keysOf(bucket)).toEqual([partPath(lost.sha256)])
    expect(result.units.built).toBe(1)
    expect(result.parts.put).toBe(1)
    // The lists came out the same, so they are not written again.
    expect(result.outcome).toBe('published')
  })

  test('a build with a failure: an error, and nothing is put', async () => {
    const bucket = memoryBucket()
    const { run } = publish(bucket, { fixture: { fail: (repo) => (repo === 'test_gl/es-419_tq' ? new Error('gone') : undefined) } })

    await expect(run).rejects.toThrow(/^Not publishing es-419, the build is not whole: .*test_gl\/es-419\/tq/)

    expect(bucket.puts).toEqual([])
  })

  test('no upload: built into the work folder, nothing put, the previous lists still read from the bucket', async () => {
    const { bucket } = await published()
    const before = bucket.puts.length
    const { run, workDir } = publish(bucket, { noUpload: true })

    const result = await run

    expect(result.outcome).toBe('built')
    expect(bucket.puts.length).toBe(before)
    expect(result.units.built).toBe(0)
    expect(existsSync(join(workDir, LANGUAGE_LIST))).toBe(true)
  })

  test('no upload and no bucket: everything built, nothing to put anywhere', async () => {
    const result = await publish(undefined, { noUpload: true }).run
    expect(result.outcome).toBe('built')
    expect(result.units.carried).toBe(0)
    expect(result.parts.put).toBe(0)
  })

  test('a previous work folder: its units are carried and their part files copied into the new folder', async () => {
    const first = publish(undefined, { noUpload: true })
    await first.run
    const { run, workDir } = publish(undefined, { noUpload: true, previousDir: first.workDir })

    const result = await run

    expect(result.outcome).toBe('built')
    expect(result.units.built).toBe(0)
    expect(readdirSync(join(workDir, 'parts')).sort()).toEqual(readdirSync(join(first.workDir, 'parts')).sort())
    expect(readFileSync(join(workDir, LANGUAGE_LIST), 'utf8')).toBe(readFileSync(join(first.workDir, LANGUAGE_LIST), 'utf8'))
  })

  test('force: no previous list is read, every unit built; the parts the bucket has are not put again', async () => {
    const { bucket } = await published()
    const before = bucket.puts.length

    const result = await publish(bucket, { force: true }).run

    expect(result.units.carried).toBe(0)
    expect(result.parts.put).toBe(0)
    expect(keysOf(bucket).slice(before).every((k) => k.startsWith('catalog/'))).toBe(true)
    expect(keysOf(bucket).at(-1)).toBe(LANGUAGE_LIST)
  })

  test('a previous list whose originals list is not in the bucket is not reused', async () => {
    const { bucket: full } = await published()
    const bucket = memoryBucket()
    await bucket.put(LANGUAGE_LIST, full.text(LANGUAGE_LIST)!, { contentType: 'application/json', cacheControl: 'x' })
    const { run, lines } = publish(bucket)

    const result = await run

    expect(result.units.carried).toBe(0)
    expect(lines.join('\n')).toContain('originals')
    const list = bucket.json<PartsList>(LANGUAGE_LIST)!
    expect(await bucket.has(list.originals!.path)).toBe(true)
  })

  test('a previous work folder whose build had failures is refused: its lists would carry a partial run', async () => {
    const failed = publish(undefined, { noUpload: true, fixture: { fail: (repo) => (repo === 'test_gl/es-419_tq' ? new Error('gone') : undefined) } })
    expect((await failed.run).failures).toBeGreaterThan(0)
    // The failed build wrote its lists anyway.
    expect(existsSync(join(failed.workDir, LANGUAGE_LIST))).toBe(true)

    await expect(publish(undefined, { noUpload: true, previousDir: failed.workDir }).run).rejects.toThrow(/not a whole build.*state done, [1-9]\d* failures/)
    await expect(publish(undefined, { noUpload: true, previousDir: freshDir('no-report') }).run).rejects.toThrow('parts-report.json')
  })

  test('previousDir with a bucket to publish to is refused: the parts it has are not the bucket’s', async () => {
    const { run } = publish(memoryBucket(), { previousDir: freshDir('prev') })
    await expect(run).rejects.toThrow('previousDir')
  })

  test('a language code that could leave its folder is refused', async () => {
    await expect(publish(memoryBucket(), { language: '../es-419' }).run).rejects.toThrow('../es-419')
  })

  test('the language list names only an originals address the bucket has, though another language wrote originals.json since', async () => {
    const { bucket } = await published()
    const ours = bucket.json<PartsList>(LANGUAGE_LIST)!.originals!.path
    // Another language's run wrote its own originals as the latest.
    const other = { ...bucket.json<PartsList>(ORIGINALS_LATEST)!, parts: [] }
    await bucket.put(ORIGINALS_LATEST, serializePartsList(other), { contentType: 'application/json', cacheControl: 'no-cache' })
    const before = bucket.puts.length

    const result = await publish(bucket).run

    // Our originals did not change: the other language's latest is left alone, and ours is still at its address.
    expect(result.outcome).toBe('unchanged')
    expect(bucket.puts.length).toBe(before)
    expect(await bucket.has(ours)).toBe(true)
  })
})
