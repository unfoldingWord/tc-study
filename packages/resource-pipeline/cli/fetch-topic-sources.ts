/**
 * Download the topic sources `build-v3 --topics` reads, each at its pinned commit, check its sha256 and write it under <out>.
 *
 *   bun packages/resource-pipeline/cli/fetch-topic-sources.ts --out <dir> [--work <dir>]
 *
 * The pins (repository, commit, path, sha256, target) are in `topic-sources.json` and equal `spec/fuentes.md`. Every file is downloaded and
 * checked in memory first (a pin with `eol: "crlf"` has in `sha256` the hash `fuentes.md` gives, which is of a CRLF checkout, and in
 * `rawSha256` the hash of the bytes at the commit, which are LF: the download is checked against `rawSha256`, turned into CRLF, then checked
 * against `sha256`, so the files equal the ones the maps were built from); one failure (HTTP status or hash) exits 1 and writes nothing. The files are source data, never uploaded: `--out`
 * under `<work>/v3-out` (what publish-v3 uploads), or under any folder named `v3-out`, exits 2.
 */

import { createHash } from 'node:crypto'
import { existsSync, readFileSync } from 'node:fs'
import { mkdir, rm, writeFile } from 'node:fs/promises'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

export type TopicSource = { name: string; repository: string; host: 'github' | 'door43'; commit: string; path: string; sha256: string; rawSha256?: string; eol?: 'crlf'; target: string }
type Io = { log: (line: string) => void; error: (line: string) => void }
type FetchFn = (url: string) => Promise<Response>

const encodePath = (p: string): string => p.split('/').map(encodeURIComponent).join('/')

export function urlOf(s: TopicSource): string {
  return s.host === 'github'
    ? `https://raw.githubusercontent.com/${s.repository}/${s.commit}/${encodePath(s.path)}`
    : `https://git.door43.org/${s.repository}/raw/commit/${s.commit}/${encodePath(s.path)}`
}

/** LF to CRLF, leaving an existing CRLF alone. */
export function toCrlf(bytes: Uint8Array): Uint8Array {
  const out: number[] = []
  for (let i = 0; i < bytes.length; i++) {
    if (bytes[i] === 10 && bytes[i - 1] !== 13) out.push(13)
    out.push(bytes[i])
  }
  return Uint8Array.from(out)
}

const sha256Of = (b: Uint8Array): string => createHash('sha256').update(b).digest('hex')

const USAGE = 'Usage: fetch-topic-sources --out <dir> [--work <dir>]'

export function pins(): TopicSource[] {
  return (JSON.parse(readFileSync(join(import.meta.dir, 'topic-sources.json'), 'utf8')) as { sources: TopicSource[] }).sources
}

/**
 * Why the files under `dir` are not the pinned sources, or undefined. A file is right when its sha256 is the pin's `sha256` (as fetch
 * wrote it), or, for a pin with `rawSha256`, when it is the LF bytes of the commit (`rawSha256`) whose CRLF form has the pin's `sha256`.
 */
export function sourcesProblem(dir: string, sources: TopicSource[] = pins()): string | undefined {
  for (const s of sources) {
    const file = join(dir, s.target)
    if (!existsSync(file)) return `${file} is missing (pinned source ${s.name})`
    const bytes = new Uint8Array(readFileSync(file))
    const disk = sha256Of(bytes)
    if (disk === s.sha256) continue
    if (s.rawSha256 !== undefined && disk === s.rawSha256 && sha256Of(s.eol === 'crlf' ? toCrlf(bytes) : bytes) === s.sha256) continue
    return `${file}: sha256 is ${disk}, the pin in topic-sources.json says ${s.sha256}`
  }
  return undefined
}

/** Why `out` may not hold source files, or undefined. */
export function outProblem(out: string, work?: string): string | undefined {
  const abs = resolve(out)
  if (abs.split(sep).includes('v3-out')) return `--out ${out} is inside a v3-out folder, which publish-v3 uploads`
  if (work !== undefined) {
    const rel = relative(resolve(work, 'v3-out'), abs)
    if (rel === '' || !(rel.startsWith('..') || isAbsolute(rel))) return `--out ${out} is inside ${join(work, 'v3-out')}, which publish-v3 uploads`
  }
  return undefined
}

export async function main(args: string[], io: Io, fetchFn: FetchFn = (u) => fetch(u), sources: TopicSource[] = pins()): Promise<number> {
  const opts: Record<string, string> = {}
  for (let i = 0; i < args.length; i += 2) {
    const flag = args[i]
    const value = args[i + 1]
    if (!['--out', '--work'].includes(flag) || value === undefined || value.startsWith('--')) {
      io.error(`bad argument ${flag}\n${USAGE}`)
      return 2
    }
    opts[flag.slice(2)] = value
  }
  if (opts.out === undefined) {
    io.error(`--out is required\n${USAGE}`)
    return 2
  }
  const problem = outProblem(opts.out, opts.work)
  if (problem !== undefined) {
    io.error(problem)
    return 2
  }
  const out = resolve(opts.out)
  const bodies: Array<[TopicSource, Uint8Array]> = []
  for (const s of sources) {
    let bytes: Uint8Array
    try {
      const res = await fetchFn(urlOf(s))
      if (!res.ok) {
        io.error(`${s.target}: HTTP ${res.status} from ${urlOf(s)}`)
        return 1
      }
      bytes = new Uint8Array(await res.arrayBuffer())
    } catch (e) {
      io.error(`${s.target}: ${e instanceof Error ? e.message : String(e)}`)
      return 1
    }
    if (s.rawSha256 !== undefined) {
      const raw = sha256Of(bytes)
      if (raw !== s.rawSha256) {
        io.error(`${s.target}: sha256 of the download is ${raw}, the pin says ${s.rawSha256}`)
        return 1
      }
      if (s.eol === 'crlf') bytes = toCrlf(bytes)
    }
    const got = sha256Of(bytes)
    if (got !== s.sha256) {
      io.error(`${s.target}: sha256 is ${got}, the pin says ${s.sha256}`)
      return 1
    }
    bodies.push([s, bytes])
  }
  const existed = existsSync(out)
  const written: string[] = []
  try {
    for (const [s, bytes] of bodies) {
      const file = join(out, s.target)
      await mkdir(dirname(file), { recursive: true })
      await writeFile(file, bytes)
      written.push(file)
    }
  } catch (e) {
    for (const f of written) await rm(f, { force: true })
    if (!existed) await rm(out, { recursive: true, force: true })
    io.error(`writing ${out}: ${e instanceof Error ? e.message : String(e)}`)
    return 1
  }
  io.log(`${bodies.length} files written under ${out}`)
  return 0
}

if (import.meta.main) {
  process.exit(await main(process.argv.slice(2), { log: (l) => console.log(l), error: (l) => console.error(l) }))
}
