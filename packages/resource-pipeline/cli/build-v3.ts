/**
 * Build the segments of language pack format 3 from format 2.0 parts and save them in a folder.
 *
 *   bun packages/resource-pipeline/cli/build-v3.ts --list <lang list.json> --originals <originals list.json> --parts <dir> --out <dir>
 *     [--books tit,rut] [--registry <dir>] [--revision <n>] [--built <RFC 3339>] [--publisher <name>]
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
 * Prints one line per segment: class, book or group, size in KB (1 KB = 1024 bytes) and the first 12 digits of the id. Exit code 0
 * when the folder is written, 1 for a usage error (the usage is printed), 2 for a build error (the message is printed).
 */

import { existsSync, statSync } from 'node:fs'
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
  type SectionRegistry,
} from '@bt-synergy/language-pack-v3'
import { partsSource } from '@bt-synergy/language-pack-v3/node/partsSource'

export class UsageError extends Error {}

export const USAGE =
  'Usage: build-v3 --list <lang list.json> --originals <originals list.json> --parts <dir> --out <dir> ' +
  '[--books tit,rut] [--registry <dir>] [--revision <n>] [--built <RFC 3339>] [--publisher <name>]\n' +
  '  --books      the books to build (default: those the language and the originals have)\n' +
  '  --registry   the folder of registry-<lang>.json, read if it exists and updated; without it, section ids start from scratch\n' +
  '  --revision   the revision of both catalogs (default 1)\n' +
  '  --built      the time the catalogs say they were built (default: now). Pass a fixed value for a reproducible build:\n' +
  '               the same inputs and the same --built give the same bytes\n' +
  '  --publisher  the publisher of both catalogs (default unfoldingWord)'

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
}

const VALUE_FLAGS = ['list', 'originals', 'parts', 'out', 'books', 'registry', 'revision', 'built', 'publisher']

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

  for (const [name, path] of [['list', list], ['originals', originals]]) {
    if (!existsSync(path) || !statSync(path).isFile()) throw new UsageError(`--${name}: ${path} is not a file`)
  }
  if (!existsSync(parts) || !statSync(parts).isDirectory()) throw new UsageError(`--parts: ${parts} is not a directory`)

  return { list, originals, parts, out, books, registry: flags.get('registry'), revision, built, publisher }
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

  const source = await partsSource({ list: o.list, partsDir: o.parts, originals: o.originals })
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
  const common = await buildCommon({ source, books, about })
  const built = await buildLanguage({
    source,
    lang,
    books,
    registry,
    about,
    requires: [['common', o.revision, common.catalog.id]],
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
