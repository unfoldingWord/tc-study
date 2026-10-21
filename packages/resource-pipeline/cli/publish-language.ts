/**
 * Build a language's packs and views and upload them to the packs bucket, only when Door43, the generator, MACULA or
 * the lexicons changed since the build the bucket holds (src/language/publishLanguage.ts).
 *
 *   bun packages/resource-pipeline/cli/publish-language.ts --lang es-419 --work <dir> --generator <sha> \
 *     --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] \
 *     [--dry-run | --no-upload]
 *
 * `--macula` is the `public/` folder of a Taller checkout. `--macula-commit` defaults to the last commit that touched
 * its `trees/` and `referents/`, and `--macula-date` to that commit's date, what apps order MACULA's stamps by
 * (cli/maculaIdentity.ts).
 *
 * `--dry-run` decides only (outcome `would-publish` or `unchanged`). `--no-upload` decides, then builds the packs and
 * the views into `--work` and puts nothing (outcome `built`): a measurement or a check.
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
    'Uso: publish-language --lang <código> --work <carpeta> --generator <sha> --macula <taller>/public [--macula-commit <sha>] [--macula-date <iso>] --lexicons-ref <ref> [--obs] [--dry-run | --no-upload]'
  )
  process.exit(2)
}

const language = arg('lang')
if (!language || !isLanguageCode(language)) usage(`--lang no es un código de idioma: ${JSON.stringify(language ?? null)}`)
const dryRun = process.argv.includes('--dry-run')
const noUpload = process.argv.includes('--no-upload')
if (dryRun && noUpload) usage('--dry-run y --no-upload no van juntos')
const required = Object.fromEntries(['generator', 'macula', 'lexicons-ref'].map((name) => [name, arg(name)]))
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
    workDir: resolve(arg('work') ?? join(tmpdir(), `publish-language-${language}`)),
    generator: required.generator!,
    macula: { folder: maculaFolder, ...macula },
    lexiconsRef: required['lexicons-ref']!,
    obs: process.argv.includes('--obs'),
    dryRun,
    noUpload,
    log: (line) => console.error(line),
  })
  printResult(JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error(oneLine(`publish-language ${language}: ${e instanceof Error ? e.message : String(e)}`))
  process.exit(1)
}
