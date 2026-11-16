/** Fetch one Aquifer resource language from GitHub, pinned to a commit (`cli/fetch-aquifer.ts`). */
import { createHash } from 'node:crypto'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

export const BOOKS = (
  'gen exo lev num deu jos jdg rut 1sa 2sa 1ki 2ki 1ch 2ch ezr neh est job psa pro ecc sng isa jer lam ezk dan hos joe amo oba jon mic nam hab zep hag zec mal ' +
  'mat mrk luk jhn act rom 1co 2co gal eph php col 1th 2th 1ti 2ti tit phm heb jas 1pe 2pe 1jn 2jn 3jn jud rev'
).split(' ')

export const SHA40 = /^[0-9a-f]{40}$/
const HEAD = 16384

export type Bases = { api: string; raw: string }
export const DEFAULT_BASES: Bases = { api: 'https://api.github.com', raw: 'https://raw.githubusercontent.com' }

export type Opts = {
  repo: string
  lang: string
  out: string
  commit?: string
  books?: string[]
  bases?: Bases
  token?: string
  now?: () => Date
  warn?: (line: string) => void
}
export type Manifest = {
  repo: string
  lang: string
  commit: string
  fetched: string
  /** The head of metadata.json that `resource_metadata` was cut from. */
  metadata: { range: string; sha256: string }
  files: { path: string; size: number; sha256: string }[]
}

/** Book code of `NN.content.json` (1-66), or undefined for a name that is not a book (the 3-digit `001` of a manual has no book). */
export function bookOfFile(name: string): string | undefined {
  const m = /^(\d{2})\.content\.json$/.exec(name)
  return m ? BOOKS[Number(m[1]) - 1] : undefined
}

async function getOk(url: string, headers: Record<string, string>): Promise<Response> {
  const res = await fetch(url, { headers: { 'Accept-Encoding': 'identity', ...headers } })
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
  return res
}

/** At most the first `HEAD` bytes of the body, even when the server ignores Range and sends the whole file. */
async function readHead(res: Response): Promise<Buffer> {
  const reader = res.body!.getReader()
  const parts: Uint8Array[] = []
  let n = 0
  while (n < HEAD) {
    const { done, value } = await reader.read()
    if (done) break
    parts.push(value)
    n += value.length
  }
  await reader.cancel()
  return Buffer.concat(parts).subarray(0, HEAD)
}

/** The `resource_metadata` object from the head of `metadata.json`: it comes first, before `"scripture_burrito"`. */
export function cutResourceMetadata(head: string): unknown {
  const at = head.indexOf('"scripture_burrito"')
  if (at < 0) throw new Error('metadata head has no "scripture_burrito" to cut at')
  const json = head.slice(0, at).trimEnd().replace(/,$/, '') + '}'
  const meta = (JSON.parse(json) as { resource_metadata?: unknown }).resource_metadata
  if (meta === undefined) throw new Error('metadata head has no resource_metadata')
  return meta
}

export async function fetchAquifer(o: Opts): Promise<Manifest> {
  const bases = o.bases ?? DEFAULT_BASES
  const auth: Record<string, string> = o.token ? { Authorization: `Bearer ${o.token}` } : {}
  const api = `${bases.api}/repos/BibleAquifer/${o.repo}`
  let commit = o.commit
  if (!commit) {
    const repo = (await (await getOk(api, auth)).json()) as { default_branch: string }
    commit = ((await (await getOk(`${api}/commits/${repo.default_branch}`, auth)).json()) as { sha: string }).sha
  }
  if (!SHA40.test(commit)) throw new Error(`commit ${commit} is not a full 40-hex sha`)
  const tree = (await (await getOk(`${api}/git/trees/${commit}?recursive=1`, auth)).json()) as {
    truncated?: boolean
    tree: { path: string; type: string; size?: number }[]
  }
  if (tree.truncated) throw new Error(`the git tree of ${commit} is truncated by the API; cannot list ${o.lang}/json/ safely`)
  const dir = `${o.lang}/json/`
  const wanted = tree.tree
    .filter((t) => t.type === 'blob' && t.path.startsWith(dir) && /^\d{2,3}\.content\.json$/.test(t.path.slice(dir.length)))
    .filter((t) => {
      if (!o.books) return true
      const code = bookOfFile(t.path.slice(dir.length))
      if (code === undefined) o.warn?.(`--books given: skipping ${t.path}, which has no book code`)
      return code !== undefined && o.books.includes(code)
    })
  if (wanted.length === 0) throw new Error(`no ${dir}*.content.json file selected at ${commit}`)

  const raw = (path: string) => `${bases.raw}/BibleAquifer/${o.repo}/${commit}/${path}`
  rmSync(join(o.out, 'json'), { recursive: true, force: true })
  mkdirSync(join(o.out, 'json'), { recursive: true })
  const files: Manifest['files'] = []
  for (const t of wanted) {
    const buf = Buffer.from(await (await getOk(raw(t.path), {})).arrayBuffer())
    if (buf.length !== t.size) throw new Error(`${t.path}: downloaded ${buf.length} bytes, the tree says ${t.size}`)
    writeFileSync(join(o.out, 'json', t.path.slice(dir.length)), buf)
    files.push({ path: t.path, size: buf.length, sha256: createHash('sha256').update(buf).digest('hex') })
  }
  const range = `bytes=0-${HEAD - 1}`
  const headBytes = await readHead(await getOk(raw(`${o.lang}/metadata.json`), { Range: range }))
  writeFileSync(join(o.out, 'resource_metadata.json'), JSON.stringify(cutResourceMetadata(headBytes.toString('utf8')), null, 2) + '\n')
  const manifest: Manifest = {
    repo: o.repo,
    lang: o.lang,
    commit,
    fetched: (o.now?.() ?? new Date()).toISOString(),
    metadata: { range, sha256: createHash('sha256').update(headBytes).digest('hex') },
    files,
  }
  writeFileSync(join(o.out, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n')
  return manifest
}
