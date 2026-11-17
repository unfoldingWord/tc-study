/**
 * Build the catalog `zxx-obsimg` (the Open Bible Stories pictures) and upload what the bucket lacks.
 *
 *   bun packages/resource-pipeline/cli/publish-obs-images.ts --work <dir> [--bucket-dir <dir>] [--no-upload] [--sign-key <PKCS#8 PEM file of an Ed25519 key>]
 *
 * The bucket: `--bucket-dir` (a folder, for local runs), else R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (all four
 * or none), else only `--no-upload` is allowed (the bucket is then empty, in memory).
 *
 * In order: the published `zxx-obsimg` catalog is read; the zip is downloaded (kept in `<work>/cache/`), checked against its pin and
 * converted; the build runs in process into `<work>/obsimg-out/` with the revision one more than the published one (1 when none) and
 * `previous` the published id (`build-v3 --obs-images`); then `publishStandalone`: the missing segments, then the catalog. A catalog equal
 * to the published one apart from `about` (and signed by this key) is `unchanged`. No common catalog is read and no registry is written.
 *
 * The log goes to stderr; the last stdout line is the result as JSON:
 * `{"outcome":"published"|"unchanged"|"built","catalog":"zxx-obsimg","revision":n,"id":"<hex>","segments":{"uploaded":n,"present":n}}`.
 * Exit 0 for those outcomes, 1 for a build or upload failure, 2 for bad arguments.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdir, rm } from 'node:fs/promises'
import { join, resolve } from 'node:path'
import { catalogView, KNOWN, OBSIMG_CATALOG, readSegment } from '@bt-synergy/language-pack-v3'
import { dirBucket } from '../src/language/dirBucket'
import { memoryBucket, oneLine, type PackBucket, r2Bucket } from '../src/language/publishLanguage'
import { publishStandalone, readPublishedCatalog } from '../src/language/publishV3'
import { readSigningKey, type SigningKey } from '../src/language/signKey'
import { main as buildV3, type ObsImagesDeps } from './build-v3'

class UsageError extends Error {}

export const USAGE =
  'Usage: publish-obs-images --work <dir> [--bucket-dir <dir>] [--no-upload] [--sign-key <PEM file>]\n' +
  '  The bucket is --bucket-dir, else R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (all or none); with neither only --no-upload is allowed.'

type Io = { log: (line: string) => void; error: (line: string) => void; out?: (line: string) => void }
type Env = Record<string, string | undefined>

const BOOLEAN_FLAGS = ['no-upload']
const VALUE_FLAGS = ['work', 'bucket-dir', 'sign-key']

type Options = { work: string; bucketDir?: string; noUpload: boolean; signKey?: string }

function parse(argv: string[]): Options {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]
    if (!name.startsWith('--')) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    const key = name.slice(2)
    if (flags.has(key)) throw new UsageError(`${name} is given twice`)
    if (BOOLEAN_FLAGS.includes(key)) {
      flags.set(key, 'true')
      continue
    }
    if (!VALUE_FLAGS.includes(key)) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`The value of ${name} is missing`)
    flags.set(key, value)
    i += 1
  }
  const work = flags.get('work')
  if (work === undefined) throw new UsageError('--work is missing')
  const signKey = flags.get('sign-key')
  if (signKey !== undefined && (!existsSync(signKey) || !statSync(signKey).isFile())) throw new UsageError(`--sign-key: ${signKey} is not a file`)
  return { work, bucketDir: flags.get('bucket-dir'), noUpload: flags.has('no-upload'), signKey }
}

function bucketOf(o: Options, env: Env, io: Io): PackBucket | undefined {
  if (o.bucketDir !== undefined) return dirBucket(resolve(o.bucketDir))
  const names = ['R2_ENDPOINT', 'R2_BUCKET', 'R2_ACCESS_KEY_ID', 'R2_SECRET_ACCESS_KEY']
  const given = names.filter((n) => env[n]).length
  if (given === 4) return r2Bucket({ endpoint: env.R2_ENDPOINT!, bucket: env.R2_BUCKET!, accessKeyId: env.R2_ACCESS_KEY_ID!, secretAccessKey: env.R2_SECRET_ACCESS_KEY!, log: io.error })
  if (given !== 0) throw new UsageError(`Missing ${names.filter((n) => !env[n]).join(', ')}: give all four R2 variables or none`)
  if (!o.noUpload) throw new UsageError('No bucket: give --bucket-dir or the four R2 variables (without them only --no-upload is allowed)')
  io.error('No bucket: --no-upload against an empty bucket in memory')
  return undefined
}

type Result = { outcome: 'published' | 'unchanged' | 'built'; catalog: string; revision: number; id: string; segments: { uploaded: number; present: number } }

class BuildFailure extends Error {}

async function run(o: Options, env: Env, io: Io, deps?: ObsImagesDeps): Promise<Result> {
  const bucket = bucketOf(o, env, io)
  const store = bucket ?? memoryBucket()
  const signer: SigningKey | undefined = o.signKey === undefined ? undefined : await readSigningKey(o.signKey)
  const out = resolve(o.work, 'obsimg-out')
  const cache = resolve(o.work, 'cache')

  const published = await readPublishedCatalog(store, OBSIMG_CATALOG)
  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  const args = [
    '--obs-images', '--out', out, '--cache', cache,
    '--revision', String((published?.revision ?? 0) + 1),
    ...(published === undefined ? [] : ['--previous', published.id]),
    ...(o.signKey === undefined ? [] : ['--sign-key', o.signKey]),
  ]
  const code = await buildV3(args, { log: io.error, error: io.error }, undefined, deps)
  if (code !== 0) throw new BuildFailure(`build-v3 --obs-images failed (exit ${code})`)

  const built = new Uint8Array(readFileSync(join(out, `catalog-${OBSIMG_CATALOG}.seg`)))
  const { seg, id } = await readSegment(built, { known: KNOWN.catalog, expectedClass: 'catalog' })
  const builtRef = { revision: catalogView(seg).about.revision, id }
  if (o.noUpload) return { outcome: 'built', catalog: OBSIMG_CATALOG, ...builtRef, segments: { uploaded: 0, present: 0 } }

  const result = await publishStandalone({ bucket: store, outDir: out, name: OBSIMG_CATALOG, signer, log: io.error })
  const ref = result.outcome === 'published' ? builtRef : { revision: published!.revision, id: published!.id }
  return { outcome: result.outcome, catalog: OBSIMG_CATALOG, ...ref, segments: { uploaded: result.uploaded.filter((k) => k.startsWith('v3/seg/')).length, present: result.skipped.length } }
}

/** The command: its exit code (0, 1 for a build or upload failure, 2 for bad arguments). The result JSON goes to `io.out`, the log to `io.error`. */
export async function main(argv: string[], env: Env = process.env, io: Io = { log: console.error, error: console.error, out: console.log }, deps?: ObsImagesDeps): Promise<number> {
  try {
    const options = parse(argv)
    const result = await run(options, env, io, deps)
    ;(io.out ?? console.log)(JSON.stringify(result))
    return 0
  } catch (error) {
    if (error instanceof UsageError) {
      io.error(error.message)
      io.error(USAGE)
      return 2
    }
    io.error(oneLine(`publish-obs-images: ${error instanceof Error ? error.message : String(error)}`))
    return 1
  }
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  // The pipeline's libraries print with console.log: stdout is kept for the result line alone.
  const printResult = console.log.bind(console)
  console.log = console.error
  process.exitCode = await main(process.argv.slice(2), process.env, { log: console.error, error: console.error, out: printResult })
}
