/**
 * The notes, questions and word links of a book (`spec/cddl/book.cddl`, "Notes, questions and word links"), as format 2.0
 * keeps them in the `tn:`, `tq:` and `twl:` rows, with the quotes of the notes and the links found in the original.
 *
 * - {@link extractHelps} reads one resource (tN, tQ or tWL) from rows into a {@link HelpTable};
 * - {@link extractBook} reads a whole book of a language from a row source into a {@link BookModel}: the bridge texts
 *   (`bookTexts.ts`) and the helps. `book.ts` turns the model into the segment, `read/book.ts` back.
 *
 * Nothing the rows hold is dropped silently: a row whose reference cannot be read is placed at the book introduction, a
 * repeated id is renamed, a quote word the original lacks is listed. Each of these, and each link in a form the format
 * does not rewrite, adds a line to `issues`. No Node module is used.
 */
import { compareCodePoints } from '../codec/columns'
import { isMap } from '../codec/values'
import { conceptOfSupportReference, conceptOfTwLink, formatRef, parseRef, rewriteLinks, unescapeTsv, verseId } from '../ids'
import { type BookModel, type HelpRow, type HelpTable, LONG_TEXT_COLUMNS, type OrigModel } from '../model'
import type { ResourceRef, Row, RowSource } from '../source/rows'
import { extractText } from './bookTexts'
import { OrigIndex } from './orig'

export type HelpsKind = 'notes' | 'questions' | 'links'

/**
 * Where each kind of helps comes from: the Door43 subject of its resource, the prefix of its `sot` keys, the field of the
 * row list, and the column that becomes the concept of the row (notes: SupportReference, links: TWLink).
 */
const SOURCES: Record<HelpsKind, { subject: string; prefix: string; field: string; concept?: { column: string; of: (value: string) => string | null } }> = {
  notes: { subject: 'TSV Translation Notes', prefix: 'tn', field: 'notes', concept: { column: 'supportReference', of: conceptOfSupportReference } },
  questions: { subject: 'TSV Translation Questions', prefix: 'tq', field: 'questions' },
  links: { subject: 'TSV Translation Words Links', prefix: 'twl', field: 'links', concept: { column: 'twLink', of: conceptOfTwLink } },
}
const HELPS_KINDS: readonly HelpsKind[] = ['notes', 'questions', 'links']
const TEXT_SUBJECT = 'Aligned Bible'

const DIGITS = /^[0-9]+$/
const BOOK_FACTOR = 1_000_000
const CHAPTER_FACTOR = 1_000

// Rows

/** The list of rows a `sot` row holds: `content.{field}` (a chapter chunk) or `{field}` (a book row), or `undefined`. */
function listOf(row: Row, field: string): unknown[] | undefined {
  const value = isMap(row.value) ? row.value : {}
  const content = isMap(value.content) ? value.content : {}
  if (Array.isArray(content[field])) return content[field]
  if (Array.isArray(value[field])) return value[field]
  return undefined
}

/**
 * The rows of the source in file order: the chapter chunks `{prefix}:{res}:{book}:{chapter}` in chapter order whatever the
 * order they come in, or, when the resource has no chunk, the list of the book row `{prefix}:{res}:{book}`.
 */
export function sourceRows(rows: Row[], book: string, res: string, kind: HelpsKind): { where: string; item: unknown }[] {
  const { prefix, field } = SOURCES[kind]
  const bookKey = `${prefix}:${res}:${book}`
  const chunks = new Map<number, { where: string; list: unknown[] }>()
  let whole: { where: string; list: unknown[] } | undefined
  for (const row of rows) {
    if (row.layer !== 'sot') continue
    if (row.key === bookKey) {
      whole = { where: row.key, list: listOf(row, field) ?? [] }
      continue
    }
    if (!row.key.startsWith(`${bookKey}:`)) continue
    const chapter = row.key.slice(bookKey.length + 1)
    if (!DIGITS.test(chapter)) continue
    const list = listOf(row, field)
    if (list === undefined) throw new Error(`${row.key}: the row has no list of ${field}`)
    if (chunks.has(Number(chapter))) throw new Error(`${row.key}: the chapter is in the source twice`)
    chunks.set(Number(chapter), { where: row.key, list })
  }
  const parts = chunks.size > 0 ? [...chunks.entries()].sort(([a], [b]) => a - b).map(([, chunk]) => chunk) : whole === undefined ? [] : [whole]
  if (parts.length === 0) throw new Error(`The rows have no ${field} of the book ${book} in ${res}`)
  return parts.flatMap(({ where, list }) => list.map((item) => ({ where, item })))
}

// References

const chapterOf = (id: number): number => Math.floor((id % BOOK_FACTOR) / CHAPTER_FACTOR)

/**
 * The lowest and the highest verse a reference text names, or `null` when it names none. The text is read part by part
 * (a comma ends a part), with spaces and leading zeros left out; a part that is only verses (`3`, `3-5`) is in the chapter
 * of the part before it. A part that cannot be read is skipped.
 */
function looseRange(book: string, text: string): [number, number] | null {
  let low: number | undefined
  let high: number | undefined
  let chapter: number | undefined
  for (const raw of text.split(',')) {
    const part = raw.replace(/\s+/g, '').replace(/\d+/g, (digits) => String(Number(digits)))
    const range =
      parseRef(book, part) ?? (chapter !== undefined && /^[1-9][0-9]{0,2}(?:-[1-9][0-9]{0,2})?$/.test(part) ? parseRef(book, `${chapter}:${part}`) : null)
    if (range === null) continue
    low = low === undefined ? range[0] : Math.min(low, range[0])
    high = high === undefined ? range[1] : Math.max(high, range[1])
    chapter = chapterOf(range[1])
  }
  return low === undefined || high === undefined ? null : [low, high]
}

/** A range for a message: `1:2-4`, or the ids when no text names it. */
function showRange(book: string, from: number, to: number): string {
  try {
    return formatRef(book, from, to)
  } catch (error) {
    if (error instanceof RangeError) return `${from} to ${to}`
    throw error
  }
}

// Links in text

/**
 * What a text keeps after {@link rewriteLinks} that looks like a link of the format but is in a form the format does not
 * rewrite: an `rc://` address, in a link or not, and a link to a relative file. Other links (`https://`) are not asked about.
 */
const UNREWRITTEN = /\[\[rc:\/\/[^\]]*\]\]|\[[^\]]*\]\((?:rc:\/\/|\.{1,2}\/)[^)]*\)|rc:\/\/[^\s\])>"'’]+/g

// Quotes

/** `helps-quote:{res}@…:{book}:{chapter}` rows of the resource: for each row id, the pieces the quote layer found. */
function quoteLayer(rows: Row[], book: string, res: string, issues: string[]): Map<string, unknown[]> {
  const prefix = `helps-quote:${res}@`
  const out = new Map<string, unknown[]>()
  for (const row of rows) {
    if (row.layer !== 'quote' || !row.key.startsWith(prefix)) continue
    const tail = /:([^:]+):(\d+)$/.exec(row.key)
    if (tail === null || tail[1] !== book) continue
    const value = isMap(row.value) ? row.value : {}
    const content = isMap(value.content) ? value.content : {}
    for (const [id, pieces] of Object.entries(content)) {
      if (!Array.isArray(pieces)) throw new Error(`${row.key}: the quote of ${JSON.stringify(id)} is not a list`)
      if (out.has(id)) issues.push(`${res} ${id}: the quote layer has this id in two rows; the last is used`)
      out.set(id, pieces)
    }
  }
  return out
}

/** An ellipsis in the quote: a piece that is not a word although the layer calls it one. */
const ELLIPSIS = /^(?:…|\.\.\.)$/

/** A whole number from 0 to 2^53 - 1, or `fallback`. */
const countOr = (value: unknown, fallback: number): number => (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback)

/**
 * The pieces of a quote as the quote layer holds them, turned into positions. A word is found with
 * `orig.findWithIntro(verse, word, occurrence)`, the verse being the piece's own (`chapter` and `verse`), or the first verse of the
 * row when the piece has none (for verse 1 the words of the chapter's introduction, a psalm's title, come first: the quote layer counts them so). A word that is not found gets `-1` and an entry in `missing`; a piece whose `type` is not
 * `word`, or that is an ellipsis, gets `-1` and an entry in `kinds`.
 */
function quotePieces(
  pieces: unknown[],
  book: string,
  fallbackVerse: number,
  orig: OrigIndex,
  report: (text: string) => void,
): Pick<HelpRow, 'quote' | 'quoteKinds' | 'quoteMissing'> {
  const quote: number[] = []
  const kinds: [number, string][] = []
  const missing: [number, number, string, number][] = []
  pieces.forEach((token, piece) => {
    if (!isMap(token)) throw new Error(`The piece ${piece} of a quote is not an object`)
    const content = typeof token.content === 'string' ? token.content : typeof token.text === 'string' ? token.text : ''
    const type = typeof token.type === 'string' ? token.type : 'word'
    if (type !== 'word' || ELLIPSIS.test(content)) {
      quote.push(-1)
      kinds.push([piece, type !== 'word' ? type : 'ellipsis'])
      return
    }
    let verse = fallbackVerse
    if (typeof token.chapter === 'number' && typeof token.verse === 'number' && Number.isInteger(token.chapter) && Number.isInteger(token.verse)) {
      try {
        verse = verseId(book, token.chapter, token.verse)
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
      }
    }
    const occurrence = typeof token.occurrence === 'number' ? token.occurrence : 1
    let position = orig.findWithIntro(verse, content, occurrence)
    // A ketiv is found by its qere too (the layer keeps both).
    if (position === null && typeof token.qere === 'string' && token.qere !== '') {
      position = orig.findWithIntro(verse, token.qere, typeof token.qereOccurrence === 'number' ? token.qereOccurrence : occurrence)
    }
    if (position !== null) {
      quote.push(position)
      return
    }
    quote.push(-1)
    missing.push([piece, verse, content, countOr(occurrence, 0)])
    report(`the word ${JSON.stringify(content)} (occurrence ${String(occurrence)}) of the quote is not in verse ${verse} of the original`)
  })
  const out: Pick<HelpRow, 'quote' | 'quoteKinds' | 'quoteMissing'> = { quote }
  if (kinds.length > 0) out.quoteKinds = kinds
  if (missing.length > 0) out.quoteMissing = missing
  return out
}

// Extraction

/**
 * A function that gives the id of each row of a table: the published one, or, when it is taken, the published one with `~2`,
 * `~3`… (`ids.md`, "Resources and pieces"), in the order the rows are given.
 */
export function uniqueIds(): (id: string) => string {
  const taken = new Set<string>()
  const repeats = new Map<string, number>()
  return (id) => {
    if (!taken.has(id)) {
      taken.add(id)
      return id
    }
    let n = repeats.get(id) ?? 1
    let candidate: string
    do {
      n++
      candidate = `${id}~${n}`
    } while (taken.has(candidate))
    repeats.set(id, n)
    taken.add(candidate)
    return candidate
  }
}

/**
 * The fields of a row of notes, questions or links that are not its id and its reference, as the row keeps them: `cols`, and
 * the `concept` (notes: SupportReference, links: TWLink). A value that is an address (`rc://*\/ta/man/…`) becomes `concept` and
 * its column is left out; an empty one is left out; any other form stays in `cols` and the row has no concept. `note`, `question`
 * and `response` have their TSV escapes undone and their links rewritten (`unescapeTsv`, then `rewriteLinks`, with `book`
 * `null` for Open Bible Stories, which has no book to resolve the relative links against). `report` receives a line for each
 * anomaly. Throws `Error` for a field that is not text or true and false; `where` and `published` (the row's id) name the row.
 */
export function helpColumns(
  item: Record<string, unknown>,
  kind: HelpsKind,
  book: string | null,
  where: string,
  published: string,
  report: (text: string) => void,
): { cols: Record<string, string | boolean>; concept?: string } {
  const { concept: conceptSource } = SOURCES[kind]
  const cols: [string, string | boolean][] = []
  let concept: string | undefined
  for (const [name, value] of Object.entries(item)) {
    if (name === 'id' || name === 'reference' || value === undefined || value === null) continue
    if (conceptSource !== undefined && name === conceptSource.column && typeof value === 'string') {
      if (value === '') continue
      const found = conceptSource.of(value)
      if (found !== null) {
        concept = found
        continue
      }
      report(`the ${name} ${JSON.stringify(value)} is not an address that becomes a concept; it stays in cols`)
      cols.push([name, value])
    } else if (typeof value === 'string') {
      if (!LONG_TEXT_COLUMNS.includes(name)) {
        cols.push([name, value])
        continue
      }
      const text = rewriteLinks(unescapeTsv(value), book)
      cols.push([name, text])
      const left = [...new Set(text.match(UNREWRITTEN) ?? [])]
      if (left.length > 0) report(`${name} has links in a form that is kept as it is: ${left.slice(0, 3).join(' ')}${left.length > 3 ? ` (and ${left.length - 3} more)` : ''}`)
    } else if (typeof value === 'boolean') {
      cols.push([name, value])
    } else {
      throw new Error(`${where}: the field ${JSON.stringify(name)} of the row ${JSON.stringify(published)} is not text or true and false`)
    }
  }
  // `fromEntries` defines every key, a field named "__proto__" included.
  return concept === undefined ? { cols: Object.fromEntries(cols) } : { cols: Object.fromEntries(cols), concept }
}

/**
 * Reads the notes, questions or word links of a book from rows of a source (the caller has filtered them to the language
 * and the book; rows of other resources and of other layers are ignored). `res` is the key of the resource.
 *
 * - **Rows.** The `sot` rows `tn:{res}:{book}:{chapter}` (`content.notes`), `tq:…` (`content.questions`) and
 *   `twl:{res}:{book}` (`links`), in file order. A resource with no chunk rows is read from the book row.
 * - **Ids.** The `id` field. An id that repeats gets `~2`, `~3`… in file order; the quote layer is keyed by the id as
 *   published, so the rows of a repeated id all look up the same entry.
 * - **References.** The `reference` field, read with `parseRef`. A text it cannot read (a list, `01:02`, spacing) is read
 *   loosely: `from` and `to` are the lowest and the highest verse the text names; a text that names none is placed at the
 *   book introduction (`from` and `to` are the id of chapter 0, verse 0). The row is never dropped, and the text stays in
 *   `ref`.
 * - **Concept.** For the notes, SupportReference; for the links, TWLink. A value that is an address (`rc://*\/ta/man/…`) becomes
 *   `concept` and its column is left out of `cols`; an empty one is left out (no concept, no column); any other form stays
 *   in `cols` and the row has no concept.
 * - **Columns.** Every other field of the row stays in `cols` under its name. `note`, `question` and `response` have their
 *   TSV escapes undone and their links rewritten (`unescapeTsv`, then `rewriteLinks`).
 * - **Quotes.** For the notes and the links, the quote layer (`helps-quote:{res}@…:{book}:{chapter}`, from `content[id]`)
 *   says which words of the original the quote names; each is looked up with `orig.find`. If any row has a piece, every row
 *   has `quote` (`[]` for a row with none: no quote, or one the layer did not find); if none does, no row has it.
 *
 * Each anomaly adds a line to `issues`. Throws `Error` for rows that are not what format 2.0 writes: no rows of the
 * resource, a chapter twice, a row without an id, a field that is not text or true and false.
 */
export function extractHelps(rows: Row[], book: string, res: string, kind: HelpsKind, orig: OrigIndex, issues: string[] = []): HelpTable {
  const source = sourceRows(rows, book, res, kind)
  const layer = kind === 'questions' ? new Map<string, unknown[]>() : quoteLayer(rows, book, res, issues)

  const unique = uniqueIds()

  const table: HelpRow[] = []
  for (const [index, { where, item }] of source.entries()) {
    if (!isMap(item)) throw new Error(`${where}: row ${index} is not an object`)
    const published = item.id
    if (typeof published !== 'string' || published === '') throw new Error(`${where}: row ${index} has no id`)
    const id = unique(published)
    const report = (text: string) => issues.push(`${res} ${id}: ${text}`)
    if (id !== published) report(`the id ${JSON.stringify(published)} is in the source twice; this row is ${JSON.stringify(id)}, and the quote layer is read by ${JSON.stringify(published)}`)

    const reference = typeof item.reference === 'string' ? item.reference : ''
    let range = parseRef(book, reference)
    if (range === null) {
      // "3:front", the title of a psalm: the introduction of the chapter.
      const front = /^([1-9][0-9]{0,2}):front$/.exec(reference.trim())
      const title = front === null ? null : parseRef(book, `${front[1]}:intro`)
      if (title !== null) {
        range = title
        report(`the reference ${JSON.stringify(reference)} is read as the introduction of chapter ${front![1]}`)
      } else {
        range = looseRange(book, reference)
        if (range === null) {
          const intro = verseId(book, 0, 0)
          range = [intro, intro]
          report(`the reference ${JSON.stringify(reference)} names no verse; the row is placed at the book introduction`)
        } else {
          report(`the reference ${JSON.stringify(reference)} is not one range in the usual form; the row covers ${showRange(book, range[0], range[1])}`)
        }
      }
    }

    const { cols, concept } = helpColumns(item, kind, book, where, published, report)
    const row: HelpRow = { id, ref: reference, from: range[0], to: range[1], cols }
    if (concept !== undefined) row.concept = concept
    const pieces = layer.get(published)
    if (pieces !== undefined) Object.assign(row, quotePieces(pieces, book, range[0], orig, report))
    table.push(row)
  }

  // A table has `quote` on every row or on none.
  if (table.some((row) => row.quote !== undefined && row.quote.length > 0)) {
    for (const row of table) row.quote ??= []
  } else {
    for (const row of table) {
      delete row.quote
      delete row.quoteKinds
      delete row.quoteMissing
    }
  }
  return { res, rows: table }
}

/**
 * The model of a book of a language: the bridge texts and the helps the source has of it, with the positions of the texts'
 * alignment and of the quotes found in `orig`.
 *
 * - **Resources.** `source.resources(lang)` lists them; those whose `books` include `book` are used, by subject: `Aligned
 *   Bible` for a text (all of them), `TSV Translation Notes` for the notes, `TSV Translation Questions` for the questions
 *   and `TSV Translation Words Links` for the links (the first by key, and a line in `issues` when there are more). All in
 *   the order of their keys, compared by code point.
 * - **Header.** `res` is `[key, release tag]` of every resource used, in the order of the keys; the release tag is the stamp
 *   before the `#`. `orig` is `[orig.key, orig.stamp]`.
 * - **No text.** A language with notes of a book and no text of it gives `texts: []`.
 *
 * Throws `Error` when the source has no resource of the book at all, or when a reader of the rows does (`extractText`,
 * `extractHelps`).
 */
export async function extractBook(source: RowSource, lang: string, book: string, orig: OrigModel, issues: string[] = []): Promise<BookModel> {
  const index = new OrigIndex(orig)
  const resources = (await source.resources(lang)).filter((resource) => resource.books.includes(book)).sort((a, b) => compareCodePoints(a.key, b.key))

  const collect = async (resource: ResourceRef, layers: string[]): Promise<Row[]> => {
    const out: Row[] = []
    for await (const row of source.rows({ lang, book, resource: resource.key })) if (layers.includes(row.layer)) out.push(row)
    return out
  }

  const used: ResourceRef[] = []
  const texts = resources.filter((resource) => resource.kind === TEXT_SUBJECT)
  used.push(...texts)
  const helps: [HelpsKind, ResourceRef][] = []
  for (const kind of HELPS_KINDS) {
    const found = resources.filter((resource) => resource.kind === SOURCES[kind].subject)
    if (found.length === 0) continue
    if (found.length > 1) {
      issues.push(`${found.length} resources of ${SOURCES[kind].subject} have the book ${book} (${found.map((r) => r.key).join(', ')}); ${found[0].key} is used`)
    }
    helps.push([kind, found[0]])
    used.push(found[0])
  }
  if (used.length === 0) throw new Error(`The source has no text, notes, questions or links of the book ${book} in ${lang}`)
  used.sort((a, b) => compareCodePoints(a.key, b.key))

  const model: BookModel = {
    lang,
    book,
    orig: [orig.key, orig.stamp],
    res: used.map((resource): [string, string] => [resource.key, resource.stamp.split('#')[0]]),
    texts: [],
  }
  for (const resource of texts) model.texts.push(extractText(await collect(resource, ['sot']), book, resource.key, index, issues))
  for (const [kind, resource] of helps) model[kind] = extractHelps(await collect(resource, ['sot', 'quote']), book, resource.key, kind, index, issues)
  return model
}
