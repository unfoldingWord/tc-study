/**
 * Build the segments of language pack format 3 from format 2.0 parts and save them in a folder.
 *
 *   bun packages/resource-pipeline/cli/build-v3.ts --list <lang list.json> --originals <originals list.json> --parts <dir> --out <dir>
 *     [--books tit,rut] [--registry <dir>] [--revision <n>] [--built <RFC 3339>] [--publisher <name>]
 *     [--map-lang <lang>] [--map-list <list.json>] [--book-names <file>] [--topics <dir>]
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
 * Prints one line per segment: class, book or group, size in KB (1 KB = 1024 bytes) and the first 12 digits of the id. Exit code 0
 * when the folder is written, 1 for a usage error (the usage is printed), 2 for a build error (the message is printed).
 */

import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import {
  BOOKS,
  bookNumber,
  type BuiltSegment,
  buildCommon,
  buildLanguage,
  BUILDER,
  ORIGINALS,
  parseTipnr,
  type SectionRegistry,
  type TipnrRecord,
  xtopicsView,
  type XtopicsCore,
} from '@bt-synergy/language-pack-v3'
import { partsSource } from '@bt-synergy/language-pack-v3/node/partsSource'

export class UsageError extends Error {}

export const USAGE =
  'Usage: build-v3 --list <lang list.json> --originals <originals list.json> --parts <dir> --out <dir> ' +
  '[--books tit,rut] [--registry <dir>] [--revision <n>] [--built <RFC 3339>] [--publisher <name>]\n' +
  '  --books      the books to build (default: those the language and the originals have).\n' +
  '               The common map counts only the books built: a publisher needs all 66 originals\n' +
  '  --registry   the folder of registry-<lang>.json, read if it exists and updated; without it, section ids start from scratch\n' +
  '  --revision   the revision of both catalogs (default 1)\n' +
  '  --built      the time the catalogs say they were built (default: now). Pass a fixed value for a reproducible build:\n' +
  '               the same inputs and the same --built give the same bytes\n' +
  '  --publisher  the publisher of both catalogs (default unfoldingWord)\n' +
  '  --map-lang   the language whose helps make the common map (default en; with no list for it, no common map)\n' +
  '  --map-list   the parts list of the map language, when it is not the language of --list (default: none)\n' +
  '  --book-names a JSON file {book: [name, short, abbreviation]} for the book names of the language map\n' +
  '  --topics     the folder of the topic sources (tipnr/, theographic/, en_obs/): builds the xtopics and the topics of the language'

type Io = { log: (line: string) => void; error: (line: string) => void }

type Options = {
  list: string
  originals: string
  parts: string
  out: string
  books?: string[]
  registry?: string
  revision: number
  built: string
  publisher: string
  mapLang: string
  mapList?: string
  bookNames?: string
  topics?: string
}

const VALUE_FLAGS = ['list', 'originals', 'parts', 'out', 'books', 'registry', 'revision', 'built', 'publisher', 'map-lang', 'map-list', 'book-names', 'topics']

/** RFC 3339 date and time, as the catalog writes `about.built`. */
const RFC3339 = /^\d{4}-\d{2}-\d{2}[Tt]\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:[Zz]|[+-]\d{2}:\d{2})$/

function flagsOf(argv: string[]): Map<string, string> {
  const flags = new Map<string, string>()
  for (let i = 0; i < argv.length; i += 2) {
    const name = argv[i]
    if (!name.startsWith('--') || !VALUE_FLAGS.includes(name.slice(2))) throw new UsageError(`Unknown argument ${JSON.stringify(name)}`)
    const value = argv[i + 1]
    if (value === undefined || value.startsWith('--')) throw new UsageError(`The value of ${name} is missing`)
    if (flags.has(name.slice(2))) throw new UsageError(`${name} is given twice`)
    flags.set(name.slice(2), value)
  }
  return flags
}

export function optionsFromArgs(argv: string[]): Options {
  const flags = flagsOf(argv)
  const need = (name: string): string => {
    const value = flags.get(name)
    if (value === undefined) throw new UsageError(`--${name} is missing`)
    return value
  }
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

  const revisionText = flags.get('revision') ?? '1'
  const revision = Number(revisionText)
  if (!/^[0-9]+$/.test(revisionText) || !Number.isSafeInteger(revision)) throw new UsageError(`--revision ${JSON.stringify(revisionText)} is not a whole number`)

  const built = flags.get('built') ?? new Date().toISOString().replace(/\.\d+Z$/, 'Z')
  if (!RFC3339.test(built)) throw new UsageError(`--built ${JSON.stringify(built)} is not an RFC 3339 date and time (2026-11-01T10:00:00Z)`)

  const publisher = flags.get('publisher') ?? 'unfoldingWord'
  if (publisher === '') throw new UsageError('--publisher is empty')

  const mapLang = flags.get('map-lang') ?? 'en'
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(mapLang)) throw new UsageError(`--map-lang ${JSON.stringify(mapLang)} is not a language code`)
  const bookNames = flags.get('book-names')
  const mapList = flags.get('map-list')
  const topics = flags.get('topics')

  for (const [name, path] of [['list', list], ['originals', originals], ...(bookNames === undefined ? [] : [['book-names', bookNames]]), ...(mapList === undefined ? [] : [['map-list', mapList]])]) {
    if (!existsSync(path) || !statSync(path).isFile()) throw new UsageError(`--${name}: ${path} is not a file`)
  }
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
  }

  return { list, originals, parts, out, books, registry: flags.get('registry'), revision, built, publisher, mapLang, mapList, bookNames, topics }
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

async function build(o: Options, io: Io): Promise<void> {
  const lang = await languageOf(o.list)
  if (!/^[A-Za-z0-9][A-Za-z0-9-]*$/.test(lang)) throw new Error(`${o.list}: the language ${JSON.stringify(lang)} cannot name a file`)
  const originalsLanguage = await languageOf(o.originals)
  if (originalsLanguage !== ORIGINALS) throw new Error(`${o.originals} is not the list of the originals: its language is ${JSON.stringify(originalsLanguage)}`)

  const source = await partsSource({ list: o.list, partsDir: o.parts, originals: o.originals, extra: o.mapList === undefined ? [] : [o.mapList] })
  const about = { format: '3.0' as const, publisher: o.publisher, origin: 'published' as const, revision: o.revision, built: o.built, builder: BUILDER }

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
  if (mapLang === undefined) io.log(`no list for the map language ${o.mapLang} (--map-list): no common map is built`)
  const topicSources = o.topics === undefined ? undefined : topicTexts(o.topics)
  const common = await buildCommon({ source, books, about, mapLang, topics: topicSources })
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
    const core = common.segments.find(({ seg }) => seg.h.class === 'xtopics' && seg.h.part === 'core')
    if (core === undefined) throw new Error('--topics: the common part has no xtopics core (no originals were built?)')
    // The builder already reported what it worked around in the TIPNR text (`common.report`); only a line it did not report is added
    const issues: string[] = []
    const records = parseTipnr(topicSources.tipnr, issues)
    for (const line of issues) if (!common.report.includes(`topics: ${line}`)) common.report.push(`topics: ${line}`)
    topics = { xtopics: xtopicsView(core.seg) as XtopicsCore, records }
  }
  const built = await buildLanguage({
    source,
    lang,
    books,
    registry,
    bookNames,
    about,
    requires: [['common', o.revision, common.catalog.id]],
    topics,
  })

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
    `common: ${countsOf(common.segments)}, catalog ${common.catalog.id.slice(0, 12)}`,
    `${lang}: ${countsOf(built.segments)}, catalog ${built.catalog.id.slice(0, 12)}`,
    registryLine,
    '',
    ...common.report,
    ...built.report,
  ]

  await mkdir(join(o.out, 'segments'), { recursive: true })
  const all = [...common.segments, common.catalog, ...built.segments, built.catalog]
  for (const segment of [...common.segments, ...built.segments]) await writeFile(join(o.out, 'segments', `${segment.id}.seg`), segment.bytes)
  await writeFile(join(o.out, 'catalog-common.seg'), common.catalog.bytes)
  await writeFile(join(o.out, `catalog-${lang}.seg`), built.catalog.bytes)
  await writeFile(join(o.out, 'report.txt'), `${report.join('\n')}\n`)
  if (registryFile !== undefined) {
    await mkdir(o.registry!, { recursive: true })
    await writeFile(registryFile, registryText(built.registry))
  }

  for (const segment of all) io.log(lineOf(segment))
  for (const line of [mapSizes('xmap', common.segments, 'xmap'), mapSizes(`map ${lang}`, built.segments, 'map')]) if (line !== undefined) io.log(line)
  const bytes = all.reduce((sum, segment) => sum + segment.bytes.length, 0)
  io.log(`${all.length} segments, ${(bytes / 1024).toFixed(1)} KB, written in ${o.out} (${built.report.length} lines in report.txt)`)
}

/** The command: its exit code (0, 1 for a usage error, 2 for a build error). `io` takes what it prints. */
export async function main(argv: string[], io: Io = { log: console.log, error: console.error }): Promise<number> {
  let options: Options
  try {
    options = optionsFromArgs(argv)
  } catch (error) {
    if (!(error instanceof UsageError)) throw error
    io.error(error.message)
    io.error(USAGE)
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
