/**
 * Measure an Aquifer patch catalog (`build-patch-v3.ts` output) against Door43 production, for the Hindi pilot
 * (`aquifer-fase0.md` section 5): the gap cells filled, the Translation Academy links, 20 notes for a person to check, and the passages
 * that still answer nothing.
 *
 *   bun packages/resource-pipeline/cli/aquifer-measure.ts --base-books <json> --patch <dir> --common <dir> --out-md <file.md>
 *     [--sample 20] [--seed 1] [--refs <file|"tit 1:1,rut 2:3">] [--en-ta-titles <json>] [--base <dir>] [--lang hi]
 *
 * - `--base-books`: `{ "tn": [books], "tq": [books] }` (`door43-books.ts`), the "before". `--patch`: the folder `build-patch-v3` wrote.
 *   `--common`: the published common catalog folder (the verses of each patched book come from its `orig:<book>`).
 * - `--base`: optional, a built Door43 `--lang` format 3 folder (`catalog-<lang>.seg` and `segments/`). With it the "after" answers come from the
 *   client's `patchedReader(base, [patch])`; without it from the patch reader alone, and a reference in a book Door43 has the table of (per
 *   `--base-books`) counts as answered, because Door43 always wins.
 * - Gap cells: 66 books x {tN, tQ}, each `door43`, `aquifer` or empty, before (Door43 only) and after (the patch fills what Door43 lacks).
 * - TA links: notes with a `concept`, inline `[[ta:...]]` links, and the links left as text (`report.txt` of the patch: "ta links left as text: N inline links").
 * - Empty answers: `--refs` (a file with one reference per line or a JSON list, or a comma list), or 30 spread evenly over the patched books'
 *   verses. A reference is empty when it has no notes and no questions. "Before" is the books of `--base-books`; with `--base` the base reader's own
 *   answer is reported too.
 * - The sample of notes is deterministic by `--seed`.
 *
 * Writes the markdown report to `--out-md`; the last line on stdout is one JSON summary line. Exit 0 when written, 1 for a usage error, 2 for a
 * read error. No network.
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import {
  type BookModel,
  BOOKS,
  bookView,
  catalogView,
  type EnTaTitles,
  type HelpRow,
  hex,
  KNOWN,
  origView,
  readSegment,
} from '@bt-synergy/language-pack-v3'
// The client has no symlink in this package's node_modules (it is not a dependency): reached by path, as `src/language/*` reaches `cli/`.
import { openFromSegments, patchedReader, type PackReader } from '../../language-pack-client/src/index'
import { verifyCatalogFile } from '../../language-pack-client/src/verify'

export class UsageError extends Error {}

export const USAGE =
  'Usage: aquifer-measure --base-books <json> --patch <dir> --common <dir> --out-md <file.md>\n' +
  '  [--sample 20] [--seed <n>] [--refs <file|"tit 1:1,rut 2:3">] [--en-ta-titles <json>] [--base <dir>] [--lang hi]'

type Io = { log: (line: string) => void; error: (line: string) => void }
const VALUE_FLAGS = ['base-books', 'patch', 'common', 'out-md', 'sample', 'seed', 'refs', 'en-ta-titles', 'base', 'lang']

export type Options = {
  baseBooks: string
  patch: string
  common: string
  outMd: string
  sample: number
  seed: number
  refs?: string
  enTaTitles?: string
  base?: string
  lang: string
}

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
  const whole = (name: string, fallback: number): number => {
    const text = flags.get(name)
    if (text === undefined) return fallback
    if (!/^[0-9]+$/.test(text) || !Number.isSafeInteger(Number(text))) throw new UsageError(`--${name} ${JSON.stringify(text)} is not a whole number`)
    return Number(text)
  }
  const file = (name: string, value: string): void => {
    if (!existsSync(value) || !statSync(value).isFile()) throw new UsageError(`--${name}: ${value} is not a file`)
  }
  const dir = (name: string, value: string): void => {
    if (!existsSync(value) || !statSync(value).isDirectory()) throw new UsageError(`--${name}: ${value} is not a folder`)
  }
  const baseBooks = need('base-books')
  file('base-books', baseBooks)
  const patch = need('patch')
  dir('patch', patch)
  const common = need('common')
  file('common', join(common, 'catalog-common.seg'))
  const enTaTitles = flags.get('en-ta-titles')
  if (enTaTitles !== undefined) file('en-ta-titles', enTaTitles)
  const base = flags.get('base')
  if (base !== undefined) dir('base', base)
  const lang = flags.get('lang') ?? 'hi'
  if (!/^[a-z]{2,3}$/.test(lang)) throw new UsageError(`--lang ${JSON.stringify(lang)} is not a language code of 2 or 3 lowercase letters`)
  return { baseBooks, patch, common, outMd: need('out-md'), sample: whole('sample', 20), seed: whole('seed', 1), refs: flags.get('refs'), enTaTitles, base, lang }
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Reading folders

type Opened = { name: string; reader: PackReader; books: Map<string, BookModel> }

const catalogFile = (dir: string, pick: (name: string) => boolean): string => {
  const names = readdirSync(dir).filter((n) => /^catalog-.+\.seg$/.test(n) && pick(n))
  if (names.length !== 1) throw new Error(`${dir} has ${names.length} matching catalog-*.seg files, and one is expected`)
  return join(dir, names[0])
}

/** A built folder (`catalog-*.seg` and `segments/`) as a reader, and its `book:` segments as models. */
async function openDir(dir: string, pick: (name: string) => boolean): Promise<Opened> {
  const file = catalogFile(dir, pick)
  const catalog = await verifyCatalogFile(new Uint8Array(await readFile(file)), {}, { from: 'store' })
  const model = catalog.catalog
  const name = catalog.name
  const get = async (id: string): Promise<Uint8Array | undefined> => {
    const path = join(dir, 'segments', `${id}.seg`)
    return existsSync(path) ? new Uint8Array(await readFile(path)) : undefined
  }
  const books = new Map<string, BookModel>()
  for (const unit of model.units) {
    if (!unit.id.startsWith('book:')) continue
    const entry = model.segments[unit.segments[0]]
    const bytes = await get(hex(entry.id))
    if (bytes === undefined) throw new Error(`${dir}: the segment of ${unit.id} is not there`)
    const { seg } = await readSegment(bytes, { known: KNOWN.book, expectedId: hex(entry.id), expectedClass: 'book' })
    books.set(unit.id.slice('book:'.length), bookView(seg))
  }
  return { name, reader: openFromSegments({ lang: name, catalogs: [catalog], get }), books }
}

/** The verses `chapter:verse` of each `orig:<book>` of the common catalog, for the books asked. A book the catalog lacks is absent. */
async function commonVerses(dir: string, books: string[]): Promise<Map<string, string[]>> {
  const { seg } = await readSegment(new Uint8Array(await readFile(join(dir, 'catalog-common.seg'))), { known: KNOWN.catalog, expectedClass: 'catalog' })
  const model = catalogView(seg)
  const out = new Map<string, string[]>()
  for (const book of books) {
    const unit = model.units.find((u) => u.id === `orig:${book}`)
    if (unit === undefined) continue
    const path = join(dir, 'segments', `${hex(model.segments[unit.segments[0]].id)}.seg`)
    if (!existsSync(path)) continue
    const orig = origView((await readSegment(new Uint8Array(await readFile(path)), { known: KNOWN.orig, expectedClass: 'orig' })).seg)
    const verses: string[] = []
    let chapter = ''
    for (const [, kind, arg] of orig.events) {
      if (kind === 'chapter') chapter = arg
      else if (kind === 'verse' && chapter !== '' && /^\d+$/.test(arg)) verses.push(`${chapter}:${arg}`)
    }
    out.set(book, verses)
  }
  return out
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Measures

export type Cell = 'door43' | 'aquifer' | ''
export type Gap = { book: string; tn: Cell; tq: Cell }
type Totals = { tn: { door43: number; aquifer: number; empty: number }; tq: { door43: number; aquifer: number; empty: number } }

/** The 66 x 2 cells before (Door43 only) and after (the patch fills what Door43 lacks; Door43 wins where both have it). */
export function gapCells(base: { tn: string[]; tq: string[] }, patch: { tn: Set<string>; tq: Set<string> }): { before: Gap[]; after: Gap[]; totals: { before: Totals; after: Totals } } {
  const cell = (kind: 'tn' | 'tq', book: string, withPatch: boolean): Cell => (base[kind].includes(book) ? 'door43' : withPatch && patch[kind].has(book) ? 'aquifer' : '')
  const rows = (withPatch: boolean): Gap[] => BOOKS.map((book) => ({ book, tn: cell('tn', book, withPatch), tq: cell('tq', book, withPatch) }))
  const total = (gaps: Gap[]): Totals => {
    const t: Totals = { tn: { door43: 0, aquifer: 0, empty: 0 }, tq: { door43: 0, aquifer: 0, empty: 0 } }
    for (const g of gaps) for (const kind of ['tn', 'tq'] as const) t[kind][g[kind] === '' ? 'empty' : g[kind]]++
    return t
  }
  const [before, after] = [rows(false), rows(true)]
  return { before, after, totals: { before: total(before), after: total(after) } }
}

const TA_LINK = /\[\[ta:[^\]]+\]\]/g
const noteText = (row: HelpRow): string => (typeof row.cols.note === 'string' ? row.cols.note : '')

export type TaLinks = {
  notes: number
  withConcept: number
  withInlineLink: number
  inlineLinks: number
  /** Links to Manual articles left as plain text, from `report.txt`; `null` when the report does not say. */
  leftAsText: number | null
  /** Associated Manual articles with no `ta:` id, so no `concept` for the note; `null` when the report does not say. */
  conceptArticlesWithoutId: number | null
  /** `inlineLinks / (inlineLinks + leftAsText)`; `null` when `leftAsText` is. */
  linkHitRate: number | null
  conceptRate: number
}

export function taLinks(rows: HelpRow[], report: string | undefined): TaLinks {
  let withConcept = 0
  let withInlineLink = 0
  let inlineLinks = 0
  for (const row of rows) {
    if (row.concept !== undefined && row.concept !== '') withConcept++
    const n = noteText(row).match(TA_LINK)?.length ?? 0
    if (n > 0) withInlineLink++
    inlineLinks += n
  }
  // `build-patch-v3` writes "ta links left as text: N inline links; M associated concept articles with no ta: id".
  const m = report === undefined ? null : /^ta links left as text: (\d+) inline links(?:; (\d+) associated concept articles)?/m.exec(report)
  const leftAsText = m === null ? null : Number(m[1])
  const conceptArticlesWithoutId = m === null || m[2] === undefined ? null : Number(m[2])
  const rate = (a: number, b: number): number => (b === 0 ? 0 : a / b)
  return {
    notes: rows.length,
    withConcept,
    withInlineLink,
    inlineLinks,
    leftAsText,
    conceptArticlesWithoutId,
    linkHitRate: leftAsText === null ? null : rate(inlineLinks, inlineLinks + leftAsText),
    conceptRate: rate(withConcept, rows.length),
  }
}

/** A seeded generator (mulberry32): the same seed gives the same sample on any machine. */
function random(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6d2b79f5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

export type SampleNote = { book: string; row: HelpRow; taIds: string[] }

/** `n` notes drawn by `seed`, in the order of the canon and the table. */
export function sampleNotes(books: Map<string, BookModel>, n: number, seed: number): SampleNote[] {
  const all: SampleNote[] = []
  for (const book of BOOKS) for (const row of books.get(book)?.notes?.rows ?? []) all.push({ book, row, taIds: [...new Set((noteText(row).match(TA_LINK) ?? []).map((l) => l.slice(2, -2)))] })
  const rand = random(seed)
  const order = all.map((_, i) => i)
  for (let i = order.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1))
    ;[order[i], order[j]] = [order[j], order[i]]
  }
  return order
    .slice(0, n)
    .sort((a, b) => a - b)
    .map((i) => all[i])
}

/** `ta:` id to the English title(s) of that article, from what `fetch-en-ta-titles.ts` wrote. */
export function invertTitles(titles: EnTaTitles): Map<string, string[]> {
  const out = new Map<string, string[]>()
  const add = (id: string, title: string): void => void out.set(id, [...(out.get(id) ?? []), title])
  for (const [title, id] of Object.entries(titles.titles ?? {})) add(id, title)
  for (const [title, ids] of Object.entries(titles.ambiguous ?? {})) for (const id of ids) add(id, title)
  return out
}

/** The first 30 (or `n`) references spread evenly over the books, an even share each, and evenly inside a book. */
export function spreadRefs(verses: Map<string, string[]>, n = 30): string[] {
  const books = [...verses.keys()].filter((b) => verses.get(b)!.length > 0).sort((a, b) => BOOKS.indexOf(a) - BOOKS.indexOf(b))
  const out: string[] = []
  books.forEach((book, i) => {
    const list = verses.get(book)!
    const share = Math.floor(n / books.length) + (i < n % books.length ? 1 : 0)
    const count = Math.min(share, list.length)
    for (let k = 0; k < count; k++) out.push(`${book} ${list[Math.floor(((k + 0.5) * list.length) / count)]}`)
  })
  return out
}

export type EmptyAnswers = {
  refs: string[]
  /** Before, by the books of `--base-books`: no notes and no questions because Door43 has neither table of the book. */
  emptyBefore: number
  /** The base reader's own answer, when `--base` is given. */
  emptyBeforeMeasured: number | null
  emptyAfter: number
  stillEmpty: string[]
}

const count = (a: { data: { notes: unknown[]; questions: unknown[] } | null }): number => (a.data === null ? 0 : a.data.notes.length + a.data.questions.length)

export async function emptyAnswers(o: { refs: string[]; base: { tn: string[]; tq: string[] }; patch: PackReader; baseReader?: PackReader }): Promise<EmptyAnswers> {
  const merged = o.baseReader === undefined ? undefined : patchedReader(o.baseReader, [o.patch])
  let emptyBefore = 0
  let emptyBeforeMeasured = 0
  let emptyAfter = 0
  const stillEmpty: string[] = []
  for (const ref of o.refs) {
    const book = ref.trim().toLowerCase().split(/\s+/)[0]
    const door43 = o.base.tn.includes(book) || o.base.tq.includes(book)
    if (!door43) emptyBefore++
    // After: the merged answer with a base; otherwise Door43's books count as answered (it always wins) and the rest is the patch's answer.
    const answered = merged !== undefined ? count(await merged.passage(ref)) > 0 : door43 || count(await o.patch.passage(ref)) > 0
    if (!answered) {
      emptyAfter++
      stillEmpty.push(ref)
    }
    if (o.baseReader !== undefined && count(await o.baseReader.passage(ref)) === 0) emptyBeforeMeasured++
  }
  return { refs: o.refs, emptyBefore, emptyBeforeMeasured: o.baseReader === undefined ? null : emptyBeforeMeasured, emptyAfter, stillEmpty }
}

function readRefs(spec: string): string[] {
  if (existsSync(spec) && statSync(spec).isFile()) {
    const text = readFileSync(spec, 'utf8').trim()
    const list: unknown = text.startsWith('[') ? JSON.parse(text) : text.split(/\r?\n/)
    if (!Array.isArray(list)) throw new Error(`${spec} is not a list of references`)
    return list.map((r) => String(r).trim()).filter((r) => r !== '')
  }
  return spec.split(',').map((r) => r.trim()).filter((r) => r !== '')
}

// ---------------------------------------------------------------------------------------------------------------------------------
// Report

const pct = (x: number | null): string => (x === null ? 'unknown' : `${(x * 100).toFixed(1)}%`)
const quoteOf = (row: HelpRow): string => (typeof row.cols.quote === 'string' && row.cols.quote !== '' ? row.cols.quote : '(none)')

export async function measure(o: Options): Promise<{ markdown: string; summary: Record<string, unknown> }> {
  const base = JSON.parse(readFileSync(o.baseBooks, 'utf8')) as { tn?: unknown; tq?: unknown }
  for (const kind of ['tn', 'tq'] as const) if (!Array.isArray(base[kind]) || !(base[kind] as unknown[]).every((b) => typeof b === 'string')) throw new Error(`${o.baseBooks}: "${kind}" is not a list of book codes`)
  const baseBooks = { tn: base.tn as string[], tq: base.tq as string[] }
  const patch = await openDir(o.patch, (n) => /-x-/.test(n))
  const baseOpened = o.base === undefined ? undefined : await openDir(o.base, (n) => n === `catalog-${o.lang}.seg`)
  const reportPath = join(o.patch, 'report.txt')
  const report = existsSync(reportPath) ? readFileSync(reportPath, 'utf8') : undefined

  const patchBooks = { tn: new Set<string>(), tq: new Set<string>() }
  for (const [book, model] of patch.books) {
    if (model.notes !== undefined) patchBooks.tn.add(book)
    if (model.questions !== undefined) patchBooks.tq.add(book)
  }
  const gaps = gapCells(baseBooks, patchBooks)
  const noteRows = BOOKS.flatMap((b) => patch.books.get(b)?.notes?.rows ?? [])
  const links = taLinks(noteRows, report)
  const sample = sampleNotes(patch.books, o.sample, o.seed)
  const titles = o.enTaTitles === undefined ? undefined : invertTitles(JSON.parse(readFileSync(o.enTaTitles, 'utf8')) as EnTaTitles)

  const patched = [...patch.books.keys()].sort((a, b) => BOOKS.indexOf(a) - BOOKS.indexOf(b))
  let refs: string[]
  if (o.refs !== undefined) refs = readRefs(o.refs)
  else {
    const verses = await commonVerses(o.common, patched)
    // A book the common catalog lacks falls back to the references of its rows that are one verse of one chapter.
    for (const book of patched) {
      if (verses.has(book)) continue
      const rows = [...(patch.books.get(book)?.notes?.rows ?? []), ...(patch.books.get(book)?.questions?.rows ?? [])]
      verses.set(book, [...new Set(rows.map((r) => r.ref).filter((r) => /^\d+:\d+$/.test(r)))])
    }
    refs = spreadRefs(verses)
  }
  const empty = await emptyAnswers({ refs, base: baseBooks, patch: patch.reader, baseReader: baseOpened?.reader })

  const L: string[] = []
  L.push(`# Aquifer patch ${patch.name}: measures`, '')
  L.push('## Gap cells (66 books x tN, tQ)', '')
  const t = gaps.totals
  L.push('| | tN door43 | tN aquifer | tN empty | tQ door43 | tQ aquifer | tQ empty |', '|---|---|---|---|---|---|---|')
  for (const [name, x] of [['before', t.before], ['after', t.after]] as const) {
    L.push(`| ${name} | ${x.tn.door43} | ${x.tn.aquifer} | ${x.tn.empty} | ${x.tq.door43} | ${x.tq.aquifer} | ${x.tq.empty} |`)
  }
  L.push('', '| book | tN before | tN after | tQ before | tQ after |', '|---|---|---|---|---|')
  gaps.before.forEach((b, i) => {
    const a = gaps.after[i]
    L.push(`| ${b.book} | ${b.tn || '-'} | ${a.tn || '-'} | ${b.tq || '-'} | ${a.tq || '-'} |`)
  })
  L.push('', '## Translation Academy links', '')
  L.push(`- Notes in the patch: ${links.notes}`)
  L.push(`- With a resolved \`concept\`: ${links.withConcept} (${pct(links.conceptRate)})`)
  L.push(`- With at least one inline \`[[ta:...]]\` link: ${links.withInlineLink}`)
  L.push(`- Inline \`[[ta:...]]\` links: ${links.inlineLinks}`)
  L.push(`- Links left as text (report.txt): ${links.leftAsText ?? 'unknown (no report.txt, or no such line)'}`)
  L.push(`- Associated Manual articles with no ta: id (no concept): ${links.conceptArticlesWithoutId ?? 'unknown'}`)
  L.push(`- Link hit rate: ${pct(links.linkHitRate)}`)
  L.push('', `## Empty answers (${refs.length} references)`, '')
  L.push(`- Before, by the Door43 books (no tN and no tQ of the book): ${empty.emptyBefore}`)
  if (empty.emptyBeforeMeasured !== null) L.push(`- Before, measured on the base reader: ${empty.emptyBeforeMeasured}`)
  L.push(`- After (${baseOpened === undefined ? 'patch reader alone; Door43 books count as answered' : 'base and patch merged'}): ${empty.emptyAfter}`)
  if (empty.stillEmpty.length > 0) L.push(`- Still empty: ${empty.stillEmpty.join(', ')}`)
  L.push('', `## ${sample.length} notes to check by hand (seed ${o.seed})`, '')
  L.push('Check that each concept and each link names the article the note is about.', '')
  sample.forEach((s, i) => {
    L.push(`### ${i + 1}. ${s.book} ${s.row.ref} (\`${s.row.id}\`)`, '')
    L.push(`- Quote: ${quoteOf(s.row)}`)
    L.push(`- Concept: ${s.row.concept ?? '(none)'}${s.row.concept !== undefined && titles !== undefined ? ` (${(titles.get(s.row.concept) ?? ['no English title']).join(' / ')})` : ''}`)
    L.push(`- ta links: ${s.taIds.length === 0 ? '(none)' : s.taIds.map((id) => `\`${id}\`${titles === undefined ? '' : ` = ${(titles.get(id) ?? ['no English title']).join(' / ')}`}`).join('; ')}`)
    const text = noteText(s.row)
    L.push(`- Note: ${[...text].slice(0, 300).join('').replace(/\s+/g, ' ')}${[...text].length > 300 ? '...' : ''}`, '')
  })

  const summary = {
    patch: patch.name,
    books: { tn: [...patchBooks.tn].length, tq: [...patchBooks.tq].length },
    gap: { before: t.before, after: t.after },
    ta: links,
    empty: { refs: refs.length, before: empty.emptyBefore, beforeMeasured: empty.emptyBeforeMeasured, after: empty.emptyAfter },
    sample: sample.length,
    seed: o.seed,
  }
  return { markdown: `${L.join('\n')}\n`, summary }
}

/** The command: its exit code (0, 1 for a usage error, 2 for a read error). */
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
    const { markdown, summary } = await measure(options)
    await mkdir(dirname(options.outMd), { recursive: true })
    await writeFile(options.outMd, markdown)
    io.log(JSON.stringify(summary))
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
