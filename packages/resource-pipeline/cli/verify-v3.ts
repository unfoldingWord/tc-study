/**
 * Check a published format 3 language over HTTP, with both readers (spec/serving.md is the contract).
 *
 *   bun packages/resource-pipeline/cli/verify-v3.ts --base <url> --lang <tag> --out <dir> [--built <v3-out dir>] [--python <path>] [--reader <lp3read.py>]
 *
 * Downloads `{base}/v3/packs/{lang}/catalog`, `{base}/v3/packs/common/catalog` and every segment either names (`/v3/packs/seg/{id}`) into
 * `<out>` in the shape `build-v3` writes: `catalog-<lang>.seg`, `catalog-common.seg`, `segments/<id>.seg`. Then it checks
 *  1. every segment: the id of its header and the sha256 of its decompressed body are the id of the URL, its length is the catalog's `size`,
 *     the answer had no Content-Encoding;
 *  2. with `--built`: each downloaded file is byte-equal to the file of that name in the build folder (a file the build lacks is not compared);
 *  3. the HTTP contract on the way: a repeated catalog GET with `If-None-Match` gives 304, one `Range` request on a segment gives 206 with
 *     the right bytes;
 *  4. both readers over `<out>` (the TypeScript `readerOutput` and `spec/reader-py/lp3read.py`, as `spec/tests/compare.ts` compares them,
 *     here on the files of the folder) give the same output;
 *  5. the fixed queries of `spec/tests/queries/` whose books the catalog holds answer as their `expected` (the independent answers).
 *
 * The interpreter is `--python`, else `LP3_PYTHON`, else `python` (3.11 or later). `--reader` is another script for the Python reader
 * (tests use it to show that a difference is found). `--pubkey` is not here yet (Task 11).
 *
 * One line per check on stdout, then a last line `{"ok","segments","bytes","failures"}`. Exit 0 when ok, 1 when a check fails, 2 for
 * bad arguments, an unusable interpreter or a network failure (the base does not answer).
 */

import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { canonicalJson, catalogView, hex, KNOWN, readerOutput, readSegment, type CatalogModel } from '@bt-synergy/language-pack-v3'
import { runQueries } from '../../language-pack-v3/spec/tests/queries/run'

class UsageError extends Error {}
class NetworkError extends Error {}

export const USAGE = 'Usage: verify-v3 --base <url> --lang <tag> --out <dir> [--built <v3-out dir>] [--python <path>] [--reader <lp3read.py>]'

type Io = { log: (line: string) => void; error: (line: string) => void; out?: (line: string) => void }
type Env = Record<string, string | undefined>

const VALUE_FLAGS = ['base', 'lang', 'out', 'built', 'python', 'reader']
const TAG = /^[a-z]{2,3}(-[a-z0-9]{1,8})*$/
const SPEC_TESTS = join(import.meta.dir, '..', '..', 'language-pack-v3', 'spec', 'tests')

function parse(argv: string[]): { base: string; lang: string; out: string; built?: string; python?: string; reader?: string } {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i++) {
    const name = argv[i]
    if (!name.startsWith('--') || !VALUE_FLAGS.includes(name.slice(2))) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    if (flags.has(name.slice(2))) throw new UsageError(`${name} is given twice`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`The value of ${name} is missing`)
    flags.set(name.slice(2), value)
    i += 1
  }
  for (const key of ['base', 'lang', 'out']) if (!flags.has(key)) throw new UsageError(`--${key} is required`)
  const lang = flags.get('lang')!
  if (!TAG.test(lang)) throw new UsageError(`--lang ${JSON.stringify(lang)} is not a language tag`)
  if (!/^https?:\/\//.test(flags.get('base')!)) throw new UsageError('--base must be an http or https URL')
  return { base: flags.get('base')!.replace(/\/+$/, ''), lang, out: flags.get('out')!, built: flags.get('built'), python: flags.get('python'), reader: flags.get('reader') }
}

type Got = { status: number; headers: Headers; bytes: Uint8Array; bodyError?: string }

async function get(url: string, headers: Record<string, string> = {}): Promise<Got> {
  let response: Response
  try {
    response = await fetch(url, { headers: { 'Accept-Encoding': 'identity', ...headers }, redirect: 'manual' })
  } catch (error) {
    throw new NetworkError(`cannot reach ${url}: ${error instanceof Error ? error.message : String(error)}`)
  }
  // A body that cannot be read when the answer says it is encoded is a finding of the check, not a network failure.
  try {
    return { status: response.status, headers: response.headers, bytes: new Uint8Array(await response.arrayBuffer()) }
  } catch (error) {
    if (response.headers.get('content-encoding') !== null) return { status: response.status, headers: response.headers, bytes: new Uint8Array(0), bodyError: String(error) }
    throw new NetworkError(`the body of ${url} was cut: ${error instanceof Error ? error.message : String(error)}`)
  }
}

const sameBytes = (a: Uint8Array, b: Uint8Array): boolean => a.length === b.length && a.every((v, i) => v === b[i])

type PythonVersion = { major: number; minor: number }
function pythonVersion(python: string): PythonVersion | string {
  const run = spawnSync(python, ['-I', '-X', 'utf8', '-c', 'import sys; print(sys.version_info[0], sys.version_info[1])'], { encoding: 'utf8' })
  if (run.error !== undefined) return `cannot run "${python}": ${run.error.message}`
  if (run.status !== 0) return `"${python}" exited ${run.status}: ${run.stderr.trim()}`
  const [major, minor] = run.stdout.trim().split(' ').map(Number)
  return Number.isInteger(major) && Number.isInteger(minor) ? { major, minor } : `"${python}" did not say its version`
}

/** Why the two readers disagree on `file`, or null. */
async function readersDisagree(file: string, python: string, reader: string): Promise<string | null> {
  const bytes = new Uint8Array(readFileSync(file))
  let ts: unknown
  try {
    ts = await readerOutput(bytes)
  } catch (error) {
    return `the TypeScript reader threw: ${error instanceof Error ? error.message : String(error)}`
  }
  const run = spawnSync(python, ['-I', '-X', 'utf8', reader, file], { encoding: 'buffer', maxBuffer: 1 << 29 })
  if (run.error !== undefined) return `cannot run Python: ${run.error.message}`
  const status = run.status ?? -1
  if (status !== 0 && status !== 1) return `the Python reader exited ${status}: ${new TextDecoder().decode(run.stderr).trim().slice(0, 200)}`
  let py: unknown
  try {
    py = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(run.stdout))
  } catch (error) {
    return `the output of the Python reader is not JSON: ${(error as Error).message}`
  }
  let a: string
  let b: string
  try {
    a = canonicalJson(ts)
    b = canonicalJson(py)
  } catch (error) {
    return `an output is not canonical JSON: ${(error as Error).message}`
  }
  const isError = typeof ts === 'object' && ts !== null && Object.hasOwn(ts, 'error')
  if (a !== b) {
    let i = 0
    while (i < a.length && a[i] === b[i]) i++
    return `outputs differ at character ${i}: TypeScript ${JSON.stringify(a.slice(i, i + 40))} / Python ${JSON.stringify(b.slice(i, i + 40))}`
  }
  return status === (isError ? 1 : 0) ? null : `exit code of the Python reader is ${status}`
}

export async function main(argv: string[], env: Env = process.env, io: Io = { log: console.log, error: console.error, out: console.log }): Promise<number> {
  const failures: string[] = []
  let segments = 0
  let bytesTotal = 0
  /** One line per check: ok, or FAIL with the first problem; every problem goes to `failures` (at most 5 a check). */
  const record = (check: string, problems: string[], detail = ''): void => {
    if (problems.length === 0) io.log(`ok   ${check}${detail === '' ? '' : `: ${detail}`}`)
    else {
      io.log(`FAIL ${check}: ${problems[0]}${problems.length > 1 ? ` (+${problems.length - 1} more)` : ''}`)
      for (const p of problems.slice(0, 5)) failures.push(`${check}: ${p}`)
      if (problems.length > 5) failures.push(`${check}: … and ${problems.length - 5} more`)
    }
  }
  try {
    const o = parse(argv)
    const python = o.python ?? (env.LP3_PYTHON !== undefined && env.LP3_PYTHON !== '' ? env.LP3_PYTHON : 'python')
    const reader = o.reader ?? join(SPEC_TESTS, '..', 'reader-py', 'lp3read.py')
    const version = pythonVersion(python)
    if (typeof version === 'string') throw new UsageError(`the Python interpreter is not usable: ${version}`)
    if (version.major < 3 || (version.major === 3 && version.minor < 11)) throw new UsageError(`"${python}" is Python ${version.major}.${version.minor}; 3.11 or later is needed`)

    mkdirSync(join(o.out, 'segments'), { recursive: true })
    const save = (relative: string, bytes: Uint8Array): void => writeFileSync(join(o.out, relative), bytes)

    // 1. The catalogs
    const catalogs: { name: string; file: string; model: CatalogModel; etag: string | null; url: string }[] = []
    for (const name of [o.lang, 'common']) {
      const url = `${o.base}/v3/packs/${name}/catalog`
      const got = await get(url)
      const problems: string[] = []
      if (got.status !== 200) problems.push(`GET ${url} gave ${got.status}`)
      else {
        if (got.headers.get('content-encoding') !== null) problems.push(`the answer has Content-Encoding ${got.headers.get('content-encoding')}`)
        try {
          const { seg } = await readSegment(got.bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
          const model = catalogView(seg)
          if (model.about.catalog !== name) problems.push(`about.catalog is ${JSON.stringify(model.about.catalog)}, not ${JSON.stringify(name)}`)
          const file = `catalog-${name}.seg`
          save(file, got.bytes)
          bytesTotal += got.bytes.length
          catalogs.push({ name, file, model, etag: got.headers.get('etag'), url })
        } catch (error) {
          problems.push(error instanceof Error ? error.message : String(error))
        }
      }
      record(`catalog ${name}`, problems, problems.length === 0 ? `${got.bytes.length} bytes` : '')
    }

    // 2. The segments both catalogs name
    const wanted = new Map<string, { size: number; class: string }>()
    const mismatches: string[] = []
    for (const c of catalogs) {
      for (const entry of c.model.segments) {
        const id = hex(entry.id)
        const before = wanted.get(id)
        if (before !== undefined && before.size !== entry.size) mismatches.push(`${id}: the catalogs give two sizes (${before.size} and ${entry.size})`)
        wanted.set(id, { size: entry.size, class: entry.class })
      }
    }
    record('catalog sizes agree', mismatches)
    let firstSegment: { id: string; bytes: Uint8Array } | undefined
    for (const [id, entry] of [...wanted].sort(([a], [b]) => (a < b ? -1 : 1))) {
      const url = `${o.base}/v3/packs/seg/${id}`
      const got = await get(url)
      const problems: string[] = []
      if (got.status !== 200) problems.push(`GET ${url} gave ${got.status}`)
      else {
        const encoding = got.headers.get('content-encoding')
        if (encoding !== null) problems.push(`the answer has Content-Encoding ${encoding}`)
        if (got.bodyError !== undefined) problems.push(`the body cannot be decoded: ${got.bodyError}`)
        if (got.bodyError === undefined) {
          if (got.bytes.length !== entry.size) problems.push(`length is ${got.bytes.length}, the catalog's size is ${entry.size}`)
          try {
            await readSegment(got.bytes, { known: KNOWN[entry.class as keyof typeof KNOWN] ?? {}, expectedId: id, expectedClass: entry.class as 'xmap' })
          } catch (error) {
            problems.push(`id ${id}: ${error instanceof Error ? error.message : String(error)}`)
          }
        }
        save(`segments/${id}.seg`, got.bytes)
        segments++
        bytesTotal += got.bytes.length
        if (firstSegment === undefined && got.bytes.length > 2 && encoding === null) firstSegment = { id, bytes: got.bytes }
      }
      if (problems.length > 0) record(`segment ${id}`, problems.map((p) => (p.includes(id) ? p : `${id}: ${p}`)))
    }
    if (!failures.some((f) => f.startsWith('segment '))) record('segments', [], `${segments} verified (id, body hash, size, no Content-Encoding)`)

    // 3. Equal to the build
    if (o.built !== undefined) {
      const problems: string[] = []
      let compared = 0
      const files = [...catalogs.map((c) => c.file), ...[...wanted.keys()].map((id) => `segments/${id}.seg`)]
      for (const file of files) {
        const built = join(o.built, file)
        if (!existsSync(built) || !existsSync(join(o.out, file))) continue
        compared++
        if (!sameBytes(new Uint8Array(readFileSync(built)), new Uint8Array(readFileSync(join(o.out, file))))) problems.push(`${file} differs from the build`)
      }
      if (compared === 0) problems.push(`no downloaded file has a counterpart in ${o.built}`)
      record('equal to the build', problems, `${compared} files`)
    }

    // 4. The HTTP contract: 304 and 206
    const mine = catalogs.find((c) => c.name === o.lang)
    if (mine !== undefined) {
      const problems: string[] = []
      if (mine.etag === null) problems.push('the catalog answer has no ETag')
      else {
        const again = await get(mine.url, { 'If-None-Match': mine.etag })
        if (again.status !== 304) problems.push(`GET with If-None-Match ${mine.etag} gave ${again.status}, not 304`)
        else if (again.bytes.length > 0) problems.push('the 304 has a body')
      }
      record('catalog If-None-Match gives 304', problems)
    }
    if (firstSegment !== undefined) {
      const problems: string[] = []
      const a = 1
      const b = Math.min(firstSegment.bytes.length - 1, 32)
      const part = await get(`${o.base}/v3/packs/seg/${firstSegment.id}`, { Range: `bytes=${a}-${b}` })
      if (part.status !== 206) problems.push(`GET with Range bytes=${a}-${b} gave ${part.status}, not 206`)
      else {
        if (!sameBytes(part.bytes, firstSegment.bytes.subarray(a, b + 1))) problems.push('the 206 body is not the requested bytes')
        const expected = `bytes ${a}-${b}/${firstSegment.bytes.length}`
        if (part.headers.get('content-range') !== expected) problems.push(`Content-Range is ${JSON.stringify(part.headers.get('content-range'))}, not ${JSON.stringify(expected)}`)
      }
      record('segment Range gives 206', problems)
    }

    // 5. Both readers over the folder
    {
      const files = [...catalogs.map((c) => join(o.out, c.file)), ...readdirSync(join(o.out, 'segments')).filter((f) => f.endsWith('.seg')).map((f) => join(o.out, 'segments', f))]
      const problems: string[] = []
      for (const file of files) {
        const why = await readersDisagree(file, python, reader)
        if (why !== null) problems.push(`readers disagree on ${file.slice(o.out.length + 1).replace(/\\/g, '/')}: ${why}`)
      }
      record('both readers agree', problems, `${files.length} files`)
    }

    // 6. The fixed queries whose books the catalogs hold
    {
      const common = catalogs.find((c) => c.name === 'common')
      const dir = join(SPEC_TESTS, 'queries')
      if (common === undefined || !existsSync(dir)) io.log('skip queries: no common catalog or no queries folder')
      else {
        const origs = new Set(common.model.units.filter((u) => u.id.startsWith('orig:')).map((u) => u.id.slice('orig:'.length)))
        const temp = mkdtempSync(join(tmpdir(), 'verify-v3-queries-'))
        let asked = 0
        let left = 0
        try {
          for (const name of readdirSync(dir).filter((f) => f.endsWith('.json'))) {
            const query = (JSON.parse(readFileSync(join(dir, name), 'utf8')) as { query: { book?: string } }).query
            // A query about a book needs its original; one about no book (a Strong key, a concept) needs all 66.
            const ok = query.book !== undefined ? origs.has(query.book) : origs.size >= 66
            if (ok) {
              copyFileSync(join(dir, name), join(temp, name))
              asked++
            } else left++
          }
          if (asked === 0) io.log(`ok   queries: 0 asked (${left} need books the common catalog lacks)`)
          else {
            const result = await runQueries(o.out, temp)
            record('fixed queries', result.lines.filter((l) => !/: (ok|skipped)\b/.test(l)), `${asked} asked, ${result.skipped} skipped, ${left} left out`)
          }
        } catch (error) {
          record('fixed queries', [error instanceof Error ? error.message : String(error)])
        } finally {
          rmSync(temp, { recursive: true, force: true })
        }
      }
    }
  } catch (error) {
    if (error instanceof UsageError) {
      io.error(error.message)
      io.error(USAGE)
      return 2
    }
    if (error instanceof NetworkError) {
      io.error(`verify-v3: ${error.message}`)
      return 2
    }
    failures.push(`verify-v3: ${error instanceof Error ? error.message : String(error)}`)
  }
  const ok = failures.length === 0
  ;(io.out ?? console.log)(JSON.stringify({ ok, segments, bytes: bytesTotal, failures }))
  return ok ? 0 : 1
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  process.exitCode = await main(process.argv.slice(2), process.env)
}
