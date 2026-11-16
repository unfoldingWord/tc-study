/**
 * The books Door43 production has for a language, for `build-patch-v3.ts --base-books`.
 *
 *   bun packages/resource-pipeline/cli/door43-books.ts --lang hi [--out <file.json>]
 *
 * Reads `https://git.door43.org/api/v1/catalog/search?lang=<lang>&stage=prod&limit=100` (every page, until an empty one or the `X-Total-Count` the server announces: it may cap a page below the limit) and counts only the subjects
 * `TSV Translation Notes` and `TSV Translation Questions` (the tc-ready ones). Writes `{ "lang": "hi", "tn": [books], "tq": [books] }`, the books in
 * the order of the canon, to `--out`, or to stdout without it. Exit 0 when written, 1 when the catalog cannot be read, 2 for bad arguments.
 */
import { writeFileSync } from 'node:fs'
import { BOOKS } from '@bt-synergy/language-pack-v3'

const BASE = 'https://git.door43.org'
const LIMIT = 100
const MAX_PAGES = 200
const SUBJECTS: Record<string, 'tn' | 'tq'> = { 'TSV Translation Notes': 'tn', 'TSV Translation Questions': 'tq' }
export const USAGE = 'Usage: door43-books --lang <code> [--out <file.json>]'

type Io = { log: (line: string) => void; error: (line: string) => void }
export type Door43Books = { lang: string; tn: string[]; tq: string[] }

type Entry = { subject?: string; ingredients?: { identifier?: string }[] }

/** The books of the notes and the questions of the production catalog of `lang`. Throws `Error` when the catalog cannot be read. */
export async function door43Books(lang: string, fetcher: typeof fetch = fetch, base = BASE): Promise<Door43Books> {
  const sets = { tn: new Set<string>(), tq: new Set<string>() }
  let seen = 0
  for (let page = 1; ; page++) {
    if (page > MAX_PAGES) throw new Error(`${base}: the catalog has more than ${MAX_PAGES} pages; the server may be ignoring page`)
    const url = `${base}/api/v1/catalog/search?lang=${encodeURIComponent(lang)}&stage=prod&limit=${LIMIT}&page=${page}`
    const response = await fetcher(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    const body = (await response.json()) as { data?: Entry[] }
    if (!Array.isArray(body.data)) throw new Error(`${url}: the answer has no data list`)
    for (const entry of body.data) {
      const kind = entry.subject === undefined ? undefined : SUBJECTS[entry.subject]
      if (kind === undefined) continue
      for (const ingredient of entry.ingredients ?? []) if (typeof ingredient.identifier === 'string' && BOOKS.includes(ingredient.identifier)) sets[kind].add(ingredient.identifier)
    }
    // The server may cap a page below `limit` (it does at 50), so only an empty page, or the total it announced, ends the list.
    if (body.data.length === 0) break
    seen += body.data.length
    const total = Number(response.headers.get('X-Total-Count'))
    if (Number.isFinite(total) && total > 0 && seen >= total) break
  }
  const order = (set: Set<string>): string[] => [...set].sort((a, b) => BOOKS.indexOf(a) - BOOKS.indexOf(b))
  return { lang, tn: order(sets.tn), tq: order(sets.tq) }
}

export async function main(argv: string[], io: Io = { log: console.log, error: console.error }, fetcher: typeof fetch = fetch, base = BASE): Promise<number> {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const [name, value] = [argv[i], argv[i + 1]]
    if ((name !== '--lang' && name !== '--out') || value === undefined || value.startsWith('--') || flags.has(name)) {
      io.error(USAGE)
      return 2
    }
    flags.set(name, value)
  }
  const lang = flags.get('--lang')
  if (lang === undefined || !/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(lang)) {
    io.error(USAGE)
    return 2
  }
  try {
    const text = `${JSON.stringify(await door43Books(lang, fetcher, base), null, 2)}\n`
    const out = flags.get('--out')
    if (out === undefined) io.log(text.trimEnd())
    else writeFileSync(out, text)
    return 0
  } catch (error) {
    io.error((error as Error).message)
    return 1
  }
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) process.exitCode = await main(process.argv.slice(2))
