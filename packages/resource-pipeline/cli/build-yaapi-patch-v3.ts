/**
 * Build the signed Bible-text patch catalog `{lang}-x-yaapi` (format 3, `spec/catalog.md`, "Patch catalogs") from a snapshot `fetch-yaapi.ts` wrote.
 *
 *   bun packages/resource-pipeline/cli/build-yaapi-patch-v3.ts --lang es-419 --snap <dir> --base <url> --common <url|dir> --out <dir>
 *     [--sign-key <pem>] [--published <url>] [--trusted <hex>] [--books gen,exo] [--built <RFC 3339>] [--publisher <name>] [--versions <file>]
 *
 * - `--snap`: the folder of `fetch-yaapi.ts` (`<ABBR>.json`). The versions and their order come from `data/yaapi-versions.json` (`--versions` to change the file).
 * - `--base`: the base URL of a packs Worker. The published catalog of `{lang}` is read (signature checked): the books of its Bible resources are the books
 *   the patch leaves alone. `--common`: as in `build-patch-v3` (a folder or the base URL of a packs Worker); each book's original gives the verses to match.
 * - `--published`, `--trusted`, `--sign-key`: as in `build-patch-v3`. Writes `catalog-{lang}-x-yaapi.seg`, `segments/` and `report.txt` in `--out`; the last line on stdout is JSON.
 */
import { createHash } from 'node:crypto'
import { readdirSync, readFileSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { BOOKS, buildYaapiPatch, catalogView, hex, KNOWN, origView, readSegment, signCatalog, verifyCatalog, type YaapiVersionInfo } from '@bt-synergy/language-pack-v3'
import { ORIG_TABLES } from '../../language-pack-v3/src/read/orig'
import { readSigningKey } from '../src/language/signKey'
import type { Snapshot } from '../src/yaapi/fetchYaapi'
import { downloadCommon, readCommon, readPublished, trustedKeys } from './build-patch-v3'

const arg = (name: string): string | undefined => {
  const i = process.argv.indexOf(`--${name}`)
  return i < 0 ? undefined : process.argv[i + 1]
}
const need = (name: string): string => {
  const v = arg(name)
  if (v === undefined) {
    console.error(`--${name} is required`)
    process.exit(1)
  }
  return v
}
const isUrl = (s: string): boolean => /^https?:\/\//.test(s)

/** The books of the Bible resources of a published language catalog. */
async function baseTextBooks(base: string, lang: string, trusted: Record<string, Uint8Array>): Promise<Set<string>> {
  const root = base.replace(/\/+$/, '').replace(/\/v3\/packs(?:\/[^/]+)?$/, '')
  const res = await fetch(`${root}/v3/packs/${lang}/catalog`)
  if (!res.ok) throw new Error(`the base catalog ${lang}: HTTP ${res.status}`)
  const bytes = new Uint8Array(await res.arrayBuffer())
  await verifyCatalog(bytes, trusted)
  const model = catalogView((await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })).seg)
  const out = new Set<string>()
  for (const r of model.resources) {
    if (!/bible/i.test(r.subject)) continue
    BOOKS.forEach((b, i) => {
      if ((r.books[i >> 3] >> (i & 7)) & 1) out.add(b)
    })
  }
  return out
}

const lang = need('lang')
const cfg = JSON.parse(readFileSync(arg('versions') ?? fileURLToPath(new URL('../data/yaapi-versions.json', import.meta.url)), 'utf8')).languages[lang] as { versions: { abbr: string; license: string; audience: 'translators' | 'readers'; style: 'literal' | 'simple' | 'dynamic'; notice?: string }[] } | undefined
if (!cfg) {
  console.error(`yaapi-versions.json has no language ${lang}`)
  process.exit(1)
}
const snapDir = need('snap')
const out = need('out')
const trusted = trustedKeys(arg('trusted') ? [arg('trusted')!] : [])
const name = `${lang}-x-yaapi`

const versions: YaapiVersionInfo[] = cfg.versions.map((c) => {
  const file = join(snapDir, `${c.abbr}.json`)
  const raw = readFileSync(file)
  const snap = JSON.parse(raw.toString('utf8')) as Snapshot
  return {
    abbr: c.abbr,
    name: snap.version.name,
    copyright: snap.version.copyright,
    link: snap.version.link,
    field: snap.version.license,
    license: c.license,
    audience: c.audience,
    style: c.style,
    ...(c.notice !== undefined ? { notice: c.notice } : {}),
    release: `${c.abbr}@sha256:${createHash('sha256').update(raw).digest('hex').slice(0, 12)}`,
    verses: new Map(Object.entries(snap.books)),
  }
})

let revision = 1
let previous: Uint8Array | undefined
if (arg('published') !== undefined) {
  const p = await readPublished(arg('published')!, name, trusted)
  if (p !== undefined) {
    revision = p.revision + 1
    previous = Uint8Array.from(p.id.match(/../g)!, (pair) => parseInt(pair, 16))
  }
}
const commonArg = need('common')
const commonDir = isUrl(commonArg) ? await downloadCommon(commonArg, trusted) : commonArg
const common = await readCommon(commonDir)
const origVerses = new Map<string, Set<string>>()
for (const f of readdirSync(join(commonDir, 'segments'))) {
  const { seg } = await readSegment(new Uint8Array(readFileSync(join(commonDir, 'segments', f))), { known: ORIG_TABLES, expectedClass: 'orig' })
  const o = origView(seg)
  const set = new Set<string>()
  let ch = 0
  for (const [, kind, a] of o.events) {
    if (kind === 'chapter') ch = Number(a)
    else if (kind === 'verse' && Number.isInteger(Number(a))) set.add(`${ch}:${a}`)
  }
  origVerses.set(o.book, set)
}
if (isUrl(commonArg)) await rm(commonDir, { recursive: true, force: true })

const baseBooks = await baseTextBooks(need('base'), lang, trusted)
const build = await buildYaapiPatch({
  lang,
  versions,
  baseTextBooks: baseBooks,
  origs: common.origs,
  origVerses,
  common: { revision: common.revision, id: common.id },
  books: arg('books')?.split(','),
  about: { revision, built: arg('built') ?? new Date().toISOString(), publisher: arg('publisher') ?? 'unfoldingWord', previous },
})
let bytes = build.catalog.bytes
if (arg('sign-key') !== undefined) bytes = await signCatalog(bytes, (await readSigningKey(arg('sign-key')!)).pkcs8)
await rm(join(out, 'segments'), { recursive: true, force: true })
await mkdir(join(out, 'segments'), { recursive: true })
for (const s of build.segments) await writeFile(join(out, 'segments', `${s.id}.seg`), s.bytes)
await writeFile(join(out, `catalog-${name}.seg`), bytes)
const size = build.segments.reduce((n, s) => n + s.bytes.length, 0)
const lines = [
  `catalog: ${name}, revision ${revision}, id ${build.catalog.id}`,
  `common: revision ${common.revision}, id ${common.id}`,
  `base has text of: ${[...baseBooks].join(',') || '-'}`,
  ...build.resources.map((r) => `resource ${r.key}: ${r.release}, license ${r.license}`),
  ...Object.entries(build.built).map(([v, b]) => `${v}: ${b.length} books: ${b.join(',')}`),
  `sizes: ${build.segments.length} book segments ${(size / 1024).toFixed(0)} KB, catalog ${bytes.length} bytes`,
  ...build.report,
]
await writeFile(join(out, 'report.txt'), `${lines.join('\n')}\n`)
console.log(JSON.stringify({ catalog: `catalog-${name}.seg`, id: build.catalog.id, revision, books: build.built, segments: build.segments.length, bytes: size }))
void hex
