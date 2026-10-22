/**
 * Build a language as parts (spec §1, §4), one unit of work at a time, each in a database of its own that is deleted
 * when the unit is done: in Node the store is fake-indexeddb, which frees memory only when a database is deleted, so
 * memory follows the largest unit instead of the language.
 *
 * 1. A catalog database kept for the run: discovery's rows, each book-scoped resource's books absent from its release
 *    (from the zip's own file list, pruned as a whole download prunes them) and its book blobs.
 * 2. The shared unit: TW, TA (and OBS) downloaded whole, the lexicons and MACULA, their article jobs and titles.
 * 3. One unit per book any book-scoped resource or original has: that book of each, its receipt written first so the
 *    loaders and jobs find it, then the book's jobs for the language and for the book's original.
 *
 * Every unit's rows are those today's whole pack carries (`rowsOfResource`), placed by `slotOfRow` and written as
 * `parts/<sha256>.part.gz`. Then the language's list and the shared originals list (schema 2). Nothing is uploaded.
 */

import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import {
  compatKeyOf,
  isBookScoped,
  ORIGINAL_LANGUAGE_KEYS,
  PART_LAYERS,
  PARTS_FORMAT_VERSION,
  packSourceFrom,
  partPath,
  partsListPath,
  rowsOfResource,
  serializePartsList,
  slotId,
  slotOfRow,
  writePart,
  type PackLayer,
  type PartEntry,
  type PartRow,
  type PartSlot,
  type PartsList,
  type PartsListResource,
  type PackResourceRole,
} from '@bt-synergy/language-pack'
import {
  buildIngestReceiptFromCatalog,
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  ingredientPresentInPathSet,
  isMatchingIngestReceipt,
  pathSetFromZipFileNames,
  persistAbsentFromRelease,
  presentIngredientCount,
  resourceContentStamp,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { addLexicons, addMacula, lexiconOwnerOf, MACULA_KEYS } from '../../cli/companions'
import { discoverLanguage } from '../discover/discoverLanguage'
import { createHeadlessResourceTypeRegistry } from '../discover/resourceTypeRegistry'
import { recordBlobsAfterComplete } from '../download/recordBlobsAfterComplete'
import { runDownload } from '../download/runDownload'
import { zipCachingClient, zipFileNames } from '../download/zipCache'
import { resolveOriginalLanguageKey } from '../scripture/originalLanguage'
import { CANON_BOOK_ORDER } from '../warm/warmBookOrder'
import { buildLanguageArtifacts, type BuildReport } from './buildLanguageArtifacts'
import { chaptersFromStore } from './chaptersFromStore'
import { isObs, keyOfRow, literalTextOf } from './door43Stamps'
import { closeAndDelete } from './fakeDatabases'
import { PACK_VERSIONS } from './packVersions'

export type UnitSummary = { built: number; cached: number; blocked: number; noop: number; failed: number }

export type PartsFailure = { unit: string; job?: string; error: string }

type Door43Like = {
  downloadZipball(owner: string, repo: string, ref?: string): Promise<ArrayBuffer>
  [method: string]: unknown
}

/** Discovery puts the language's resources and the originals in the catalog; replaced in tests. */
export type DiscoverInto = (o: {
  language: string
  catalogManager: CatalogManager
  door43Client: Door43Like
}) => Promise<{ resources: string[]; originals: string[] }>

const defaultDiscover: DiscoverInto = async ({ language, catalogManager, door43Client }) => {
  const found = await discoverLanguage({
    language,
    door43Client: door43Client as never,
    catalogManager,
    resourceTypeRegistry: createHeadlessResourceTypeRegistry(catalogManager),
  })
  return { resources: found.resources.map((r) => r.resourceKey), originals: found.originals }
}

const DEFAULT_MEMORY_LIMIT_MB = 10_240

const CATALOG_DB = 'parts-catalog'
const DISCOVERY_DB = 'parts-discovery'
const SHARED_DB = 'parts-shared'
const bookDb = (book: string) => `parts-book-${book}`

function cacheAdapterFor(dbName: string) {
  return new IndexedDBCacheAdapter({ dbName, storeName: 'cache-entries', version: 1 })
}

const repoOf = (key: string) => {
  const [owner, language, id] = key.split('/')
  return { owner, repo: `${language}_${id}` }
}

/** The ref the loaders download a release zip at. */
const refOf = (m: ResourceMetadata) => m.release?.tag_name || (m as { default_branch?: string }).default_branch || 'master'

const ingredientBooks = (m: ResourceMetadata): string[] =>
  (m.contentMetadata?.ingredients ?? []).map((i) => String(i.identifier ?? '').toLowerCase()).filter(Boolean)

/** The receipt a whole download would leave: what the loaders and jobs of a book unit look for. */
function receiptOf(m: ResourceMetadata, absent: readonly string[]) {
  const ingredients = m.contentMetadata?.ingredients?.length ?? 0
  const count = presentIngredientCount(ingredients, absent)
  const receipt = buildIngestReceiptFromCatalog(m, {
    ingestSchema: ingestSchemaForResourceType(String(m.type ?? ''), USJ_PROCESSING_VERSION),
    ingredientCount: count,
    downloadMethod: 'zip',
    entryCount: count,
    expectedEntryCount: count,
  })
  if (!receipt) throw new Error(`${keyOfRow(m)} has no release stamp: it cannot be built`)
  return { content: { downloaded: true }, metadata: { ...receipt, ...(absent.length ? { absentFromRelease: [...absent] } : {}) } }
}

/** What `buildLanguagePack` requires to carry a resource: a receipt for the release its catalog row names. */
async function completeHere(cache: { get(key: string): Promise<unknown> }, m: ResourceMetadata): Promise<boolean> {
  const schema = ingestSchemaForResourceType(String(m.type ?? ''), String(PACK_VERSIONS.sot.usjProcessing))
  return isMatchingIngestReceipt(await cache.get(`resource:${keyOfRow(m)}`), expectedIngestReleaseStamp(m), schema)
}

type Collected = { slot: PartSlot; rows: PartRow[] }

export async function buildLanguageParts(o: {
  language: string
  /** Gets `parts/`, `catalog/<compat>/` and `zips/` (the release zips of this run). */
  workDir: string
  /** A folder with Taller's `trees/` and `referents/`, and the stamp MACULA's rows get (its commit and date). */
  macula?: { folder: string; version: string; publishedAt: string }
  /** Read the lexicons from this ref; none leaves them out. */
  lexiconsRef?: string
  /** Open Bible Stories and their helps; left out by default, as the published packs always were. */
  obs?: boolean
  memoryLimitMb?: number
  log?: (line: string) => void
  door43Client?: Door43Like
  discover?: DiscoverInto
  fetch?: (url: string) => Promise<Response>
  /** Resident memory in bytes; `process.memoryUsage().rss` unless a test says otherwise. */
  rss?: () => number
}): Promise<{
  list: PartsList
  originals: PartsList
  summary: Record<string, UnitSummary>
  failures: PartsFailure[]
  units: Array<{ unit: string; rssMb: number; seconds: number; parts: number }>
  peakRssMb: number
}> {
  const language = o.language
  const say = o.log ?? (() => {})
  const obs = o.obs ?? false
  const limit = o.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB
  const rss = o.rss ?? (() => process.memoryUsage().rss)
  const compat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
  const door43 = zipCachingClient(
    (o.door43Client ?? (getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false }) as unknown as Door43Like)) as Door43Like,
    join(o.workDir, 'zips')
  )
  mkdirSync(join(o.workDir, 'parts'), { recursive: true })

  const started = Date.now()
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`
  const summary: Record<string, UnitSummary> = {}
  const failures: PartsFailure[] = []
  const units: Array<{ unit: string; rssMb: number; seconds: number; parts: number }> = []
  let peakRssMb = 0
  const languageParts: PartEntry[] = []
  const originalParts: PartEntry[] = []
  /** Book-scoped resources: the books that gave source rows, as the whole pack's manifest lists them. */
  const booksWithRows = new Map<string, Set<string>>()

  const catalog = new IndexedDBCatalogAdapter({ dbName: CATALOG_DB, storeName: 'catalog-entries', version: 1 })
  const managerOver = (cache: IndexedDBCacheAdapter) =>
    new CatalogManager({ catalogAdapter: catalog, cacheAdapter: cache, door43Client: door43, enableNetworkFallback: true, requireSecureConnection: false } as never)
  const metaOf = async (key: string) => {
    const m = await catalog.get(key)
    if (!m) throw new Error(`${key} is not in the catalog`)
    return m
  }

  function endUnit(unit: string, unitStarted: number, parts: number) {
    const mb = Math.round(rss() / 1024 / 1024)
    peakRssMb = Math.max(peakRssMb, mb)
    const seconds = Math.round((Date.now() - unitStarted) / 100) / 10
    units.push({ unit, rssMb: mb, seconds, parts })
    say(`[${elapsed()}] ${unit}: ${parts} partes, ${mb} MB, ${seconds} s`)
    if (mb > limit) throw new Error(`${unit} used ${mb} MB, over the ${limit} MB limit`)
  }

  function count(unit: string, report: BuildReport, isFailure: (job: string) => boolean = () => false) {
    const s = (summary[unit] ??= { built: 0, cached: 0, blocked: 0, noop: 0, failed: 0 })
    s.built += report.jobs.finished
    s.cached += report.jobs.cached
    s.blocked += report.jobs.blocked
    s.noop += report.jobs.noop
    s.failed += report.jobs.failed
    for (const f of report.failures) failures.push({ unit, job: f.job, error: f.error })
    if (report.jobs.failed > report.failures.length) {
      failures.push({ unit, error: `${report.jobs.failed - report.failures.length} more failed jobs (${report.language})` })
    }
    for (const job of report.incomplete) {
      if (job.outcome !== 'blocked' || !isFailure(job.jobKey)) continue
      // A chapter planned from the store that cannot be prepared is a fault, not a missing input.
      s.blocked -= 1
      s.failed += 1
      failures.push({ unit, job: job.jobKey, error: 'blocked: its source is in the store but could not be prepared' })
    }
  }

  /** The unit's rows of each resource, by part. `where` says which parts this unit may give. */
  async function collect(
    cache: IndexedDBCacheAdapter,
    keys: string[],
    unit: string,
    where: (slot: PartSlot) => boolean
  ): Promise<Map<string, Collected>> {
    const source = packSourceFrom({ cache: cache as never, catalog: catalog as never })
    const out = new Map<string, Collected>()
    for (const key of keys) {
      const m = await metaOf(key)
      const byLayer = await rowsOfResource(source, key, PART_LAYERS)
      for (const [layer, rows] of byLayer) {
        for (const row of rows) {
          const slot = slotOfRow({ layer, key: row.key }, { key, type: String(m.type ?? ''), subject: m.subject })
          if (!slot) continue
          if (!where(slot)) throw new Error(`${unit}: the ${layer} row ${row.key} of ${key} belongs to ${slotId(slot)}, another unit's part`)
          const id = slotId(slot)
          const entry = out.get(id) ?? { slot, rows: [] }
          entry.rows.push({ layer: layer as PackLayer, key: row.key, value: row.entry })
          out.set(id, entry)
          if (layer === 'sot' && slot.book && (slot.kind === 'book' || slot.kind === 'original')) {
            const books = booksWithRows.get(key) ?? new Set<string>()
            books.add(slot.book)
            booksWithRows.set(key, books)
          }
        }
      }
    }
    return out
  }

  async function writeParts(collected: Map<string, Collected>): Promise<number> {
    for (const { slot, rows } of collected.values()) {
      const { bytes, sha256, rows: n } = await writePart(rows)
      const file = join(o.workDir, partPath(sha256))
      if (!existsSync(file)) writeFileSync(file, bytes)
      const layers = PART_LAYERS.filter((l) => rows.some((r) => r.layer === l))
      const entry: PartEntry = { sha256, bytes: bytes.length, rows: n, ...slot, layers }
      const shared = slot.kind === 'original' || slot.kind === 'macula'
      ;(shared ? originalParts : languageParts).push(entry)
    }
    return collected.size
  }

  // 1. The catalog.
  say(`[${elapsed()}] Buscando los recursos de ${language} en Door43…`)
  const discoveryCache = cacheAdapterFor(DISCOVERY_DB)
  const found = await (o.discover ?? defaultDiscover)({ language, catalogManager: managerOver(discoveryCache), door43Client: door43 })
  await closeAndDelete([discoveryCache], [DISCOVERY_DB], say)

  const languageKeys: string[] = []
  for (const key of (await catalog.getAll()).sort()) {
    const m = await metaOf(key)
    if (m.language === language && (obs || !isObs(m))) languageKeys.push(key)
  }
  const originalKeys = ORIGINAL_LANGUAGE_KEYS.filter((k) => found.originals.includes(k))
  const bookScoped = new Set<string>()
  for (const key of [...languageKeys, ...originalKeys]) {
    if (isBookScoped(await metaOf(key) as never)) bookScoped.add(key)
  }

  // Books absent from a release are decided by the zip the loaders read, so both builds leave out the same books.
  const absentOf = new Map<string, string[]>()
  for (const key of bookScoped) {
    const m = await metaOf(key)
    if (m.release?.zipball_url) {
      const { owner, repo } = repoOf(key)
      const names = zipFileNames(await door43.downloadZipball(owner, repo, refOf(m)))
      if (!names) throw new Error(`${key}: its release zip cannot be read`)
      const paths = pathSetFromZipFileNames(names)
      const absent = (m.contentMetadata?.ingredients ?? [])
        .filter((i) => i.identifier && !ingredientPresentInPathSet(i, paths))
        .map((i) => String(i.identifier))
      if (absent.length) {
        const scratch = new Map<string, unknown>()
        await persistAbsentFromRelease({
          cacheAdapter: { get: async (k) => scratch.get(k) ?? null, set: async (k, v) => void scratch.set(k, v) },
          catalogAdapter: catalog as never,
          resourceKey: key,
          metadata: m,
          absentIds: absent,
          logLabel: 'parts',
        })
        say(`  ${key}: ${absent.join(', ')} no están en la versión`)
      }
      absentOf.set(key, absent)
    }
    await recordBlobsAfterComplete({ complete: true, door43Client: door43, catalogAdapter: catalog as never, resourceKey: key })
  }

  // 2. The shared unit.
  {
    const unit = 'shared'
    const unitStarted = Date.now()
    const cache = cacheAdapterFor(SHARED_DB)
    const catalogManager = managerOver(cache)
    const whole = languageKeys.filter((k) => !bookScoped.has(k))
    say(`[${elapsed()}] ${unit}: ${whole.join(', ') || 'nada que descargar'}`)
    await runDownload({
      resourceKeys: whole,
      skipExisting: true,
      runId: 1,
      post: (message) => {
        if (message.type === 'error') failures.push({ unit, error: JSON.stringify(message.payload) })
      },
      isCurrentRun: () => true,
      cacheAdapter: cache as never,
      catalogAdapter: catalog as never,
      door43Client: door43,
    })
    // Before the companions, as the whole build runs its jobs before adding them.
    count(unit, await buildLanguageArtifacts({ language, cache: cache as never, catalog: catalogManager as never, books: [], articles: true, obs }))
    const companions: string[] = []
    const literal = literalTextOf(await Promise.all(languageKeys.map(metaOf)), language) as (ResourceMetadata & { owner?: string }) | undefined
    if (o.lexiconsRef && literal?.owner) {
      const owner = lexiconOwnerOf(language, literal.owner)
      for (const l of await addLexicons(cache as never, catalog as never, language, owner, o.lexiconsRef, o.fetch)) {
        say(`  ${l.key}: ${l.entries !== undefined ? `${l.entries} entradas` : l.why}`)
        if (l.entries !== undefined) companions.push(l.key)
      }
    }
    const macula: string[] = []
    if (o.macula) {
      for (const m of await addMacula(cache as never, catalog as never, o.macula.folder, o.macula)) macula.push(m.key)
    }

    const carried: string[] = []
    for (const key of [...whole, ...companions]) {
      if (await completeHere(cache, await metaOf(key))) carried.push(key)
      else failures.push({ unit, error: `${key}: its download did not finish` })
    }
    const parts = await writeParts(
      await collect(cache, [...carried, ...macula], unit, (s) => !['book', 'alignments', 'original'].includes(s.kind))
    )
    await closeAndDelete([cache], [SHARED_DB], say)
    endUnit(unit, unitStarted, parts)
  }

  // 3. One unit per book.
  const present = new Map<string, Set<string>>()
  for (const key of bookScoped) {
    const absent = new Set((absentOf.get(key) ?? []).map((b) => b.toLowerCase()))
    present.set(key, new Set(ingredientBooks(await metaOf(key)).filter((b) => !absent.has(b))))
  }
  const books = CANON_BOOK_ORDER.filter((book) => [...present.values()].some((s) => s.has(book)))
  for (const book of books) {
    const unit = `book ${book}`
    const unitStarted = Date.now()
    const original = resolveOriginalLanguageKey(book)
    const ofLanguage = languageKeys.filter((k) => present.get(k)?.has(book))
    const originals = original && present.get(original.resourceKey)?.has(book) ? [original.resourceKey] : []
    const keys = [...ofLanguage, ...originals]
    const cache = cacheAdapterFor(bookDb(book))
    const catalogManager = managerOver(cache)
    for (const key of keys) await cache.set(`resource:${key}`, receiptOf(await metaOf(key), absentOf.get(key) ?? []) as never)
    await runDownload({
      resourceKeys: keys,
      skipExisting: true,
      books: [book],
      runId: 1,
      post: (message) => {
        if (message.type === 'error') {
          const p = message.payload as { resourceKey?: string; error?: string }
          failures.push({ unit, error: `${p.resourceKey}: ${p.error}` })
        }
      },
      isCurrentRun: () => true,
      cacheAdapter: cache as never,
      catalogAdapter: catalog as never,
      door43Client: door43,
    })
    const blockedPrepare = new Set<string>()
    const builds = [...(ofLanguage.length ? [language] : []), ...(originals.length ? [original!.language] : [])]
    for (const lang of builds) {
      const report = await buildLanguageArtifacts({
        language: lang,
        cache: cache as never,
        catalog: catalogManager as never,
        books: [book],
        chaptersOf: (rk, b) => chaptersFromStore(cache as never, rk, b),
        articles: false,
        obs: false,
        onProgress: (p) => {
          if (p.phase === 'jobs' && p.outcome === 'blocked' && p.job.kind === 'prepare-unit') blockedPrepare.add(p.job.jobKey)
        },
      })
      count(unit, report, (job) => blockedPrepare.has(job))
    }
    const parts = await writeParts(await collect(cache, keys, unit, (s) => s.book === book && s.kind !== 'macula'))
    await closeAndDelete([cache], [bookDb(book)], say)
    endUnit(unit, unitStarted, parts)
  }

  // 4. The lists.
  async function listResource(key: string, role: PackResourceRole): Promise<PartsListResource> {
    const m = await metaOf(key)
    const books = bookScoped.has(key) ? [...(booksWithRows.get(key) ?? [])].sort() : undefined
    return { key, stamp: resourceContentStamp(m), role, subject: m.subject, title: m.title, ...(books ? { books } : {}), metadata: m }
  }
  const named = (parts: PartEntry[]) => [...new Set(parts.map((p) => p.resource))]
  const originalsList: PartsList = {
    schema: 2,
    language: 'originals',
    compat,
    versions: PACK_VERSIONS,
    resources: await Promise.all(named(originalParts).map((k) => listResource(k, 'original'))),
    parts: originalParts,
  }
  const originalsText = serializePartsList(originalsList)
  const originalsPath = partsListPath(compat, 'originals')
  const list: PartsList = {
    schema: 2,
    language,
    compat,
    versions: PACK_VERSIONS,
    resources: await Promise.all(named(languageParts).map((k) => listResource(k, 'language'))),
    parts: languageParts,
    originals: { path: originalsPath, sha256: await sha256Hex(new TextEncoder().encode(originalsText)) },
  }
  for (const [path, text] of [
    [originalsPath, originalsText],
    [partsListPath(compat, language), serializePartsList(list)],
  ] as const) {
    mkdirSync(dirname(join(o.workDir, path)), { recursive: true })
    writeFileSync(join(o.workDir, path), text)
  }
  await closeAndDelete([catalog], [CATALOG_DB], say)

  // Every language's quotes are made against the originals: a list without them is not whole.
  for (const key of [...ORIGINAL_LANGUAGE_KEYS, ...(o.macula ? MACULA_KEYS : [])]) {
    if (!named(originalParts).includes(key)) failures.push({ unit: 'originals', error: `${key}: no parts` })
  }
  say(`[${elapsed()}] Listo: ${languageParts.length} partes de ${language}, ${originalParts.length} de los originales, pico ${peakRssMb} MB`)
  return { list, originals: originalsList, summary, failures, units, peakRssMb }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
