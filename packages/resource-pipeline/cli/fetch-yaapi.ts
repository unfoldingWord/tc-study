/**
 * Download Bible versions from yaapi.bible into a pinned snapshot for `build-yaapi-patch-v3.ts`.
 *
 *   bun packages/resource-pipeline/cli/fetch-yaapi.ts --language Spanish --versions SPAPDDPT,ONBV-AST [--books gen,exo,...] --out <dir> [--pause <ms>]
 *
 * `--language` is the English name of the language. Writes `<out>/<ABBR>.json` (the `list_versions` entry as read that day, the date and the verses of each
 * book) and `<out>/MANIFEST.json` (sha256 of each file). A book already in `<out>/<ABBR>.json` is not asked again, so a cut run is resumed by running it
 * again. A chapter that comes back empty ends its book; chapter 1 empty means the version has no such book. Exit 0 when written, 1 on a download
 * error, 2 for bad arguments.
 */
import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { BOOKS, connect, type Snapshot, type YaapiVerse } from '../src/yaapi/fetchYaapi'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? undefined : process.argv[i + 1]
}
const language = arg('language')
const versions = arg('versions')?.split(',')
const out = arg('out')
if (!language || !versions || !out) {
  console.error('Usage: fetch-yaapi --language <English name> --versions A,B --out <dir> [--books gen,exo] [--pause ms]')
  process.exit(2)
}
const books = arg('books')?.split(',') ?? BOOKS
const bad = books.filter((b) => !BOOKS.includes(b))
if (bad.length) {
  console.error(`unknown books: ${bad.join(',')}`)
  process.exit(2)
}

const mcp = await connect({ pauseMs: Number(arg('pause') ?? 250) })
const listed = await mcp.listVersions(language)
mkdirSync(out, { recursive: true })
const manifest: Record<string, string> = {}
for (const abbr of versions) {
  const meta = listed.find((v) => v.abbreviation === abbr)
  if (!meta) {
    console.error(`${abbr} is not in list_versions(${language})`)
    process.exit(1)
  }
  const file = join(out, `${abbr}.json`)
  const snap: Snapshot = existsSync(file) ? JSON.parse(readFileSync(file, 'utf8')) : { format: 1, version: meta, fetched: new Date().toISOString(), books: {} }
  for (const book of books) {
    if (snap.books[book] !== undefined) continue
    const verses: YaapiVerse[] = []
    for (let c = 1; c < 200; c++) {
      let got: YaapiVerse[] = []
      for (let attempt = 0; ; attempt++) {
        try {
          got = await mcp.chapter(abbr, book, c)
          break
        } catch (e) {
          if (attempt >= 3) throw e
          await new Promise((r) => setTimeout(r, 2000 * (attempt + 1)))
        }
      }
      if (got.length === 0) break
      verses.push(...got)
    }
    snap.books[book] = verses
    writeFileSync(file, JSON.stringify(snap))
    console.error(`${abbr} ${book}: ${verses.length} verses`)
  }
  manifest[`${abbr}.json`] = createHash('sha256').update(readFileSync(file)).digest('hex')
}
writeFileSync(join(out, 'MANIFEST.json'), JSON.stringify(manifest, null, 1))
console.log(JSON.stringify(manifest))
