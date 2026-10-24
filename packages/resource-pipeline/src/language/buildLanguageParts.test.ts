import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'bun:test'
import { mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { compatKeyOf, gitBlobSha, originalsListPath, PARTS_FORMAT_VERSION, partsListPath, readPart, sha256Hex, stripVolatile } from '@bt-synergy/language-pack'
import { runDownload } from '../download/runDownload'
import { buildLanguageParts, PARTS_REPORT, slotRows, UNPLACED_LISTED, type PartsReport } from './buildLanguageParts'
import { closeAndDelete } from './fakeDatabases'
import { PACK_VERSIONS } from './packVersions'
import { partsCode } from './partsCode'
import {
  catalogRows,
  discover,
  discoverWith,
  fakeDoor43,
  GLT,
  GST,
  LANG,
  lexiconFetch,
  LEXICONS_REF,
  MACULA_STAMP,
  maculaFolder,
  REPOS,
  TA,
  TN,
  TQ,
  TW,
  TWL,
  UGNT,
  UHB,
  UHL,
} from './partsFixture'

// The whole build and the parts build of this fixture are compared row by row in compareParts.test.ts, the whole
// one through prepareAndPack itself.

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function freshDir(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`))
  dirs.push(dir)
  return dir
}

async function build(workDir: string, extra: Partial<Parameters<typeof buildLanguageParts>[0]> & { door43?: ReturnType<typeof fakeDoor43> } = {}) {
  const { door43 = fakeDoor43(), ...rest } = extra
  const lines: string[] = []
  const result = await buildLanguageParts({
    language: LANG,
    workDir,
    macula: { folder: maculaFolder(freshDir('macula')), ...MACULA_STAMP },
    lexiconsRef: LEXICONS_REF,
    fetch: lexiconFetch,
    door43Client: door43 as never,
    discover,
    log: (line) => lines.push(line),
    ...rest,
  })
  return { ...result, door43, lines }
}

const slots = (parts: Array<{ kind: string; resource: string; book?: string; group?: string }>) =>
  parts.map((p) => [p.kind, p.resource, p.book ?? '', p.group ?? ''].filter(Boolean).join(' ')).sort()

const reportOf = (workDir: string) => JSON.parse(readFileSync(join(workDir, PARTS_REPORT), 'utf8')) as PartsReport
const partsDatabases = async () => (await indexedDB.databases()).map((d) => d.name ?? '').filter((n) => n.startsWith('parts-'))
const MB = 1024 * 1024

describe('buildLanguageParts', () => {
  test('writes one part per slot, one book at a time, and nothing for a book no resource has', async () => {
    const workDir = freshDir('parts')
    const { list, originals, failures, summary, units, door43, lines } = await build(workDir)

    expect(failures).toEqual([])
    // Each zip downloaded once for the whole run, however many units read it.
    expect(new Set(door43.downloads).size).toBe(door43.downloads.length)
    // The canon in order, then the front matter only the ULT-like text has.
    expect(units.map((u) => u.unit)).toEqual(['shared', 'book rut', 'book jon', 'book tit', 'book frt'])
    for (const u of units) expect(lines.some((l) => l.endsWith(`${u.unit}: start`))).toBe(true)

    const languageSlots = slots(list.parts)
    for (const book of ['rut', 'jon']) {
      for (const r of [GLT, GST, TN, TQ, TWL]) expect(languageSlots).toContain(`book ${r} ${book}`)
      for (const r of [TN, TWL]) expect(languageSlots).toContain(`alignments ${r} ${book}`)
    }
    expect(languageSlots).toContain(`book ${GLT} frt`)
    for (const r of [TW, TA]) expect(languageSlots).toContain(`titles ${r}`)
    expect(languageSlots.filter((s) => s.startsWith(`tw ${TW} `)).length).toBeGreaterThan(0)
    expect(languageSlots.filter((s) => s.startsWith(`ta ${TA} `)).length).toBeGreaterThan(0)
    expect(languageSlots.filter((s) => s.includes(UHL)).length).toBeGreaterThan(0)
    // Genesis is in GST's catalog but not in its release: no unit, no part, and GST's row no longer lists it.
    expect(languageSlots.some((s) => s.includes(' gen'))).toBe(false)
    const gst = list.resources.find((r) => r.key === GST)!
    expect(gst.books).toEqual(['jon', 'rut'])
    expect((gst.metadata as any).contentMetadata.ingredients.map((i: any) => i.identifier)).toEqual(['rut', 'jon'])
    expect(Object.keys((gst.metadata as any).contentMetadata.bookBlobs).sort()).toEqual(['jon', 'rut'])
    expect(list.resources.find((r) => r.key === GLT)!.books).toEqual(['frt', 'jon', 'rut'])

    expect(slots(originals.parts)).toEqual([
      'macula Biblica/el-x-koine/macula tit',
      'macula Biblica/hbo/macula rut',
      `original ${UGNT} tit`,
      `original ${UHB} jon`,
      `original ${UHB} rut`,
    ])
    expect(originals.resources.map((r) => r.key).sort()).toEqual(['Biblica/el-x-koine/macula', 'Biblica/hbo/macula', UGNT, UHB])

    // The jobs of each book ran: quotes and alignments of the helps, prepared rows of every text.
    const tnRuth = list.parts.find((p) => p.kind === 'book' && p.resource === TN && p.book === 'rut')!
    expect(tnRuth.layers).toEqual(['sot', 'prepared', 'quote'])
    const rows = await readPart(new Uint8Array(readFileSync(join(workDir, 'parts', `${tnRuth.sha256}.part.gz`))))
    expect(rows.every((r) => r.key.toLowerCase().includes('rut'))).toBe(true)
    expect(summary['book rut'].built).toBeGreaterThan(0)
    expect(summary['book rut'].failed).toBe(0)

    // The lists on disk, where the CLI says they are.
    const compat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
    expect(list.compat).toBe(compat)
    // The code every fingerprint is made with: what a reader recomputes them with.
    expect(list.code).toBe(await partsCode())
    expect(originals.code).toBe(list.code)
    expect(JSON.parse(readFileSync(join(workDir, partsListPath(compat, LANG)), 'utf8')).parts.length).toBe(list.parts.length)
    // The originals list at its content address too, named by the language list (another language's run cannot
    // overwrite it), and the same text as `originals.json`.
    const originalsText = readFileSync(join(workDir, partsListPath(compat, 'originals')), 'utf8')
    const sha = await sha256Hex(new TextEncoder().encode(originalsText))
    expect(list.originals).toEqual({ path: originalsListPath(compat, sha), sha256: sha })
    expect(readFileSync(join(workDir, originalsListPath(compat, sha)), 'utf8')).toBe(originalsText)
    const onDisk = readdirSync(join(workDir, 'parts')).sort()
    expect(onDisk).toEqual([...new Set([...list.parts, ...originals.parts].map((p) => `${p.sha256}.part.gz`))].sort())

    // The report: every unit's own peak, time and jobs; and no database left behind.
    const report = reportOf(workDir)
    expect(report.state).toBe('done')
    expect(report.units.map((u) => u.unit)).toEqual(units.map((u) => u.unit))
    expect(report.units.every((u) => u.peakRssMb > 0 && u.seconds >= 0 && u.failures === 0)).toBe(true)
    expect(report.units.find((u) => u.unit === 'book rut')!.jobs.built).toBe(summary['book rut'].built)
    expect(await partsDatabases()).toEqual([])
  }, 120_000)

  test('two builds of the same inputs give the same lists and the same part files', async () => {
    const a = freshDir('parts-a')
    const b = freshDir('parts-b')
    await build(a)
    await new Promise((r) => setTimeout(r, 1100))
    await build(b)
    const compat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
    for (const language of [LANG, 'originals']) {
      const path = partsListPath(compat, language)
      expect(readFileSync(join(b, path), 'utf8')).toBe(readFileSync(join(a, path), 'utf8'))
    }
    expect(readdirSync(join(b, 'parts')).sort()).toEqual(readdirSync(join(a, 'parts')).sort())
  }, 120_000)
})

const HEX64 = /^[0-9a-f]{64}$/

/** Door43 resources the fixture's build reads, each checked against its tree: 9 zips (OBS off) and the lexicon. */
const TREE_CHECKED = 10

describe('fingerprints', () => {
  test('every part and every unit has a fingerprint, and the report counts the tree checks', async () => {
    const workDir = freshDir('parts-fp')
    const { list, originals, units, failures, door43 } = await build(workDir)
    expect(failures).toEqual([])
    for (const p of [...list.parts, ...originals.parts]) expect(p.fingerprint).toMatch(HEX64)
    // One unit per unit built, the shared one included, each with its own fingerprint.
    expect(list.units?.map((u) => u.id)).toEqual(units.map((u) => u.unit).sort())
    for (const u of list.units ?? []) expect(u.fingerprint).toMatch(HEX64)
    expect(new Set(list.units?.map((u) => u.fingerprint)).size).toBe(units.length)
    // Different parts read different files.
    const tn = (book: string) => list.parts.find((p) => p.kind === 'book' && p.resource === TN && p.book === book)!.fingerprint
    expect(tn('rut')).not.toBe(tn('jon'))
    expect(reportOf(workDir).treeChecks).toEqual({ match: TREE_CHECKED, mismatch: 0, unverified: 0 })
    // Each tree asked at the ref the zip was read at.
    expect(door43.trees).toContain('test_gl/es-419_tn@v12')
    expect(door43.trees).toContain('unfoldingWord/hbo_uhb@v2.1.30')
    // The lexicon's at the commit its archive was read at.
    expect(door43.trees).toContain('test_gl/es-419_uhl@0123456789abcdef0123456789abcdef01234567')
  }, 120_000)

  test("without Door43's tree, the book blobs still come from the zips' bytes, and every check is unverified", async () => {
    const door43 = fakeDoor43({
      tree: () => {
        throw new Error('Door43 answered 500')
      },
    })
    const workDir = freshDir('parts-no-tree')
    const { list, originals, failures } = await build(workDir, { door43 })
    expect(failures).toEqual([])
    const blobsOf = (key: string) => ([...list.resources, ...originals.resources].find((r) => r.key === key)!.metadata as any).contentMetadata
    const sha = (repo: string, path: string) => gitBlobSha(new TextEncoder().encode(REPOS[repo][path]))
    expect(blobsOf(TN).bookBlobs).toEqual({ rut: await sha('test_gl/es-419_tn', 'tn_RUT.tsv'), jon: await sha('test_gl/es-419_tn', 'tn_JON.tsv') })
    expect(blobsOf(TN).bookBlobsRef).toBe('v12')
    expect(blobsOf(UHB).bookBlobs.rut).toBe(await sha('unfoldingWord/hbo_uhb', '08-RUT.usfm'))
    expect(reportOf(workDir).treeChecks).toEqual({ match: 0, mismatch: 0, unverified: TREE_CHECKED })
  }, 120_000)

  test("a tree with another sha for one file is a failure of the catalog naming the resource and the path", async () => {
    const door43 = fakeDoor43({
      tree: (repo, truth) =>
        repo === 'test_gl/es-419_twl' ? { ...truth, blobs: new Map([...truth.blobs, ['twl_RUT.tsv', 'f'.repeat(40)]]) } : truth,
    })
    const workDir = freshDir('parts-tree-differs')
    const { failures } = await build(workDir, { door43 })
    expect(failures).toEqual([
      { unit: 'catalog', error: `${TWL}: its files differ from Door43's tree at v12, so the Worker would compute other fingerprints: twl_RUT.tsv` },
    ])
    expect(reportOf(workDir).treeChecks).toEqual({ match: TREE_CHECKED - 1, mismatch: 1, unverified: 0 })
  }, 120_000)

  test("a book whose stamp would be the release's, not its file's, is a failure of its unit", async () => {
    // The loader finds `tn_RUT.tsv` for `./RUT.tsv` (it matches the end of a path), but no file has that path, so
    // the book has no blob and its quote keys would carry the release stamp, which no input of the part carries.
    const edit = (r: { resourceKey: string; contentMetadata: { ingredients: Array<{ identifier: string; path: string }> } }) => {
      if (r.resourceKey === TN) r.contentMetadata.ingredients[0].path = './RUT.tsv'
    }
    const { failures } = await build(freshDir('parts-release-stamp'), { discover: discoverWith({ edit: edit as never }) })
    expect(failures).toEqual([
      { unit: 'book rut', error: expect.stringContaining(`${TN}: the rut rows would carry its release stamp (v12#`) },
    ])
  }, 120_000)
})

describe('memory', () => {
  test('a unit over the memory limit stops the build, naming the unit, and leaves no database and a report', async () => {
    const workDir = freshDir('parts-limit')
    await expect(build(workDir, { memoryLimitMb: 1 })).rejects.toThrow(/^shared used \d+ MB, over the 1 MB limit$/)
    expect(await partsDatabases()).toEqual([])
    const report = reportOf(workDir)
    expect(report.state).toBe('failed')
    expect(report.error).toMatch(/^shared used/)
    expect(report.units.map((u) => [u.unit, u.stopped?.startsWith('shared used')])).toEqual([['shared', true]])
  }, 120_000)

  test('memory that grows within a unit stops it there, before the next unit starts', async () => {
    const workDir = freshDir('parts-grow')
    const lines: string[] = []
    // Low until Ruth starts, then far over: the limit is crossed inside that unit, not between units.
    const rss = () => (lines.some((l) => l.endsWith('book rut: start')) ? 9000 : 100) * MB
    await expect(build(workDir, { memoryLimitMb: 1000, rss, memorySampleMs: 5, log: (l) => lines.push(l) })).rejects.toThrow(
      'book rut used 9000 MB, over the 1000 MB limit'
    )
    expect(lines.some((l) => l.includes('book jon: start'))).toBe(false)
    const report = reportOf(workDir)
    expect(report.state).toBe('failed')
    expect(report.units.map((u) => [u.unit, u.startRssMb, u.peakRssMb])).toEqual([
      ['shared', 100, 100],
      ['book rut', 9000, 9000],
    ])
    expect(await partsDatabases()).toEqual([])
  }, 120_000)

  test('databases a stopped run left are deleted before the build opens its own', async () => {
    const left = new IndexedDBCacheAdapter({ dbName: 'parts-book-zzz', storeName: 'cache-entries', version: 1 })
    await left.set('stale', { data: 1 } as never)
    await left.close()
    expect(await partsDatabases()).toContain('parts-book-zzz')
    const { failures } = await build(freshDir('parts-leftover'))
    expect(failures).toEqual([])
    expect(await partsDatabases()).toEqual([])
  }, 120_000)
})

describe('failures are listed, and the build goes on', () => {
  const bad = (status: number) => new Error(`Door43 answered ${status}`)

  test('a release zip that fails twice is tried again after 2 s and 4 s', async () => {
    const waits: number[] = []
    const door43 = fakeDoor43({ fail: (repo, attempt) => (repo === 'test_gl/es-419_tn' && attempt <= 2 ? bad(502) : undefined) })
    const { failures, list } = await build(freshDir('parts-retry'), { door43, wait: async (ms) => void waits.push(ms) })
    expect(failures).toEqual([])
    expect(waits).toEqual([2000, 4000])
    expect(slots(list.parts)).toContain(`book ${TN} rut`)
  }, 120_000)

  test('a release zip that never comes leaves that resource out, with a failure, and builds the rest', async () => {
    const waits: number[] = []
    const door43 = fakeDoor43({ fail: (repo) => (repo === 'test_gl/es-419_tn' ? bad(503) : undefined) })
    const { failures, list } = await build(freshDir('parts-no-zip'), { door43, wait: async (ms) => void waits.push(ms) })
    expect(waits).toEqual([2000, 4000, 8000])
    expect(failures).toEqual([{ unit: 'catalog', error: `${TN}: its release zip did not download after 4 tries, so it is left out: Door43 answered 503` }])
    expect(list.parts.some((p) => p.resource === TN)).toBe(false)
    expect(slots(list.parts)).toContain(`book ${GLT} rut`)
  }, 120_000)

  test('an original whose zip never comes is left out: the parts that would quote it are fingerprinted without it', async () => {
    const door43 = fakeDoor43({ fail: (repo) => (repo === 'unfoldingWord/hbo_uhb' ? bad(503) : undefined) })
    const { failures, list, originals } = await build(freshDir('parts-no-uhb'), { door43, wait: async () => {} })
    expect(failures).toContainEqual({ unit: 'catalog', error: `${UHB}: its release zip did not download after 4 tries, so it is left out: Door43 answered 503` })
    expect(failures).toContainEqual({ unit: 'originals', error: `${UHB}: no parts` })
    expect(originals.parts.some((p) => p.resource === UHB)).toBe(false)
    for (const p of list.parts) expect(p.fingerprint).toMatch(HEX64)
    expect(slots(list.parts)).toContain(`book ${TN} rut`)
  }, 120_000)

  test("a shared resource's zip that never comes is a failure of the catalog with Door43's error, and the rest is built", async () => {
    // Its zip is read in the catalog step now, for its files' blob shas, and the shared unit reads the same bytes.
    const door43 = fakeDoor43({ fail: (repo) => (repo === 'test_gl/es-419_ta' ? bad(500) : undefined) })
    const { failures, list } = await build(freshDir('parts-ta'), { door43, wait: async () => {} })
    expect(failures).toEqual([{ unit: 'catalog', error: `${TA}: its release zip did not download after 4 tries, so it is left out: Door43 answered 500` }])
    expect(list.parts.some((p) => p.resource === TA)).toBe(false)
    expect(slots(list.parts)).toContain(`titles ${TW}`)
  }, 120_000)

  test('rows with no part are failures of their unit, listed up to a limit, and the others are placed', () => {
    const out = new Map()
    const unplaced = { listed: [] as Array<{ unit: string; error: string }>, more: 0 }
    const strays = Array.from({ length: UNPLACED_LISTED + 3 }, (_, i) => ({ key: `${TN}/manifest-${i}`, entry: {} }))
    slotRows({
      unit: 'book rut',
      resource: { key: TN, type: 'notes', subject: 'TSV Translation Notes' },
      byLayer: [['sot', [{ key: `tn:${TN}:rut:1`, entry: {} }, ...strays]]],
      where: (s) => s.book === 'rut',
      out,
      unplaced,
    })
    expect(unplaced.listed.length).toBe(UNPLACED_LISTED)
    expect(unplaced.more).toBe(3)
    expect(unplaced.listed[0]).toEqual({ unit: 'book rut', error: `No part for the sot row ${TN}/manifest-0 of ${TN}` })
    expect([...out.keys()].length).toBe(1)
  })

  test("a row of another unit's part is a failure too, not a stop", () => {
    const unplaced = { listed: [] as Array<{ unit: string; error: string }>, more: 0 }
    slotRows({
      unit: 'book jon',
      resource: { key: TN, type: 'notes', subject: 'TSV Translation Notes' },
      byLayer: [['sot', [{ key: `tn:${TN}:rut:1`, entry: {} }]]],
      where: (s) => s.book === 'jon',
      out: new Map(),
      unplaced,
    })
    expect(unplaced.listed.map((f) => f.error)).toEqual([expect.stringContaining("another unit's part")])
  })
})

describe('one book downloaded alone', () => {
  test('gives the same rows of that book as the whole download', async () => {
    const door43 = fakeDoor43()
    const rows = new Map<string, unknown>(catalogRows().map((r) => [r.resourceKey, r]))
    // Writes are dropped, so both downloads read the same catalog rows.
    const catalogAdapter = {
      get: async (k: string) => structuredClone(rows.get(k) ?? null),
      set: async () => {},
      delete: async () => {},
      has: async (k: string) => rows.has(k),
      getAll: async () => [...rows.keys()],
      clear: async () => {},
    }
    const rowsOf = async (name: string, books?: string[]) => {
      const cache = new IndexedDBCacheAdapter({ dbName: name, storeName: 'cache-entries', version: 1 })
      await runDownload({
        resourceKeys: [GLT, TN, TQ],
        skipExisting: true,
        ...(books ? { books } : {}),
        runId: 1,
        post: () => {},
        isCurrentRun: () => true,
        cacheAdapter: cache as never,
        catalogAdapter: catalogAdapter as never,
        door43Client: door43,
      })
      const ruth = (await cache.getByPrefix('')).filter((r) => /:rut\b/i.test(r.key))
      await closeAndDelete([cache], [name])
      return ruth.map((r) => ({ key: r.key, entry: stripVolatile(r.entry) })).sort((x, y) => (x.key < y.key ? -1 : 1))
    }
    const whole = await rowsOf('whole-download')
    const alone = await rowsOf('ruth-download', ['rut'])
    expect(whole.length).toBeGreaterThan(0)
    expect(alone).toEqual(whole)
  }, 60_000)
})
