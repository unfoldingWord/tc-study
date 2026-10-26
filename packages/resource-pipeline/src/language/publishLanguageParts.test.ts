import 'fake-indexeddb/auto'
import { afterAll, describe, expect, test } from 'bun:test'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compatKeyOf, partPath, partsListPath, PARTS_FORMAT_VERSION, serializePartsList, type PartsList } from '@bt-synergy/language-pack'
import { buildLanguageParts } from './buildLanguageParts'
import { PACK_VERSIONS } from './packVersions'
import { partsCode } from './partsCode'
import { maculaIdentity } from '../../cli/maculaIdentity'
import { discoverWith, fakeDoor43, GLT, LANG, lexiconFetch, lexiconFetchOf, LEXICONS_REF, MACULA_STAMP, maculaFolder, reposCopy, UHL, UHL_COMMIT, type CatalogOverrides } from './partsFixture'
import { IMMUTABLE, memoryBucket, type PackBucket } from './publishLanguage'
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

type Fixture = {
  repos?: Record<string, Record<string, string>>
  catalog?: CatalogOverrides
  fail?: (repo: string) => Error | undefined
  lexiconFetch?: typeof lexiconFetch
}

/** The real parts build, over the fixture's Door43 (changed by `f`) instead of the real one. */
function fixtureBuild(f: Fixture = {}): typeof buildLanguageParts {
  return (o) =>
    buildLanguageParts({
      ...o,
      fetch: f.lexiconFetch ?? lexiconFetch,
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
    expect(result.parts).toEqual({ language: list.parts.length, originals: bucket.json<PartsList>(ORIGINALS_LATEST)!.parts.length, put: shas.size, present: 0, refreshed: 0 })
    expect(result.units.carried).toBe(0)
    expect(result.units.built).toBe(list.units!.length)
    expect(result.failures).toBe(0)
    expect(result.compat).toBe(COMPAT)
    // The code the lists were built with, as published: what the workflow records in the ok status.
    expect(result.code).toBe(list.code)
    expect(result.code).toBe(await partsCode())

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
    expect(result.code).toBe(bucket.json<PartsList>(LANGUAGE_LIST)!.code)
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
    const { run, workDir } = publish(undefined, { noUpload: true })
    const result = await run
    expect(result.outcome).toBe('built')
    expect(result.code).toBe(JSON.parse(readFileSync(join(workDir, LANGUAGE_LIST), 'utf8')).code)
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

// The Worker's cleanup deletes a part no list has named for 30 days whose R2 upload is 30 days old too (delivery 3
// Task 8). A run refreshes the old parts its lists name and asks R2 again for every part it did not put before writing
// a list, so a part the cleanup takes in the meantime fails the run instead of being named.
describe('publish against the cleanup', () => {
  const DAY = 86_400_000

  /** A bucket after one publish, both on a clock the test moves. */
  async function publishedAt() {
    const clock = { now: new Date('2026-07-01T00:00:00Z') }
    const bucket = memoryBucket({}, { now: () => clock.now })
    await publish(bucket, { now: () => clock.now }).run
    const later = (days: number) => (clock.now = new Date(clock.now.getTime() + days * DAY))
    return { bucket, clock, later, shas: [...new Set(namedParts(bucket))] }
  }

  /** The bucket, counting the reads that bypass nothing: each stat and each download. */
  function watched(inner: ReturnType<typeof memoryBucket>, vanish: (key: string, asked: number) => boolean = () => false) {
    const stats = new Map<string, number>()
    const gets: string[] = []
    const bucket: PackBucket = {
      ...inner,
      async stat(key) {
        const asked = (stats.get(key) ?? 0) + 1
        stats.set(key, asked)
        return vanish(key, asked) ? null : inner.stat(key)
      },
      async getBytes(key) {
        gets.push(key)
        return inner.getBytes(key)
      },
    }
    return { bucket, stats, gets }
  }

  test('a part R2 wrote more than 20 days ago is put again with the same bytes; a carried one is read back from the bucket', async () => {
    const { bucket, clock, later, shas } = await publishedAt()
    const bytes = new Map(shas.map((sha) => [sha, bucket.bytes(partPath(sha))]))
    later(21)
    const before = bucket.puts.length
    const w = watched(bucket)

    const result = await publish(w.bucket, { now: () => clock.now }).run

    // Every unit carried: none of the parts is in the work folder, so each comes from the bucket.
    expect(result.units.built).toBe(0)
    expect(result.outcome).toBe('unchanged')
    expect(result.parts).toMatchObject({ put: 0, present: shas.length, refreshed: shas.length })
    expect(new Set(w.gets)).toEqual(new Set(shas.map(partPath)))
    const refreshed = bucket.puts.slice(before)
    expect(refreshed.map((p) => p.key).sort()).toEqual(shas.map(partPath).sort())
    for (const p of refreshed) expect(`${p.contentType} | ${p.cacheControl}`).toBe('application/gzip | public, max-age=31536000, immutable')
    for (const sha of shas) {
      expect(bucket.bytes(partPath(sha))).toEqual(bytes.get(sha)!)
      expect(await bucket.stat(partPath(sha))).toEqual({ uploaded: clock.now })
    }
  })

  test('a part 20 days old is left alone, and nothing is put', async () => {
    const { bucket, clock, later } = await publishedAt()
    later(20)
    const before = bucket.puts.length

    const result = await publish(bucket, { now: () => clock.now }).run

    expect(result.outcome).toBe('unchanged')
    expect(result.parts.refreshed).toBe(0)
    expect(bucket.puts.length).toBe(before)
  })

  test('an old part this run built is put again from the work folder, and the old originals address too', async () => {
    const { bucket, clock, later, shas } = await publishedAt()
    const originalsPath = bucket.json<PartsList>(LANGUAGE_LIST)!.originals!.path
    later(21)
    const before = bucket.puts.length
    const w = watched(bucket)

    const { run, workDir } = publish(w.bucket, { now: () => clock.now, force: true })
    const result = await run

    expect(result.units.carried).toBe(0)
    expect(result.parts).toMatchObject({ put: 0, present: shas.length, refreshed: shas.length })
    expect(w.gets).toEqual([])
    const sha = shas[0]
    expect(bucket.bytes(partPath(sha))).toEqual(new Uint8Array(readFileSync(join(workDir, partPath(sha)))))
    expect(keysOf(bucket).slice(before)).toContain(originalsPath)
    expect(await bucket.stat(originalsPath)).toEqual({ uploaded: clock.now })
    expect(keysOf(bucket).at(-1)).toBe(LANGUAGE_LIST)
  })

  test('a carried part whose bytes in the bucket are not the ones its name says: refused, and not put again; force mends it', async () => {
    const { bucket, clock, later, shas } = await publishedAt()
    await bucket.put(partPath(shas[0]), new Uint8Array([31, 139, 8, 0]), { contentType: 'application/gzip', cacheControl: IMMUTABLE })
    later(21)
    const before = bucket.puts.length

    const refused = publish(bucket, { now: () => clock.now }).run
    await expect(refused).rejects.toThrow(`${partPath(shas[0])} in the bucket is not the part its name says`)
    await expect(refused).rejects.toThrow('run again with force, which builds its unit and puts its own bytes over this object')

    expect(keysOf(bucket).slice(before)).not.toContain(partPath(shas[0]))

    // What the message says to do: a forced run builds the unit and puts its own bytes over the bad object.
    const { run, workDir } = publish(bucket, { now: () => clock.now, force: true })
    await run
    expect(bucket.bytes(partPath(shas[0]))).toEqual(new Uint8Array(readFileSync(join(workDir, partPath(shas[0])))))
  })

  test('an old part whose file in the work folder is not the one its name says: refused, and the good object in the bucket is not put over', async () => {
    const { bucket, clock, later, shas } = await publishedAt()
    const good = bucket.bytes(partPath(shas[0]))
    later(21)
    const before = bucket.puts.length
    // The build writes the part, then something spoils the file before the upload reads it.
    const spoiling: typeof buildLanguageParts = async (o) => {
      const built = await fixtureBuild()(o)
      writeFileSync(join(o.workDir, partPath(shas[0])), new Uint8Array([31, 139, 8, 0]))
      return built
    }

    const { run, workDir } = publish(bucket, { now: () => clock.now, force: true, build: spoiling })
    await expect(run).rejects.toThrow(`${join(workDir, partPath(shas[0]))} is not the part its name says`)
    await expect(run).rejects.toThrow('delete that file and run again')

    expect(keysOf(bucket).slice(before)).not.toContain(partPath(shas[0]))
    expect(bucket.bytes(partPath(shas[0]))).toEqual(good)
    expect(catalogKeys(bucket).length).toBe(catalogKeys({ puts: bucket.puts.slice(0, before) }).length)
  })

  test('before the lists, R2 is asked again for every part the run found there and for the originals address', async () => {
    const { bucket, clock, later, shas } = await publishedAt()
    const originalsPath = bucket.json<PartsList>(LANGUAGE_LIST)!.originals!.path
    later(1)
    const w = watched(bucket)

    const result = await publish(w.bucket, { now: () => clock.now, fixture: { catalog: { tags: { [GLT]: 'v13' } } } }).run

    expect(result.outcome).toBe('published')
    // Once for the build and the upload (one answer, kept), once more right before the lists.
    for (const sha of shas) expect(w.stats.get(partPath(sha))).toBe(2)
    expect(w.stats.get(originalsPath)).toBe(2)
  })

  test('a part gone when asked again: the run fails and the language list stays the earlier one', async () => {
    const { bucket, clock, shas } = await publishedAt()
    const listText = bucket.text(LANGUAGE_LIST)
    const gone = partPath(shas[0])
    const w = watched(bucket, (key, asked) => key === gone && asked > 1)

    await expect(publish(w.bucket, { now: () => clock.now, fixture: { catalog: { tags: { [GLT]: 'v13' } } } }).run).rejects.toThrow(`Not publishing ${LANG}: 1 parts vanished while publishing (${gone})`)

    expect(bucket.text(LANGUAGE_LIST)).toBe(listText)
  })

  test('the originals address gone when asked again: the run fails before originals.json and the language list', async () => {
    const { bucket, clock } = await publishedAt()
    const originalsPath = bucket.json<PartsList>(LANGUAGE_LIST)!.originals!.path
    const before = bucket.puts.length
    const w = watched(bucket, (key, asked) => key === originalsPath && asked > 1)

    await expect(publish(w.bucket, { now: () => clock.now, fixture: { catalog: { tags: { [GLT]: 'v13' } } } }).run).rejects.toThrow('1 parts vanished while publishing')

    expect(catalogKeys({ puts: bucket.puts.slice(before) })).toEqual([])
  })

  test('an unchanged run whose part is gone when asked again fails too: it must not end ok', async () => {
    const { bucket, clock, shas } = await publishedAt()
    const w = watched(bucket, (key, asked) => key === partPath(shas.at(-1)!) && asked > 1)

    await expect(publish(w.bucket, { now: () => clock.now }).run).rejects.toThrow('1 parts vanished while publishing')
  })
})

// The dates in the stamps as the Worker computes them from GitHub and Door43 (delivery 3), from the strings git and
// Door43 give, offsets included.
describe('the dates in the stamps', () => {
  test("MACULA's %cI with an offset is stamped in UTC; a lexicon commit without `created` is dated by its committer, offset kept", async () => {
    // Taller's MACULA committed at 02:00 in UTC+2, as `git log --format=%cI` prints it.
    const folder = maculaFolder(freshDir('macula-git'))
    const date = '2026-08-01T02:00:00+02:00'
    const git = (args: string[]) => {
      const env = { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
      const out = spawnSync('git', ['-c', 'user.name=t', '-c', 'user.email=t@t', '-c', 'commit.gpgsign=false', ...args], { cwd: folder, env, encoding: 'utf8' })
      if (out.status !== 0) throw new Error(out.stderr)
    }
    git(['init', '-q'])
    git(['add', '.'])
    git(['commit', '-q', '-m', 'MACULA'])
    const macula = maculaIdentity(folder, {})
    expect(macula.date).toBe(date)

    // Door43's commit with no `created`: the date is the committer's, as Door43 wrote it.
    const lexiconCommit = { sha: UHL_COMMIT.sha, commit: { committer: { date: '2026-07-01T02:00:00+02:00' } } }
    const { run, workDir } = publish(undefined, { noUpload: true, macula: { folder, ...macula }, fixture: { lexiconFetch: lexiconFetchOf({ commit: lexiconCommit }) } })
    const result = await run
    expect(result.failures).toBe(0)

    const list = JSON.parse(readFileSync(join(workDir, LANGUAGE_LIST), 'utf8')) as PartsList
    const maculaStamp = `${macula.commit.slice(0, 10)}#2026-08-01T00_00_00.000Z`
    expect(list.stamps?.['Biblica/hbo/macula']).toBe(maculaStamp)
    expect(list.stamps?.['Biblica/el-x-koine/macula']).toBe(maculaStamp)
    expect(list.stamps?.[UHL]).toBe('0123456789#2026-07-01T02_00_00+02_00')
  })
})
