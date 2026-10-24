/**
 * Build a language as parts (spec §1, §4), one unit of work at a time, each in a database of its own that is deleted
 * when the unit is done: in Node the store is fake-indexeddb, which frees memory only when a database is deleted, so
 * memory follows the largest unit instead of the language.
 *
 * 1. A catalog database kept for the run: discovery's rows, and every input read before any unit. Each resource's
 *    archive is fetched once and kept in `<work>/zips` (release zips through `zipCachingClient`, the lexicons'
 *    archives through `archiveCachingFetch`), so the units' loaders read the very bytes hashed here; MACULA comes from
 *    its folder. From those bytes: each resource's files and their git blob shas (checked against Door43's tree when
 *    the client can read it), the normalized manifests, each book-scoped resource's books absent from its release
 *    (pruned as a whole download prunes them) and its book blobs (which stamp the quote and alignment keys).
 *    Then every unit's fingerprint.
 * 2. The shared unit: TW, TA (and OBS) downloaded whole, the lexicons and MACULA, their article jobs and titles.
 * 3. One unit per book any book-scoped resource or original has: that book of each, its receipt written first so the
 *    loaders and jobs find it, then the book's jobs for the language and for the book's original.
 *
 *    Books outside the 66 (front and back matter, `frt`, `bak`) come after the canon, sorted: the whole build packs
 *    their rows too.
 *
 * Every unit's rows are those today's whole pack carries (`rowsOfResource`), placed by `slotOfRow` and written as
 * `parts/<sha256>.part.gz`, each with the fingerprint of the files it was built from (`partInputs`), which must be
 * within its unit's. Then the language's list (with every unit's fingerprint) and the shared originals list (schema 2),
 * the latter also at its content address, which the language list names. Nothing is uploaded.
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
  bookUnit,
  compatKeyOf,
  fingerprintOf,
  isBookScoped,
  manifestFingerprint,
  missingFromUnit,
  ORIGINAL_LANGUAGE_KEYS,
  originalsListPath,
  PART_LAYERS,
  PARTS_FORMAT_VERSION,
  packSourceFrom,
  partInputs,
  partPath,
  partsListPath,
  rowsOfResource,
  serializePartsList,
  sha256Hex,
  SHARED_UNIT,
  slotId,
  slotOfRow,
  unitInputs,
  writePart,
  type FingerprintInputs,
  type InputsContext,
  type PackLayer,
  type PartEntry,
  type PartRow,
  type PartSlot,
  type PartsList,
  type PartsListResource,
  type PartsUnit,
  type PackResourceRole,
  type ResourceFiles,
} from '@bt-synergy/language-pack'
import {
  bookBlobsFromTree,
  bookContentStamp,
  buildIngestReceiptFromCatalog,
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  ingredientPresentInPathSet,
  isMatchingIngestReceipt,
  normalizeIngredientPath,
  pathSetFromZipFileNames,
  persistAbsentFromRelease,
  presentIngredientCount,
  resourceContentStamp,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import {
  addLexicons,
  addMacula,
  lexiconArchiveUrl,
  lexiconOwnerOf,
  lexiconRepos,
  lexiconRowPath,
  lexiconStampOf,
  MACULA_KEYS,
  maculaKeyOf,
  resolveLexicon,
} from '../../cli/companions'
import { discoverLanguage } from '../discover/discoverLanguage'
import { createHeadlessResourceTypeRegistry } from '../discover/resourceTypeRegistry'
import { CACHE_METADATA_KEYS } from '../download/ResourceCompletenessChecker'
import { runDownload } from '../download/runDownload'
import { zipCachingClient, zipFileNames } from '../download/zipCache'
import { resolveOriginalLanguageKey } from '../scripture/originalLanguage'
import { CANON_BOOK_ORDER } from '../warm/warmBookOrder'
import { buildLanguageArtifacts, type BuildReport } from './buildLanguageArtifacts'
import { chaptersFromStore } from './chaptersFromStore'
import { isObs, keyOfRow, literalTextOf } from './door43Stamps'
import { closeAndDelete } from './fakeDatabases'
import { archiveCachingFetch, folderInputs, lexiconInputs, treeCheck, zipInputs, type TreeCheck } from './inputFiles'
import { PACK_VERSIONS } from './packVersions'
import { partsCode } from './partsCode'

export type UnitSummary = { built: number; cached: number; blocked: number; noop: number; failed: number }

export type PartsFailure = { unit: string; job?: string; error: string }

export type UnitRecord = {
  unit: string
  /**
   * Resident memory when the unit started. Memory freed by a deleted database is reused but not returned, so a
   * unit's own growth is `peakRssMb - startRssMb`, not its peak alone.
   */
  startRssMb: number
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

/** How many resources' files matched Door43's tree, differed from it (a failure), or could not be checked. */
export type TreeChecks = Record<TreeCheck['state'], number>

/** What `parts-report.json` holds, written after every unit and when the build ends. */
export type PartsReport = {
  language: string
  state: 'running' | 'done' | 'failed'
  error?: string
  peakRssMb: number
  units: UnitRecord[]
  failures: PartsFailure[]
  treeChecks: TreeChecks
}

export const PARTS_REPORT = 'parts-report.json'

/** Waits before each new try of a release zip in step 1, in seconds. */
export const ZIP_RETRY_DELAYS_S = [2, 4, 8] as const

/** At most this many rows with no part are listed per unit; the rest are counted. */
export const UNPLACED_LISTED = 20

/** At most this many paths are named in a failure for files that differ from Door43's tree. */
const DIFFERING_LISTED = 5

type Door43Like = {
  downloadZipball(owner: string, repo: string, ref?: string): Promise<ArrayBuffer>
  /** Door43's tree of a ref, to check the blob shas computed from the bytes; without it nothing is checked. */
  fetchRepoTree?(owner: string, repo: string, ref: string): Promise<{ blobs: Map<string, string>; complete: boolean }>
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

/** The tag `bookContentStamp` compares `bookBlobsRef` with. */
const blobsTagOf = (m: ResourceMetadata) => m.release?.tag_name?.trim() || m.version?.trim() || ''

/** The kinds whose keys carry a book's content stamp (`bookContentStamp`): a book's own parts. */
const BOOK_STAMPED = new Set(['book', 'alignments', 'original'])

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
  const code = await partsCode()
  const door43 = zipCachingClient(
    (o.door43Client ?? (getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false }) as unknown as Door43Like)) as Door43Like,
    join(o.workDir, 'zips')
  )
  // The lexicons' archives, kept beside the zips: what the catalog step hashes is what the shared unit adds.
  const fetchArchives = archiveCachingFetch((o.fetch ?? fetch) as (url: string) => Promise<Response>, join(o.workDir, 'zips'))
  mkdirSync(join(o.workDir, 'parts'), { recursive: true })

  const started = Date.now()
  const elapsed = () => `${((Date.now() - started) / 1000).toFixed(0)}s`
  const summary: Record<string, UnitSummary> = {}
  const failures: PartsFailure[] = []
  const units: UnitRecord[] = []
  let peakRssMb = 0
  const languageParts: PartEntry[] = []
  const originalParts: PartEntry[] = []
  const treeChecks: TreeChecks = { match: 0, mismatch: 0, unverified: 0 }

  function writeReport(state: PartsReport['state'], error?: unknown) {
    const report: PartsReport = { language, state, ...(error !== undefined ? { error: messageOf(error) } : {}), peakRssMb, units, failures, treeChecks }
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
    const start = peak
    const timer = setInterval(sample, o.memorySampleMs ?? 1000)
    ;(timer as { unref?: () => void }).unref?.()
    return {
      sample,
      start: () => start,
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
        startRssMb: m.start(),
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
      say(`[${elapsed()}] ${unit}: ${parts} partes, pico ${record.peakRssMb} MB (+${record.peakRssMb - record.startRssMb}), ${record.seconds} s${stopped ? ', detenido' : ''}`)
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
      })
      m.check()
    }
    failures.push(...unplaced.listed)
    if (unplaced.more) failures.push({ unit, error: `${unplaced.more} more rows with no part` })
    return out
  }

  /** Each resource's files, from the bytes step 1 read: what every fingerprint is made of. */
  const resourceFiles = new Map<string, ResourceFiles>()
  const inputs: InputsContext = {
    resources: resourceFiles,
    // An original left out (its zip never came) has no files: no part reads it.
    originalOf: (book) => {
      const key = resolveOriginalLanguageKey(book)?.resourceKey
      return key && resourceFiles.has(key) ? key : undefined
    },
  }
  /** Each unit's inputs and fingerprint, made in step 1, before any unit is built. */
  const unitPlan = new Map<string, { keys: string[]; inputs: FingerprintInputs; fingerprint: string }>()

  async function writeParts(unit: string, collected: Map<string, Collected>, m: Meter): Promise<number> {
    const plan = unitPlan.get(unit)
    if (!plan) throw new Error(`No inputs were planned for the unit ${unit}`)
    const stampChecked = new Set<string>()
    for (const { slot, rows } of collected.values()) {
      const id = slotId(slot)
      const read = partInputs(slot, inputs)
      // A part that reads something its unit does not could change while its unit looks unchanged.
      const missing = missingFromUnit(read, plan.inputs)
      if (missing.length) throw new Error(`The part ${id} reads what its unit ${unit} does not: ${missing.slice(0, DIFFERING_LISTED).join('; ')}`)
      if (slot.book && BOOK_STAMPED.has(slot.kind) && !stampChecked.has(`${slot.resource} ${slot.book}`)) {
        stampChecked.add(`${slot.resource} ${slot.book}`)
        // Quote and alignment keys carry the book's stamp, which no input carries: it must come from the file's blob.
        const stamp = bookContentStamp(await metaOf(slot.resource), slot.book)
        if (!stamp.startsWith('g')) {
          failures.push({
            unit,
            error: `${slot.resource}: the ${slot.book} rows would carry its release stamp (${stamp}), not their file's: no file of its release has the path its catalog names for ${slot.book}`,
          })
        }
      }
      const { bytes, sha256, rows: n } = await writePart(rows)
      const file = join(o.workDir, partPath(sha256))
      if (!existsSync(file)) writeFileSync(file, bytes)
      const layers = PART_LAYERS.filter((l) => rows.some((r) => r.layer === l))
      const fingerprint = await fingerprintOf({ code, id, inputs: read })
      const entry: PartEntry = { sha256, bytes: bytes.length, rows: n, ...slot, fingerprint, layers }
      const shared = slot.kind === 'original' || slot.kind === 'macula'
      ;(shared ? originalParts : languageParts).push(entry)
      m.sample()
    }
    return collected.size
  }

  /**
   * A release zip and its file names, Door43's transient failures tried again; null (and a failure) when it never
   * came. Kept in `<work>/zips`, where the loaders read it.
   */
  async function releaseZip(key: string, m: ResourceMetadata): Promise<{ zip: ArrayBuffer; names: string[] } | null> {
    const { owner, repo } = repoOf(key)
    for (let attempt = 0; ; attempt++) {
      try {
        const zip = await door43.downloadZipball(owner, repo, refOf(m))
        const names = zipFileNames(zip)
        if (!names) throw new Error('its release zip cannot be read')
        return { zip, names }
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

  /** Door43's tree of a ref, or null when the client cannot read one or Door43 does not answer (`unverified`). */
  async function treeOf(owner: string, repo: string, ref: string) {
    if (typeof door43.fetchRepoTree !== 'function') return null
    try {
      return await door43.fetchRepoTree(owner, repo, ref)
    } catch (e) {
      say(`  ${owner}/${repo}@${ref}: sin árbol de Door43 (${messageOf(e)})`)
      return null
    }
  }

  /** Counts a tree check; a mismatch is a failure: the Worker, reading the tree, would never agree with the build. */
  function recordTreeCheck(key: string, ref: string, check: TreeCheck) {
    treeChecks[check.state] += 1
    if (check.state !== 'mismatch') return
    const more = check.differing.length - DIFFERING_LISTED
    failures.push({
      unit: 'catalog',
      error: `${key}: its files differ from Door43's tree at ${ref}, so the Worker would compute other fingerprints: ${check.differing.slice(0, DIFFERING_LISTED).join(', ')}${more > 0 ? ` and ${more} more` : ''}`,
    })
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

    // Every Door43 resource's release zip, before any unit: its files are the inputs of its parts. Books absent from a
    // release are decided by the zip the loaders read, so both builds leave out the same books.
    const absentOf = new Map<string, string[]>()
    const leftOut = new Set<string>()
    for (const key of [...candidates, ...originalCandidates]) {
      const m = await metaOf(key)
      if (!m.release?.zipball_url) {
        // Its loader would read files one by one from a branch: nothing this build could hash.
        failures.push({ unit: 'catalog', error: `${key}: it has no release zip, whose files a parts build is made from, so it is left out` })
        leftOut.add(key)
        continue
      }
      const got = await releaseZip(key, m)
      if (!got) {
        leftOut.add(key)
        continue
      }
      let read: Awaited<ReturnType<typeof zipInputs>>
      try {
        read = await zipInputs(got.zip)
      } catch (e) {
        failures.push({ unit: 'catalog', error: `${key}: its release zip cannot be read, so it is left out: ${messageOf(e)}` })
        leftOut.add(key)
        continue
      }
      const { owner, repo } = repoOf(key)
      recordTreeCheck(key, refOf(m), treeCheck(read.files, await treeOf(owner, repo, refOf(m))))
      let books: Record<string, string> | undefined
      if (bookScoped.has(key)) {
        const paths = pathSetFromZipFileNames(got.names)
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
        // The book blobs from the bytes the loaders read, never from the tree: a part carried later keeps quote and
        // alignment keys that match the list's catalog rows.
        const pruned = await metaOf(key)
        const gone = new Set(absent.map((b) => b.toLowerCase()))
        const ingredients = (pruned.contentMetadata?.ingredients ?? []).filter((i) => i.identifier && !gone.has(String(i.identifier).toLowerCase()))
        await catalog.set(key, {
          ...pruned,
          contentMetadata: { ...pruned.contentMetadata, bookBlobs: bookBlobsFromTree(read.files, ingredients), bookBlobsRef: blobsTagOf(pruned) },
        } as never)
        books = {}
        for (const i of ingredients) {
          const path = normalizeIngredientPath(i.path)
          if (path) books[String(i.identifier).toLowerCase()] = path
        }
      }
      const row = await metaOf(key)
      resourceFiles.set(key, {
        key,
        type: row.type,
        subject: row.subject,
        stamp: resourceContentStamp(row),
        ...(read.manifest !== undefined ? { manifest: await manifestFingerprint(read.manifest) } : {}),
        files: read.files,
        ...(books ? { books } : {}),
      })
    }
    for (const key of leftOut) bookScoped.delete(key)
    const languageKeys = candidates.filter((k) => !leftOut.has(k))

    // The lexicons, from their archives at the commit the ref names now (the shared unit adds that same archive).
    const lexicons = new Map<string, string>()
    const literal = literalTextOf(await Promise.all(languageKeys.map(metaOf)), language) as (ResourceMetadata & { owner?: string }) | undefined
    if (o.lexiconsRef && literal?.owner) {
      for (const lexicon of lexiconRepos(language, lexiconOwnerOf(language, literal.owner))) {
        const repo = `${lexicon.owner}/${lexicon.name}`
        const commit = await resolveLexicon(repo, o.lexiconsRef, fetchArchives)
        if (!commit) continue
        const res = await fetchArchives(lexiconArchiveUrl(repo, commit.sha))
        if (!res.ok) throw new Error(`Could not download ${repo} at ${commit.sha} (Door43 answered ${res.status})`)
        const read = await lexiconInputs(new Uint8Array(await res.arrayBuffer()))
        // The tree by row path, as the files are keyed; files that make no row are no input, nor checked.
        const tree = await treeOf(lexicon.owner, lexicon.name, commit.sha)
        const rowTree = tree && {
          complete: tree.complete,
          blobs: new Map([...tree.blobs].flatMap(([path, sha]) => {
            const row = lexiconRowPath(path)
            return row ? [[row, sha] as const] : []
          })),
        }
        recordTreeCheck(lexicon.key, commit.sha, treeCheck(read.files, rowTree))
        resourceFiles.set(lexicon.key, {
          key: lexicon.key,
          type: 'lexicon',
          subject: lexicon.subject,
          stamp: lexiconStampOf(commit),
          ...(read.manifest !== undefined ? { manifest: await manifestFingerprint(read.manifest) } : {}),
          files: read.files,
        })
        lexicons.set(lexicon.key, commit.sha.slice(0, 10))
      }
    }

    // MACULA, from its folder (no Door43 tree to check it against): the Old Testament's files to the Hebrew resource,
    // the New's to the Greek, as `addMacula` splits them.
    const maculaKeys: string[] = []
    if (o.macula) {
      const byKey = new Map<string, Map<string, string>>()
      for (const [path, sha] of await folderInputs(o.macula.folder, ['trees', 'referents'])) {
        const key = maculaKeyOf(path.split('/')[1].replace(/\.json$/, ''))
        byKey.set(key, (byKey.get(key) ?? new Map()).set(path, sha))
      }
      const stamp = resourceContentStamp({ version: o.macula.version, release: { tag_name: o.macula.version, published_at: o.macula.publishedAt } })
      for (const key of MACULA_KEYS) {
        const files = byKey.get(key)
        if (!files) continue
        resourceFiles.set(key, { key, type: 'original-syntax', subject: 'Original Language Syntax', stamp, files })
        maculaKeys.push(key)
      }
    }

    // The units, the canon's books in order, then any other book a resource has (front matter…), sorted; and what
    // each one reads, fingerprinted before any is built.
    const whole = languageKeys.filter((k) => !bookScoped.has(k))
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
    const keysOfBook = (book: string) => {
      const original = resolveOriginalLanguageKey(book)?.resourceKey
      return {
        ofLanguage: languageKeys.filter((k) => present.get(k)?.has(book)),
        originals: original && present.get(original)?.has(book) ? [original] : [],
      }
    }
    for (const [unit, keys] of [
      [SHARED_UNIT, [...whole, ...lexicons.keys(), ...maculaKeys]],
      ...books.map((book) => {
        const { ofLanguage, originals } = keysOfBook(book)
        return [bookUnit(book), [...ofLanguage, ...originals]] as const
      }),
    ] as const) {
      const read = unitInputs(unit, keys, inputs)
      unitPlan.set(unit, { keys: [...keys], inputs: read, fingerprint: await fingerprintOf({ code, id: unit, inputs: read }) })
    }
    say(`[${elapsed()}] Árboles de Door43: ${treeChecks.match} iguales, ${treeChecks.mismatch} distintos, ${treeChecks.unverified} sin comprobar`)

    // 2. The shared unit.
    await runUnit(SHARED_UNIT, SHARED_DB, async (cache, m) => {
      const unit = SHARED_UNIT
      const catalogManager = managerOver(cache)
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
      if (o.lexiconsRef && literal?.owner) {
        const owner = lexiconOwnerOf(language, literal.owner)
        for (const l of await addLexicons(cache as never, catalog as never, language, owner, o.lexiconsRef, fetchArchives)) {
          say(`  ${l.key}: ${l.entries !== undefined ? `${l.entries} entradas` : l.why}`)
          if (l.entries === undefined) continue
          // The ref may have moved since step 1: these rows would then not be of the files fingerprinted.
          const version = (await metaOf(l.key)).version
          if (lexicons.get(l.key) !== version) {
            failures.push({ unit, error: `${l.key}: read at ${version}, but its files were hashed at ${lexicons.get(l.key) ?? 'no commit'}: the ref moved during the build` })
            continue
          }
          companions.push(l.key)
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
      return writeParts(unit, await collect(cache, [...carried, ...macula], unit, (s) => !BOOK_STAMPED.has(s.kind), m), m)
    })

    // 3. One unit per book.
    for (const book of books) {
      const unit = bookUnit(book)
      await runUnit(unit, bookDb(book), async (cache, m) => {
        const { ofLanguage, originals } = keysOfBook(book)
        const original = resolveOriginalLanguageKey(book)
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
        return writeParts(unit, await collect(cache, keys, unit, (s) => s.book === book && s.kind !== 'macula', m), m)
      })
    }

    // 4. The lists. A book-scoped resource's books are those with source rows, as the whole pack's manifest lists them,
    // read from the parts (so a carried part counts as a built one).
    const booksOf = new Map<string, Set<string>>()
    for (const p of [...languageParts, ...originalParts]) {
      if ((p.kind === 'book' || p.kind === 'original') && p.book && p.layers.includes('sot')) {
        booksOf.set(p.resource, (booksOf.get(p.resource) ?? new Set()).add(p.book))
      }
    }
    async function listResource(key: string, role: PackResourceRole): Promise<PartsListResource> {
      const m = await metaOf(key)
      const books = bookScoped.has(key) ? [...(booksOf.get(key) ?? [])].sort() : undefined
      return { key, stamp: resourceContentStamp(m), role, subject: m.subject, title: m.title, ...(books ? { books } : {}), metadata: m }
    }
    const named = (parts: PartEntry[]) => [...new Set(parts.map((p) => p.resource))]
    const originalsList: PartsList = {
      schema: 2,
      language: 'originals',
      compat,
      code,
      versions: PACK_VERSIONS,
      resources: await Promise.all(named(originalParts).map((k) => listResource(k, 'original'))),
      parts: originalParts,
    }
    const originalsText = serializePartsList(originalsList)
    const originalsSha = await sha256Hex(new TextEncoder().encode(originalsText))
    // At its content address too, which the language list names: another language's run cannot overwrite it.
    const originalsPath = originalsListPath(compat, originalsSha)
    // Sorted as serializePartsList writes them, so the list returned is the list on disk.
    const unitEntries: PartsUnit[] = [...unitPlan]
      .map(([id, plan]) => ({ id, fingerprint: plan.fingerprint }))
      .sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const list: PartsList = {
      schema: 2,
      language,
      compat,
      code,
      versions: PACK_VERSIONS,
      resources: await Promise.all(named(languageParts).map((k) => listResource(k, 'language'))),
      parts: languageParts,
      units: unitEntries,
      originals: { path: originalsPath, sha256: originalsSha },
    }
    for (const [path, text] of [
      [originalsPath, originalsText],
      [partsListPath(compat, 'originals'), originalsText],
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
