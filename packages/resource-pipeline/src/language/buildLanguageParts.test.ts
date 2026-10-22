import 'fake-indexeddb/auto'
import { afterEach, describe, expect, test } from 'bun:test'
import { createHash } from 'node:crypto'
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import {
  buildLanguagePack,
  compatKeyOf,
  ORIGINAL_LANGUAGE_KEYS,
  PART_LAYERS,
  PARTS_FORMAT_VERSION,
  packSourceFrom,
  partsListPath,
  readPart,
  rowsOfResource,
  serializePartsList,
  stableJson,
  stripVolatile,
} from '@bt-synergy/language-pack'
import { addMacula, MACULA_KEYS } from '../../cli/companions'
import { runDownload } from '../download/runDownload'
import { storedZip } from '../download/zipFixture'
import { buildLanguageArtifacts } from './buildLanguageArtifacts'
import { buildLanguageParts, type DiscoverInto } from './buildLanguageParts'
import { closeAndDelete } from './fakeDatabases'
import { PACK_VERSIONS } from './packVersions'

const LANG = 'es-419'
const GLT = 'test_gl/es-419/glt'
const GST = 'test_gl/es-419/gst'
const TN = 'test_gl/es-419/tn'
const TWL = 'test_gl/es-419/twl'
const TW = 'test_gl/es-419/tw'
const UHB = 'unfoldingWord/hbo/uhb'
const UGNT = 'unfoldingWord/el-x-koine/ugnt'

const HEBREW = (book: string) =>
  `\\id ${book}\n\\c 1\n\\p\n\\v 1 \\w וַיְהִי|lemma="הָיָה" strong="H1961" x-morph="He,Vqw3ms"\\w* \\w בִּימֵי|lemma="יוֹם" strong="b:H3117" x-morph="He,R:Ncmpc"\\w*\n\\c 2\n\\p\n\\v 1 \\w וּלְנָעֳמִי|lemma="נָעֳמִי" strong="c:l:H5281" x-morph="He,C:R:Np"\\w*\n`
const GREEK = `\\id TIT\n\\c 1\n\\p\n\\v 1 \\w Παῦλος|lemma="Παῦλος" strong="G39720" x-morph="Gr,N,,,,,NMS,"\\w*\n`
const aligned = (book: string, words: [string, string]) =>
  `\\id ${book}\n\\c 1\n\\p\n\\v 1 \\zaln-s |x-strong="H1961" x-lemma="הָיָה" x-morph="He,Vqw3ms" x-occurrence="1" x-occurrences="1" x-content="וַיְהִי"\\*\\w ${words[0]}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\* \\zaln-s |x-strong="b:H3117" x-lemma="יוֹם" x-morph="He,R:Ncmpc" x-occurrence="1" x-occurrences="1" x-content="בִּימֵי"\\*\\w ${words[1]}|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*\n\\c 2\n\\p\n\\v 1 \\zaln-s |x-strong="c:l:H5281" x-lemma="נָעֳמִי" x-morph="He,C:R:Np" x-occurrence="1" x-occurrences="1" x-content="וּלְנָעֳמִי"\\*\\w Noemí|x-occurrence="1" x-occurrences="1"\\w*\\zaln-e\\*\n`
const TN_HEADER = 'Reference\tID\tTags\tSupportReference\tQuote\tOccurrence\tNote\n'
const TWL_HEADER = 'Reference\tID\tTags\tOrigWords\tOccurrence\tTWLink\n'

// The TW loader trusts a catalog row only with more than ten articles; fewer, it asks Door43 for them.
const EXTRA_TW = ['faith', 'grace', 'love', 'sin', 'holy', 'lord', 'spirit', 'word']

/** Each repository's release zip (top folder `{repo}/`, as Door43 serves it). */
const REPOS: Record<string, Record<string, string>> = {
  'test_gl/es-419_glt': { '08-RUT.usfm': aligned('RUT', ['Sucedió', 'en los días']), '32-JON.usfm': aligned('JON', ['Vino', 'palabra']) },
  'test_gl/es-419_gst': { '08-RUT.usfm': aligned('RUT', ['Pasó', 'cuando']), '32-JON.usfm': aligned('JON', ['Llegó', 'mensaje']) },
  'test_gl/es-419_tn': {
    'tn_RUT.tsv': `${TN_HEADER}1:1\tab12\t\trc://*/ta/man/translate/figs-idiom\tוַיְהִי\t1\tUna nota de Rut\n2:1\tcd34\t\t\tוּלְנָעֳמִי\t1\tNoemí\n`,
    'tn_JON.tsv': `${TN_HEADER}1:1\tef56\t\t\tוַיְהִי\t1\tUna nota de Jonás\n`,
  },
  'test_gl/es-419_twl': {
    'twl_RUT.tsv': `${TWL_HEADER}1:1\tgh78\t\tבִּימֵי\t1\trc://*/tw/dict/bible/other/day\n2:1\tij90\t\tוּלְנָעֳמִי\t1\trc://*/tw/dict/bible/names/naomi\n`,
    'twl_JON.tsv': `${TWL_HEADER}1:1\tkl12\t\tוַיְהִי\t1\trc://*/tw/dict/bible/kt/god\n`,
  },
  'test_gl/es-419_tw': {
    'bible/kt/god.md': '# Dios\n\nEl creador.\n',
    'bible/names/naomi.md': '# Noemí\n\nSuegra de Rut.\n',
    'bible/other/day.md': '# día\n\nUn día.\n',
    ...Object.fromEntries(EXTRA_TW.map((id) => [`bible/kt/${id}.md`, `# ${id}\n\nTérmino ${id}.\n`])),
  },
  'unfoldingWord/hbo_uhb': { '08-RUT.usfm': HEBREW('RUT'), '32-JON.usfm': HEBREW('JON') },
  'unfoldingWord/el-x-koine_ugnt': { '57-TIT.usfm': GREEK },
}

const blobSha = (content: string) => {
  const bytes = Buffer.from(content)
  return createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')
}

function fakeDoor43() {
  const downloads: string[] = []
  return {
    downloads,
    async downloadZipball(owner: string, repo: string, ref: string) {
      downloads.push(`${owner}/${repo}@${ref}`)
      const files = REPOS[`${owner}/${repo}`]
      if (!files) throw new Error(`404 ${owner}/${repo}`)
      return storedZip(Object.fromEntries(Object.entries(files).map(([path, content]) => [`${repo}/${path}`, content])))
    },
    async fetchRepoTreeBlobs(owner: string, repo: string) {
      return new Map(Object.entries(REPOS[`${owner}/${repo}`] ?? {}).map(([path, content]) => [path, blobSha(content)]))
    },
    async fetchRepoTreePaths(owner: string, repo: string) {
      return new Set(Object.keys(REPOS[`${owner}/${repo}`] ?? {}))
    },
  }
}

function row(key: string, subject: string, type: string, ingredients: Array<{ identifier: string; path: string; title?: string }>) {
  const [owner, language, resourceId] = key.split('/')
  const tag = resourceId === 'uhb' || resourceId === 'ugnt' ? 'v2.1.30' : 'v12'
  return {
    resourceKey: key,
    server: 'git.door43.org',
    owner,
    language,
    resourceId,
    subject,
    type,
    title: `${resourceId} (${language})`,
    version: tag,
    format: 'usfm',
    availability: { online: true, offline: false, bundled: false, partial: false },
    locations: [],
    catalogedAt: new Date().toISOString(),
    release: {
      tag_name: tag,
      published_at: '2026-09-01T00:00:00Z',
      zipball_url: `https://git.door43.org/${owner}/${language}_${resourceId}/archive/${tag}.zip`,
    },
    contentMetadata: { ingredients, books: ingredients.map((i) => i.identifier) },
  }
}

const book = (id: string, file: string) => ({ identifier: id, path: `./${file}` })

/** What discovery would have put in the catalog: GST's catalog lists Genesis, which its release lacks. */
const catalogRows = () => [
    row(GLT, 'Aligned Bible', 'scripture', [book('rut', '08-RUT.usfm'), book('jon', '32-JON.usfm')]),
    row(GST, 'Aligned Bible', 'scripture', [book('gen', '01-GEN.usfm'), book('rut', '08-RUT.usfm'), book('jon', '32-JON.usfm')]),
    row(TN, 'TSV Translation Notes', 'notes', [book('rut', 'tn_RUT.tsv'), book('jon', 'tn_JON.tsv')]),
    row(TWL, 'TSV Translation Words Links', 'words-links', [book('rut', 'twl_RUT.tsv'), book('jon', 'twl_JON.tsv')]),
    row(TW, 'Translation Words', 'words', [
      { identifier: 'bible/kt/god', path: './bible/kt/god.md', title: 'Dios' },
      { identifier: 'bible/names/naomi', path: './bible/names/naomi.md', title: 'Noemí' },
      { identifier: 'bible/other/day', path: './bible/other/day.md', title: 'día' },
      ...EXTRA_TW.map((id) => ({ identifier: `bible/kt/${id}`, path: `./bible/kt/${id}.md`, title: id })),
    ]),
    row(UHB, 'Hebrew Old Testament', 'scripture', [book('rut', '08-RUT.usfm'), book('jon', '32-JON.usfm')]),
    row(UGNT, 'Greek New Testament', 'scripture', [book('tit', '57-TIT.usfm')]),
  ]

const discover: DiscoverInto = async ({ catalogManager }) => {
  const rows = catalogRows()
  for (const r of rows) await catalogManager.catalogAdapter.set(r.resourceKey, r as never)
  return { resources: rows.slice(0, 5).map((r) => r.resourceKey), originals: [UHB, UGNT] }
}

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})
function freshDir(name: string) {
  const dir = mkdtempSync(join(tmpdir(), `${name}-`))
  dirs.push(dir)
  return dir
}

function maculaFolder() {
  const dir = freshDir('macula')
  for (const part of ['trees', 'referents']) mkdirSync(join(dir, part))
  writeFileSync(join(dir, 'trees', 'RUT.json'), JSON.stringify({ sentences: ['Rut 1:1'] }))
  writeFileSync(join(dir, 'referents', 'RUT.json'), JSON.stringify({ naomi: ['Rut 2:1'] }))
  writeFileSync(join(dir, 'trees', 'TIT.json'), JSON.stringify({ sentences: ['Tito 1:1'] }))
  return dir
}

async function build(workDir: string, extra: Partial<Parameters<typeof buildLanguageParts>[0]> = {}) {
  const door43 = fakeDoor43()
  const result = await buildLanguageParts({
    language: LANG,
    workDir,
    macula: { folder: maculaFolder(), version: 'abc1234567', publishedAt: '2026-08-01T00:00:00.000Z' },
    door43Client: door43 as never,
    discover,
    ...extra,
  })
  return { ...result, door43 }
}

const slots = (parts: Array<{ kind: string; resource: string; book?: string; group?: string }>) =>
  parts.map((p) => [p.kind, p.resource, p.book ?? '', p.group ?? ''].filter(Boolean).join(' ')).sort()

describe('buildLanguageParts', () => {
  test('writes one part per slot, one book at a time, and nothing for a book no resource has', async () => {
    const workDir = freshDir('parts')
    const { list, originals, failures, summary, units, door43 } = await build(workDir)

    expect(failures).toEqual([])
    // Each zip downloaded once for the whole run, however many units read it.
    expect(new Set(door43.downloads).size).toBe(door43.downloads.length)
    expect(units.map((u) => u.unit)).toEqual(['shared', 'book rut', 'book jon', 'book tit'])

    const languageSlots = slots(list.parts)
    for (const book of ['rut', 'jon']) {
      for (const r of [GLT, GST, TN, TWL]) expect(languageSlots).toContain(`book ${r} ${book}`)
      for (const r of [TN, TWL]) expect(languageSlots).toContain(`alignments ${r} ${book}`)
    }
    expect(languageSlots).toContain(`titles ${TW}`)
    expect(languageSlots.filter((s) => s.startsWith(`tw ${TW} `)).length).toBeGreaterThan(0)
    expect(languageSlots.every((s) => /^(book|alignments|tw|titles) /.test(s))).toBe(true)
    // Genesis is in GST's catalog but not in its release: no unit, no part, and GST's row no longer lists it.
    expect(languageSlots.some((s) => s.includes(' gen'))).toBe(false)
    const gst = list.resources.find((r) => r.key === GST)!
    expect(gst.books).toEqual(['jon', 'rut'])
    expect((gst.metadata as any).contentMetadata.ingredients.map((i: any) => i.identifier)).toEqual(['rut', 'jon'])
    expect(Object.keys((gst.metadata as any).contentMetadata.bookBlobs).sort()).toEqual(['jon', 'rut'])

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
    expect(JSON.parse(readFileSync(join(workDir, partsListPath(compat, LANG)), 'utf8')).parts.length).toBe(list.parts.length)
    expect(list.originals?.path).toBe(partsListPath(compat, 'originals'))
    const onDisk = readdirSync(join(workDir, 'parts')).sort()
    expect(onDisk).toEqual([...new Set([...list.parts, ...originals.parts].map((p) => `${p.sha256}.part.gz`))].sort())
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

  test('a unit over the memory limit stops the build, naming the unit', async () => {
    await expect(build(freshDir('parts-limit'), { memoryLimitMb: 1 })).rejects.toThrow(/^shared used \d+ MB, over the 1 MB limit$/)
  }, 120_000)
})

/**
 * Today's whole build of the fixture, as prepareLanguage and prepareAndPack do it: one database, every resource
 * downloaded whole, the language's and both originals' jobs, MACULA, then the rows each pack carries.
 */
async function wholeBuild(macula: string) {
  const cache = new IndexedDBCacheAdapter({ dbName: 'whole-cache', storeName: 'cache-entries', version: 1 })
  const catalog = new IndexedDBCatalogAdapter({ dbName: 'whole-catalog', storeName: 'catalog-entries', version: 1 })
  const door43 = fakeDoor43()
  const catalogManager = new CatalogManager({ catalogAdapter: catalog, cacheAdapter: cache, door43Client: door43, enableNetworkFallback: true, requireSecureConnection: false } as never)
  const found = await discover({ language: LANG, catalogManager, door43Client: door43 as never })
  await runDownload({
    resourceKeys: [...found.resources, ...found.originals],
    skipExisting: true,
    runId: 1,
    post: () => {},
    isCurrentRun: () => true,
    cacheAdapter: cache as never,
    catalogAdapter: catalog as never,
    door43Client: door43,
  })
  for (const language of [LANG, 'el-x-koine', 'hbo']) {
    await buildLanguageArtifacts({ language, cache: cache as never, catalog: catalogManager as never })
  }
  await addMacula(cache as never, catalog as never, macula, { version: 'abc1234567', publishedAt: '2026-08-01T00:00:00.000Z' })
  const source = packSourceFrom({ cache: cache as never, catalog: catalog as never })
  const languageKeys = (await source.catalogRows()).filter((m) => m.language === LANG).map((m) => m.resourceKey)
  const rows = new Set<string>()
  const metadata: Record<string, unknown> = {}
  for (const params of [
    { kind: 'language' as const, resourceKeys: languageKeys },
    { kind: 'originals' as const, originalKeys: [...ORIGINAL_LANGUAGE_KEYS, ...MACULA_KEYS] },
  ]) {
    const { manifest, skipped } = await buildLanguagePack({ source, language: LANG, versions: PACK_VERSIONS, ...params })
    expect(skipped).toEqual([])
    for (const r of manifest.resources) {
      metadata[r.key] = await catalog.get(r.key)
      for (const [layer, list] of await rowsOfResource(source, r.key, PART_LAYERS)) {
        for (const row of list) rows.add(stableJson({ layer, key: row.key, value: stripVolatile(row.entry) }))
      }
    }
  }
  await closeAndDelete([cache, catalog], ['whole-cache', 'whole-catalog'])
  return { rows, metadata }
}

describe('the parts and the whole build', () => {
  test('carry the same rows, and the same catalog row for each resource', async () => {
    const macula = maculaFolder()
    const whole = await wholeBuild(macula)
    const workDir = freshDir('parts-same')
    const { list, originals } = await build(workDir, { macula: { folder: macula, version: 'abc1234567', publishedAt: '2026-08-01T00:00:00.000Z' } })

    const parted = new Set<string>()
    for (const part of [...list.parts, ...originals.parts]) {
      for (const row of await readPart(new Uint8Array(readFileSync(join(workDir, 'parts', `${part.sha256}.part.gz`))))) {
        const line = stableJson(row)
        expect(parted.has(line)).toBe(false)
        parted.add(line)
      }
    }
    expect(whole.rows.size).toBeGreaterThan(150)
    expect([...parted].filter((r) => !whole.rows.has(r))).toEqual([])
    expect([...whole.rows].filter((r) => !parted.has(r))).toEqual([])

    // Compared as the list writes them, without the catalog's own bookkeeping.
    const asListed = (resources: Array<{ key: string; metadata: unknown }>) =>
      JSON.parse(serializePartsList({ schema: 2, language: LANG, compat: '', versions: {}, parts: [], resources: resources.map((r) => ({ ...r, stamp: '', role: 'language', subject: '', title: '' })) })).resources.map(
        (r: { key: string; metadata: unknown }) => [r.key, r.metadata]
      )
    expect(asListed([...list.resources, ...originals.resources])).toEqual(
      asListed(Object.entries(whole.metadata).map(([key, metadata]) => ({ key, metadata })))
    )
  }, 120_000)
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
        resourceKeys: [GLT, TN],
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
