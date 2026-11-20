/**
 * Build the signed patch catalog of an aggregator (format 3, `spec/catalog.md`, "Patch catalogs"): the Aquifer notes and questions that
 * Door43 production lacks, as `book` segments of the catalog `{lang}-x-{source}`.
 *
 *   bun packages/resource-pipeline/cli/build-patch-v3.ts --lang hi --source aquifer --tn <dir> [--tq <dir>] [--ta <dir>] --ta-eng <dir>
 *     --en-ta-titles <file.json> --base-books <file.json> --common <dir> --out <dir>
 *     [--sign-key <pem>] [--revision <n>] [--previous <64 hex>] [--published <url>] [--trusted <hex>] [--books tit,rut] [--built <RFC 3339>] [--publisher <name>]
 *
 * - `--tn`, `--tq`: what `fetch-aquifer.ts` wrote for UWTranslationNotes / UWTranslationQuestions (`json/NN.content.json`, `resource_metadata.json`,
 *   `manifest.json`); `--ta`, `--ta-eng`: the same for UWTranslationManual in the language and in English (every `json/*.content.json` is read).
 *   `--tq` is left out for a language with no questions in Aquifer (es-419), and `--ta` for one with no Manual (es-419): the Manual articles the notes
 *   themselves link to (`associations.resource`, with the `reference_id` of the English twin) then stand in for it (`taFromNotes`). `--lang` is a language tag
 *   such as `hi` or `es-419` (no `-x-` suffix).
 * - `--en-ta-titles`: what `fetch-en-ta-titles.ts` wrote. `--base-books`: `{ "tn": [books], "tq": [books] }`, the books Door43 production already
 *   has (`door43-books.ts` writes it). A table of a book goes in only if Door43 lacks it; a book with neither table is not built.
 * - `--published`: the base URL of a packs Worker. Its published `{lang}-x-{source}` catalog is read (signature checked); if there is one the revision is its
 *   revision + 1 (an explicit `--revision` must be greater) and `--previous` is its id; a 404 means the first revision. Without it the revision is 1.
 * - `--trusted`: the raw Ed25519 public key (64 hex digits, comma-separated for several) trusted to sign what is downloaded, besides `language-pack-v3/keys/*.pub`.
 * - `--common`: a folder with `catalog-common.seg` and `segments/` of the published common catalog, or the base URL of a packs Worker (`https://...`; its
 *   `/v3/packs/common/catalog` and the `orig` segments it names are downloaded to a temporary folder, removed after the read). The patch requires the
 *   catalog (name, revision and id) and each book takes its `orig` from the `orig:{book}` segment.
 *
 * Writes in `--out`: `catalog-{lang}-x-{source}.seg`, `segments/<id>.seg` and `report.txt` (books built per table, row counts, links to Manual articles
 * left as text, sizes, what the converter worked around). With `--sign-key` the catalog is signed as `build-v3` does. The last line on stdout is
 * one JSON line. Exit code 0 when written, 1 for a usage error, 2 for a build error.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  type AquiferArticle,
  type AquiferTaArticle,
  BOOKS,
  bookNumber,
  type BaseBooks,
  buildPatch,
  buildTaMap,
  catalogView,
  type EnTaTitles,
  hex,
  KNOWN,
  keyId,
  type PatchSource,
  readHeader,
  readSegment,
  signCatalog,
  taFromNotes,
  verifyCatalog,
} from '@bt-synergy/language-pack-v3'
import { readSigningKey } from '../src/language/signKey'

export class UsageError extends Error {}

export const USAGE =
  'Usage: build-patch-v3 --lang <code> --source <name> --tn <dir> [--tq <dir>] [--ta <dir>] --ta-eng <dir> --en-ta-titles <file> --base-books <file> --common <dir> --out <dir>\n' +
  '  [--sign-key <pem>] [--revision <n>] [--previous <64 hex digits>] [--published <url>] [--trusted <hex>] [--books tit,rut] [--built <RFC 3339>] [--publisher <name>]'

type Io = { log: (line: string) => void; error: (line: string) => void }

const VALUE_FLAGS = ['lang', 'source', 'tn', 'tq', 'ta', 'ta-eng', 'en-ta-titles', 'base-books', 'common', 'out', 'sign-key', 'revision', 'previous', 'published', 'trusted', 'books', 'built', 'publisher']
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

type Options = {
  lang: string
  source: string
  tn: string
  /** `undefined` when not given: the language has no questions in Aquifer. */
  tq?: string
  /** `undefined` when not given: the Manual stand-in is taken from the notes' own associations (`taFromNotes`). */
  ta?: string
  taEng: string
  enTaTitles: string
  baseBooks: string
  common: string
  out: string
  signKey?: string
  /** `undefined` when not given. */
  revision?: number
  published?: string
  trusted: string[]
  previous?: Uint8Array
  books?: string[]
  built: string
  publisher: string
}

const isUrl = (text: string): boolean => /^https?:\/\//.test(text)

export function optionsFromArgs(argv: string[]): Options {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    if (!name.startsWith('--') || !VALUE_FLAGS.includes(name.slice(2))) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`The value of ${name} is missing`)
    if (flags.has(name.slice(2))) throw new UsageError(`${name} is given twice`)
    flags.set(name.slice(2), value)
  }
  const need = (name: string): string => {
    const value = flags.get(name)
    if (value === undefined) throw new UsageError(`--${name} is missing`)
    return value
  }
  const lang = need('lang')
  if (!/^[a-z]{2,3}(?:-(?!x(?:-|$))[a-z0-9]{1,8})*$/.test(lang)) throw new UsageError(`--lang ${JSON.stringify(lang)} is not a language tag without a private-use subtag (hi, es-419, pt-br)`)
  const source = need('source')
  if (!/^[a-z0-9]{1,8}$/.test(source)) throw new UsageError(`--source ${JSON.stringify(source)} is not 1 to 8 characters of a-z and 0-9`)
  for (const name of ['tn', 'ta-eng', ...(flags.has('tq') ? ['tq'] : []), ...(flags.has('ta') ? ['ta'] : [])]) {
    const dir = need(name)
    if (!existsSync(join(dir, 'json')) || !statSync(join(dir, 'json')).isDirectory()) throw new UsageError(`--${name}: ${join(dir, 'json')} is not a directory`)
  }
  for (const name of flags.has('tq') ? ['tn', 'tq'] : ['tn']) {
    for (const file of ['manifest.json', 'resource_metadata.json']) {
      if (!existsSync(join(need(name), file))) throw new UsageError(`--${name}: ${join(need(name), file)} is not there`)
    }
  }
  for (const name of ['en-ta-titles', 'base-books']) {
    if (!existsSync(need(name)) || !statSync(need(name)).isFile()) throw new UsageError(`--${name}: ${need(name)} is not a file`)
  }
  const common = need('common')
  if (!isUrl(common) && (!existsSync(join(common, 'catalog-common.seg')) || !statSync(join(common, 'catalog-common.seg')).isFile())) throw new UsageError(`--common: ${join(common, 'catalog-common.seg')} is not a file`)
  const signKey = flags.get('sign-key')
  if (signKey !== undefined && (!existsSync(signKey) || !statSync(signKey).isFile())) throw new UsageError(`--sign-key: ${signKey} is not a file`)
  const revisionText = flags.get('revision')
  const revision = revisionText === undefined ? undefined : Number(revisionText)
  if (revisionText !== undefined && (!/^[0-9]+$/.test(revisionText) || !Number.isSafeInteger(revision))) throw new UsageError(`--revision ${JSON.stringify(revisionText)} is not a whole number`)
  const previousText = flags.get('previous')
  if (previousText !== undefined && !/^[0-9a-f]{64}$/.test(previousText)) throw new UsageError(`--previous ${JSON.stringify(previousText)} is not an id (64 lowercase hex digits)`)
  const published = flags.get('published')
  if (published !== undefined && !isUrl(published)) throw new UsageError(`--published ${JSON.stringify(published)} is not a URL (https://...)`)
  const trusted = flags.get('trusted') === undefined ? [] : flags.get('trusted')!.split(',')
  for (const key of trusted) if (!/^[0-9a-f]{64}$/.test(key)) throw new UsageError(`--trusted ${JSON.stringify(key)} is not a public key (64 lowercase hex digits)`)
  let books: string[] | undefined
  if (flags.has('books')) {
    books = flags.get('books')!.split(',')
    for (const book of books) {
      try {
        bookNumber(book)
      } catch {
        throw new UsageError(`--books: ${JSON.stringify(book)} is not one of the 66 book codes`)
      }
    }
  }
  const built = flags.get('built') ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  if (!RFC3339.test(built)) throw new UsageError(`--built ${JSON.stringify(built)} is not an RFC 3339 date and time (2026-11-01T10:00:00Z)`)
  const publisher = flags.get('publisher') ?? 'unfoldingWord'
  if (publisher === '') throw new UsageError('--publisher is empty')
  return {
    lang,
    source,
    tn: need('tn'),
    tq: flags.get('tq'),
    ta: flags.get('ta'),
    taEng: need('ta-eng'),
    enTaTitles: need('en-ta-titles'),
    baseBooks: need('base-books'),
    common,
    out: need('out'),
    signKey,
    revision,
    published,
    trusted,
    previous: previousText === undefined ? undefined : Uint8Array.from(previousText.match(/../g)!, (pair) => parseInt(pair, 16)),
    books,
    built,
    publisher,
  }
}

function readJson<T>(file: string, what: string): T {
  try {
    return JSON.parse(readFileSync(file, 'utf8')) as T
  } catch (error) {
    throw new Error(`Cannot read ${what} ${file}: ${(error as Error).message}`)
  }
}

/** The files `NN.content.json` (and the 3-digit ones) of `<dir>/json`, in name order. */
function contentFiles(dir: string): string[] {
  return readdirSync(join(dir, 'json'))
    .filter((name) => /^\d+\.content\.json$/.test(name))
    .sort()
}

/** A fetched Aquifer resource: its metadata, its pin and the articles of each book (the 3-digit files have no book and are not read). */
export function readFetched(dir: string, repo: string, only?: readonly string[]): PatchSource {
  const manifest = readJson<{ repo?: string; commit?: string }>(join(dir, 'manifest.json'), 'the manifest')
  if (typeof manifest.commit !== 'string' || !/^[0-9a-f]{40}$/.test(manifest.commit)) throw new Error(`${join(dir, 'manifest.json')} has no commit of 40 hex digits`)
  if (manifest.repo !== repo) throw new Error(`${join(dir, 'manifest.json')} is of the repo ${JSON.stringify(manifest.repo)}, and ${JSON.stringify(repo)} is expected`)
  const metadata = readJson<PatchSource['metadata']>(join(dir, 'resource_metadata.json'), 'the resource metadata')
  const books = new Map<string, AquiferArticle[]>()
  for (const name of contentFiles(dir)) {
    const m = /^(\d{2})\.content\.json$/.exec(name)
    const book = m === null ? undefined : BOOKS[Number(m[1]) - 1]
    if (book === undefined || (only !== undefined && !only.includes(book))) continue
    const items = readJson<unknown>(join(dir, 'json', name), 'the articles')
    if (!Array.isArray(items)) throw new Error(`${join(dir, 'json', name)} is not a list of articles`)
    books.set(book, items as AquiferArticle[])
  }
  return { repo, commit: manifest.commit, metadata, books }
}

/** The articles of a Manual fetch, all files. */
function readManual(dir: string): AquiferTaArticle[] {
  return contentFiles(dir).flatMap((name) => {
    const items = readJson<unknown>(join(dir, 'json', name), 'the Manual articles')
    if (!Array.isArray(items)) throw new Error(`${join(dir, 'json', name)} is not a list of articles`)
    return items as AquiferTaArticle[]
  })
}

/** The root of a packs Worker from its base URL, which may end in `/v3/packs` or `/v3/packs/{name}`. */
const rootOf = (base: string): string => base.replace(/\/+$/, '').replace(/\/v3\/packs(?:\/[^/]+)?$/, '')

/** The public keys a download is checked against: `language-pack-v3/keys/*.pub` and the hex keys of `--trusted`, by key id. */
export function trustedKeys(extra: readonly string[] = [], keysDir = fileURLToPath(new URL('../../language-pack-v3/keys', import.meta.url))): Record<string, Uint8Array> {
  const out: Record<string, Uint8Array> = {}
  const add = (text: string): void => {
    const raw = Uint8Array.from(text.match(/../g) ?? [], (pair) => parseInt(pair, 16))
    out[keyId(raw)] = raw
  }
  if (existsSync(keysDir)) {
    for (const name of readdirSync(keysDir)) {
      if (!name.endsWith('.pub')) continue
      const text = readFileSync(join(keysDir, name), 'utf8').trim()
      if (/^[0-9a-f]{64}$/.test(text)) add(text)
    }
  }
  for (const key of extra) add(key)
  return out
}

/**
 * What a Worker has published of the catalog `name`: its revision and id (signature checked against `trusted`), or `undefined` on a 404 (nothing published yet).
 * Any other failure throws.
 */
export async function readPublished(base: string, name: string, trusted: Record<string, Uint8Array>, fetcher: typeof fetch = fetch): Promise<{ revision: number; id: string } | undefined> {
  const url = `${rootOf(base)}/v3/packs/${name}/catalog`
  const response = await fetcher(url)
  if (response.status === 404) return undefined
  if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
  const bytes = new Uint8Array(await response.arrayBuffer())
  await verifyCatalog(bytes, trusted)
  const read = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
  const model = catalogView(read.seg)
  if (model.about.catalog !== name) throw new Error(`${url} is the catalog ${JSON.stringify(model.about.catalog)}, and ${JSON.stringify(name)} is expected`)
  return { revision: model.about.revision, id: read.id }
}

/**
 * Downloads the published common catalog from a packs Worker into a new temporary folder (`catalog-common.seg` and `segments/`): `{base}/v3/packs/common/catalog`,
 * then the `orig` segments it names, `{base}/v3/packs/seg/{id}` (the patch reads only those; the map and topics segments are not needed). `base` may end
 * in `/v3/packs/common` or `/v3/packs`. The catalog's signature is checked against `trusted` (`verifyCatalog`) and each segment against its id. Returns the folder; the caller removes it.
 */
export async function downloadCommon(base: string, trusted: Record<string, Uint8Array>, fetcher: typeof fetch = fetch): Promise<string> {
  const root = rootOf(base)
  const get = async (url: string): Promise<Uint8Array> => {
    const response = await fetcher(url)
    if (!response.ok) throw new Error(`${url}: HTTP ${response.status}`)
    return new Uint8Array(await response.arrayBuffer())
  }
  const dir = await mkdtemp(join(tmpdir(), 'patch-common-'))
  try {
    const bytes = await get(`${root}/v3/packs/common/catalog`)
    await verifyCatalog(bytes, trusted)
    await writeFile(join(dir, 'catalog-common.seg'), bytes)
    const { seg } = await readSegment(bytes, { known: KNOWN.catalog, expectedClass: 'catalog' })
    const model = catalogView(seg)
    await mkdir(join(dir, 'segments'))
    for (const unit of model.units) {
      if (!unit.id.startsWith('orig:')) continue
      for (const index of unit.segments) {
        const id = hex(model.segments[index].id)
        const segment = await get(`${root}/v3/packs/seg/${id}`)
        await readSegment(segment, { known: KNOWN.orig, expectedId: id, expectedClass: 'orig' })
        await writeFile(join(dir, 'segments', `${id}.seg`), segment)
      }
    }
    return dir
  } catch (error) {
    await rm(dir, { recursive: true, force: true })
    throw error
  }
}

/** The published common catalog in `dir`: its revision, its id and the `[key, stamp]` of each `orig:{book}` segment. */
export async function readCommon(dir: string): Promise<{ revision: number; id: string; origs: Map<string, [string, string]> }> {
  const file = join(dir, 'catalog-common.seg')
  let read
  try {
    read = await readSegment(new Uint8Array(await readFile(file)), { known: KNOWN.catalog, expectedClass: 'catalog' })
  } catch (error) {
    throw new Error(`Cannot read the common catalog ${file}: ${(error as Error).message}`)
  }
  const model = catalogView(read.seg)
  if (model.about.catalog !== 'common') throw new Error(`${file} is not the common catalog: it is the catalog ${JSON.stringify(model.about.catalog)}`)
  const origs = new Map<string, [string, string]>()
  for (const unit of model.units) {
    if (!unit.id.startsWith('orig:')) continue
    const book = unit.id.slice('orig:'.length)
    const entry = model.segments[unit.segments[0]]
    const name = join(dir, 'segments', `${hex(entry.id)}.seg`)
    if (!existsSync(name)) throw new Error(`the common segment ${name} (${unit.id}) is not there`)
    const orig = (readHeader(new Uint8Array(await readFile(name))).header.h as { orig?: unknown }).orig
    if (!Array.isArray(orig) || typeof orig[0] !== 'string' || typeof orig[1] !== 'string') throw new Error(`the common segment ${name} (${unit.id}) has no orig in its header`)
    origs.set(book, [orig[0], orig[1]])
  }
  return { revision: model.about.revision, id: read.id, origs }
}

const kb = (bytes: number): string => `${(bytes / 1024).toFixed(1)} KB`

async function build(o: Options, io: Io): Promise<void> {
  const base = readJson<Partial<BaseBooks>>(o.baseBooks, 'the base books')
  for (const kind of ['tn', 'tq'] as const) {
    if (!Array.isArray(base[kind]) || !base[kind]!.every((b) => typeof b === 'string')) throw new Error(`${o.baseBooks}: "${kind}" is not a list of book codes`)
  }
  const tn = readFetched(o.tn, 'UWTranslationNotes', o.books)
  const tq = o.tq === undefined ? undefined : readFetched(o.tq, 'UWTranslationQuestions', o.books)
  const titles = readJson<EnTaTitles>(o.enTaTitles, 'the TA titles')
  const { map: taMap, unmatched } = buildTaMap(o.ta === undefined ? taFromNotes([...tn.books.values()].flat()) : readManual(o.ta), readManual(o.taEng), titles)
  const trusted = trustedKeys(o.trusted)
  const name = `${o.lang}-x-${o.source}`
  let revision = o.revision ?? 1
  let previous = o.previous
  if (o.published !== undefined) {
    const published = await readPublished(o.published, name, trusted)
    if (published !== undefined) {
      if (o.revision !== undefined && o.revision <= published.revision) throw new Error(`--revision ${o.revision} is not greater than the published revision ${published.revision} of ${name}`)
      revision = o.revision ?? published.revision + 1
      const id = Uint8Array.from(published.id.match(/../g)!, (pair) => parseInt(pair, 16))
      if (previous !== undefined && hex(previous) !== published.id) throw new Error(`--previous is not the id of the published ${name} (${published.id})`)
      previous = id
    }
  }
  let commonDir = o.common
  let temporary: string | undefined
  if (isUrl(o.common)) commonDir = temporary = await downloadCommon(o.common, trusted)
  let common: Awaited<ReturnType<typeof readCommon>>
  try {
    common = await readCommon(commonDir)
  } finally {
    if (temporary !== undefined) await rm(temporary, { recursive: true, force: true })
  }

  const patch = await buildPatch({
    lang: o.lang,
    source: o.source,
    tn,
    tq,
    taMap,
    base: { tn: base.tn!, tq: base.tq! },
    origs: common.origs,
    common: { revision: common.revision, id: common.id },
    books: o.books,
    about: { revision, built: o.built, publisher: o.publisher, previous },
  })

  let catalogBytes = patch.catalog.bytes
  let keyId: string | undefined
  if (o.signKey !== undefined) {
    const key = await readSigningKey(o.signKey)
    keyId = key.keyId
    catalogBytes = await signCatalog(catalogBytes, key.pkcs8)
  }

  // Empty segments/ first, as build-v3 does, so a withdrawn book does not linger.
  await rm(join(o.out, 'segments'), { recursive: true, force: true })
  await mkdir(join(o.out, 'segments'), { recursive: true })
  for (const segment of patch.segments) await writeFile(join(o.out, 'segments', `${segment.id}.seg`), segment.bytes)
  await writeFile(join(o.out, `catalog-${name}.seg`), catalogBytes)

  const segmentBytes = patch.segments.reduce((sum, s) => sum + s.bytes.length, 0)
  const lines = [
    `built: ${o.built}`,
    `catalog: ${name}, revision ${revision}, id ${patch.catalog.id}`,
    `common: revision ${common.revision}, id ${common.id}`,
    `signed: ${keyId === undefined ? 'no' : `key ${keyId}`}`,
    `door43 has: tn ${base.tn!.join(',') || '-'}; tq ${base.tq!.join(',') || '-'}`,
    `tn: ${patch.built.tn.length} books, ${patch.rows.tn} rows: ${patch.built.tn.join(',') || '-'}`,
    `tq: ${patch.built.tq.length} books, ${patch.rows.tq} rows: ${patch.built.tq.join(',') || '-'}`,
    ...patch.resources.map((r) => `resource ${r.key}: ${r.release}, review ${r.review}, license ${r.license}`),
    `ta map: ${taMap.size} articles matched, ${unmatched.length} Manual articles without a ta: id`,
    `ta links left as text: ${patch.taLinks.inlineLinks} inline links; ${patch.taLinks.conceptArticles} associated concept articles with no ta: id`,
    `sizes: ${patch.segments.length} book segments ${kb(segmentBytes)}, catalog ${kb(catalogBytes.length)}`,
    ...patch.segments.map((s) => `  book ${s.seg.h.book} ${kb(s.bytes.length)} ${s.id.slice(0, 12)}`),
    ...unmatched.map((u) => `ta article ${u.contentId} ${JSON.stringify(u.title)}: ${u.reason}`),
    ...patch.report,
  ]
  await writeFile(join(o.out, 'report.txt'), `${lines.join('\n')}\n`)
  io.log(
    JSON.stringify({
      catalog: `catalog-${name}.seg`,
      id: patch.catalog.id,
      revision,
      signed: keyId !== undefined,
      books: patch.built,
      rows: patch.rows,
      taLinks: patch.taLinks,
      segments: patch.segments.length,
      bytes: { segments: segmentBytes, catalog: catalogBytes.length },
    }),
  )
}

/** The command: its exit code (0, 1 for a usage error, 2 for a build error). `io` takes what it prints. */
export async function main(argv: string[], io: Io = { log: console.log, error: console.error }): Promise<number> {
  let options: Options
  try {
    options = optionsFromArgs(argv)
  } catch (error) {
    io.error(error instanceof Error ? error.message : String(error))
    if (error instanceof UsageError) io.error(USAGE)
    return 1
  }
  try {
    await build(options, io)
    return 0
  } catch (error) {
    io.error(`Error: ${error instanceof Error ? error.message : String(error)}`)
    return 2
  }
}

// `main` is Bun's; this package's type check has no Bun types.
if ((import.meta as ImportMeta & { main?: boolean }).main) {
  process.exitCode = await main(process.argv.slice(2))
}
