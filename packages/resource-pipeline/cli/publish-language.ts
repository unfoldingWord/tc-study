/**
 * Build a language's packs and views and upload them to the packs bucket, only when Door43, the generator, MACULA or
 * the lexicons changed since the build the bucket holds (src/language/publishLanguage.ts).
 *
 *   bun packages/resource-pipeline/cli/publish-language.ts --lang es-419 --work <dir> --generator <sha> \
 *     --macula <folder> --macula-commit <sha> [--macula-date <iso>] --lexicons-ref <ref> [--obs] [--dry-run]
 *
 * `--macula-date` is the MACULA commit's date, what apps order MACULA's stamps by; without it, it is read from the
 * folder's git (`git log -1 --format=%cI`).
 *
 * The bucket: R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY. A dry run without them decides against
 * an empty bucket, as if nothing had been published. One language per process: the build's in-memory databases have
 * fixed names.
 *
 * The log goes to stderr; stdout's one line is the PublishResult as JSON, for the workflow. Exits 0 on `unchanged` and
 * `published`, 1 on failure, 2 on bad arguments.
 */

import 'fake-indexeddb/auto'
import { tmpdir } from 'node:os'
import { spawnSync } from 'node:child_process'
import { join, resolve } from 'node:path'
import { requireFreshBuilds } from './freshBuilds'
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
    'Uso: publish-language --lang <código> --work <carpeta> --generator <sha> --macula <carpeta> --macula-commit <sha> [--macula-date <iso>] --lexicons-ref <ref> [--obs] [--dry-run]'
  )
  process.exit(2)
}

const language = arg('lang')
if (!language || !isLanguageCode(language)) usage(`--lang no es un código de idioma: ${JSON.stringify(language ?? null)}`)
const dryRun = process.argv.includes('--dry-run')
const required = Object.fromEntries(['generator', 'macula', 'macula-commit', 'lexicons-ref'].map((name) => [name, arg(name)]))
const missing = Object.entries(required).filter(([, v]) => !v).map(([k]) => `--${k}`)
if (missing.length) usage(`Faltan ${missing.join(', ')}`)

function commitDateIn(folder: string): string | undefined {
  const git = spawnSync('git', ['-C', folder, 'log', '-1', '--format=%cI'], { encoding: 'utf8' })
  return git.status === 0 ? git.stdout.trim() || undefined : undefined
}
const maculaFolder = resolve(required.macula!)
const maculaDate = arg('macula-date') ?? commitDateIn(maculaFolder)
if (!maculaDate) usage(`Sin --macula-date, y no se pudo leer la fecha del último commit de ${maculaFolder} con git`)

const env = { endpoint: process.env.R2_ENDPOINT, bucket: process.env.R2_BUCKET, accessKeyId: process.env.R2_ACCESS_KEY_ID, secretAccessKey: process.env.R2_SECRET_ACCESS_KEY }
const given = Object.values(env).filter(Boolean).length
let bucket: PackBucket
if (given === 4) {
  bucket = r2Bucket(env as { endpoint: string; bucket: string; accessKeyId: string; secretAccessKey: string })
} else if (given === 0 && dryRun) {
  console.error('Sin R2_*: dry run contra un bucket vacío en memoria')
  bucket = memoryBucket()
} else {
  usage('Faltan R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID o R2_SECRET_ACCESS_KEY (sin ellas solo se puede --dry-run)')
}

// Packs made with code compiled before its last change are not this code's packs.
requireFreshBuilds(['@bt-synergy/resource-pipeline', '@bt-synergy/language-pack', '@bt-synergy/cache-adapter-indexeddb', '@bt-synergy/catalog-adapter-indexeddb'])

try {
  const result = await publishLanguage({
    language,
    bucket,
    workDir: resolve(arg('work') ?? join(tmpdir(), `publish-language-${language}`)),
    generator: required.generator!,
    macula: { folder: maculaFolder, commit: required['macula-commit']!, date: maculaDate },
    lexiconsRef: required['lexicons-ref']!,
    obs: process.argv.includes('--obs'),
    dryRun,
    log: (line) => console.error(line),
  })
  printResult(JSON.stringify(result))
  process.exit(0)
} catch (e) {
  console.error(oneLine(`publish-language ${language}: ${e instanceof Error ? e.message : String(e)}`))
  process.exit(1)
}
