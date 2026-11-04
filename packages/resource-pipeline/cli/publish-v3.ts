/**
 * Build a language's format 3 catalog and segments and upload what the bucket lacks (src/language/publishV3.ts).
 *
 *   bun packages/resource-pipeline/cli/publish-v3.ts --lang <tag> --list <list.json> --originals <originals list.json> --parts <dir> --work <dir>
 *     [--bucket-dir <dir>] [--no-upload] [--map-lang en] [--map-list <list.json>] [--topics <dir>] [--aligned]
 *     [--books <list>]   (local tests only: refused with --lang equal to --map-lang unless --bucket-dir is given)
 *
 * The bucket: `--bucket-dir` (a folder, for local runs), else R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (all four
 * or none), else only `--no-upload` is allowed (the bucket is then empty, in memory).
 *
 * In order: the parts the lists name that `--parts` lacks are fetched from the bucket (`parts/<sha256>.part.gz`); the published catalogs
 * are read; a language other than the map language is `skipped` when the common catalog is not published yet; the published common
 * catalog and its segments go to `<work>/common/` and the registry of the language to `<work>/registry/`; the build runs in process into
 * `<work>/v3-out/` with each revision one more than the published one (1 when none) and `previous` the published id; then `publishV3`.
 *
 * The map language builds the common catalog too. It is built first against nothing: when it equals the published common catalog apart
 * from `about`, the common revision is not bumped, the language is built again against the published copy (as any other language is)
 * and only the language catalog is put. Otherwise the common revision is the published one plus 1.
 *
 * The log goes to stderr; the last stdout line is the result as JSON:
 * `{"outcome":"published"|"unchanged"|"built"|"skipped","lang","catalogs":{"common"?:{revision,id},"lang":{revision,id}},"segments":{"uploaded":n,"present":n},"reason"?}`.
 * Exit 0 for those outcomes, 1 for a build or upload failure, 2 for bad arguments.
 */

import { existsSync, readFileSync, statSync } from 'node:fs'
import { copyFile, mkdir, rm, writeFile } from 'node:fs/promises'
import { isAbsolute, join, relative, resolve } from 'node:path'
import { catalogView, hex, KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { dirBucket } from '../src/language/dirBucket'
import { memoryBucket, oneLine, type PackBucket, r2Bucket } from '../src/language/publishLanguage'
import { publishV3, readPublishedV3, sameCatalogContent, V3_KEYS } from '../src/language/publishV3'
import { main as buildV3 } from './build-v3'

class UsageError extends Error {}

export const USAGE =
  'Usage: publish-v3 --lang <tag> --list <list.json> --originals <originals list.json> --parts <dir> --work <dir>\n' +
  '  [--bucket-dir <dir>] [--no-upload] [--map-lang en] [--map-list <list.json>] [--topics <dir>] [--aligned] [--books <list>]\n' +
  '  The bucket is --bucket-dir, else R2_ENDPOINT, R2_BUCKET, R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY (all or none); with neither only --no-upload is allowed.\n' +
  '  --books is for local tests: with --lang equal to --map-lang it needs --bucket-dir.'

type Io = { log: (line: string) => void; error: (line: string) => void; out?: (line: string) => void }
type Env = Record<string, string | undefined>

const BOOLEAN_FLAGS = ['no-upload', 'aligned']
const VALUE_FLAGS = ['lang', 'list', 'originals', 'parts', 'work', 'bucket-dir', 'map-lang', 'map-list', 'topics', 'books', 'sign-key']
const TAG = /^[a-z0-9]+(-[a-z0-9]+)*$/

type Options = {
  lang: string
  list: string
  originals: string
  parts: string
  work: string
  bucketDir?: string
  noUpload: boolean
  mapLang: string
  mapList?: string
  topics?: string
  aligned: boolean
  books?: string
}

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
  const need = (name: string): string => {
    const v = flags.get(name)
    if (v === undefined) throw new UsageError(`--${name} is missing`)
    return v
  }
  const lang = need('lang')
  if (!TAG.test(lang) || lang === 'common') throw new UsageError(`--lang ${JSON.stringify(lang)} is not a language tag for format 3 (lowercase letters, digits and hyphens; not "common")`)
  const mapLang = flags.get('map-lang') ?? 'en'
  if (!TAG.test(mapLang) || mapLang === 'common') throw new UsageError(`--map-lang ${JSON.stringify(mapLang)} is not a language tag`)
  if (flags.has('sign-key')) throw new UsageError('--sign-key: signing is not implemented by build-v3 or publishV3 yet')
  return {
    lang,
    list: need('list'),
    originals: need('originals'),
    parts: need('parts'),
    work: need('work'),
    bucketDir: flags.get('bucket-dir'),
    noUpload: flags.has('no-upload'),
    mapLang,
    mapList: flags.get('map-list'),
    topics: flags.get('topics'),
    aligned: flags.has('aligned'),
    books: flags.get('books'),
  }
}

/** A reason why the folder of a published common build cannot be used with `out`, else undefined (the build empties `<out>/segments`). */
export function commonFolderProblem(common: string, out: string): string | undefined {
  const rel = relative(resolve(out), resolve(common))
  if (rel === '' || (!rel.startsWith('..') && !isAbsolute(rel))) return `the common folder ${common} is the build folder ${out} or inside it: the build would empty its segments`
  return undefined
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

type Ref = { revision: number; id: string }
type Result = { outcome: 'published' | 'unchanged' | 'built' | 'skipped'; lang: string; catalogs?: { common?: Ref; lang: Ref }; segments?: { uploaded: number; present: number }; reason?: string }

async function catalogRef(bytes: Uint8Array): Promise<Ref> {
  const { seg, id } = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
  return { revision: catalogView(seg).about.revision, id }
}

/** Every part the lists name (of the requested books, when `books` says which) that `parts` lacks, fetched from the bucket. */
async function fetchParts(o: Options, bucket: PackBucket, io: Io): Promise<void> {
  const wanted = o.books?.split(',')
  const shas = new Set<string>()
  for (const file of [o.list, o.originals, ...(o.mapList === undefined ? [] : [o.mapList])]) {
    let list: { parts?: { sha256?: unknown; book?: unknown }[] }
    try {
      list = JSON.parse(readFileSync(file, 'utf8'))
    } catch (error) {
      throw new Error(`Cannot read the parts list ${file}: ${(error as Error).message}`)
    }
    for (const part of list.parts ?? []) {
      if (typeof part.sha256 !== 'string' || !/^[0-9a-f]{64}$/.test(part.sha256)) throw new Error(`${file} names a part with no valid sha256`)
      if (wanted !== undefined && typeof part.book === 'string' && !wanted.includes(part.book)) continue
      shas.add(part.sha256)
    }
  }
  let fetched = 0
  for (const sha of [...shas].sort()) {
    const path = join(o.parts, `${sha}.part.gz`)
    if (existsSync(path)) continue
    const bytes = await bucket.getBytes(`parts/${sha}.part.gz`)
    if (bytes === null) throw new Error(`Part ${sha} is neither in ${o.parts} nor in the bucket`)
    await writeFile(path, bytes)
    fetched += 1
  }
  if (fetched > 0) io.log(`parts: ${fetched} fetched from the bucket`)
}

async function run(o: Options, env: Env, io: Io): Promise<Result> {
  const out = resolve(o.work, 'v3-out')
  const commonDir = resolve(o.work, 'common')
  const registryDir = resolve(o.work, 'registry')
  const problem = commonFolderProblem(commonDir, out)
  if (problem !== undefined) throw new UsageError(problem)
  const isMap = o.lang === o.mapLang
  if (o.books !== undefined && isMap && o.bucketDir === undefined) throw new UsageError('--books with the map language is for local tests: it needs --bucket-dir (a partial common catalog must never reach a real bucket)')
  const bucket = bucketOf(o, env, io)
  if (!existsSync(o.parts) || !statSync(o.parts).isDirectory()) throw new UsageError(`--parts: ${o.parts} is not a directory`)
  const store = bucket ?? memoryBucket()
  const { lang } = o

  await fetchParts(o, store, io)

  const published = await readPublishedV3(store, lang)
  if (!isMap && published.common === undefined) {
    io.log('The common catalog is not published yet: nothing to build against')
    return { outcome: 'skipped', lang, reason: 'no common catalog' }
  }

  // The published common catalog and its segments, for --common.
  const downloadCommon = async (): Promise<void> => {
    await rm(commonDir, { recursive: true, force: true })
    await mkdir(join(commonDir, 'segments'), { recursive: true })
    await writeFile(join(commonDir, 'catalog-common.seg'), published.common!.bytes)
    const { seg } = await readSegment(published.common!.bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
    for (const entry of catalogView(seg).segments) {
      const id = hex(entry.id)
      const bytes = await store.getBytes(V3_KEYS.seg(id))
      if (bytes === null) throw new Error(`The published common catalog names the segment ${id}, which the bucket does not have`)
      await writeFile(join(commonDir, 'segments', `${id}.seg`), bytes)
    }
  }
  // The registry of the language as published: each build starts from it (a second build must not start from the first one's).
  const resetRegistry = async (): Promise<void> => {
    await rm(registryDir, { recursive: true, force: true })
    if (published.registry !== undefined) {
      await mkdir(registryDir, { recursive: true })
      await writeFile(join(registryDir, `registry-${lang}.json`), (await store.getBytes(V3_KEYS.registry(lang)))!)
    }
  }

  const build = async (against: boolean): Promise<void> => {
    await resetRegistry()
    const args = [
      '--list', o.list, '--originals', o.originals, '--parts', o.parts, '--out', out, '--registry', registryDir, '--map-lang', o.mapLang,
      '--revision-lang', String((published.lang?.revision ?? 0) + 1),
      ...(published.lang === undefined ? [] : ['--previous-lang', published.lang.id]),
      ...(against ? ['--common', commonDir] : ['--revision-common', String((published.common?.revision ?? 0) + 1), ...(published.common === undefined ? [] : ['--previous-common', published.common.id])]),
      ...(o.mapList === undefined ? [] : ['--map-list', o.mapList]),
      ...(o.topics === undefined ? [] : ['--topics', o.topics]),
      ...(o.books === undefined ? [] : ['--books', o.books]),
      ...(o.aligned ? ['--aligned'] : []),
    ]
    const code = await buildV3(args, { log: io.error, error: io.error })
    if (code !== 0) throw new BuildFailure(`build-v3 failed (exit ${code})`)
  }

  await rm(out, { recursive: true, force: true })
  await mkdir(out, { recursive: true })
  if (published.common !== undefined) await downloadCommon()
  let publishCommon = false
  if (!isMap) {
    await build(true)
  } else {
    await build(false)
    publishCommon = true
    if (published.common !== undefined) {
      const built = new Uint8Array(readFileSync(join(out, 'catalog-common.seg')))
      if (await sameCatalogContent(published.common.bytes, built)) {
        io.log(`catalog common: equal to the published revision ${published.common.revision}: its revision is not bumped`)
        await build(true)
        publishCommon = false
      }
    }
  }
  // publishV3 reads the registry from the build folder.
  const registryFile = join(registryDir, `registry-${lang}.json`)
  if (existsSync(registryFile)) await copyFile(registryFile, join(out, `registry-${lang}.json`))

  const catalogOut = async (name: string): Promise<Ref | undefined> => (existsSync(join(out, `catalog-${name}.seg`)) ? catalogRef(new Uint8Array(readFileSync(join(out, `catalog-${name}.seg`)))) : undefined)
  if (o.noUpload) {
    const common = (await catalogOut('common')) ?? (published.common ? await catalogRef(published.common.bytes) : undefined)
    return { outcome: 'built', lang, catalogs: { ...(common ? { common } : {}), lang: (await catalogOut(lang))! }, segments: { uploaded: 0, present: 0 } }
  }

  const result = await publishV3({ bucket: store, outDir: out, lang, publishCommon, log: io.error })
  const put = (name: string): boolean => result.uploaded.includes(V3_KEYS.catalog(name))
  const common = put('common') ? await catalogOut('common') : published.common ? { revision: published.common.revision, id: published.common.id } : undefined
  const language = put(lang) ? (await catalogOut(lang))! : published.lang ? { revision: published.lang.revision, id: published.lang.id } : (await catalogOut(lang))!
  return {
    outcome: result.outcome,
    lang,
    catalogs: { ...(common ? { common } : {}), lang: language },
    segments: { uploaded: result.uploaded.filter((k) => k.startsWith('v3/seg/')).length, present: result.skipped.length },
  }
}

class BuildFailure extends Error {}

/** The command: its exit code (0, 1 for a build or upload failure, 2 for bad arguments). The result JSON goes to `io.out`, the log to `io.error`. */
export async function main(argv: string[], env: Env = process.env, io: Io = { log: console.error, error: console.error, out: console.log }): Promise<number> {
  try {
    const options = parse(argv)
    const result = await run(options, env, io)
    ;(io.out ?? console.log)(JSON.stringify(result))
    return 0
  } catch (error) {
    if (error instanceof UsageError) {
      io.error(error.message)
      io.error(USAGE)
      return 2
    }
    io.error(oneLine(`publish-v3: ${error instanceof Error ? error.message : String(error)}`))
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
