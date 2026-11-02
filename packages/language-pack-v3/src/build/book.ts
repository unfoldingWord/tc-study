/**
 * The book segment of format 3 (`spec/cddl/book.cddl`): one language, one book. Its texts and their alignment, and the
 * notes, questions and word links with the positions of their quotes in the original.
 *
 * {@link bookSegment} turns a {@link BookModel} into the segment, the same bytes for the same model. All the tables
 * share one string table, so the work is in two steps:
 *
 * 1. every group of tables is a {@link TablePart}, which first says which strings it uses (one entry per use: the table
 *    puts the most used first);
 * 2. the string table is built once from the uses of all the parts, and each part then writes its tables with the
 *    numbers of that table.
 *
 * To add tables to the segment, write another part and add it to the list in `bookSegment`: nothing else changes.
 *
 * The reader of the segment is `read/book.ts`. No Node module is used.
 */
import type { CborValue } from '../codec/cbor'
import { compareCodePoints, encodeBits, encodeDeltas, encodeTexts, encodeUvarints, stringTable, zigzag } from '../codec/columns'
import type { Segment } from '../codec/container'
import { hasOwn } from '../codec/values'
import { eventCode } from '../events'
import { formatRef } from '../ids'
import { type BookModel, type HelpRow, type HelpTable, LONG_TEXT_COLUMNS, type TextModel } from '../model'

/** A group of tables of the segment. */
export type TablePart = {
  /** Every table it writes: name to `[version, required]`, as `h.tables` lists them. */
  tables: Record<string, [number, boolean]>
  /** Every use of a string, one entry per use, before the string table exists. */
  uses: string[]
  /** The tables, written with the numbers of the string table. */
  encode(index: ReadonlyMap<string, number>): Record<string, CborValue>
}

const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)
const isCount = (value: unknown): value is number => isInteger(value) && value >= 0

/** The index in `h.res` of each resource key. Throws `Error` when the header has no resource or lists one twice. */
export function resIndexOf(m: { res: [string, string][] }): Map<string, number> {
  if (m.res.length === 0) throw new Error('The header needs at least one resource (res)')
  const index = new Map<string, number>()
  m.res.forEach(([key], i) => {
    if (index.has(key)) throw new Error(`The resource ${JSON.stringify(key)} is in res twice`)
    index.set(key, i)
  })
  return index
}

// Texts and alignment

const wordCount = (text: TextModel): number => text.pieces.reduce((count, [, isWord]) => count + (isWord ? 1 : 0), 0)

/** A text against what the tables can hold: a violation is a builder's bug, so it throws `Error`. */
function checkText(text: TextModel, i: number, resIndex: ReadonlyMap<string, number>): void {
  const where = `The text ${i} (${text.res})`
  if (!resIndex.has(text.res)) throw new Error(`${where} is of a resource that res does not list`)

  let last = 0
  text.events.forEach(([position, kind, arg], n) => {
    if (eventCode(kind) === undefined) throw new Error(`${where}, event ${n}: ${JSON.stringify(kind)} is not an event kind`)
    if (!isCount(position) || position < last || position > text.pieces.length) {
      throw new Error(`${where}, event ${n}: position ${String(position)} is not between the previous event (${last}) and the ${text.pieces.length} pieces`)
    }
    if (kind === 'close' && arg !== '') throw new Error(`${where}, event ${n}: a close has no argument`)
    last = position
  })
  for (const key of Object.keys(text.attrs ?? {})) {
    const event = Number(key)
    if (!isCount(event) || String(event) !== key || event >= text.events.length) {
      throw new Error(`${where}: attrs names the event ${JSON.stringify(key)}, and the text has events 0 to ${text.events.length - 1}`)
    }
  }

  const words = wordCount(text)
  const missing = text.alignMissing ?? []
  if (text.align !== undefined && text.align.length !== words) {
    throw new Error(`${where} has ${words} words and align has ${text.align.length} lists`)
  }
  for (const [word, positions] of (text.align ?? []).entries()) {
    for (const position of positions) {
      if (!isCount(position)) throw new Error(`${where}, word ${word}: the position ${String(position)} is not an integer from 0 to 2^53 - 1`)
    }
  }
  if (text.alignMissing !== undefined && missing.length === 0) throw new Error(`${where}: alignMissing is empty, and then it is left out`)
  missing.forEach(([word, verse, original, occurrence], n) => {
    if (!isCount(word) || word >= words) throw new Error(`${where}, alignMissing ${n}: ${String(word)} is not one of the ${words} words`)
    if (!isCount(verse)) throw new Error(`${where}, alignMissing ${n}: the verse ${String(verse)} is not an integer from 0 to 2^53 - 1`)
    if (typeof original !== 'string') throw new Error(`${where}, alignMissing ${n}: the original word is not text`)
    if (!isCount(occurrence)) throw new Error(`${where}, alignMissing ${n}: the occurrence ${String(occurrence)} is not an integer from 0 to 2^53 - 1`)
  })
  // The reader gives `align` to a text if and only if it has a position or a missing word, so the model has to say the same.
  const aligned = (text.align ?? []).some((positions) => positions.length > 0) || missing.length > 0
  if (aligned && text.align === undefined) throw new Error(`${where} has alignMissing and no align`)
  if (!aligned && text.align !== undefined) throw new Error(`${where} has an align that aligns no word and misses none: leave it out`)
}

/** Per piece the string number times 2, plus 1 for a word; per event three numbers; the attributes by event number. */
function encodeText(text: TextModel, res: number, index: ReadonlyMap<string, number>): CborValue {
  const ev: number[] = []
  let last = 0
  for (const [position, kind, arg] of text.events) {
    ev.push(position - last, eventCode(kind)!, kind === 'close' ? 0 : index.get(arg)!)
    last = position
  }
  const out: Record<string, CborValue> = {
    res,
    tok: encodeUvarints(text.pieces.map(([piece, isWord]) => index.get(piece)! * 2 + (isWord ? 1 : 0))),
    ev: encodeUvarints(ev),
  }
  if (text.attrs !== undefined) {
    out.attrs = Object.keys(text.attrs)
      .map(Number)
      .sort((a, b) => a - b)
      .map((event): CborValue => [event, text.attrs![event]])
  }
  return out
}

/**
 * The alignment of a text, one entry of the table `align`. `words` is one column of uvarints: for each word piece, in
 * order, `k` (how many original words it translates) and then `k` numbers, the zigzag of each position minus the last
 * position written in the column, which may be one of an earlier word. The first position written is taken from 0. A
 * text without alignment in a segment that has the table writes `k = 0` for each of its words.
 */
function encodeAlign(text: TextModel): CborValue {
  const words: number[] = []
  let previous = 0
  // Counted once: a count inside the loop condition is a pass over all the pieces for each word.
  const count = wordCount(text)
  for (let word = 0; word < count; word++) {
    const positions = text.align?.[word] ?? []
    words.push(positions.length)
    for (const position of positions) {
      words.push(zigzag(position - previous))
      previous = position
    }
  }
  const entry: Record<string, CborValue> = { words: encodeUvarints(words) }
  if (text.alignMissing !== undefined) entry.missing = text.alignMissing.map((item): CborValue => [...item])
  return entry
}

/** The tables `texts` (required) and `align` (optional, only when some text has alignment). */
function textsPart(m: BookModel, resIndex: ReadonlyMap<string, number>): TablePart {
  m.texts.forEach((text, i) => checkText(text, i, resIndex))
  const uses: string[] = []
  for (const text of m.texts) {
    for (const [piece] of text.pieces) uses.push(piece)
    for (const [, kind, arg] of text.events) if (kind !== 'close') uses.push(arg)
  }
  const aligned = m.texts.some((text) => text.align !== undefined)
  return {
    tables: aligned ? { texts: [1, true], align: [1, false] } : { texts: [1, true] },
    uses,
    encode(index) {
      const tables: Record<string, CborValue> = {
        texts: m.texts.map((text) => encodeText(text, resIndex.get(text.res)!, index)),
      }
      if (aligned) tables.align = m.texts.map(encodeAlign)
      return tables
    },
  }
}

// Notes, questions and word links

type HelpsName = 'notes' | 'questions' | 'links'
const HELPS_NAMES: readonly HelpsName[] = ['notes', 'questions', 'links']
/** The helps whose rows have quotes in the original (`quotes` has no table for the questions). */
const QUOTED_NAMES: readonly HelpsName[] = ['notes', 'links']

/** The canonical text of a range, or `null` when no text names it (an id of another book, an introduction inside a range). */
function canonicalRef(book: string, from: number, to: number): string | null {
  try {
    return formatRef(book, from, to)
  } catch (error) {
    if (error instanceof RangeError) return null
    throw error
  }
}

/** One column of a helps table: which rows have a value (`present`), and the values of those rows, in row order. */
export type ColumnPlan = { name: string; kind: 'strings' | 'texts' | 'flags'; present: boolean[]; values: (string | boolean)[] }

/** `column` of `common.cddl`: `has` only when some row lacks the value, then the values of the rows that have it. */
export function encodeColumn(plan: Omit<ColumnPlan, 'name'>, index: ReadonlyMap<string, number>): CborValue {
  const out: Record<string, CborValue> = {}
  if (plan.present.some((has) => !has)) out.has = encodeBits(plan.present)
  if (plan.kind === 'strings') out.strings = encodeUvarints((plan.values as string[]).map((value) => index.get(value)!))
  else if (plan.kind === 'texts') out.texts = encodeTexts(plan.values as string[])
  else out.flags = encodeBits(plan.values as boolean[])
  return out
}

/** The columns of the rows' `cols`, by name in code point order. A column is `texts` for a long text, `flags` for true or false. */
export function columnPlans(name: string, rows: { cols: HelpRow['cols'] }[]): ColumnPlan[] {
  const names = new Set<string>()
  for (const row of rows) for (const key of Object.keys(row.cols)) if (row.cols[key] !== undefined) names.add(key)
  return [...names].sort(compareCodePoints).map((column) => {
    const present: boolean[] = []
    const values: (string | boolean)[] = []
    for (const row of rows) {
      const has = hasOwn(row.cols, column) && row.cols[column] !== undefined
      present.push(has)
      if (has) values.push(row.cols[column])
    }
    const types = new Set(values.map((value) => typeof value))
    if (types.size !== 1 || !(types.has('string') || types.has('boolean'))) {
      throw new Error(`The table ${name}: the column ${JSON.stringify(column)} has values of ${[...types].join(' and ')}, and a column holds text or true and false`)
    }
    const kind = types.has('boolean') ? 'flags' : LONG_TEXT_COLUMNS.includes(column) ? 'texts' : 'strings'
    return { name: column, kind, present, values }
  })
}

/** A table of notes, questions or links against what the segment can hold: a violation is a builder's bug, so it throws `Error`. */
function checkHelps(name: HelpsName, table: HelpTable, resIndex: ReadonlyMap<string, number>): void {
  if (!resIndex.has(table.res)) throw new Error(`The table ${name} is of a resource that res does not list`)
  const ids = new Set<string>()
  table.rows.forEach((row, i) => {
    const where = `The table ${name}, row ${i}`
    if (typeof row.id !== 'string' || row.id === '') throw new Error(`${where} has no id`)
    if (ids.has(row.id)) throw new Error(`${where}: the id ${JSON.stringify(row.id)} is in the table twice`)
    ids.add(row.id)
    if (typeof row.ref !== 'string') throw new Error(`${where} has no reference text`)
    if (!isCount(row.from) || !isCount(row.to)) throw new Error(`${where}: from and to are verse ids, integers from 0 to 2^53 - 1`)
    if (row.from > row.to) throw new Error(`${where}: from ${row.from} is after to ${row.to}`)
    if (row.concept !== undefined && (typeof row.concept !== 'string' || row.concept === '')) throw new Error(`${where}: the concept is not text`)
    if (typeof row.cols !== 'object' || row.cols === null) throw new Error(`${where} has no cols`)
    if (name === 'questions' && (row.quote !== undefined || row.quoteKinds !== undefined || row.quoteMissing !== undefined)) {
      throw new Error(`${where}: the questions have no quote positions`)
    }
  })
}

/** The table `notes`, `questions` or `links` (`helps` in `book.cddl`). */
function helpsPart(name: HelpsName, table: HelpTable, m: BookModel, resIndex: ReadonlyMap<string, number>): TablePart {
  checkHelps(name, table, resIndex)
  const rows = table.rows
  const columns = columnPlans(name, rows)
  const ascii4 = rows.every((row) => /^[\x00-\x7f]{4}$/.test(row.id))
  const withConcept = rows.map((row) => row.concept !== undefined)
  const concepts = rows.flatMap((row) => (row.concept === undefined ? [] : [row.concept]))

  const uses: string[] = [...concepts]
  if (!ascii4) uses.push(...rows.map((row) => row.id))
  for (const column of columns) if (column.kind === 'strings') uses.push(...(column.values as string[]))

  return {
    tables: { [name]: [1, false] },
    uses,
    encode(index) {
      const ids: CborValue = ascii4
        ? { ascii4: Uint8Array.from(rows.flatMap((row) => [...row.id].map((char) => char.charCodeAt(0)))) }
        : { strings: encodeUvarints(rows.map((row) => index.get(row.id)!)) }
      const out: Record<string, CborValue> = {
        res: resIndex.get(table.res)!,
        n: rows.length,
        id: ids,
        ref: { from: encodeDeltas(rows.map((row) => row.from)), span: encodeUvarints(rows.map((row) => row.to - row.from)) },
      }
      // The reference text is kept for the rows whose text is not the canonical one of their range.
      const refText = rows.flatMap((row, i): CborValue[] => (canonicalRef(m.book, row.from, row.to) === row.ref ? [] : [[i, row.ref]]))
      if (refText.length > 0) out.refText = refText
      if (concepts.length > 0) out.concept = encodeColumn({ kind: 'strings', present: withConcept, values: concepts }, index)
      out.cols = Object.fromEntries(columns.map((column) => [column.name, encodeColumn(column, index)]))
      return { [name]: out }
    },
  }
}

/** What `quote-positions` of `book.cddl` holds for one table, or `undefined` when no row of it has a piece. */
function quotePositions(name: HelpsName, table: HelpTable): CborValue | undefined {
  const rows = table.rows
  const quoted = rows.filter((row) => row.quote !== undefined).length
  if (quoted === 0) {
    rows.forEach((row, i) => {
      if (row.quoteKinds !== undefined || row.quoteMissing !== undefined) throw new Error(`The table ${name}, row ${i}: quoteKinds and quoteMissing without quote`)
    })
    return undefined
  }
  if (quoted !== rows.length) throw new Error(`The table ${name}: ${quoted} of ${rows.length} rows have quote, and a table has it on every row or on none`)

  const counts: number[] = []
  const pos: number[] = []
  const kinds: CborValue[] = []
  const missing: CborValue[] = []
  rows.forEach((row, i) => {
    const where = `The table ${name}, row ${i}`
    const quote = row.quote!
    if (!Array.isArray(quote)) throw new Error(`${where}: quote is not a list`)
    quote.forEach((position, piece) => {
      if (!isInteger(position) || position < -1) throw new Error(`${where}, piece ${piece}: ${String(position)} is not a position (an integer from 0 to 2^53 - 1) or -1`)
      pos.push(position + 1)
    })
    counts.push(quote.length)

    // Each piece without a position is a piece that is not a word or a word the original lacks, and says which.
    const listed = new Set<number>()
    const piece = (value: unknown, what: string): number => {
      if (!isCount(value) || value >= quote.length || quote[value] !== -1) throw new Error(`${where}: ${what} names the piece ${String(value)}, which is not a piece of the quote without a position`)
      if (listed.has(value)) throw new Error(`${where}: the piece ${value} is in quoteKinds and quoteMissing more than once`)
      listed.add(value)
      return value
    }
    if (row.quoteKinds !== undefined && row.quoteKinds.length === 0) throw new Error(`${where}: quoteKinds is empty, and then it is left out`)
    if (row.quoteMissing !== undefined && row.quoteMissing.length === 0) throw new Error(`${where}: quoteMissing is empty, and then it is left out`)
    const rowKinds = (row.quoteKinds ?? []).map(([at, kind]): [number, string] => {
      if (typeof kind !== 'string') throw new Error(`${where}: a kind in quoteKinds is not text`)
      return [piece(at, 'quoteKinds'), kind]
    })
    const rowMissing = (row.quoteMissing ?? []).map(([at, verse, word, occurrence]): [number, number, string, number] => {
      if (!isCount(verse)) throw new Error(`${where}: the verse ${String(verse)} in quoteMissing is not an integer from 0 to 2^53 - 1`)
      if (typeof word !== 'string') throw new Error(`${where}: the word in quoteMissing is not text`)
      if (!isCount(occurrence)) throw new Error(`${where}: the occurrence ${String(occurrence)} in quoteMissing is not an integer from 0 to 2^53 - 1`)
      return [piece(at, 'quoteMissing'), verse, word, occurrence]
    })
    quote.forEach((position, at) => {
      if (position === -1 && !listed.has(at)) throw new Error(`${where}: the piece ${at} has no position and is in neither quoteKinds nor quoteMissing`)
    })
    for (const [at, kind] of rowKinds.sort((a, b) => a[0] - b[0])) kinds.push([i, at, kind])
    for (const [at, verse, word, occurrence] of rowMissing.sort((a, b) => a[0] - b[0])) missing.push([i, at, verse, word, occurrence])
  })
  if (pos.length === 0) throw new Error(`The table ${name}: no row has a piece in quote, and then quote is left out of every row`)

  const out: Record<string, CborValue> = { n: encodeUvarints(counts), pos: encodeDeltas(pos) }
  if (kinds.length > 0) out.kinds = kinds
  if (missing.length > 0) out.missing = missing
  return out
}

/** The table `quotes`, when some row of the notes or the links has a piece in its quote. */
function quotesPart(m: BookModel): TablePart | undefined {
  const quotes: Record<string, CborValue> = {}
  for (const name of QUOTED_NAMES) {
    const table = m[name]
    const positions = table === undefined ? undefined : quotePositions(name, table)
    if (positions !== undefined) quotes[name] = positions
  }
  if (Object.keys(quotes).length === 0) return undefined
  return { tables: { quotes: [1, false] }, uses: [], encode: () => ({ quotes }) }
}

/** The parts for the helps the model has, in the order notes, questions, links, quotes. */
function helpsParts(m: BookModel, resIndex: ReadonlyMap<string, number>): TablePart[] {
  const parts: TablePart[] = []
  for (const name of HELPS_NAMES) {
    const table = m[name]
    if (table !== undefined) parts.push(helpsPart(name, table, m, resIndex))
  }
  const quotes = quotesPart(m)
  if (quotes !== undefined) parts.push(quotes)
  return parts
}

// Segment

/**
 * The segment of a model (`book.cddl`): the tables `strings`, `texts`, when some text has alignment `align`, and the
 * `notes`, `questions` and `links` the model has, with `quotes` when some row of the notes or the links has a piece in
 * its quote. The same model gives the same segment. The header's `res` is the model's, as it is: the caller gives the
 * release tag of each resource (`v42`), not its whole stamp. Throws `Error` when the model is not one the segment can
 * hold: a book code that is not three lowercase letters or digits, no resource or one twice, a text or a table of a
 * resource the header does not list, an `align` of another length than the words, a position or a number that is not an
 * integer from 0 to 2^53 - 1, events out of order or out of the pieces, a close with an argument, attributes of an event
 * that does not exist, a row without id or with an id twice, a column of mixed values, a quote whose pieces without a
 * position are not all in `quoteKinds` or `quoteMissing`.
 */
export function bookSegment(m: BookModel): Segment {
  if (!/^[0-9a-z]{3}$/.test(m.book)) throw new Error(`The book code ${JSON.stringify(m.book)} is not three lowercase letters or digits`)
  const resIndex = resIndexOf(m)

  const parts: TablePart[] = [textsPart(m, resIndex), ...helpsParts(m, resIndex)]

  const strings = stringTable(parts.flatMap((part) => part.uses))
  const tables: Record<string, [number, boolean]> = { strings: [1, true] }
  const t: Record<string, CborValue> = { strings: strings.list }
  for (const part of parts) {
    Object.assign(tables, part.tables)
    Object.assign(t, part.encode(strings.index))
  }
  return {
    h: { class: 'book', v: 1, tables, lang: m.lang, book: m.book, orig: [m.orig[0], m.orig[1]], res: m.res.map(([key, tag]) => [key, tag]) },
    t,
  }
}
