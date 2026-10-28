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
 *    (pruned as a whole download prunes them) and its book blobs (which stamp the quote and alignment keys). TW's
 *    and TA's catalog ingredients (their titles) must be those their zip gives. Then every unit's fingerprint.
 *
 *    Given the lists an earlier build published (`previous`, same compat, code and language), a unit whose
 *    fingerprint they record, whose parts' fingerprints recomputed now are the recorded ones and which the bucket still
 *    has, is carried: its parts copied into the new lists, no database opened, nothing written. Any other unit is built
 *    whole, as below. With OBS on, the shared unit is always built.
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
import { getDoor43ApiClient, manifestRights } from '@bt-synergy/door43-api'
import {
  bookUnit,
  compatKeyOf,
  familyOf,
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
  slotOfEntry,
  slotOfRow,
  unitInputs,
  unitOfPart,
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
import { taIngredientsFromZip } from '@bt-synergy/translation-academy-loader'
import { twIngredientsFromZip } from '@bt-synergy/translation-words-loader'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import {
  addLexicons,
  addMacula,
  companionCatalogRow,
  lexiconArchiveUrl,
  lexiconOwnerOf,
  lexiconRepos,
  lexiconRowPath,
  lexiconResourceOf,
  lexiconStampOf,
  MACULA_KEYS,
  maculaCatalogRows,
  maculaKeyOf,
  resolveLexicon,
} from '../../cli/companions'
import { discoverLanguage } from '../discover/discoverLanguage'
import { createHeadlessResourceTypeRegistry } from '../discover/resourceTypeRegistry'
import { CACHE_METADATA_KEYS } from '../download/ResourceCompletenessChecker'
import { resetTocTitleIndexCache } from '../helps/tocTitleIndex'
import { runDownload } from '../download/runDownload'
import { zipCachePath, zipCachingClient, zipFileNames } from '../download/zipCache'
import { resolveOriginalLanguageKey } from '../scripture/originalLanguage'
import { CANON_BOOK_ORDER } from '../warm/warmBookOrder'
import { buildLanguageArtifacts, type BuildReport } from './buildLanguageArtifacts'
import { chaptersFromStore } from './chaptersFromStore'
import { isObs, keyOfRow, literalTextOf } from './door43Stamps'
import { closeAndDelete } from './fakeDatabases'
import { archiveCachingFetch, folderGitTree, folderInputs, lexiconInputs, treeCheck, zipInputs, type TreeCheck } from './inputFiles'
import { PACK_VERSIONS } from './packVersions'
import { partsCode } from './partsCode'
import { cacheOnlyNetwork, isRefusingFetch, recordingFetch } from './unitNetwork'

export type UnitSummary = { built: number; cached: number; blocked: number; noop: number; failed: number }

export type PartsFailure = { unit: string; job?: string; error: string }

export type UnitRecord = {
  unit: string
  /** Built in this run, or carried from the previous lists (nothing built, nothing written). */
  outcome: 'built' | 'carried'
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

/** The sizes (gzip bytes) of a set of parts. */
export type PartSizes = { parts: number; bytes: number; min: number; median: number; max: number }

/**
 * Part sizes by kind, and for TW and TA also by folder (`tw:kt`, `ta:translate`…): what the bucket counts are chosen
 * from. The median of an even count is the mean of the two middle sizes, rounded.
 */
export function partSizes(parts: ReadonlyArray<Pick<PartEntry, 'kind' | 'group' | 'bytes'>>): Record<string, PartSizes> {
  const byKey = new Map<string, number[]>()
  const add = (key: string, bytes: number) => byKey.set(key, [...(byKey.get(key) ?? []), bytes])
  for (const p of parts) {
    add(p.kind, p.bytes)
    if ((p.kind === 'tw' || p.kind === 'ta') && p.group) add(`${p.kind}:${p.group.split(':')[0]}`, p.bytes)
  }
  const out: Record<string, PartSizes> = {}
  for (const key of [...byKey.keys()].sort()) {
    const sizes = byKey.get(key)!.sort((a, b) => a - b)
    const mid = sizes.length >> 1
    out[key] = {
      parts: sizes.length,
      bytes: sizes.reduce((a, b) => a + b, 0),
      min: sizes[0],
      median: sizes.length % 2 ? sizes[mid] : Math.round((sizes[mid - 1] + sizes[mid]) / 2),
      max: sizes[sizes.length - 1],
    }
  }
  return out
}

/** The kinds the build's last log line shows, each with its folders. */
const SIZES_SHOWN = ['tw', 'ta', 'lexicon', 'book']

/** `sizes`' rows of `SIZES_SHOWN` as a table, in KB. */
export function sizesTable(sizes: Record<string, PartSizes>): string {
  const kb = (n: number) => `${(n / 1024).toFixed(1)} KB`
  const rows = Object.keys(sizes)
    .filter((k) => SIZES_SHOWN.includes(k.split(':')[0]))
    .sort((a, b) => SIZES_SHOWN.indexOf(a.split(':')[0]) - SIZES_SHOWN.indexOf(b.split(':')[0]) || (a < b ? -1 : a > b ? 1 : 0))
    .map((k) => [k, String(sizes[k].parts), kb(sizes[k].bytes), kb(sizes[k].min), kb(sizes[k].median), kb(sizes[k].max)])
  const table = [['clase', 'partes', 'total', 'mín', 'mediana', 'máx'], ...rows]
  const widths = table[0].map((_, i) => Math.max(...table.map((row) => row[i].length)))
  return table.map((row) => row.map((cell, i) => (i ? cell.padStart(widths[i]) : cell.padEnd(widths[i]))).join('  ')).join('\n')
}

/** The archives step 1 downloaded (release zips, lexicon archives), their bytes and the seconds spent on them. */
export type Downloads = { archives: number; bytes: number; seconds: number }

/** What `parts-report.json` holds, written after every unit and when the build ends. */
export type PartsReport = {
  language: string
  state: 'running' | 'done' | 'failed'
  error?: string
  peakRssMb: number
  units: UnitRecord[]
  failures: PartsFailure[]
  treeChecks: TreeChecks
  /** Over both lists, carried parts included; empty until the lists are made. */
  sizes: Record<string, PartSizes>
  downloads: Downloads
  /**
   * `<resource> <book>` of each book whose catalog path no file of its release has (a loader found it by the end of a
   * path): its rows carry the release stamp, so its parts and unit are rebuilt on every release.
   */
  releaseStampedBooks: string[]
}

export const PARTS_REPORT = 'parts-report.json'

/** Waits before each new try of a release zip in step 1, in seconds. */
export const ZIP_RETRY_DELAYS_S = [2, 4, 8] as const

/** At most this many rows with no part are listed per unit; the rest are counted. */
export const UNPLACED_LISTED = 20

/** At most this many paths are named in a failure for files that differ from Door43's tree. */
const DIFFERING_LISTED = 5

/** The TW and TA loaders trust a catalog row's ingredients only above this many; fewer, they ask Door43 for them. */
const LOADER_TRUSTED_INGREDIENTS = 10

type Door43Like = {
  downloadZipball(owner: string, repo: string, ref?: string): Promise<ArrayBuffer>
  /** Door43's tree of a ref, to check the blob shas computed from the bytes; without it nothing is checked. */
  fetchRepoTree?(owner: string, repo: string, ref: string): Promise<{ blobs: Map<string, string>; complete: boolean }>
  [method: string]: unknown
}

/**
 * What an earlier build of the language published: its list, the originals list that list names, and whether the
 * bucket (or the work folder) still has a part.
 */
export type PreviousParts = { list: PartsList; originals: PartsList; has(sha256: string): Promise<boolean> }

/** Why a previous build's lists cannot be reused by this one, or null when they can. */
export async function previousUnusable(
  previous: Pick<PreviousParts, 'list' | 'originals'>,
  now: { language: string; compat: string; code: string }
): Promise<string | null> {
  const { list, originals } = previous
  for (const [name, l, language] of [
    ['list', list, now.language],
    ['originals list', originals, 'originals'],
  ] as const) {
    if (l.schema !== 2) return `its ${name} has schema ${String(l.schema)}, not 2`
    if (l.language !== language) return `its ${name} is of ${l.language}, not ${language}`
    if (l.compat !== now.compat) return `its ${name} is of compat ${l.compat}, not ${now.compat}`
    // Fingerprints made by other code say nothing of what this code would build.
    if (l.code !== now.code) return `its ${name} was built by code ${l.code}, not ${now.code}`
  }
  if (!list.units) return 'its list records no units'
  // A part its unit cannot be told of (no book), or with no file to name, would stop the build when carried.
  for (const [name, l] of [
    ['list', list],
    ['originals list', originals],
  ] as const) {
    for (const p of l.parts ?? []) {
      let why: string | null = null
      if (!p || typeof p.kind !== 'string' || typeof p.resource !== 'string') why = 'no kind or resource'
      else if (!/^[0-9a-f]{64}$/.test(String(p.sha256))) why = `its sha256 is ${JSON.stringify(p.sha256)}`
      else if (typeof p.fingerprint !== 'string') why = 'no fingerprint'
      else {
        try {
          unitOfPart(p)
        } catch (e) {
          why = messageOf(e)
        }
      }
      if (why) return `its ${name} has a malformed part (${p?.kind} ${p?.resource}): ${why}`
    }
  }
  const sha = await sha256Hex(new TextEncoder().encode(serializePartsList(originals)))
  if (!list.originals || list.originals.sha256 !== sha) return 'its originals list is not the one its list names'
  return null
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
    // The build's client, which keeps each zip it downloads: TW's and TA's ingredients (their titles) come from the
    // zip step 1 hashes, not from a download of their own.
    ingredientsClient: door43Client as never,
  })
  return { resources: found.resources.map((r) => r.resourceKey), originals: found.originals }
}

const DEFAULT_MEMORY_LIMIT_MB = 10_240

/**
 * Why a parts build refuses OBS: its loader reads each story from Door43 at the release tag (findRepository,
 * fetchTextContent), and the client's methods call the process's fetch, which a unit refuses; the rows would not be
 * of the zip fingerprinted anyway.
 */
export const OBS_PARTS_REFUSED = 'OBS parts wait for the OBS loader to read the hashed zip'

/**
 * What discovery's enrichment (Door43ApiClient.enrichResourceMetadata) gets from a repository's root files, as the
 * row's `readme` and `license`: README.md when not empty, and the `rights:` of manifest.yaml (`manifestRights`, which
 * the enrichment reads it with). A failed request there leaves the field empty with no error, so the build compares
 * the row with the zip's root files.
 */
export function discoveryReadsOf(root: { readme?: string; manifest?: string }): { readme: boolean; license: boolean } {
  return {
    readme: !!root.readme,
    license: !!root.manifest && manifestRights(root.manifest) !== undefined,
  }
}

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
  /**
   * A folder with Taller's `trees/` and `referents/`, and the stamp MACULA's rows get (its commit and date). `commit`
   * (the whole sha; `version` when absent) is the one whose git tree the files are checked against.
   */
  macula?: { folder: string; version: string; publishedAt: string; commit?: string }
  /** Read the lexicons from this ref; none leaves them out. */
  lexiconsRef?: string
  /**
   * Open Bible Stories and their helps; left out by default, as the published packs always were. Refused for now
   * (OBS_PARTS_REFUSED) unless `obsTestOnly` says this is a test: on Door43 the OBS loader reads each story with the
   * process's fetch, which a unit refuses.
   */
  obs?: boolean
  /** Test-only: lets `obs` through, for a fixture whose client serves the stories itself. */
  obsTestOnly?: boolean
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
  /**
   * The lists an earlier build published: a unit whose fingerprint they record, whose parts' fingerprints are
   * unchanged and which the bucket still has, is carried (its parts copied, nothing built or written). Lists of
   * another compat, code or language, or without units, are ignored.
   */
  previous?: PreviousParts
}): Promise<{
  list: PartsList
  originals: PartsList
  summary: Record<string, UnitSummary>
  failures: PartsFailure[]
  units: UnitRecord[]
  /** The units carried from `previous`. */
  carried: string[]
  peakRssMb: number
}> {
  const language = o.language
  const say = o.log ?? (() => {})
  const obs = o.obs ?? false
  if (obs && !o.obsTestOnly) throw new Error(OBS_PARTS_REFUSED)
  const limit = o.memoryLimitMb ?? DEFAULT_MEMORY_LIMIT_MB
  const rss = o.rss ?? (() => process.memoryUsage().rss)
  const wait = o.wait ?? ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)))
  const compat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
  const code = await partsCode()
  // Titles are memoized per process by resource and stamp: a file changed under the same tag would get the old ones.
  resetTocTitleIndexCache()
  const door43 = zipCachingClient(
    (o.door43Client ?? (getDoor43ApiClient({ baseUrl: 'https://git.door43.org', debug: false }) as unknown as Door43Like)) as Door43Like,
    join(o.workDir, 'zips')
  )
  // The lexicons' archives, kept beside the zips: what the catalog step hashes is what the shared unit adds.
  const fetchArchives = archiveCachingFetch((o.fetch ?? fetch) as (url: string) => Promise<Response>, join(o.workDir, 'zips'))
  // What step 1 read: the only network a unit is given (unitNetwork.ts).
  const stepOne = recordingFetch(fetchArchives)
  const keptZips = new Set<string>()
  /** The OBS repositories, whose loader reads each story from Door43 (`owner/repo`). */
  const obsRepos = new Set<string>()
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
  const releaseStampedBooks: string[] = []
  let sizes: Record<string, PartSizes> = {}
  const downloads: Downloads = { archives: 0, bytes: 0, seconds: 0 }
  let downloadMs = 0
  /** Counts one archive step 1 fetched, and the time `since` it was asked for. */
  const downloaded = (bytes: number, since: number) => {
    downloads.archives += 1
    downloads.bytes += bytes
    downloadMs += Date.now() - since
    downloads.seconds = Math.round(downloadMs / 100) / 10
  }

  function writeReport(state: PartsReport['state'], error?: unknown) {
    const report: PartsReport = { language, state, ...(error !== undefined ? { error: messageOf(error) } : {}), peakRssMb, units: [...steps, ...units], failures, treeChecks, sizes, downloads, releaseStampedBooks }
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

  type UnitNetwork = { client: Door43Like; fetch: typeof fetchArchives }

  /**
   * One unit in a database of its own: `body` returns how many parts it wrote. However it ends, the unit's peak is
   * kept before its database is deleted, the database is deleted, and the report written.
   *
   * The unit reads only what step 1 read (`net`, and the process's `fetch` refused meanwhile): any other network call
   * is a failure of the unit naming it, since its rows would not be of the bytes fingerprinted. OBS, when on, is the
   * exception: its loader reads each story from Door43 (logged; its unit is never carried).
   */
  async function runUnit(unit: string, dbName: string, body: (cache: IndexedDBCacheAdapter, m: Meter, net: UnitNetwork) => Promise<number>) {
    say(`[${elapsed()}] ${unit}: start`)
    const unitStarted = Date.now()
    const failuresBefore = failures.length
    const m = meter(unit)
    const cache = cacheAdapterFor(dbName)
    const allowed = new Set<string>()
    const net = cacheOnlyNetwork({
      unit,
      client: door43,
      // Step 1's zip, still on disk: a missing one would be downloaded again.
      kept: (owner, repo, ref) => keptZips.has(`${owner}/${repo}@${ref}`) && existsSync(zipCachePath(join(o.workDir, 'zips'), owner, repo, ref)),
      fetchFn: fetchArchives,
      recorded: stepOne,
      allow: (method, args) => {
        const ok = unit === SHARED_UNIT && (method === 'findRepository' || method === 'fetchTextContent') && obsRepos.has(`${args[0]}/${args[1]}`)
        if (ok && !allowed.has(method)) {
          allowed.add(method)
          say(`  ${unit}: ${method} de ${args[0]}/${args[1]} desde Door43 (el lector de OBS lee cada historia, no el zip)`)
        }
        return ok
      },
    })
    const processFetch = globalThis.fetch
    let parts = 0
    let stopped: string | undefined
    try {
      // Saving a refusal as the process's fetch would give it back at the end: every fetch after refused.
      if (isRefusingFetch(processFetch)) {
        throw new Error(`${unit}: the process's fetch is already a parts unit's refusal (another unit is running in this process), so this one cannot replace it`)
      }
      m.check()
      globalThis.fetch = net.global
      try {
        parts = await body(cache, m, { client: net.client, fetch: net.fetch })
      } finally {
        globalThis.fetch = processFetch
      }
      m.check()
    } catch (e) {
      stopped = messageOf(e)
      throw e
    } finally {
      m.stop()
      const calls = [...new Set(net.calls)]
      if (calls.length) {
        const more = calls.length - DIFFERING_LISTED
        failures.push({
          unit,
          error: `${unit}: it asked the network for what step 1 did not read, so its rows would not be of the files fingerprinted: ${calls.slice(0, DIFFERING_LISTED).join('; ')}${more > 0 ? ` and ${more} more` : ''}`,
        })
      }
      const record: UnitRecord = {
        unit,
        outcome: 'built',
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
  const managerOver = (cache: IndexedDBCacheAdapter, client: Door43Like = door43) =>
    new CatalogManager({ catalogAdapter: catalog, cacheAdapter: cache, door43Client: client, enableNetworkFallback: true, requireSecureConnection: false } as never)
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

  function planOf(unit: string) {
    const plan = unitPlan.get(unit)
    if (!plan) throw new Error(`No inputs were planned for the unit ${unit}`)
    return plan
  }

  /** What a part of `unit` reads; a part that reads something its unit does not could change while its unit looks unchanged. */
  function inputsOfPart(unit: string, slot: PartSlot): FingerprintInputs {
    const read = partInputs(slot, inputs)
    const missing = missingFromUnit(read, planOf(unit).inputs)
    if (missing.length) throw new Error(`The part ${slotId(slot)} reads what its unit ${unit} does not: ${missing.slice(0, DIFFERING_LISTED).join('; ')}`)
    return read
  }

  /**
   * Quote and alignment keys carry the book's stamp: its file's blob (`g…`), or, for a book no file of its release has
   * the path of (`releaseStampedBooks`), the release stamp, which the part must then read (`partInputs` adds it).
   */
  async function checkBookStamp(unit: string, slot: PartSlot, read: FingerprintInputs, checked: Set<string>) {
    if (!slot.book || !BOOK_STAMPED.has(slot.kind) || checked.has(`${slot.resource} ${slot.book}`)) return
    checked.add(`${slot.resource} ${slot.book}`)
    const stamp = bookContentStamp(await metaOf(slot.resource), slot.book)
    if (stamp.startsWith('g') || read.stamps.some(([r, s]) => r === slot.resource && s === stamp)) return
    failures.push({
      unit,
      error: `${slot.resource}: the ${slot.book} rows would carry the stamp ${stamp}, which none of the part's inputs is`,
    })
  }

  const pushPart = (entry: PartEntry) => (entry.kind === 'original' || entry.kind === 'macula' ? originalParts : languageParts).push(entry)

  async function writeParts(unit: string, collected: Map<string, Collected>, m: Meter): Promise<number> {
    const stampChecked = new Set<string>()
    for (const { slot, rows } of collected.values()) {
      const id = slotId(slot)
      const read = inputsOfPart(unit, slot)
      await checkBookStamp(unit, slot, read, stampChecked)
      const { bytes, sha256, rows: n } = await writePart(rows)
      const file = join(o.workDir, partPath(sha256))
      if (!existsSync(file)) writeFileSync(file, bytes)
      const layers = PART_LAYERS.filter((l) => rows.some((r) => r.layer === l))
      const fingerprint = await fingerprintOf({ code, id, inputs: read })
      pushPart({ sha256, bytes: bytes.length, rows: n, ...slot, fingerprint, layers })
      m.sample()
    }
    return collected.size
  }

  /** The previous lists, once step 1 found them usable. */
  let previous: PreviousParts | undefined
  const carried: string[] = []

  /**
   * A unit's parts in the previous lists, when it can be carried: they record the fingerprint the unit has now, every
   * part's fingerprint recomputed now is the one they record, and the bucket still has every part. Else why not.
   */
  async function carriable(unit: string): Promise<{ parts: PartEntry[] } | { why: string }> {
    if (!previous) return { why: 'no previous list' }
    // TODO(loader): the OBS loader reads each story from Door43 at the tag it looks up, not from the zip hashed here.
    if (unit === SHARED_UNIT && obs) return { why: 'OBS stories are read one by one from Door43, not from the zip its fingerprint hashes' }
    const recorded = previous.list.units?.find((u) => u.id === unit)
    if (!recorded) return { why: 'new' }
    if (recorded.fingerprint !== planOf(unit).fingerprint) return { why: 'changed' }
    const parts = [...previous.list.parts, ...previous.originals.parts].filter((p) => unitOfPart(p) === unit)
    // Every resource the unit builds must have left a part: else a part the previous build lost (a silent gap) would
    // stay lost for as long as the unit is carried. A book's source part of each resource; any part of a shared one.
    const book = unit === SHARED_UNIT ? undefined : unit.slice('book '.length)
    for (const key of planOf(unit).keys) {
      if (book === undefined) {
        if (!parts.some((p) => p.resource === key)) return { why: `the previous lists have no part of ${key}` }
        continue
      }
      const kind = (ORIGINAL_LANGUAGE_KEYS as readonly string[]).includes(key) ? 'original' : 'book'
      if (!parts.some((p) => p.resource === key && p.kind === kind && p.book === book && p.layers.includes('sot'))) {
        return { why: `the previous lists have no ${kind} part of ${key} ${book}` }
      }
    }
    for (const p of parts) {
      const slot = slotOfEntry(p)
      let fingerprint: string
      try {
        fingerprint = await fingerprintOf({ code, id: slotId(slot), inputs: inputsOfPart(unit, slot) })
      } catch (e) {
        return { why: `${slotId(slot)}: ${messageOf(e)}` }
      }
      if (fingerprint !== p.fingerprint) return { why: `the fingerprint of ${slotId(slot)} changed` }
    }
    for (const p of parts) {
      if (!(await previous.has(p.sha256))) return { why: `the bucket has no ${p.sha256} (${slotId(slotOfEntry(p))})` }
    }
    return { parts }
  }

  /**
   * Carries the unit when it can (its parts copied, no database opened, nothing written) and says so; false when it
   * must be built.
   */
  async function carry(unit: string): Promise<boolean> {
    const found = await carriable(unit)
    if ('why' in found) {
      if (previous && found.why !== 'changed' && found.why !== 'new') say(`[${elapsed()}] ${unit}: se construye (${found.why})`)
      return false
    }
    const failuresBefore = failures.length
    const stampChecked = new Set<string>()
    for (const p of found.parts) {
      const slot = slotOfEntry(p)
      await checkBookStamp(unit, slot, inputsOfPart(unit, slot), stampChecked)
      pushPart(p)
    }
    const mb = Math.round(rss() / 1024 / 1024)
    peakRssMb = Math.max(peakRssMb, mb)
    units.push({
      unit,
      outcome: 'carried',
      startRssMb: mb,
      peakRssMb: mb,
      seconds: 0,
      parts: found.parts.length,
      jobs: { built: 0, cached: 0, blocked: 0, noop: 0, failed: 0 },
      failures: failures.length - failuresBefore,
    })
    carried.push(unit)
    say(`[${elapsed()}] ${unit}: llevada de la lista anterior, ${found.parts.length} partes`)
    writeReport('running')
    return true
  }

  /**
   * A release zip and its file names, Door43's transient failures tried again; null (and a failure) when it never
   * came. Kept in `<work>/zips`, where the loaders read it.
   */
  async function releaseZip(key: string, m: ResourceMetadata): Promise<{ zip: ArrayBuffer; names: string[] } | null> {
    const { owner, repo } = repoOf(key)
    for (let attempt = 0; ; attempt++) {
      try {
        const since = Date.now()
        const zip = await door43.downloadZipball(owner, repo, refOf(m))
        const names = zipFileNames(zip)
        if (!names) throw new Error('its release zip cannot be read')
        downloaded(zip.byteLength, since)
        keptZips.add(`${owner}/${repo}@${refOf(m)}`)
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

  /**
   * TW and TA titles are made from the catalog row's ingredients, which discovery read with a download of its own (or
   * file by file, for a tag not like `v1`): they must be what the zip hashed here gives, so the titles come from the
   * bytes fingerprinted. Why not, or null.
   */
  async function ingredientsProblem(m: ResourceMetadata, zip: ArrayBuffer, family: 'tw' | 'ta'): Promise<string | null> {
    const listed = m.contentMetadata?.ingredients ?? []
    if (listed.length <= LOADER_TRUSTED_INGREDIENTS) {
      return `its catalog row has ${listed.length} ingredients, so its loader would read its articles' list from Door43 again, not from its release zip`
    }
    const { ingredients } = await (family === 'tw' ? twIngredientsFromZip : taIngredientsFromZip)(zip)
    const byId = (list: ReadonlyArray<{ identifier?: string; title?: string; path?: string }>) =>
      new Map(list.map((i) => [String(i.identifier ?? ''), JSON.stringify([i.title ?? '', String(i.path ?? '').replace(/^\.\//, '')])]))
    const [ours, zips] = [byId(listed), byId(ingredients)]
    const differing = [...new Set([...ours.keys(), ...zips.keys()])].filter((id) => ours.get(id) !== zips.get(id)).sort()
    if (!differing.length) return null
    const more = differing.length - DIFFERING_LISTED
    return `its catalog's ingredients are not those of its release zip (${differing.slice(0, DIFFERING_LISTED).join(', ')}${more > 0 ? ` and ${more} more` : ''}), so its titles would not come from the files fingerprinted`
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
  function recordTreeCheck(key: string, ref: string, check: TreeCheck, whose = "Door43's tree") {
    treeChecks[check.state] += 1
    if (check.state !== 'mismatch') return
    const more = check.differing.length - DIFFERING_LISTED
    failures.push({
      unit: 'catalog',
      error: `${key}: its files differ from ${whose} at ${ref}, so the Worker would compute other fingerprints: ${check.differing.slice(0, DIFFERING_LISTED).join(', ')}${more > 0 ? ` and ${more} more` : ''}`,
    })
  }

  /** Step 1 in the report, metered as the unit `catalog`, before the units (the result's `units` are those). */
  const steps: UnitRecord[] = []
  let catalogStep: { m: Meter; started: number; failuresBefore: number } | undefined
  /** Ends step 1's metering and records it, once: when step 1 is done, or when the build stops in it. */
  function endCatalogStep(stopped?: string) {
    if (!catalogStep) return
    const { m, started, failuresBefore } = catalogStep
    catalogStep = undefined
    m.stop()
    const record: UnitRecord = {
      unit: 'catalog',
      outcome: 'built',
      startRssMb: m.start(),
      peakRssMb: m.peak(),
      seconds: Math.round((Date.now() - started) / 100) / 10,
      parts: 0,
      jobs: { built: 0, cached: 0, blocked: 0, noop: 0, failed: 0 },
      failures: failures.length - failuresBefore,
      ...(stopped ? { stopped } : {}),
    }
    peakRssMb = Math.max(peakRssMb, record.peakRssMb)
    steps.push(record)
    say(`[${elapsed()}] catalog: pico ${record.peakRssMb} MB (+${record.peakRssMb - record.startRssMb}), ${record.seconds} s${stopped ? ', detenido' : ''}`)
    writeReport('running')
  }

  let error: unknown
  try {
    // 1. The catalog: every archive read and hashed, under the memory limit as a unit is.
    catalogStep = { m: meter('catalog'), started: Date.now(), failuresBefore: failures.length }
    const stepMeter = catalogStep.m
    if (o.previous) {
      const why = await previousUnusable(o.previous, { language, compat, code })
      if (why) say(`[${elapsed()}] La lista anterior no se usa (${why}): se construye todo`)
      else previous = o.previous
    }
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
      // The list carries the row's README and licence: one Door43 hiccup in discovery would publish another list
      // for the same inputs, so such a row fails (the zip's text is not put in its place: the whole build has the row's).
      if (m.urls?.metadata) {
        const expected = discoveryReadsOf({ readme: read.readme, manifest: read.manifest })
        if (expected.readme && !m.readme) {
          failures.push({ unit: 'catalog', error: `${key}: its README could not be read during discovery (its release zip has one), so the list would carry an empty one; rerun` })
        }
        if (expected.license && !m.license) {
          failures.push({ unit: 'catalog', error: `${key}: its licence (manifest.yaml's rights) could not be read during discovery (its release zip has one), so the list would carry none; rerun` })
        }
      }
      const family = familyOf({ key, type: String(m.type ?? ''), subject: m.subject })
      if (family === 'tw' || family === 'ta') {
        const why = await ingredientsProblem(m, got.zip, family)
        if (why) {
          failures.push({ unit: 'catalog', error: `${key}: ${why}, so it is left out` })
          leftOut.add(key)
          continue
        }
      }
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
          if (!path) continue
          const book = String(i.identifier).toLowerCase()
          books[book] = path
          if (!read.files.has(path)) {
            releaseStampedBooks.push(`${key} ${book}`)
            say(`  ${key}: ningún archivo de la versión tiene la ruta ${path} de ${book}; sus filas llevan la marca de la versión`)
          }
        }
      }
      stepMeter.check()
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
    // Their catalog rows and MACULA's, as `addLexicons` and `addMacula` write them: a carried shared unit runs neither.
    const lexicons = new Map<string, string>()
    const companionRows: Array<ReturnType<typeof companionCatalogRow>> = []
    for (const key of languageKeys) if (isObs(await metaOf(key))) obsRepos.add(Object.values(repoOf(key)).join('/'))
    const literal = literalTextOf(await Promise.all(languageKeys.map(metaOf)), language) as (ResourceMetadata & { owner?: string }) | undefined
    if (o.lexiconsRef && literal?.owner) {
      for (const lexicon of lexiconRepos(language, lexiconOwnerOf(language, literal.owner))) {
        const repo = `${lexicon.owner}/${lexicon.name}`
        const commit = await resolveLexicon(repo, o.lexiconsRef, stepOne.fetch)
        if (!commit) continue
        const since = Date.now()
        const res = await stepOne.fetch(lexiconArchiveUrl(repo, commit.sha))
        if (!res.ok) throw new Error(`Could not download ${repo} at ${commit.sha} (Door43 answered ${res.status})`)
        const archive = new Uint8Array(await res.arrayBuffer())
        downloaded(archive.byteLength, since)
        const read = await lexiconInputs(archive)
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
        stepMeter.check()
        companionRows.push(companionCatalogRow(lexiconResourceOf(lexicon, language, commit, { title: read.title, license: read.license })))
      }
    }

    // MACULA, from its folder: the Old Testament's files to the Hebrew resource, the New's to the Greek, as `addMacula`
    // splits them. Checked against Taller's git tree at the MACULA commit, which the Worker reads them from.
    const maculaKeys: string[] = []
    if (o.macula) {
      const byKey = (entries: Iterable<[string, string]>) => {
        const out = new Map<string, Map<string, string>>()
        for (const [path, sha] of entries) {
          const key = maculaKeyOf(path.split('/')[1].replace(/\.json$/, ''))
          out.set(key, (out.get(key) ?? new Map()).set(path, sha))
        }
        return out
      }
      const filesOf = byKey(await folderInputs(o.macula.folder, ['trees', 'referents']))
      const ref = o.macula.commit ?? o.macula.version
      const git = folderGitTree(o.macula.folder, ref, ['trees', 'referents'])
      if (!git.tree) say(`  MACULA: sin árbol de git (${git.why})`)
      const treeOf = git.tree && byKey(git.tree.blobs)
      const stamp = resourceContentStamp({ version: o.macula.version, release: { tag_name: o.macula.version, published_at: o.macula.publishedAt } })
      for (const key of MACULA_KEYS) {
        const files = filesOf.get(key)
        const tree = treeOf?.get(key)
        if (files || tree) recordTreeCheck(key, ref, treeCheck(files ?? new Map(), treeOf && { blobs: tree ?? new Map(), complete: true }), "Taller's git tree")
        if (!files) continue
        resourceFiles.set(key, { key, type: 'original-syntax', subject: 'Original Language Syntax', stamp, files })
        maculaKeys.push(key)
      }
      companionRows.push(...maculaCatalogRows(o.macula.folder, o.macula))
      stepMeter.check()
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
    stepMeter.check()
    endCatalogStep()

    // 2. The shared unit.
    if (await carry(SHARED_UNIT)) {
      for (const row of companionRows) await catalog.set(row.resourceKey, row as never)
    } else await runUnit(SHARED_UNIT, SHARED_DB, async (cache, m, net) => {
      const unit = SHARED_UNIT
      const catalogManager = managerOver(cache, net.client)
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
        door43Client: net.client,
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
        for (const l of await addLexicons(cache as never, catalog as never, language, owner, o.lexiconsRef, net.fetch)) {
          say(`  ${l.key}: ${l.entries !== undefined ? `${l.entries} entradas` : l.why}`)
          if (l.entries === undefined) continue
          // The unit's fetch answers the ref's commit as step 1 got it, so it cannot have moved; kept as a check that
          // these rows are of the files fingerprinted.
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
      if (await carry(unit)) continue
      await runUnit(unit, bookDb(book), async (cache, m, net) => {
        const { ofLanguage, originals } = keysOfBook(book)
        const original = resolveOriginalLanguageKey(book)
        const keys = [...ofLanguage, ...originals]
        const catalogManager = managerOver(cache, net.client)
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
          door43Client: net.client,
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
      // Every input step 1 read (a resource left out never got there): the Worker's freshness check compares these.
      stamps: Object.fromEntries([...resourceFiles].map(([key, r]) => [key, r.stamp]).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))),
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
    sizes = partSizes([...languageParts, ...originalParts])
    say(`[${elapsed()}] Listo: ${languageParts.length} partes de ${language}, ${originalParts.length} de los originales, ${units.length - carried.length} unidades construidas y ${carried.length} llevadas, pico ${peakRssMb} MB; ${downloads.archives} archivos descargados (${(downloads.bytes / 1024 / 1024).toFixed(1)} MB, ${downloads.seconds} s)`)
    say(`Tamaños de las partes:\n${sizesTable(sizes)}`)
    return { list, originals: originalsList, summary, failures, units, carried, peakRssMb }
  } catch (e) {
    error = e
    endCatalogStep(messageOf(e))
    throw e
  } finally {
    await deleteDatabases('end', [catalog], [CATALOG_DB])
    writeReport(error === undefined ? 'done' : 'failed', error)
  }
}
