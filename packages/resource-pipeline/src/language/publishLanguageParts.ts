/**
 * Publish one language as parts (spec §3, §4): build it, carrying every unit an earlier publish already has
 * (`buildLanguageParts` with `previous`), then put what the bucket lacks, in the order that keeps a cut-short run
 * harmless:
 *
 * 1. the parts (`parts/<sha256>.part.gz`, named by content: new keys), each asked for first and skipped when the
 *    bucket has it;
 * 2. the originals list at its content address (`catalog/<compat>/originals/<sha256>.json`), which no other language's
 *    run can overwrite;
 * 3. `catalog/<compat>/originals.json`, the latest originals list (last writer wins between languages);
 * 4. `catalog/<compat>/<language>.json` last, once every part both lists name is known to be in the bucket.
 *
 * Until step 4 the bucket names the previous build, whose parts nothing deletes.
 *
 * The Worker's cleanup deletes a part no list has named for 30 days once R2 wrote it 30 days ago too, and a run may name
 * such a part again (a carried unit, or a build that comes out as an old one). So a part or originals address the run
 * finds there is put again when R2 wrote it more than `PART_REFRESH_DAYS` ago, and before any list is written R2 is
 * asked again, past the answers kept for the run, for each one: a part taken in between fails the run instead of being
 * named. Nothing is decided from Door43's
 * stamps: every run downloads and recomputes, and is `unchanged` when the language list comes out as the stored one.
 * A build with any failure is never published: a carried unit would freeze a resource dropped by a failed download.
 */

import { copyFileSync, existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import {
  compatKeyOf,
  ORIGINAL_LANGUAGE_KEYS,
  originalsListPath,
  PARTS_FORMAT_VERSION,
  partPath,
  partsListPath,
  serializePartsList,
  sha256Hex,
  type PartsList,
} from '@bt-synergy/language-pack'
import { MACULA_KEYS } from '../../cli/companions'
import { buildLanguageParts, PARTS_REPORT, type PartsReport, type PreviousParts } from './buildLanguageParts'
import { PACK_VERSIONS } from './packVersions'
import { eachLimit, IMMUTABLE, isLanguageCode, NO_CACHE, oneLine, type PackBucket } from './publishLanguage'

/**
 * `unchanged`: the language list came out as the stored one and nothing was missing. `published`: something was put.
 * `built`: `noUpload` built into the work folder and put nothing.
 */
export type PartsPublishOutcome = 'unchanged' | 'published' | 'built'

export type PartsPublishResult = {
  language: string
  outcome: PartsPublishOutcome
  compat: string
  /** The code the lists were built with (their `code`): what the workflow records in the ok status. */
  code: string
  units: { built: number; carried: number }
  /**
   * `put`: parts uploaded by this run; `present`: parts the bucket (or the previous work folder) already had;
   * `refreshed`: those of `present` put again because R2 wrote them more than `PART_REFRESH_DAYS` ago.
   */
  parts: { language: number; originals: number; put: number; present: number; refreshed: number }
  peakRssMb: number
  /** The build's failures and any reason the lists are not whole; more than 0 is never published. */
  failures: number
}

const PART_UPLOADS_AT_ONCE = 16

/**
 * A part (or an originals address) R2 wrote longer ago than this is put again when a run names it. The cleanup wants
 * 30 days since R2 wrote it as well as 30 unnamed, so «written 30 days ago» comes to mean «no build named it for 30
 * days», and a part a run found there cannot be due for at least the 10 days after: far longer than any run.
 */
export const PART_REFRESH_DAYS = 20
const PART_REFRESH_MS = PART_REFRESH_DAYS * 86_400_000

/** At most this many keys are named in the error of a run whose parts vanished. */
const VANISHED_LISTED = 3

const GZIP = { contentType: 'application/gzip', cacheControl: IMMUTABLE }

type Found = { uploaded: Date } | null

/** At most this many reasons are named in the error of a build that is not whole. */
const GAPS_LISTED = 10

const resourceIdOf = (key: string) => key.split('/')[2] ?? ''

/** Why parts lists must not be published, beyond the build's own failures: what `notWhole` asks of whole packs. */
function partsGaps(list: PartsList, originals: PartsList): string[] {
  const out: string[] = []
  const inOriginals = new Set(originals.parts.map((p) => p.resource))
  for (const key of [...ORIGINAL_LANGUAGE_KEYS, ...MACULA_KEYS]) {
    if (!inOriginals.has(key)) out.push(`${key}: no tiene partes en la lista de originales`)
  }
  // A language without an aligned literal text cannot be opened in Servos (the spec's eligibility rule).
  if (!list.resources.some((r) => r.subject === 'Aligned Bible' && /lt$/.test(resourceIdOf(r.key)))) {
    out.push('la lista no tiene texto literal alineado')
  }
  return out
}

/** Where the previous lists are read from: the bucket's keys, or the same paths under an earlier work folder. */
type ListSource = { where: string; read(path: string): Promise<PartsList | null> }

function folderSource(dir: string): ListSource {
  return {
    where: dir,
    async read(path) {
      const file = join(dir, path)
      return existsSync(file) ? (JSON.parse(readFileSync(file, 'utf8')) as PartsList) : null
    },
  }
}

function bucketSource(bucket: PackBucket): ListSource {
  return { where: 'el bucket', read: (path) => bucket.getJson<PartsList>(path) }
}

/**
 * An earlier work folder is a previous build only when that build ended whole: the build writes its lists even after
 * failures, and such lists would carry a failed run's partial units as if nothing had gone wrong.
 */
function refuseUnfinished(dir: string): void {
  const file = join(dir, PARTS_REPORT)
  let report: Partial<PartsReport>
  try {
    report = JSON.parse(readFileSync(file, 'utf8')) as Partial<PartsReport>
  } catch (e) {
    throw new Error(`previousDir ${dir} has no readable ${PARTS_REPORT}, so nothing says its build ended whole: ${e instanceof Error ? e.message : String(e)}`)
  }
  const failures = Array.isArray(report.failures) ? report.failures.length : undefined
  if (report.state !== 'done' || failures !== 0) {
    throw new Error(`previousDir ${dir} is not a whole build (its ${PARTS_REPORT} says state ${String(report.state)}, ${failures ?? 'unknown'} failures): its lists cannot be carried`)
  }
}

/**
 * The previous language list, and the originals list it names when that one can be read too. The path is taken only
 * when it is the content address its sha256 gives, so a list cannot point the run at any other key or file.
 */
async function readPrevious(
  source: ListSource,
  compat: string,
  language: string,
  say: (line: string) => void
): Promise<{ list: PartsList | null; originals: PartsList | null }> {
  const list = await source.read(partsListPath(compat, language))
  if (!list) {
    say(`${language}: no hay lista anterior en ${source.where}: se construye todo`)
    return { list: null, originals: null }
  }
  const named = list.originals
  if (!named || named.path !== originalsListPath(compat, named.sha256)) {
    say(`${language}: la lista anterior no nombra una lista de originales de ${compat}: se construye todo`)
    return { list, originals: null }
  }
  const originals = await source.read(named.path)
  if (!originals) say(`${language}: la lista anterior nombra ${named.path}, que ${source.where} no tiene: se construye todo`)
  return { list, originals }
}

export async function publishLanguageParts(o: {
  language: string
  /** Gets what `buildLanguageParts` writes: `parts/`, `catalog/<compat>/`, `zips/`, `parts-report.json`. */
  workDir: string
  /** `date`: the commit's date (ISO 8601); MACULA's rows are stamped with the commit's first ten characters and it. */
  macula: { folder: string; commit: string; date: string }
  lexiconsRef: string
  obs?: boolean
  /** Where the lists are published, and the previous ones read from. Required unless `noUpload`. */
  bucket?: PackBucket
  /** Build into `workDir` and put nothing (a measurement, a check). */
  noUpload?: boolean
  /**
   * With `noUpload` only: an earlier run's work folder, read instead of the bucket. Its lists are the previous ones, its
   * part files say what is there, and carried parts are copied from it into `workDir`, so the new folder is whole.
   */
  previousDir?: string
  /** Read no previous list: every unit is built (the parts the bucket has are still not put again). */
  force?: boolean
  /** The clock a part's age is read against (tests). */
  now?: () => Date
  build?: typeof buildLanguageParts
  log?: (line: string) => void
}): Promise<PartsPublishResult> {
  const { language, workDir, bucket } = o
  if (!isLanguageCode(language)) throw new Error(`Not a language code: ${JSON.stringify(language)}`)
  const maculaDate = new Date(o.macula.date)
  if (!/^\d{4}-\d{2}-\d{2}/.test(o.macula.date) || Number.isNaN(maculaDate.getTime())) {
    throw new Error(`Not an ISO 8601 date for MACULA's commit: ${JSON.stringify(o.macula.date)}`)
  }
  if (!o.noUpload && !bucket) throw new Error('No bucket to publish to: give one, or noUpload')
  // What a work folder has says nothing of what the bucket has: a list published on that word could name a missing part.
  if (o.previousDir && !o.noUpload) throw new Error('previousDir goes only with noUpload: its parts are not the bucket’s')
  if (o.previousDir) refuseUnfinished(o.previousDir)
  const write = o.log ?? (() => {})
  const say = (line: string) => write(oneLine(line))
  const build = o.build ?? buildLanguageParts
  const compat = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)
  const languagePath = partsListPath(compat, language)
  const latestPath = partsListPath(compat, 'originals')

  const source = o.previousDir ? folderSource(o.previousDir) : bucket ? bucketSource(bucket) : null
  const now = o.now ?? (() => new Date())
  const partHere: ((sha256: string) => Promise<Found>) | null = o.previousDir
    ? async (sha) => {
        const file = join(o.previousDir!, partPath(sha))
        return existsSync(file) ? { uploaded: statSync(file).mtime } : null
      }
    : bucket
      ? (sha) => bucket.stat(partPath(sha))
      : null
  // Asked once per part for the run: the build asks for the parts of the units it may carry, the upload for the rest.
  const known = new Map<string, Promise<Found>>()
  const found = (sha: string): Promise<Found> => {
    let answer = known.get(sha)
    if (!answer) {
      answer = partHere ? partHere(sha) : Promise.resolve(null)
      known.set(sha, answer)
      // A failed answer is not remembered: the next ask tries again.
      answer.catch(() => known.delete(sha))
    }
    return answer
  }
  const has = async (sha: string): Promise<boolean> => (await found(sha)) !== null
  const old = (there: { uploaded: Date }) => now().getTime() - there.uploaded.getTime() > PART_REFRESH_MS

  let stored: { list: PartsList | null; originals: PartsList | null } = { list: null, originals: null }
  if (o.force) say(`${language}: forzado, no se lee la lista anterior`)
  else if (source) stored = await readPrevious(source, compat, language, say)
  const previous: PreviousParts | undefined = stored.list && stored.originals ? { list: stored.list, originals: stored.originals, has } : undefined

  const built = await build({
    language,
    workDir,
    // The whole commit too: MACULA's files are checked against Taller's git tree at it.
    macula: { folder: o.macula.folder, version: o.macula.commit.slice(0, 10), publishedAt: maculaDate.toISOString(), commit: o.macula.commit },
    lexiconsRef: o.lexiconsRef,
    obs: o.obs ?? false,
    log: say,
    ...(previous ? { previous } : {}),
  })

  // The lists exactly as the build wrote them, and the originals list the language list names.
  const languageText = readFileSync(join(workDir, languagePath), 'utf8')
  const list = JSON.parse(languageText) as PartsList
  const originalsPath = list.originals?.path ?? ''
  const originalsText = readFileSync(join(workDir, originalsPath), 'utf8')
  const originalsSha = await sha256Hex(new TextEncoder().encode(originalsText))
  if (originalsPath !== originalsListPath(compat, originalsSha) || list.originals?.sha256 !== originalsSha) {
    throw new Error(`${languagePath} names ${originalsPath}, not the originals list the build wrote (${originalsSha})`)
  }
  const originals = JSON.parse(originalsText) as PartsList
  const shas = [...new Set([...list.parts, ...originals.parts].map((p) => p.sha256))]

  // Carried parts were not written by this build: from the earlier folder, so this one holds every part it names.
  if (o.previousDir) {
    for (const sha of shas) {
      const file = join(workDir, partPath(sha))
      if (existsSync(file)) continue
      const from = join(o.previousDir, partPath(sha))
      if (!existsSync(from)) throw new Error(`${partPath(sha)}: neither built nor in ${o.previousDir}`)
      copyFileSync(from, file)
    }
  }

  const gaps = [...built.failures.map((f) => `${f.unit}${f.job ? ` ${f.job}` : ''}: ${f.error}`), ...partsGaps(list, originals)]
  const units = { built: built.units.filter((u) => u.outcome === 'built').length, carried: built.carried.length }
  const result = (outcome: PartsPublishOutcome, counts: { put: number; present: number; refreshed: number }): PartsPublishResult => ({
    language,
    outcome,
    compat,
    code: list.code,
    units,
    parts: { language: list.parts.length, originals: originals.parts.length, ...counts },
    peakRssMb: built.peakRssMb,
    failures: gaps.length,
  })

  if (o.noUpload) {
    for (const gap of gaps) say(`  no está entero: ${gap}`)
    const present = (await Promise.all([...known.values()].map((a) => a.then(Boolean, () => false)))).filter(Boolean).length
    say(`${language}: --no-upload, ${shas.length} partes y las listas en ${workDir}; no se sube nada`)
    return result('built', { put: 0, present, refreshed: 0 })
  }
  if (gaps.length) {
    const more = gaps.length > GAPS_LISTED ? ` and ${gaps.length - GAPS_LISTED} more` : ''
    throw new Error(`Not publishing ${language}, the build is not whole: ${gaps.slice(0, GAPS_LISTED).join('; ')}${more}`)
  }
  const target = bucket!

  /** A part's bytes to put again: this run's file, or for a carried part the bucket's own; either checked against the name. */
  async function bytesToRefresh(sha: string): Promise<Uint8Array> {
    const key = partPath(sha)
    const file = join(workDir, key)
    if (existsSync(file)) {
      // The build keeps a part file already in the folder, so a bad one survives a rerun over the same folder.
      const bytes = readFileSync(file)
      const got = await sha256Hex(bytes)
      if (got !== sha) throw new Error(`${file} is not the part its name says (its sha256 is ${got}): not publishing ${language}, and the bucket's ${key} is left as it was; delete that file and run again`)
      return bytes
    }
    const bytes = await target.getBytes(key)
    if (!bytes) throw new Error(`Not publishing ${language}: ${key} vanished while publishing`)
    const got = await sha256Hex(bytes)
    if (got !== sha) throw new Error(`${key} in the bucket is not the part its name says (its sha256 is ${got}): not publishing ${language}; run again with force, which builds its unit and puts its own bytes over this object`)
    return bytes
  }

  /** R2 asked again, past the answers kept for the run: the cleanup may have taken a key the run found there. */
  async function stillThere(keys: string[]): Promise<void> {
    const gone: string[] = []
    await eachLimit(keys, PART_UPLOADS_AT_ONCE, async (key) => {
      if (!(await target.stat(key))) gone.push(key)
    })
    if (!gone.length) return
    const more = gone.length > VANISHED_LISTED ? ` and ${gone.length - VANISHED_LISTED} more` : ''
    throw new Error(`Not publishing ${language}: ${gone.length} parts vanished while publishing (${gone.slice(0, VANISHED_LISTED).join(', ')}${more}); a new run puts them again`)
  }

  // 1. The parts. Each one is put or known there before any list: the lists may name only those.
  const there = new Set<string>()
  const foundThere: string[] = []
  let put = 0
  let refreshed = 0
  await eachLimit(shas, PART_UPLOADS_AT_ONCE, async (sha) => {
    const key = partPath(sha)
    const before = await found(sha)
    if (before) {
      foundThere.push(key)
      if (old(before)) {
        await target.put(key, await bytesToRefresh(sha), GZIP)
        refreshed++
      }
    } else {
      const file = join(workDir, key)
      if (!existsSync(file)) throw new Error(`${key} is neither in the bucket nor in ${workDir}: not publishing ${language}`)
      await target.put(key, readFileSync(file), GZIP)
      put++
    }
    there.add(sha)
  })
  const unknown = shas.filter((sha) => !there.has(sha))
  if (unknown.length) throw new Error(`Not publishing ${language}: ${unknown.length} parts its lists name are not known to be in the bucket (${unknown.slice(0, 3).join(', ')})`)
  const counts = { put, present: foundThere.length, refreshed }
  say(`${language}: ${put} partes subidas, ${counts.present} ya estaban${refreshed ? ` (${refreshed} subidas otra vez: R2 las escribió hace más de ${PART_REFRESH_DAYS} días)` : ''}`)

  // The stored list is the one just made: its originals list is at its address (it was read from there).
  if (stored.list && stored.originals && serializePartsList(stored.list) === languageText) {
    // Nothing is written, but the run must not end ok over a part that is gone.
    await stillThere(foundThere)
    say(`${language}: la lista no cambió${put ? `; se subieron ${put} partes que faltaban` : ''}`)
    return result(put ? 'published' : 'unchanged', counts)
  }

  // 2–3. The originals list, by content (immutable: the same key is the same text), then as the latest. The latest is
  // left alone when this language's originals did not change: another language may have written newer ones since.
  const originalsThere = await target.stat(originalsPath)
  if (!originalsThere || old(originalsThere)) {
    await target.put(originalsPath, originalsText, { contentType: 'application/json', cacheControl: IMMUTABLE })
    say(`subido ${originalsPath}${originalsThere ? ' otra vez' : ''}`)
  }
  await stillThere(originalsThere ? [...foundThere, originalsPath] : foundThere)
  if (stored.list?.originals?.sha256 !== originalsSha || !(await target.has(latestPath))) {
    await target.put(latestPath, originalsText, { contentType: 'application/json', cacheControl: NO_CACHE })
    say(`subido ${latestPath}`)
  }
  // 4. The language list, last.
  await target.put(languagePath, languageText, { contentType: 'application/json', cacheControl: NO_CACHE })
  say(`subido ${languagePath}`)
  return result('published', counts)
}
