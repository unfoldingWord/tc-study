/**
 * Build the segments of language pack format 3 from format 2.0 parts and save them in a folder.
 *
 *   bun packages/resource-pipeline/cli/build-v3.ts --list <lang list.json> --originals <originals list.json> --parts <dir> --out <dir>
 *     [--books tit,rut] [--registry <dir>] [--revision <n>] [--built <RFC 3339>] [--publisher <name>]
 *     [--map-lang <lang>] [--map-list <list.json>] [--book-names <file>] [--topics <dir>] [--aligned] [--ta-config <dir>]
 *     [--role-hints <dir>]
 *
 * The inputs are what phase 0 left on disk: the parts list of a language (`es-419/list.json`, its `language` says which language
 * this is), the list of the originals (`originals/list.json`) and the folder with the `<sha256>.part.gz` files both name. Only the
 * parts of the requested books are opened (default: the books the language has and the originals have).
 *
 * The common part is built first (`buildCommon`: the `orig` segment of every requested book and the common catalog), then the
 * language (`buildLanguage`) against it: its catalog `requires` the common one. Writes in `--out`:
 *
 *   segments/<id>.seg     every segment, common and language, under its id in lowercase hex
 *   catalog-common.seg    the common catalog
 *   catalog-<lang>.seg    the language catalog
 *   report.txt            a header (built, language, books, counts) and then what the builders worked around, one line each
 *
 * With `--registry <dir>` the sections of the articles keep their ids from build to build: `registry-<lang>.json` is read if it
 * exists and written after the build. Without it nothing is read or written, and the report says so.
 *
 * With `--topics <dir>` (the sources folder: `tipnr/*.txt`, `theographic/{events,verses,people,places}.json`,
 * `en_obs/obs-repo/content/NN.md`) the common part also gets the `xtopics` segments and the language its `topics` segments. The map
 * segments are the same bytes with or without it.
 *
 * With `--ta-config <dir>` (what `fetch-ta-config.ts` writes: `<dir>/<resource key>/<manual>/config.yaml`) the `related` of the tA
 * articles also has the ties of the config of each manual; without it, the ties of the links of the texts alone, and a log line says so.
 *
 * `--aligned` (a flag with no value) also builds the optional `aligned:` units of the language, the index of aligned phrases of its bridge
 * texts (GLT, GST, ULT, UST). The other segments are the same bytes with or without it; only the `aligned` segments and the language
 * catalog (which lists them) are added or changed.
 *
 * Prints one line per segment: class, book or group, size in KB (1 KB = 1024 bytes) and the first 12 digits of the id. Exit code 0
 * when the folder is written, 1 for a usage error (the usage is printed), 2 for a build error (the message is printed).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BOOKS,
  bookNumber,
  type BuiltSegment,
  buildCommon,
  buildLanguage,
  BUILDER,
  catalogView,
  hex,
  KNOWN,
  OBSIMG_CATALOG,
  signCatalog,
  readHeader,
  readSegment,
  type Segment,
  ORIGINALS,
  artView,
  parseTipnr,
  type RoleHint,
  type SectionRegistry,
  unitBytes,
  type TipnrRecord,
  xtopicsView,
  type XtopicsCore,
} from '@bt-synergy/language-pack-v3'
import { partsSource } from '@bt-synergy/language-pack-v3/node/partsSource'
import { readSigningKey, type SigningKey } from '../src/language/signKey'
import { buildObsImages } from '../src/obsImages/build'
import { convertAll, type Converter, encoderName, sharpConverter } from '../src/obsImages/convert'
import { fetchObsImagesZip, OBS_IMAGES_ZIP, readObsJpegs } from '../src/obsImages/source'
import { readTaConfigs, readTaTocs } from '../src/language/taConfig'
import { pins, sourcesProblem, type TopicSource } from './fetch-topic-sources'

export class UsageError extends Error {}

export const USAGE =
  'Usage: build-v3 --list <lang list.json> --originals <originals list.json> --parts <dir> --out <dir> ' +
  '[--books tit,rut] [--registry <dir>] [--revision <n>] [--built <RFC 3339>] [--publisher <name>]\n' +
  '  --books      the books to build (default: those the language and the originals have).\n' +
  '               The common map counts only the books built: a publisher needs all 66 originals\n' +
  '  --registry   the folder of registry-<lang>.json, read if it exists and updated; without it, section ids start from scratch\n' +
  '  --revision   the revision of both catalogs (default 1)\n' +
  '  --revision-common, --revision-lang   the revision of one catalog (default: --revision)\n' +
  '  --previous-common, --previous-lang   the id (64 hex digits) of the published catalog this one follows (about.previous; default none)\n' +
  '  --common     a folder with catalog-common.seg and segments/ of a published common build: the common part is not built, the language\n' +
  '               is built against that catalog and nothing of the common part is written in --out\n' +
  '  --built      the time the catalogs say they were built (default: now). Pass a fixed value for a reproducible build:\n' +
  '               the same inputs and the same --built give the same bytes\n' +
  '  --publisher  the publisher of both catalogs (default unfoldingWord)\n' +
  '  --map-lang   the language whose helps make the common map (default en; with no list for it, no common map)\n' +
  '  --map-list   the parts list of the map language, when it is not the language of --list (default: none)\n' +
  '  --book-names a JSON file {book: [name, short, abbreviation]} for the book names of the language map\n' +
  '  --topics     the folder of the topic sources (tipnr/, theographic/, en_obs/): builds the xtopics and the topics of the language\n' +
  '  --sign-key   a PKCS#8 PEM file of an Ed25519 key: both catalogs this build writes are signed with it (segments are the same bytes; the key is read\n' +
  '               into memory and never printed or written)\n' +
  '  --ta-config  the folder fetch-ta-config wrote (<resource key>/<manual>/config.yaml): the related of the tA articles also has the ties\n' +
  '               of the configs (without it, the ties of the links of the texts alone)\n' +
  '  --role-hints a folder with segments/*.seg of the map language (the published `art` segments): the sections whose heading the language\n' +
  '               does not know take the role of the same section of the English article with the same id (publish-v3 gives it)\n' +
  '  --obs-images (no value) builds only the catalog zxx-obsimg (the OBS pictures: downloaded, checked against the pin, converted to WebP): needs --out and takes\n' +
  '               only --sign-key, --revision (default 1), --previous, --built, --publisher and --cache (a folder that keeps the downloaded zip)\n' +
  '  --aligned    (no value) also build the optional `aligned:` units, the index of aligned phrases of the bridge texts (GLT, GST, ULT, UST);\n' +
  '               every other segment is the same bytes with or without it'

type Io = { log: (line: string) => void; error: (line: string) => void }

type Options = {
  list: string
  originals: string
  parts: string
  out: string
  books?: string[]
  registry?: string
  revision: number
  revisionCommon: number
  revisionLang: number
  previousCommon?: Uint8Array
  previousLang?: Uint8Array
  common?: string
  built: string
  publisher: string
  mapLang: string
  mapList?: string
  bookNames?: string
  topics?: string
  aligned: boolean
  signKey?: string
  taConfig?: string
  roleHints?: string
  /** `--obs-images`: build only the catalog `zxx-obsimg`; `list`, `originals` and `parts` are then empty. */
  obsImages?: boolean
  previous?: Uint8Array
  cache?: string
}

const BOOLEAN_FLAGS = ['aligned', 'obs-images']
const VALUE_FLAGS = ['previous', 'cache', 'list', 'originals', 'parts', 'out', 'books', 'registry', 'revision', 'built', 'publisher', 'map-lang', 'map-list', 'book-names', 'topics', 'revision-common', 'revision-lang', 'previous-common', 'previous-lang', 'common', 'sign-key', 'ta-config', 'role-hints']

/** RFC 3339 date and time, as the catalog writes `about.built`. */
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

function flagsOf(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    if (name.startsWith('--') && BOOLEAN_FLAGS.includes(name.slice(2))) {
      if (flags.has(name.slice(2))) throw new UsageError(`${name} is given twice`)
      flags.set(name.slice(2), 'true')
      i -= 1
      continue
    }
    if (!name.startsWith('--') || !VALUE_FLAGS.includes(name.slice(2))) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`The value of ${name} is missing`)
    if (flags.has(name.slice(2))) throw new UsageError(`${name} is given twice`)
    flags.set(name.slice(2), value)
  }
  return flags
}

/** The options of `--obs-images`: only --out is required, and a flag of the language build is refused rather than ignored. */
function obsImagesOptions(flags: Map<string, string>, need: (name: string) => string): Options {
  const allowed = ['obs-images', 'out', 'sign-key', 'revision', 'previous', 'built', 'publisher', 'cache']
  for (const name of flags.keys()) if (!allowed.includes(name)) throw new UsageError(`--${name} does not apply to --obs-images`)
  const out = need('out')
  const revisionText = flags.get('revision') ?? '1'
  const revision = Number(revisionText)
  if (!/^[0-9]+$/.test(revisionText) || !Number.isSafeInteger(revision)) throw new UsageError(`--revision ${JSON.stringify(revisionText)} is not a whole number`)
  const previousText = flags.get('previous')
  if (previousText !== undefined && !/^[0-9a-f]{64}$/.test(previousText)) throw new UsageError(`--previous ${JSON.stringify(previousText)} is not an id (64 lowercase hex digits)`)
  const built = flags.get('built') ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  if (!RFC3339.test(built)) throw new UsageError(`--built ${JSON.stringify(built)} is not an RFC 3339 date and time (2026-11-01T10:00:00Z)`)
  const publisher = flags.get('publisher') ?? 'unfoldingWord'
  if (publisher === '') throw new UsageError('--publisher is empty')
  const signKey = flags.get('sign-key')
  if (signKey !== undefined && (!existsSync(signKey) || !statSync(signKey).isFile())) throw new UsageError(`--sign-key: ${signKey} is not a file`)
  return {
    list: '', originals: '', parts: '', out, revision, revisionCommon: revision, revisionLang: revision, built, publisher, mapLang: 'en', aligned: false, signKey,
    obsImages: true, cache: flags.get('cache'),
    previous: previousText === undefined ? undefined : Uint8Array.from(previousText.match(/../g)!, (pair) => parseInt(pair, 16)),
  }
}

export function optionsFromArgs(argv: string[], sources: TopicSource[] = pins()): Options {
  const flags = flagsOf(argv)
  const need = (name: string): string => {
    const value = flags.get(name)
    if (value === undefined) throw new UsageError(`--${name} is missing`)
    return value
  }
  if (flags.has('obs-images')) return obsImagesOptions(flags, need)
  // A language build has --previous-common and --previous-lang: a bare --previous (or --cache) would be ignored without a word.
  for (const name of ['previous', 'cache']) if (flags.has(name)) throw new UsageError(`--${name} applies only to --obs-images`)
  const list = need('list')
  const originals = need('originals')
  const parts = need('parts')
  const out = need('out')

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

  const revisionOf = (name: string, fallback: string): number => {
    const text = flags.get(name) ?? fallback
    const n = Number(text)
    if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(n)) throw new UsageError(`--${name} ${JSON.stringify(text)} is not a whole number`)
    return n
  }
  const revision = revisionOf('revision', '1')
  const revisionCommon = revisionOf('revision-common', flags.get('revision') ?? '1')
  const revisionLang = revisionOf('revision-lang', flags.get('revision') ?? '1')
  const previousOf = (name: string): Uint8Array | undefined => {
    const text = flags.get(name)
    if (text === undefined) return undefined
    if (!/^[0-9a-f]{64}$/.test(text)) throw new UsageError(`--${name} ${JSON.stringify(text)} is not an id (64 lowercase hex digits)`)
    return Uint8Array.from(text.match(/../g)!, (pair) => parseInt(pair, 16))
  }
  const previousCommon = previousOf('previous-common')
  const previousLang = previousOf('previous-lang')
  const common = flags.get('common')
  if (common !== undefined) {
    const file = join(common, 'catalog-common.seg')
    if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`--common: ${file} is not a file`)
    if (flags.has('revision-common') || flags.has('previous-common')) throw new UsageError('--common is a published common catalog: --revision-common and --previous-common do not apply')
  }

  const built = flags.get('built') ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  if (!RFC3339.test(built)) throw new UsageError(`--built ${JSON.stringify(built)} is not an RFC 3339 date and time (2026-11-01T10:00:00Z)`)

  const publisher = flags.get('publisher') ?? 'unfoldingWord'
  if (publisher === '') throw new UsageError('--publisher is empty')

  const mapLang = flags.get('map-lang') ?? 'en'
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(mapLang)) throw new UsageError(`--map-lang ${JSON.stringify(mapLang)} is not a language code`)
  const bookNames = flags.get('book-names')
  const mapList = flags.get('map-list')
  const topics = flags.get('topics')
  const taConfig = flags.get('ta-config')
  if (taConfig !== undefined && (!existsSync(taConfig) || !statSync(taConfig).isDirectory())) throw new UsageError(`--ta-config: ${taConfig} is not a directory`)

  const roleHints = flags.get('role-hints')
  if (roleHints !== undefined && (!existsSync(join(roleHints, 'segments')) || !statSync(join(roleHints, 'segments')).isDirectory())) throw new UsageError(`--role-hints: ${join(roleHints, 'segments')} is not a directory`)

  for (const [name, path] of [['list', list], ['originals', originals], ...(bookNames === undefined ? [] : [['book-names', bookNames]]), ...(mapList === undefined ? [] : [['map-list', mapList]])]) {
    if (!existsSync(path) || !statSync(path).isFile()) throw new UsageError(`--${name}: ${path} is not a file`)
  }
  const signKey = flags.get('sign-key')
  if (signKey !== undefined && (!existsSync(signKey) || !statSync(signKey).isFile())) throw new UsageError(`--sign-key: ${signKey} is not a file`)
  if (!existsSync(parts) || !statSync(parts).isDirectory()) throw new UsageError(`--parts: ${parts} is not a directory`)

  if (topics !== undefined) {
    for (const dir of [topics, join(topics, 'tipnr'), join(topics, 'theographic'), join(topics, 'en_obs', 'obs-repo', 'content')]) {
      if (!existsSync(dir) || !statSync(dir).isDirectory()) throw new UsageError(`--topics: ${dir} is not a directory`)
    }
    for (const name of ['events', 'verses', 'people', 'places']) {
      const file = join(topics, 'theographic', `${name}.json`)
      if (!existsSync(file) || !statSync(file).isFile()) throw new UsageError(`--topics: ${file} is not a file`)
    }
    const content = join(topics, 'en_obs', 'obs-repo', 'content')
    if (!readdirSync(content).some((f) => /^\d\d\.md$/.test(f))) throw new UsageError(`--topics: ${content} has no NN.md story file`)
    const texts = readdirSync(join(topics, 'tipnr')).filter((f) => f.endsWith('.txt'))
    if (texts.length !== 1) throw new UsageError(`--topics: ${join(topics, 'tipnr')} must have exactly one .txt file (the TIPNR file), it has ${texts.length}`)
    const wrong = sourcesProblem(topics, sources)
    if (wrong !== undefined) throw new UsageError(`--topics: ${wrong}`)
  }

  return { list, originals, parts, out, books, registry: flags.get('registry'), revision, revisionCommon, revisionLang, previousCommon, previousLang, common, built, publisher, mapLang, mapList, bookNames, topics, aligned: flags.has('aligned'), signKey: flags.get('sign-key'), taConfig, roleHints }
}

/** The `language` of a parts list. The rest of the list is checked by `partsSource`. */
async function languageOf(path: string): Promise<string> {
  let list: { language?: unknown }
  try {
    list = JSON.parse(await readFile(path, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read the parts list ${path}: ${(error as Error).message}`)
  }
  if (typeof list?.language !== 'string' || list.language === '') throw new Error(`${path} is not a parts list: it has no language`)
  return list.language
}

/** The texts of the topic sources in `dir` (`--topics`). */
function topicTexts(dir: string) {
  const text = (path: string): string => readFileSync(path, 'utf8')
  const tipnrDir = join(dir, 'tipnr')
  const tipnrFile = readdirSync(tipnrDir).filter((f) => f.endsWith('.txt')).sort()[0]
  if (tipnrFile === undefined) throw new Error(`${tipnrDir} has no .txt file (the TIPNR file)`)
  const obs = new Map<number, string>()
  const obsDir = join(dir, 'en_obs', 'obs-repo', 'content')
  for (const f of readdirSync(obsDir)) if (/^\d\d\.md$/.test(f)) obs.set(Number(f.slice(0, 2)), text(join(obsDir, f)))
  const theo = (name: string): string => text(join(dir, 'theographic', `${name}.json`))
  return {
    tipnr: text(join(tipnrDir, tipnrFile)),
    theographic: { events: theo('events'), verses: theo('verses'), people: theo('people'), places: theo('places') },
    obs,
  }
}

/**
 * The roles of the articles of the map language, from the `.seg` files of `<dir>/segments`: only the `art` segments count. For each
 * article id, the headed sections (level > 0) in order with their roles; `segs` says the id (hex) of the segment each came from.
 */
export async function readRoleHints(dir: string): Promise<{ hints: Map<string, RoleHint>; segs: Map<string, string>; segments: number }> {
  const hints = new Map<string, RoleHint>()
  const segs = new Map<string, string>()
  const folder = join(dir, 'segments')
  let segments = 0
  for (const name of readdirSync(folder).filter((f) => f.endsWith('.seg')).sort()) {
    const path = join(folder, name)
    let read
    try {
      const bytes = new Uint8Array(readFileSync(path))
      // The header says the class: only the `art` segments hold roles.
      if ((readHeader(bytes).header.h as { class?: unknown }).class !== 'art') continue
      read = await readSegment(bytes, { known: KNOWN.art, expectedClass: 'art' })
    } catch (error) {
      throw new Error(`Cannot read the role hints ${path}: ${(error as Error).message}`)
    }
    segments++
    for (const article of artView(read.seg).articles) {
      if (hints.has(article.id)) throw new Error(`Cannot read the role hints ${folder}: the article ${article.id} is in two art segments (${segs.get(article.id)} and ${read.id})`)
      hints.set(article.id, article.sections.filter((section) => section.level > 0).map(({ level, role }) => ({ level, role })))
      segs.set(article.id, read.id)
    }
  }
  return { hints, segs, segments }
}

/** The registry of the last build of `lang` in `dir`, `{}` if there is none (the first build). */
async function readRegistry(file: string): Promise<SectionRegistry> {
  if (!existsSync(file)) return {}
  let registry: unknown
  try {
    registry = JSON.parse(await readFile(file, 'utf8'))
  } catch (error) {
    throw new Error(`Cannot read the registry ${file}: ${(error as Error).message}`)
  }
  if (typeof registry !== 'object' || registry === null || Array.isArray(registry) || Object.values(registry).some((entries) => !Array.isArray(entries))) {
    throw new Error(`${file} is not a registry: it should map each article to the list of its sections`)
  }
  return registry as SectionRegistry
}

/** The registry as JSON text, one article to a line (the articles are in canonical order already). */
function registryText(registry: SectionRegistry): string {
  const lines = Object.keys(registry).map((key) => `${JSON.stringify(key)}:${JSON.stringify(registry[key])}`)
  return `{\n${lines.join(',\n')}\n}\n`
}

/** `book`, `art`... then what the segment is about: its book or group, the language of a catalog, `common`. */
function lineOf(built: BuiltSegment): string {
  const { h } = built.seg
  const what = h.book ?? h.group ?? h.lang ?? (h.class === 'catalog' ? 'common' : '-')
  const kb = (built.bytes.length / 1024).toFixed(1)
  return `${h.class.padEnd(7)} ${what.padEnd(10)} ${kb.padStart(9)} KB  ${built.id.slice(0, 12)}`
}

/** The size of the segments of the map: the core and the parts of the class `xmap` (common) and `map` (the language). */
function mapSizes(label: string, segments: BuiltSegment[], cls: string): string | undefined {
  const mine = segments.filter(({ seg }) => seg.h.class === cls)
  if (mine.length === 0) return undefined
  const core = mine.find(({ seg }) => seg.h.part === 'core')
  const parts = mine.filter((s) => s !== core)
  const sum = (list: BuiltSegment[]): number => list.reduce((n, s) => n + s.bytes.length, 0)
  return `${label}: core ${core?.bytes.length ?? 0} bytes, ${parts.length} parts ${sum(parts)} bytes, total ${sum(mine)} bytes`
}

function countsOf(segments: BuiltSegment[]): string {
  const counts = new Map<string, number>()
  for (const { seg } of segments) counts.set(seg.h.class, (counts.get(seg.h.class) ?? 0) + 1)
  const parts = [...counts].map(([cls, n]) => `${cls} ${n}`)
  return `${segments.length} segments${parts.length > 0 ? ` (${parts.join(', ')})` : ''}`
}

/** The common part of a build: built here, or published (`--common`: its catalog is not ours to write, and it has no segments here). */
type Common = {
  segments: BuiltSegment[]
  catalog?: BuiltSegment
  catalogId: string
  revision: number
  report: string[]
  published: boolean
  core?: Segment
}

/** The published common catalog in `dir`: it has to hold the units the language needs, `orig:<book>` for each book and `xmap` if there is a map. */
async function readPublished(dir: string, books: string[], needMap: boolean, needTopics: boolean): Promise<Common & { core?: Segment }> {
  const file = join(dir, 'catalog-common.seg')
  let read
  try {
    read = await readSegment(new Uint8Array(await readFile(file)), { known: KNOWN.catalog, expectedClass: 'catalog' })
  } catch (error) {
    throw new Error(`Cannot read the common catalog ${file}: ${(error as Error).message}`)
  }
  const model = catalogView(read.seg)
  if (model.about.catalog !== 'common') throw new Error(`${file} is not the common catalog: it is the catalog ${JSON.stringify(model.about.catalog)}`)
  const units = new Set(model.units.map((unit) => unit.id))
  for (const book of [...books].sort((a, b) => bookNumber(a) - bookNumber(b))) {
    if (!units.has(`orig:${book}`)) throw new Error(`common catalog lacks orig:${book}`)
  }
  if (needMap && !units.has('xmap')) throw new Error('common catalog lacks xmap')
  let core: Segment | undefined
  if (needTopics) {
    const entry = model.segments.find((e) => e.class === 'xtopics' && e.part === 'core')
    if (entry === undefined) throw new Error('common catalog lacks xtopics')
    const name = join(dir, 'segments', `${hex(entry.id)}.seg`)
    if (!existsSync(name)) throw new Error(`the common segment ${name} is not there`)
    core = (await readSegment(new Uint8Array(await readFile(name)), { known: KNOWN.xtopics, expectedId: hex(entry.id), expectedClass: 'xtopics' })).seg
  }
  return { segments: [], catalogId: read.id, revision: model.about.revision, report: [], published: true, core }
}

/** What `--obs-images` needs from outside, so a test runs without the network and without sharp. */
export type ObsImagesDeps = {
  fetch: (url: string) => Promise<{ ok: boolean; status: number; arrayBuffer(): Promise<ArrayBuffer> }>
  /** The converter and the name of its encoder; the default is sharp's. */
  converter?: () => Promise<{ convert: Converter; encoder: string }>
  /** The pin of the zip (the real one by default). */
  pin?: typeof OBS_IMAGES_ZIP
}

async function buildObsImagesFolder(o: Options, io: Io, deps: ObsImagesDeps): Promise<void> {
  const t0 = Date.now()
  const zip = await fetchObsImagesZip(deps.fetch, o.cache, deps.pin)
  const jpegs = await readObsJpegs(zip)
  const { convert, encoder } = deps.converter === undefined ? { convert: await sharpConverter(), encoder: await encoderName() } : await deps.converter()
  const images = await convertAll(jpegs, convert)
  const about = { format: '3.0' as const, publisher: o.publisher, origin: 'published' as const, revision: o.revision, ...(o.previous === undefined ? {} : { previous: o.previous }), built: o.built }
  const built = await buildObsImages({ images, encoder, about, source: (deps.pin ?? OBS_IMAGES_ZIP).url })

  let key: SigningKey | undefined
  if (o.signKey !== undefined) {
    key = await readSigningKey(o.signKey)
    built.catalog = { ...built.catalog, bytes: await signCatalog(built.catalog.bytes, key.pkcs8) }
  }

  await rm(join(o.out, 'segments'), { recursive: true, force: true })
  await mkdir(join(o.out, 'segments'), { recursive: true })
  for (const segment of built.segments) await writeFile(join(o.out, 'segments', `${segment.id}.seg`), segment.bytes)
  await writeFile(join(o.out, `catalog-${OBSIMG_CATALOG}.seg`), built.catalog.bytes)
  const largest = built.segments.reduce((a, b) => (b.bytes.length > a.bytes.length ? b : a))
  const segmentBytes = built.segments.reduce((sum, s) => sum + s.bytes.length, 0)
  const seconds = ((Date.now() - t0) / 1000).toFixed(1)
  const summary = [
    `images: ${images.length}`,
    `segments: ${built.segments.length}, ${segmentBytes} bytes (${(segmentBytes / 1048576).toFixed(2)} MiB)`,
    `catalog: ${built.catalog.bytes.length} bytes, id ${built.catalog.id}`,
    `largest segment: story ${largest.seg.h.group}, ${largest.bytes.length} bytes`,
    `encoder: ${encoder}`,
    `signed: ${key === undefined ? 'no' : `key ${key.keyId}`}`,
    `wall time: ${seconds} s`,
  ]
  await writeFile(join(o.out, 'report.txt'), `${['language-pack-v3 build report', `built: ${o.built}`, `catalog: ${OBSIMG_CATALOG}, revision ${o.revision}`, ...summary].join('\n')}\n`)
  for (const line of summary) io.log(line)
  io.log(`written in ${o.out}`)
}

async function build(o: Options, io: Io, deps?: ObsImagesDeps): Promise<void> {
  if (o.obsImages === true) {
    await buildObsImagesFolder(o, io, deps ?? { fetch: (url) => fetch(url) })
    return
  }
  const lang = await languageOf(o.list)
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(lang)) throw new Error(`${o.list}: the language ${JSON.stringify(lang)} cannot name a file`)
  const originalsLanguage = await languageOf(o.originals)
  if (originalsLanguage !== ORIGINALS) throw new Error(`${o.originals} is not the list of the originals: its language is ${JSON.stringify(originalsLanguage)}`)

  const source = await partsSource({ list: o.list, partsDir: o.parts, originals: o.originals, extra: o.mapList === undefined ? [] : [o.mapList] })
  const aboutOf = (revision: number, previous?: Uint8Array) => ({ format: '3.0' as const, publisher: o.publisher, origin: 'published' as const, revision, ...(previous === undefined ? {} : { previous }), built: o.built, builder: BUILDER })
  const aboutCommon = aboutOf(o.revisionCommon, o.previousCommon)
  const about = aboutOf(o.revisionLang, o.previousLang)

  // The books to build: the ones asked for, else those the language has and the originals have (a book without originals is left out).
  let books = o.books
  if (books === undefined) {
    const have = new Set((await source.resources(ORIGINALS)).flatMap((ref) => ref.books))
    const wanted = new Set((await source.resources(lang)).flatMap((ref) => ref.books))
    books = BOOKS.filter((book) => wanted.has(book) && have.has(book))
  }

  const registryFile = o.registry === undefined ? undefined : join(o.registry, `registry-${lang}.json`)
  const registry = registryFile === undefined ? {} : await readRegistry(registryFile)

  // Common first: the language catalog names it.
  // The common map needs the helps of the map language: when the source has none (no list for it), there is no map to build.
  const mapLang = (await source.resources(o.mapLang)).length > 0 ? o.mapLang : undefined
  if (mapLang === undefined && o.common === undefined) io.log(`no list for the map language ${o.mapLang} (--map-list): no common map is built`)
  const topicSources = o.topics === undefined ? undefined : topicTexts(o.topics)
  // With --common the common part is a published one: only its catalog (and the xtopics core, for --topics) is read, nothing is built
  const published = o.common === undefined ? undefined : await readPublished(o.common, books, mapLang !== undefined, topicSources !== undefined)
  const built0 = published === undefined ? await buildCommon({ source, books, about: aboutCommon, mapLang, topics: topicSources }) : undefined
  const common: Common = published ?? { ...built0!, catalogId: built0!.catalog.id, revision: o.revisionCommon, published: false }
  let bookNames: Record<string, [string, string, string]> | undefined
  if (o.bookNames !== undefined) {
    try {
      bookNames = JSON.parse(await readFile(o.bookNames, 'utf8'))
    } catch (error) {
      throw new Error(`Cannot read the book names ${o.bookNames}: ${(error as Error).message}`)
    }
  }
  let topics: { xtopics: XtopicsCore; records: TipnrRecord[] } | undefined
  if (topicSources !== undefined) {
    const core = published !== undefined ? { seg: published.core! } : common.segments.find(({ seg }) => seg.h.class === 'xtopics' && seg.h.part === 'core')
    if (core === undefined) throw new Error('--topics: the common part has no xtopics core (no originals were built?)')
    // The builder already reported what it worked around in the TIPNR text (`common.report`); only a line it did not report is added
    const issues: string[] = []
    const records = parseTipnr(topicSources.tipnr, issues)
    for (const line of issues) if (!common.report.includes(`topics: ${line}`)) common.report.push(`topics: ${line}`)
    topics = { xtopics: xtopicsView(core.seg) as XtopicsCore, records }
  }
  // Without --ta-config the related of the tA articles comes from the links alone (a log line says so).
  const taKeys = (await source.resources(lang)).filter((ref) => ref.kind === 'Translation Academy').map((ref) => ref.key)
  const taConfigs = o.taConfig === undefined ? undefined : readTaConfigs(o.taConfig, taKeys)
  const taTocs = o.taConfig === undefined ? undefined : readTaTocs(o.taConfig, taKeys)
  for (const [key, manuals] of taConfigs ?? []) {
    if (manuals.size > 0 && !(taTocs?.get(key) && taTocs.get(key)!.size > 0)) io.log(`no toc.yaml for ${key} (none in the release, or a folder fetched before toc.yaml was read)`)
  }
  if (taConfigs === undefined && taKeys.length > 0) io.log('no --ta-config: the related of the tA articles comes from the links of the texts alone')
  const roleHints = o.roleHints === undefined ? undefined : await readRoleHints(o.roleHints)
  if (roleHints !== undefined) io.log(`role hints: ${roleHints.hints.size} articles from ${roleHints.segments} art segments of ${o.roleHints}`)
  const built = await buildLanguage({
    source,
    lang,
    books,
    registry,
    bookNames,
    about,
    requires: [['common', common.revision, common.catalogId]],
    topics,
    aligned: o.aligned,
    taConfigs,
    taTocs,
    roleHints: roleHints?.hints,
    roleHintSegs: roleHints?.segs,
  })

  // Signing changes the header of a catalog and nothing its id is the hash of: the ids, and so every `requires` and every segment, stay.
  let key: SigningKey | undefined
  if (o.signKey !== undefined) {
    key = await readSigningKey(o.signKey)
    const sign = async (catalog: BuiltSegment): Promise<BuiltSegment> => ({ ...catalog, bytes: await signCatalog(catalog.bytes, key!.pkcs8) })
    if (common.catalog !== undefined) common.catalog = await sign(common.catalog)
    built.catalog = await sign(built.catalog)
  }

  const articles = Object.keys(built.registry).length
  const registryLine =
    registryFile === undefined
      ? 'registry: none (--registry not given): the ids of the sections are not read from a previous build and are not kept for the next'
      : `registry: ${registryFile}: ${Object.keys(registry).length} articles read, ${articles} written`
  const report = [
    'language-pack-v3 build report',
    `built: ${o.built}`,
    `builder: ${BUILDER}`,
    `language: ${lang}`,
    `books: ${[...books].sort((a, b) => bookNumber(a) - bookNumber(b)).join(',')}`,
    common.published ? `common: published, revision ${common.revision}, catalog ${common.catalogId.slice(0, 12)}` : `common: ${countsOf(common.segments)}, catalog ${common.catalogId.slice(0, 12)}`,
    `${lang}: ${countsOf(built.segments)}, catalog ${built.catalog.id.slice(0, 12)}`,
    registryLine,
    `signed: ${key === undefined ? 'no' : `key ${key.keyId}`}`,
    `aligned: ${o.aligned ? 'on' : 'off'}, ${built.segments.filter(({ seg }) => seg.h.class === 'aligned').length} units`,
    '',
    ...common.report,
    ...built.report,
  ]

  // Every run starts from an empty segments folder: what an earlier build left there is not part of this one
  await rm(join(o.out, 'segments'), { recursive: true, force: true })
  await mkdir(join(o.out, 'segments'), { recursive: true })
  const all = [...common.segments, ...(common.catalog === undefined ? [] : [common.catalog]), ...built.segments, built.catalog]
  for (const segment of [...common.segments, ...built.segments]) await writeFile(join(o.out, 'segments', `${segment.id}.seg`), segment.bytes)
  if (common.catalog !== undefined) await writeFile(join(o.out, 'catalog-common.seg'), common.catalog.bytes)
  else await rm(join(o.out, 'catalog-common.seg'), { force: true })
  await writeFile(join(o.out, `catalog-${lang}.seg`), built.catalog.bytes)
  await writeFile(join(o.out, 'report.txt'), `${report.join('\n')}\n`)
  if (registryFile !== undefined) {
    await mkdir(o.registry!, { recursive: true })
    await writeFile(registryFile, registryText(built.registry))
  }

  for (const segment of all) io.log(lineOf(segment))
  for (const line of [mapSizes('xmap', common.segments, 'xmap'), mapSizes(`map ${lang}`, built.segments, 'map')]) if (line !== undefined) io.log(line)
  // What a device downloads for each unit (the compressed segments): one line each and units.json, by unit id.
  const units: Record<string, number> = {}
  for (const catalog of [common.catalog, built.catalog]) {
    if (catalog !== undefined) Object.assign(units, unitBytes(catalogView(catalog.seg)))
  }
  const unitIds = Object.keys(units).sort((a, b) => (a < b ? -1 : a > b ? 1 : 0))
  await writeFile(join(o.out, 'units.json'), `${JSON.stringify(Object.fromEntries(unitIds.map((id) => [id, units[id]])), null, 2)}\n`)
  for (const id of unitIds) io.log(`unit ${id} ${(units[id] / 1024).toFixed(1)} KB`)
  const bytes = all.reduce((sum, segment) => sum + segment.bytes.length, 0)
  io.log(`${all.length} segments, ${(bytes / 1024).toFixed(1)} KB, written in ${o.out} (${built.report.length} lines in report.txt)`)
}

/** The command: its exit code (0, 1 for a usage error, 2 for a build error). `io` takes what it prints. */
export async function main(argv: string[], io: Io = { log: console.log, error: console.error }, sources: TopicSource[] = pins(), deps?: ObsImagesDeps): Promise<number> {
  let options: Options
  try {
    options = optionsFromArgs(argv, sources)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    io.error(error.message)
    io.error(USAGE)
    return 1
  }
  try {
    await build(options, io, deps)
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
