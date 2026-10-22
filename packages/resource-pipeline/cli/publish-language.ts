/**
 * Build a language's packs and views and upload them to the packs bucket, only when Door43, MACULA or the lexicons
 * changed since the build the bucket holds (src/language/publishLanguage.ts), or when `--force` says so.
 *
 *   bun packages/resource-pipeline/cli/publish-language.ts --lang es-419 --work <dir> --generator <sha> \
 *     --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] \
 *     [--dry-run | --no-upload [--parts]] [--force]
 *
 * `--macula` is the `public/` folder of a Taller checkout. `--macula-commit` defaults to the last commit that touched
 * its `trees/` and `referents/`, and `--macula-date` to that commit's date, what apps order MACULA's stamps by
 * (cli/maculaIdentity.ts).
 *
 * `--dry-run` decides only (outcome `would-publish` or `unchanged`). `--no-upload` decides, then builds the packs and
 * the views into `--work` and puts nothing (outcome `built`): a measurement or a check. `--force` builds and publishes
 * even an unchanged build id: for a builder fix no stamp shows and no compat key covers.
 *
 * `--parts` (only with `--no-upload`, until parts are published) builds the language one book at a time
 * (src/language/buildLanguageParts.ts) instead of whole, without deciding: `--work` gets `parts/<sha256>.part.gz`,
 * `catalog/<compat>/<lang>.json`, `catalog/<compat>/originals.json`, `zips/` (the release zips it read) and
 * `parts-report.json` (each unit's jobs, memory and time). `--generator` is not needed. Exits 1 when a job, a book or
 * a resource failed, after writing all of that.
 *
 * The bucket: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. A dry run or a no-upload run without them
 * decides against an empty bucket, as if nothing had been published. One language per process: the build's in-memory
 * databases have fixed names.
 *
 * The log goes to stderr; stdout's one line is the PublishResult as JSON, for the workflow. Exits 0 on `unchanged`,
 * `published`, `would-publish` and `built`, 1 on failure (a build that is not whole, a lexicon ref that does not
 * exist, R2), 2 on bad arguments.
 */

import 'fake-indexeddb/auto'
import { writeFileSync } from 'node:fs'
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
    'Uso: publish-language --lang <código> --work <carpeta> --generator <sha> --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] [--dry-run | --no-upload [--parts]] [--force]'
  )
  process.exit(2)
}

const language = arg('lang')
if (!language || !isLanguageCode(language)) usage(`--lang no es un código de idioma: ${JSON.stringify(language ?? null)}`)
const dryRun = process.argv.includes('--dry-run')
const noUpload = process.argv.includes('--no-upload')
const force = process.argv.includes('--force')
const parts = process.argv.includes('--parts')
if (dryRun && noUpload) usage('--dry-run y --no-upload no van juntos')
// Parts are not published yet: a parts build only goes to the work folder.
if (parts && !noUpload) usage('--parts solo va con --no-upload')
const required = Object.fromEntries([...(parts ? [] : ['generator']), 'macula', 'lexicons-ref'].map((name) => [name, arg(name)]))
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => `--${k}`)
if (missing.length) usage(`Faltan ${missing.join(', ')}`)

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
  const { buildLanguageParts } = await import('../src/language/buildLanguageParts')
  try {
    const date = new Date(macula.date)
    if (Number.isNaN(date.getTime())) throw new Error(`Not an ISO 8601 date for MACULA's commit: ${JSON.stringify(macula.date)}`)
    const built = await buildLanguageParts({
      language,
      workDir,
      // As publishLanguage stamps MACULA: the commit's first ten characters and its date in UTC.
      macula: { folder: maculaFolder, version: macula.commit.slice(0, 10), publishedAt: date.toISOString() },
      lexiconsRef: required['lexicons-ref']!,
      obs: process.argv.includes('--obs'),
      log: (line) => console.error(oneLine(line)),
    })
    const report = { summary: built.summary, units: built.units, peakRssMb: built.peakRssMb, failures: built.failures }
    writeFileSync(join(workDir, 'parts-report.json'), JSON.stringify(report, null, 2))
    for (const f of built.failures) console.error(oneLine(`  falló (${f.unit}) ${f.job ?? ''} ${f.error}`))
    printResult(
      JSON.stringify({
        language,
        outcome: 'built',
        compat: built.list.compat,
        parts: built.list.parts.length,
        originalParts: built.originals.parts.length,
        peakRssMb: built.peakRssMb,
        failures: built.failures.length,
      })
    )
    process.exit(built.failures.length ? 1 : 0)
  } catch (e) {
    console.error(oneLine(`publish-language --parts ${language}: ${e instanceof Error ? e.message : String(e)}`))
    process.exit(1)
  }
}

const env = { endpoint: process.env.R2_ENDPOINT, bucket: process.env.R2_BUCKET, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
const given = Object.values(env).filter(Boolean).length
let bucket: PackBucket
if (given === 4) {
  bucket = r2Bucket({ ...(env as { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string }), log: (line) => console.error(line) })
} else if (given === 0 && (dryRun || noUpload)) {
  console.error(`Sin R2_*: ${dryRun ? '--dry-run' : '--no-upload'} contra un bucket vacío en memoria`)
  bucket = memoryBucket()
} else {
  usage('Faltan R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY (sin ellas solo se puede --dry-run o --no-upload)')
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
