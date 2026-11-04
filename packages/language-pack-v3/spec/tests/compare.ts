/**
 * Runs the two readers of format 3 on the same files and compares what they say.
 *
 *     bun spec/tests/compare.ts [--python <path>] [--built] [--reader <path>]
 *
 * (from `packages/language-pack-v3`). For every `.seg` and `.tcpack` under `spec/tests/` (not `data/`) it runs `readerOutput` (TypeScript,
 * `src/read/output.ts`) and `spec/reader-py/lp3read.py` (Python 3.11 or later, standard library only), parses what the second prints, and
 * compares the two **parsed** values by their canonical text (`README.md`, "Reader output"): `canonicalJson` here. It also compares the exit
 * code of the Python reader with whether the TypeScript output is an error object (`lp3read.py` exits 0, or 1 for `{"error": …}`).
 *
 * It prints one line per file that disagrees, `file: first JSON path that differs: TypeScript value / Python value`, each value cut to
 * 80 characters, then a summary line. The exit code is 0 when all agree, 1 when some file disagrees, and 2 when the interpreter is not
 * there, is older than Python 3.11, or the arguments are wrong.
 *
 * - The interpreter is `--python`, else the environment variable `LP3_PYTHON`, else `python`.
 * - `--reader` is the script of the Python reader, `spec/reader-py/lp3read.py` unless given (the tests use it to show that a difference is found).
 * - `--built` also builds the big segments of the sample in memory (`build-cases.ts`, `buildBigSegments`), writes them in a folder under
 *   the temporary folder of the system, and compares them the same way. They are not frozen and have no expected file.
 */
import { spawnSync } from 'node:child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { compareCodePoints } from '../../src/codec/columns'
import { canonicalJson, type Json, readerOutput, sortKeys } from '../../src/read/output'
import { buildBigSegments, caseFilesOn, PYTHON_NOT_YET, TESTS_DIR } from './build-cases'

const DEFAULT_READER = join(TESTS_DIR, '..', 'reader-py', 'lp3read.py')
const MAX_VALUE = 80

/** `text` cut to 80 characters (by code point), with an ellipsis at the end when it was longer. */
function shortened(text: string): string {
  const points = [...text]
  return points.length <= MAX_VALUE ? text : `${points.slice(0, MAX_VALUE - 1).join('')}…`
}

const show = (value: Json | undefined): string => (value === undefined ? '<absent>' : shortened(canonicalJson(value)))

const isObject = (value: Json | undefined): value is { [key: string]: Json } => typeof value === 'object' && value !== null && !Array.isArray(value)

/** `$.texts[0].events[3]`: a key that is not a plain name is written `["…"]`. */
const keyPath = (path: string, key: string): string => (/^[A-Za-z_][A-Za-z0-9_]*$/.test(key) ? `${path}.${key}` : `${path}[${JSON.stringify(key)}]`)

/**
 * A fixture may name `ignoreRelationsFrom`: `from` ids (or prefixes) whose relations are left out of the answer before the compare,
 * because the independent oracle (`answers.py`) does not derive them (the `sec:` ones need the outline parsing).
 */
export function withoutIgnoredRelations(got: Json, ignore: string[] | undefined): Json {
  if (ignore === undefined || got === null || typeof got !== 'object' || Array.isArray(got) || !Array.isArray(got.relations)) return got
  const keep = got.relations.filter((r) => !(r !== null && typeof r === 'object' && !Array.isArray(r) && typeof r.from === 'string' && ignore.some((p) => (r.from as string).startsWith(p))))
  return { ...got, relations: keep }
}

/** The first place, in the order of the file (keys by code point), where `a` and `b` differ: its path and the two values (`undefined` for an absent one). */
export function firstDifference(a: Json | undefined, b: Json | undefined, path = '$'): [string, Json | undefined, Json | undefined] | null {
  if (a === undefined || b === undefined) return a === b ? null : [path, a, b]
  if (Array.isArray(a) && Array.isArray(b)) {
    for (let i = 0; i < Math.min(a.length, b.length); i++) {
      const found = firstDifference(a[i], b[i], `${path}[${i}]`)
      if (found !== null) return found
    }
    const i = Math.min(a.length, b.length)
    return a.length === b.length ? null : [`${path}[${i}]`, a[i], b[i]]
  }
  if (isObject(a) && isObject(b)) {
    for (const key of [...new Set([...Object.keys(a), ...Object.keys(b)])].sort(compareCodePoints)) {
      const found = firstDifference(Object.hasOwn(a, key) ? a[key] : undefined, Object.hasOwn(b, key) ? b[key] : undefined, keyPath(path, key))
      if (found !== null) return found
    }
    return null
  }
  return a === b ? null : [path, a, b]
}

/** What the Python reader said of a file: its parsed output and exit code, or why that cannot be compared. */
type PythonResult = { output: Json; status: number } | { failure: string }

function pythonOn(python: string, reader: string, file: string): PythonResult {
  const run = spawnSync(python, ['-I', '-X', 'utf8', reader, file], { encoding: 'buffer', maxBuffer: 1 << 29 })
  if (run.error !== undefined) return { failure: `cannot run Python: ${run.error.message}` }
  const status = run.status ?? -1
  if (status !== 0 && status !== 1) return { failure: `lp3read.py exited ${status}: ${shortened(new TextDecoder().decode(run.stderr).trim())}` }
  try {
    return { output: JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(run.stdout)) as Json, status }
  } catch (error) {
    return { failure: `the output of lp3read.py is not JSON: ${(error as Error).message}` }
  }
}

const isError = (output: Json): boolean => isObject(output) && Object.hasOwn(output, 'error')

/** The line to print when the readers disagree on `bytes` (the file at `file`), or `null` when they agree. */
async function disagreement(name: string, bytes: Uint8Array, file: string, python: string, reader: string): Promise<string | null> {
  // A TypeScript exception (not a FormatError, which readerOutput turns into an error object) is a mismatch of this file, not the end of the run.
  let ts: Json
  try {
    ts = sortKeys(await readerOutput(bytes))
  } catch (error) {
    return `${name}: the TypeScript reader threw: ${(error as Error).message}`
  }
  const py = pythonOn(python, reader, file)
  if ('failure' in py) return `${name}: ${py.failure}`
  let normal: Json
  try {
    normal = sortKeys(py.output)
  } catch (error) {
    return `${name}: the Python output is not what the reader output allows: ${(error as Error).message}`
  }
  const differs = canonicalJson(ts) !== canonicalJson(normal)
  const expectedStatus = isError(ts) ? 1 : 0
  if (!differs && py.status === expectedStatus) return null
  const exit = py.status === expectedStatus ? '' : ` (exit code: Python ${py.status}, and the TypeScript output ${isError(ts) ? 'is' : 'is not'} an error)`
  const found = differs ? firstDifference(ts, normal) : null
  return found === null ? `${name}: the exit code differs${exit}` : `${name}: ${found[0]}: TypeScript ${show(found[1])} / Python ${show(found[2])}${exit}`
}

/** `{major, minor}` of the interpreter, or the reason it cannot be used. */
function versionOf(python: string): { major: number; minor: number } | string {
  const run = spawnSync(python, ['-I', '-X', 'utf8', '-c', 'import sys; print(sys.version_info[0], sys.version_info[1])'], { encoding: 'utf8' })
  if (run.error !== undefined) return `cannot run "${python}": ${run.error.message}`
  if (run.status !== 0) return `"${python}" exited ${run.status}: ${run.stderr.trim()}`
  const [major, minor] = run.stdout.trim().split(' ').map(Number)
  if (!Number.isInteger(major) || !Number.isInteger(minor)) return `"${python}" did not say its version: ${run.stdout.trim()}`
  return { major, minor }
}

/** Runs the comparison; gives the exit code. */
export async function compare(args: string[], log: (line: string) => void = console.log): Promise<number> {
  let python = process.env.LP3_PYTHON !== undefined && process.env.LP3_PYTHON !== '' ? process.env.LP3_PYTHON : 'python'
  let reader = DEFAULT_READER
  let built = false
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--python' && i + 1 < args.length) python = args[++i]
    else if (args[i] === '--reader' && i + 1 < args.length) reader = args[++i]
    else if (args[i] === '--built') built = true
    else {
      console.error(`usage: bun spec/tests/compare.ts [--python <path>] [--built] [--reader <path>]   (cannot use: ${args[i]})`)
      return 2
    }
  }

  const version = versionOf(python)
  if (typeof version === 'string') {
    console.error(`compare.ts: the Python interpreter is not usable: ${version}. Pass --python <path> or set LP3_PYTHON to a Python 3.11 or later.`)
    return 2
  }
  if (version.major < 3 || (version.major === 3 && version.minor < 11)) {
    console.error(`compare.ts: "${python}" is Python ${version.major}.${version.minor}, and the Python reader needs 3.11 or later. Pass --python <path> or set LP3_PYTHON.`)
    return 2
  }

  const lines: string[] = []
  let count = 0
  let notYet = 0
  for (const name of caseFilesOn(TESTS_DIR)) {
    const file = join(TESTS_DIR, name)
    if (PYTHON_NOT_YET.includes(name)) {
      // Said, not skipped in silence: the Python reader does not check signatures yet (Task 10 of phase 3).
      notYet++
      lines.push(`${name}: Python: not yet`)
      continue
    }
    count++
    const line = await disagreement(name, new Uint8Array(readFileSync(file)), file, python, reader)
    if (line !== null) lines.push(line)
  }
  let big = 0
  if (built) {
    const folder = mkdtempSync(join(tmpdir(), 'lp3-built-'))
    try {
      for (const [name, bytes] of await buildBigSegments()) {
        const file = join(folder, name)
        writeFileSync(file, bytes)
        count++
        big++
        const line = await disagreement(`built/${name}`, bytes, file, python, reader)
        if (line !== null) lines.push(line)
      }
    } finally {
      rmSync(folder, { recursive: true, force: true })
    }
  }
  for (const line of lines) log(line)
  const mismatches = lines.length - notYet
  log(`compare: ${count} files compared (${count - big} cases${built ? `, ${big} built` : ''}), ${mismatches} mismatches${notYet > 0 ? `, ${notYet} not yet in Python` : ''}`)
  return mismatches === 0 ? 0 : 1
}

if (import.meta.main) process.exit(await compare(process.argv.slice(2)))
