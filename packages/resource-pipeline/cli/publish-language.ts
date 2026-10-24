/**
 * Build a language's packs and views and upload them to the packs bucket, only when Door43, MACULA or the lexicons
 * changed since the build the bucket holds (src/language/publishLanguage.ts), or when `--force` says so.
 *
 *   bun packages/resource-pipeline/cli/publish-language.ts --lang es-419 --work <dir> --generator <sha> \
 *     --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] \
 *     [--dry-run | --no-upload] [--force]
 *   bun packages/resource-pipeline/cli/publish-language.ts --parts --lang es-419 --work <dir> \
 *     --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] \
 *     [--no-upload [--previous <dir>]] [--force]
 *
 * `--macula` is the `public/` folder of a Taller checkout. `--macula-commit` defaults to the last commit that touched
 * its `trees/` and `referents/`, and `--macula-date` to that commit's date, what apps order MACULA's stamps by
 * (cli/maculaIdentity.ts).
 *
 * `--dry-run` decides only (outcome `would-publish` or `unchanged`). `--no-upload` decides, then builds the packs and
 * the views into `--work` and puts nothing (outcome `built`): a measurement or a check. `--force` builds and publishes
 * even an unchanged build id: for a builder fix no stamp shows and no compat key covers.
 *
 * `--parts` builds the language one book at a time (src/language/publishLanguageParts.ts), carrying every unit whose
 * fingerprint the previous list records, and publishes the parts the bucket lacks, then the originals lists, then the
 * language list last (outcome `published`, or `unchanged` when the list came out as the stored one). `--work` gets
 * `parts/<sha256>.part.gz`, `catalog/<compat>/…` (the lists), `zips/` (the archives it read) and `parts-report.json`
 * (each unit's outcome, jobs, peak memory and time, sizes, downloads, tree checks and the failures; written after every
 * unit, so a run stopped by the memory limit or an error still leaves it). The workflow sends parts to the staging
 * bucket only, until the Worker serves them. `--generator` is not needed. `--force` reads no previous list (every unit
 * is built; parts the bucket has are still not put again). `--dry-run` is refused: a parts run decides by building.
 * With `--no-upload` nothing is put (outcome `built`); the previous lists come from the bucket when R2_* are given,
 * or from `--previous`, the work folder of an earlier whole `--parts --no-upload` run, whose carried part files are
 * copied into `--work`. Exits 1 when a job, a book or a resource failed, after writing all of that.
 *
 * The bucket: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, all four or none. A dry run or a
 * no-upload run without them decides against an empty bucket, as if nothing had been published. One language per
 * process: the build's in-memory databases have fixed names.
 *
 * The log goes to stderr; stdout's last line is the result as JSON (PublishResult, or PartsPublishResult with
 * `--parts`), for the workflow. Exits 0 on `unchanged`, `published`, `would-publish` and `built`, 1 on failure (a
 * build that is not whole, a lexicon ref that does not exist, R2), 2 on bad arguments.
 */

import 'fake-indexeddb/auto'
import { existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { requireFreshBuilds } from './freshBuilds'
import { maculaIdentity } from './maculaIdentity'
import type { PackBucket } from '../src/language/publishLanguage'

// The pipeline's libraries print with console.log, some as they load: stdout is kept for the result line alone.
const printResult = console.log.bind(console)
console.log = console.error
const { isLanguageCode, memoryBucket, oneLine, publishLanguage, r2Bucket } = await import('../src/language/publishLanguage')

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(`--${name}`)
  return i >= 0 ? process.argv[i + 1] : undefined
}

function usage(why: string): never {
  console.error(why)
  console.error(
    'Uso: publish-language --lang <código> --work <carpeta> --generator <sha> --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] [--dry-run | --no-upload] [--force]'
  )
  console.error(
    '     publish-language --parts --lang <código> --work <carpeta> --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] [--no-upload [--previous <carpeta>]] [--force]'
  )
  process.exit(2)
}

const language = arg('lang')
if (!language || !isLanguageCode(language)) usage(`--lang no es un código de idioma: ${JSON.stringify(language ?? null)}`)
const dryRun = process.argv.includes('--dry-run')
const noUpload = process.argv.includes('--no-upload')
const force = process.argv.includes('--force')
const parts = process.argv.includes('--parts')
const previousDir = arg('previous')
if (dryRun && noUpload) usage('--dry-run y --no-upload no van juntos')
// A parts run has no stamps pre-check (it decides by building and comparing the lists): nothing to dry-run.
if (parts && dryRun) usage('--parts y --dry-run no van juntos: una corrida por partes decide construyendo')
if (process.argv.includes('--previous')) {
  if (!previousDir || previousDir.startsWith('--')) usage('Falta la carpeta de --previous')
  // What a work folder holds says nothing of what the bucket holds: a list published on its word could name a missing part.
  if (!parts || !noUpload) usage('--previous solo va con --parts --no-upload')
  if (force) usage('--previous y --force no van juntos: --force no lee ninguna lista anterior')
}
const required = Object.fromEntries([...(parts ? [] : ['generator']), 'macula', 'lexicons-ref'].map((name) => [name, arg(name)]))
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => `--${k}`)
if (missing.length) usage(`Faltan ${missing.join(', ')}`)

const env = { endpoint: process.env.R2_ENDPOINT, bucket: process.env.R2_BUCKET, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
const given = Object.values(env).filter(Boolean).length
const r2 = () => r2Bucket({ ...(env as { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }), log: (line) => console.error(line) })
if (given !== 4 && (given !== 0 || !(dryRun || noUpload))) {
  usage('Faltan R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY (sin ellas solo se puede --dry-run o --no-upload)')
}

const maculaFolder = resolve(required.macula!)
let macula: { commit: string; date: string }
try {
  macula = maculaIdentity(maculaFolder, { commit: arg('macula-commit'), date: arg('macula-date') })
} catch (e) {
  usage(`No se pudo leer el commit de MACULA en ${maculaFolder}: ${e instanceof Error ? e.message : String(e)}`)
}
console.error(`MACULA: ${macula.commit} (${macula.date})`)

const workDir = resolve(arg('work') ?? join(tmpdir(), `publish-language-${language}`))

if (parts) {
  requireFreshBuilds(['@bt-synergy/resource-pipeline', '@bt-synergy/language-pack', '@bt-synergy/cache-adapter-indexeddb', '@bt-synergy/catalog-adapter-indexeddb'])
  const { PARTS_REPORT } = await import('../src/language/buildLanguageParts')
  const { publishLanguageParts } = await import('../src/language/publishLanguageParts')
  // With --no-upload the bucket, when given, is only read (the previous lists and which parts it has): nothing is put.
  if (given === 0) console.error(`Sin R2_*: --no-upload ${previousDir ? `con las listas de ${previousDir}` : 'sin lista anterior: se construye todo'}`)
  let exitCode = 1
  let failure: unknown
  try {
    const result = await publishLanguageParts({
      language,
      workDir,
      macula: { folder: maculaFolder, ...macula },
      lexiconsRef: required['lexicons-ref']!,
      obs: process.argv.includes('--obs'),
      ...(given === 4 ? { bucket: r2() } : {}),
      noUpload,
      ...(previousDir ? { previousDir: resolve(previousDir) } : {}),
      force,
      log: (line) => console.error(line),
    })
    printResult(JSON.stringify(result))
    exitCode = result.failures ? 1 : 0
  } catch (e) {
    failure = e
    console.error(oneLine(`publish-language --parts ${language}: ${e instanceof Error ? e.message : String(e)}`))
  } finally {
    // buildLanguageParts writes the report after every unit and when it ends; a run that failed before it could
    // (the work folder, a bad date, an unreadable previous list) still leaves one, so the workflow's artifact always
    // says why.
    const report = join(workDir, PARTS_REPORT)
    if (!existsSync(report)) {
      try {
        mkdirSync(workDir, { recursive: true })
        writeFileSync(report, JSON.stringify({ language, state: 'failed', error: failure instanceof Error ? failure.message : String(failure ?? 'unknown'), peakRssMb: 0, units: [], failures: [] }, null, 2))
      } catch {
        // No work folder to write in: the log already says why.
      }
    }
  }
  process.exit(exitCode)
}

let bucket: PackBucket
if (given === 4) {
  bucket = r2()
} else {
  console.error(`Sin R2_*: ${dryRun ? '--dry-run' : '--no-upload'} contra un bucket vacío en memoria`)
  bucket = memoryBucket()
}

// Packs made with code compiled before its last change are not this code's packs.
requireFreshBuilds(['@bt-synergy/resource-pipeline', '@bt-synergy/language-pack', '@bt-synergy/cache-adapter-indexeddb', '@bt-synergy/catalog-adapter-indexeddb'])

try {
  const result = await publishLanguage({
    language,
    bucket,
    workDir,
    generator: required.generator!,
    macula: { folder: maculaFolder, ...macula },
    lexiconsRef: required['lexicons-ref']!,
    obs: process.argv.includes('--obs'),
    dryRun,
    noUpload,
    force,
    log: (line) => console.error(line),
  })
  printResult(JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error(oneLine(`publish-language ${language}: ${e instanceof Error ? e.message : String(e)}`))
  process.exit(1)
}
