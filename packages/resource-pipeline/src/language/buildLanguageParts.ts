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
 *    Books outside the 66 (front and back matter, `frt`, `bak`) come after the canon, sorted: the whole build packs
 *    their rows too.
 *
 * Every unit's rows are those today's whole pack carries (`rowsOfResource`), placed by `slotOfRow` and written as
 * `parts/<sha256>.part.gz`. Then the language's list and the shared originals list (schema 2). Nothing is uploaded.
 *
 * Memory is sampled through each unit (every second, and at every job), so a unit over the limit stops the build
 * with a message naming it, well before the runner kills the process. `parts-report.json` is written after every unit
 * and when the build ends, even by an error: each unit's peak, time, jobs and failures so far. Every unit's database
 * is deleted however the unit ends, and the run starts by deleting any `parts-*` database a stopped run left.
 */

import { existsSync, mkdirSync, renameSync, writeFileSync } from 'node:fs'
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
import { CACHE_METADATA_KEYS } from '../download/ResourceCompletenessChecker'
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

export type UnitRecord = {
  unit: string
  /** The highest resident memory sampled while the unit ran, before its database was deleted. */
  peakRssMb: number
  seconds: number
  parts: number
  jobs: UnitSummary
  /** How many failures the unit added. */
  failures: number
  /** The error that stopped the build in this unit. */
  stopped?: string
}

/** What `parts-report.json` holds, written after every unit and when the build ends. */
export type PartsReport = {
  language: string
  state: 'running' | 'done' | 'failed'
  error?: string
  peakRssMb: number
  units: UnitRecord[]
  failures: PartsFailure[]
}

export const PARTS_REPORT = 'parts-report.json'

/** Waits before each new try of a release zip in step 1, in seconds. */
export const ZIP_RETRY_DELAYS_S = [2, 4, 8] as const

/** At most this many rows with no part are listed per unit; the rest are counted. */
export const UNPLACED_LISTED = 20

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

const PARTS_DB_PREFIX = 'parts-'
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

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e))

/**
 * Places one resource's rows in `out` by part. A row no rule places, or one that belongs to another unit's part, is a
 * failure of `unit` (up to UNPLACED_LISTED of them listed, the rest counted in `unplaced.more`), and the rest go on: one
 * run lists every such row instead of stopping at the first.
 */
export function slotRows(o: {
  unit: string
  resource: { key: string; type: string; subject?: string }
  byLayer: Iterable<[string, Array<{ key: string; entry: unknown }>]>
  where: (slot: PartSlot) => boolean
  out: Map<string, Collected>
  unplaced: { listed: PartsFailure[]; more: number }
  /** Called for each source row of a book, with the book. */
  onBookRow?: (book: string) => void
}): void {
  const { unit, resource, out, unplaced } = o
  const problem = (error: string) => {
    if (unplaced.listed.length < UNPLACED_LISTED) unplaced.listed.push({ unit, error })
    else unplaced.more += 1
  }
  for (const [layer, rows] of o.byLayer) {
    for (const row of rows) {
      let slot: PartSlot | null
      try {
        slot = slotOfRow({ layer: layer as PackLayer, key: row.key }, resource)
      } catch (e) {
        problem(messageOf(e))
        continue
      }
      if (!slot) continue
      if (!o.where(slot)) {
        problem(`the ${layer} row ${row.key} of ${resource.key} belongs to ${slotId(slot)}, another unit's part`)
        continue
      }
      const id = slotId(slot)
      const entry = out.get(id) ?? { slot, rows: [] }
      entry.rows.push({ layer: layer as PackLayer, key: row.key, value: row.entry })
      out.set(id, entry)
      if (layer === 'sot' && slot.book && (slot.kind === 'book' || slot.kind === 'original')) o.onBookRow?.(slot.book)
    }
  }
}

/** The names of the databases a stopped run may have left (fake-indexeddb lives as long as the process). */
async function leftoverPartsDatabases(): Promise<string[]> {
  const all = typeof indexedDB.databases === 'function' ? await indexedDB.databases() : []
  return all.map((d) => d.name ?? '').filter((name) => name.startsWith(PARTS_DB_PREFIX))
}

export async function buildLanguageParts(o: {
  language: string
  /** Gets `parts/`, `catalog/<compat>/`, `zips/` (the release zips of this run) and `parts-report.json`. */
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
  /** How often memory is sampled within a unit, besides at every job. Default 1000 ms. */
  memorySampleMs?: number
  /** Waits between tries of a release zip (ZIP_RETRY_DELAYS_S); a test passes one that does not wait. */
  wait?: (ms: number) => Promise<void>
}): Promise<{
  list: PartsList
  originals: PartsList
  summary: Record<string, UnitSummary>
  failures: PartsFailure[]
  units: UnitRecord[]
  peakRssMb: number
}> {
  const language = o.language
  const say = o.log ?? (() => {})
  const obs = o.obs ?? false
  const limit = o.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB
  const rss = o.rss ?? (() => process.memoryUsage().rss)
  const wait = o.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
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
  const units: UnitRecord[] = []
  let peakRssMb = 0
  const languageParts: PartEntry[] = []
  const originalParts: PartEntry[] = []
  /** Book-scoped resources: the books that gave source rows, as the whole pack's manifest lists them. */
  const booksWithRows = new Map<string, Set<string>>()

  function writeReport(state: PartsReport['state'], error?: unknown) {
    const report: PartsReport = { language, state, ...(error !== undefined ? { error: messageOf(error) } : {}), peakRssMb, units, failures }
    const file = join(o.workDir, PARTS_REPORT)
    // Aside and renamed: a run killed mid-write still leaves the last whole report.
    writeFileSync(`${file}.partial`, JSON.stringify(report, null, 2))
    renameSync(`${file}.partial`, file)
  }

  async function deleteDatabases(unit: string, adapters: Array<{ close(): Promise<void> }>, names: string[]) {
    try {
      for (const name of await closeAndDelete(adapters, names, say)) {
        failures.push({ unit, error: `the database ${name} could not be deleted: another connection holds it, so its rows stay in memory` })
      }
    } catch (e) {
      failures.push({ unit, error: `the databases ${names.join(', ')} could not be deleted: ${messageOf(e)}` })
    }
  }

  /** Resident memory through one unit: sampled now, every `memorySampleMs` and whenever the unit calls `sample`. */
  function meter(unit: string) {
    let peak = 0
    let over = false
    const sample = () => {
      const mb = Math.round(rss() / 1024 / 1024)
      if (mb > peak) peak = mb
      if (mb > limit) over = true
    }
    sample()
    const timer = setInterval(sample, o.memorySampleMs ?? 1000)
    ;(timer as { unref?: () => void }).unref?.()
    return {
      sample,
      peak: () => peak,
      /** For the runs a unit starts: true stops them at their next step. */
      over: () => over,
      /** Throws, naming the unit, once any sample was over the limit. */
      check() {
        sample()
        if (over) throw new Error(`${unit} used ${peak} MB, over the ${limit} MB limit`)
      },
      stop: () => clearInterval(timer),
    }
  }

  type Meter = ReturnType<typeof meter>

  /**
   * One unit in a database of its own: `body` returns how many parts it wrote. However it ends, the unit's peak is
   * kept before its database is deleted, the database is deleted, and the report written.
   */
  async function runUnit(unit: string, dbName: string, body: (cache: IndexedDBCacheAdapter, m: Meter) => Promise<number>) {
    say(`[${elapsed()}] ${unit}: start`)
    const unitStarted = Date.now()
    const failuresBefore = failures.length
    const m = meter(unit)
    const cache = cacheAdapterFor(dbName)
    let parts = 0
    let stopped: string | undefined
    try {
      m.check()
      parts = await body(cache, m)
      m.check()
    } catch (e) {
      stopped = messageOf(e)
      throw e
    } finally {
      m.stop()
      const record: UnitRecord = {
        unit,
        peakRssMb: m.peak(),
        seconds: Math.round((Date.now() - unitStarted) / 100) / 10,
        parts,
        jobs: { ...(summary[unit] ?? { built: 0, cached: 0, blocked: 0, noop: 0, failed: 0 }) },
        failures: 0,
        ...(stopped ? { stopped } : {}),
      }
      peakRssMb = Math.max(peakRssMb, record.peakRssMb)
      await deleteDatabases(unit, [cache], [dbName])
      record.failures = failures.length - failuresBefore
      units.push(record)
      say(`[${elapsed()}] ${unit}: ${parts} partes, pico ${record.peakRssMb} MB, ${record.seconds} s${stopped ? ', detenido' : ''}`)
      writeReport('running')
    }
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

  // Deleted before anything opens: a stopped run's databases would otherwise be read, or block this run's.
  const leftovers = await leftoverPartsDatabases()
  if (leftovers.length) {
    say(`[${elapsed()}] Borrando bases de una corrida anterior: ${leftovers.join(', ')}`)
    await deleteDatabases('start', [], leftovers)
  }

  const catalog = new IndexedDBCatalogAdapter({ dbName: CATALOG_DB, storeName: 'catalog-entries', version: 1 })
  const managerOver = (cache: IndexedDBCacheAdapter) =>
    new CatalogManager({ catalogAdapter: catalog, cacheAdapter: cache, door43Client: door43, enableNetworkFallback: true, requireSecureConnection: false } as never)
  const metaOf = async (key: string) => {
    const m = await catalog.get(key)
    if (!m) throw new Error(`${key} is not in the catalog`)
    return m
  }

  /** The unit's rows of each resource, by part. `where` says which parts this unit may give. */
  async function collect(cache: IndexedDBCacheAdapter, keys: string[], unit: string, where: (slot: PartSlot) => boolean, m: Meter) {
    const source = packSourceFrom({ cache: cache as never, catalog: catalog as never })
    const out = new Map<string, Collected>()
    const unplaced = { listed: [] as PartsFailure[], more: 0 }
    for (const key of keys) {
      const meta = await metaOf(key)
      slotRows({
        unit,
        resource: { key, type: String(meta.type ?? ''), subject: meta.subject },
        byLayer: await rowsOfResource(source, key, PART_LAYERS),
        where,
        out,
        unplaced,
        onBookRow: (book) => {
          const books = booksWithRows.get(key) ?? new Set<string>()
          books.add(book)
          booksWithRows.set(key, books)
        },
      })
      m.check()
    }
    failures.push(...unplaced.listed)
    if (unplaced.more) failures.push({ unit, error: `${unplaced.more} more rows with no part` })
    return out
  }

  async function writeParts(collected: Map<string, Collected>, m: Meter): Promise<number> {
    for (const { slot, rows } of collected.values()) {
      const { bytes, sha256, rows: n } = await writePart(rows)
      const file = join(o.workDir, partPath(sha256))
      if (!existsSync(file)) writeFileSync(file, bytes)
      const layers = PART_LAYERS.filter((l) => rows.some((r) => r.layer === l))
      const entry: PartEntry = { sha256, bytes: bytes.length, rows: n, ...slot, layers }
      const shared = slot.kind === 'original' || slot.kind === 'macula'
      ;(shared ? originalParts : languageParts).push(entry)
      m.sample()
    }
    return collected.size
  }

  /** A release zip's file names, Door43's transient failures tried again; null (and a failure) when it never came. */
  async function releaseFileNames(key: string, m: ResourceMetadata): Promise<string[] | null> {
    const { owner, repo } = repoOf(key)
    for (let attempt = 0; ; attempt++) {
      try {
        const names = zipFileNames(await door43.downloadZipball(owner, repo, refOf(m)))
        if (!names) throw new Error('its release zip cannot be read')
        return names
      } catch (e) {
        if (attempt >= ZIP_RETRY_DELAYS_S.length) {
          failures.push({ unit: 'catalog', error: `${key}: its release zip did not download after ${attempt + 1} tries, so it is left out: ${messageOf(e)}` })
          return null
        }
        const seconds = ZIP_RETRY_DELAYS_S[attempt]
        say(`  ${key}: ${messageOf(e)}; otra vez en ${seconds} s`)
        await wait(seconds * 1000)
      }
    }
  }

  let error: unknown
  try {
    // 1. The catalog.
    say(`[${elapsed()}] Buscando los recursos de ${language} en Door43…`)
    const discoveryCache = cacheAdapterFor(DISCOVERY_DB)
    let found: Awaited<ReturnType<DiscoverInto>>
    try {
      found = await (o.discover ?? defaultDiscover)({ language, catalogManager: managerOver(discoveryCache), door43Client: door43 })
    } finally {
      await deleteDatabases('catalog', [discoveryCache], [DISCOVERY_DB])
    }

    const candidates: string[] = []
    for (const key of (await catalog.getAll()).sort()) {
      const m = await metaOf(key)
      if (m.language === language && (obs || !isObs(m))) candidates.push(key)
    }
    const originalCandidates = ORIGINAL_LANGUAGE_KEYS.filter((k) => found.originals.includes(k))
    const bookScoped = new Set<string>()
    for (const key of [...candidates, ...originalCandidates]) {
      if (isBookScoped(await metaOf(key) as never)) bookScoped.add(key)
    }

    // Books absent from a release are decided by the zip the loaders read, so both builds leave out the same books.
    const absentOf = new Map<string, string[]>()
    const leftOut = new Set<string>()
    for (const key of bookScoped) {
      const m = await metaOf(key)
      if (m.release?.zipball_url) {
        const names = await releaseFileNames(key, m)
        if (!names) {
          leftOut.add(key)
          continue
        }
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
    for (const key of leftOut) bookScoped.delete(key)
    const languageKeys = candidates.filter((k) => !leftOut.has(k))
    const originalKeys = originalCandidates.filter((k) => !leftOut.has(k))

    // 2. The shared unit.
    await runUnit('shared', SHARED_DB, async (cache, m) => {
      const unit = 'shared'
      const catalogManager = managerOver(cache)
      const whole = languageKeys.filter((k) => !bookScoped.has(k))
      say(`  ${whole.join(', ') || 'nada que descargar'}`)
      await runDownload({
        resourceKeys: whole,
        skipExisting: true,
        runId: 1,
        post: (message) => {
          if (message.type === 'error') failures.push({ unit, error: JSON.stringify(message.payload) })
        },
        isCurrentRun: () => !m.over(),
        cacheAdapter: cache as never,
        catalogAdapter: catalog as never,
        door43Client: door43,
      })
      m.check()
      // Before the companions, as the whole build runs its jobs before adding them.
      count(
        unit,
        await buildLanguageArtifacts({
          language,
          cache: cache as never,
          catalog: catalogManager as never,
          books: [],
          articles: true,
          obs,
          onProgress: m.sample,
          cancelled: m.over,
        })
      )
      m.check()
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
        for (const r of await addMacula(cache as never, catalog as never, o.macula.folder, o.macula)) macula.push(r.key)
      }
      m.check()

      const carried: string[] = []
      for (const key of [...whole, ...companions]) {
        if (await completeHere(cache, await metaOf(key))) {
          carried.push(key)
          continue
        }
        // A whole download that failed leaves Door43's error on the receipt (markError), not as a message.
        const receipt = (await cache.get(`resource:${key}`)) as { metadata?: Record<string, unknown> } | null
        const why = receipt?.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_ERROR]
        failures.push({ unit, error: `${key}: its download did not finish${why ? `: ${String(why)}` : ''}` })
      }
      return writeParts(await collect(cache, [...carried, ...macula], unit, (s) => !['book', 'alignments', 'original'].includes(s.kind), m), m)
    })

    // 3. One unit per book: the canon's in order, then any other book a resource has (front matter…), sorted.
    const present = new Map<string, Set<string>>()
    for (const key of bookScoped) {
      const absent = new Set((absentOf.get(key) ?? []).map((b) => b.toLowerCase()))
      present.set(key, new Set(ingredientBooks(await metaOf(key)).filter((b) => !absent.has(b))))
    }
    const anyHas = (book: string) => [...present.values()].some((s) => s.has(book))
    const canon = new Set(CANON_BOOK_ORDER)
    const books = [
      ...CANON_BOOK_ORDER.filter(anyHas),
      ...[...new Set([...present.values()].flatMap((s) => [...s]))].filter((b) => !canon.has(b)).sort(),
    ]
    for (const book of books) {
      const unit = `book ${book}`
      await runUnit(unit, bookDb(book), async (cache, m) => {
        const original = resolveOriginalLanguageKey(book)
        const ofLanguage = languageKeys.filter((k) => present.get(k)?.has(book))
        const originals = original && present.get(original.resourceKey)?.has(book) ? [original.resourceKey] : []
        const keys = [...ofLanguage, ...originals]
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
          isCurrentRun: () => !m.over(),
          cacheAdapter: cache as never,
          catalogAdapter: catalog as never,
          door43Client: door43,
        })
        m.check()
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
              m.sample()
              if (p.phase === 'jobs' && p.outcome === 'blocked' && p.job.kind === 'prepare-unit') blockedPrepare.add(p.job.jobKey)
            },
            cancelled: m.over,
          })
          m.check()
          count(unit, report, (job) => blockedPrepare.has(job))
        }
        return writeParts(await collect(cache, keys, unit, (s) => s.book === book && s.kind !== 'macula', m), m)
      })
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

    // Every language's quotes are made against the originals: a list without them is not whole.
    for (const key of [...ORIGINAL_LANGUAGE_KEYS, ...(o.macula ? MACULA_KEYS : [])]) {
      if (!named(originalParts).includes(key)) failures.push({ unit: 'originals', error: `${key}: no parts` })
    }
    say(`[${elapsed()}] Listo: ${languageParts.length} partes de ${language}, ${originalParts.length} de los originales, pico ${peakRssMb} MB`)
    return { list, originals: originalsList, summary, failures, units, peakRssMb }
  } catch (e) {
    error = e
    throw e
  } finally {
    await deleteDatabases('end', [catalog], [CATALOG_DB])
    writeReport(error === undefined ? 'done' : 'failed', error)
  }
}

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes as BufferSource))
  return Array.from(digest, (b) => b.toString(16).padStart(2, '0')).join('')
}
