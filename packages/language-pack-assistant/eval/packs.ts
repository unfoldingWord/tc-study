/**
 * The packs the evaluation reads: installed from staging into a cache folder outside the repo, then opened with the client's reader.
 * Node and Bun only. The network is opt-in (`LP3_STAGING=1`), GET requests only, and only to the staging URL: production is never touched.
 * Without the flag the reader opens what the cache holds. `bun eval/packs.ts <lang>` installs and prints the report.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createClient, httpSource, type PackReader } from '@bt-synergy/language-pack-client'
import { fsStore } from '@bt-synergy/language-pack-client/node/fsStore'

export const STAGING = 'https://translation-helps-mcp-v2-preview.unfoldingword.workers.dev'
export const KEY_ID = '78d2e6299a2de4d0'
const KEY_FILE = join(dirname(fileURLToPath(import.meta.url)), '../../language-pack-v3/keys', `${KEY_ID}.pub`)
export const CACHE = process.env.LP3_CACHE ?? 'C:/Users/LENOVO/Git/Github/wt/lp3-c2-cache'

export type PacksReport = { lang: string; ms: number; installed: string[]; fetched: number; fetchedBytes: number; cacheBytes: number; network: boolean }

function trust() {
  const hex = readFileSync(KEY_FILE, 'utf8').trim()
  return { trustedKeys: { [KEY_ID]: Uint8Array.from(hex.match(/../g)!, (p) => parseInt(p, 16)) } }
}

function folderBytes(dir: string): number {
  if (!existsSync(dir)) return 0
  let n = 0
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, e.name)
    n += e.isDirectory() ? folderBytes(p) : statSync(p).size
  }
  return n
}

/** Refreshes (with `LP3_STAGING=1`) and installs every unit of the language catalog that is not optional, with what they need; the segments the cache holds are not fetched again. */
export async function installPacks(lang: string): Promise<{ reader: PackReader; report: PacksReport }> {
  const network = process.env.LP3_STAGING === '1'
  const t0 = Date.now()
  const store = fsStore(CACHE)
  let fetchedBytes = 0
  const counting: typeof fetch = async (input, init) => {
    if ((init?.method ?? 'GET') !== 'GET') throw new Error('the evaluation sends GET requests only')
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
    if (!url.startsWith(STAGING)) throw new Error(`not the staging URL: ${url}`)
    const res = await fetch(input, init)
    fetchedBytes += Number(res.headers.get('Content-Length') ?? 0)
    return res
  }
  const client = createClient({ store, ...(network ? { source: httpSource({ base: STAGING, fetch: counting }) } : {}), trust: trust() })
  let fetched = 0
  if (network) {
    await client.refresh(lang)
    const status = await client.status(lang)
    const units = status.units.filter((u) => !u.optional).map((u) => u.key)
    const r = await client.install(lang, { units }, { concurrency: 6 })
    fetched = r.fetched.length
    if (r.waiting.length > 0 || r.unknown.length > 0) console.warn('waiting:', JSON.stringify(r.waiting), 'unknown:', JSON.stringify(r.unknown))
  }
  const status = await client.status(lang)
  const installed = status.units.filter((u) => u.installed).map((u) => u.key)
  if (installed.length === 0) throw new Error(`no packs of ${lang} in ${CACHE}: run once with LP3_STAGING=1`)
  const reader = await client.open(lang)
  return { reader, report: { lang, ms: Date.now() - t0, installed, fetched, fetchedBytes, cacheBytes: folderBytes(CACHE), network } }
}

export async function loadPacks(lang: string): Promise<PackReader> {
  return (await installPacks(lang)).reader
}

if (process.argv[1]?.endsWith('packs.ts')) {
  const lang = process.argv[2] ?? 'es-419'
  const { report } = await installPacks(lang)
  const { installed, ...rest } = report
  console.log(JSON.stringify({ ...rest, units: installed.length, books: installed.filter((u) => u.includes('/book:')).length, common: installed.filter((u) => !u.startsWith(`${lang}/`)).length }))
  console.log(installed.join(' '))
}
