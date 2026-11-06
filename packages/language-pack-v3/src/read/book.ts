/**
 * The reader of the book segment (`spec/cddl/book.cddl`): a {@link Segment} that `readSegment` has accepted, back into a
 * {@link BookModel}, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a table of the
 * wrong shape, a column of another length, a number outside its string table or its resources, an `align` table that
 * does not match the texts or the words of a text, an event out of the pieces, a `has` that does not match the values of
 * a column, a quote piece that does not belong to its row. It imports no builder code and no Node module.
 */
import { ColumnError, decodeBits, decodeDeltas, decodeTexts, decodeUvarints, unzigzag } from '../codec/columns'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap, isUint } from '../codec/values'
import { eventKind } from '../events'
import { formatRef } from '../ids'
import type { BookModel, Event, HelpRow, HelpTable, Piece, TextModel } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the book segment is malformed: ${what}`)
}


function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
  return value
}

function list(value: unknown, what: string): unknown[] {
  if (!Array.isArray(value)) bad(`${what} is not a list`)
  return value
}

function strings(value: unknown, what: string): string[] {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) bad(`${what} is not a list of text`)
  return value as string[]
}

function numbers(value: unknown, what: string): number[] {
  if (!(value instanceof Uint8Array)) bad(`${what} is not a byte string`)
  return decodeUvarints(value)
}

/** A map of text to text, copied (`fromEntries` defines every key, a key named "__proto__" included). */
function textMap(value: unknown, what: string): Record<string, string> {
  const entries = Object.entries(map(value, what))
  if (!entries.every(([, item]) => typeof item === 'string')) bad(`${what} has a value that is not text`)
  return Object.fromEntries(entries) as Record<string, string>
}

/** `[* [event: uint, {* tstr => tstr}]]`: the attributes by event, each event once and below `limit`. */
function attributesOf(value: unknown, what: string, limit: number): Record<number, Record<string, string>> {
  const out: Record<number, Record<string, string>> = {}
  for (const [i, entry] of list(value, what).entries()) {
    if (!Array.isArray(entry) || entry.length !== 2) bad(`${what}[${i}] is not [event, {...}]`)
    const [event, attributes] = entry
    if (!isUint(event) || event >= limit) bad(`${what}[${i}] names the event ${String(event)}, and there are ${limit}`)
    if (hasOwn(out, String(event))) bad(`${what} names the event ${event} twice`)
    out[event] = textMap(attributes, `${what}[${i}]`)
  }
  return out
}

/** A text without its alignment: the model so far, and how many words it has. */
function readText(value: unknown, i: number, table: string[], res: [string, string][]): { text: TextModel; words: number } {
  const what = `texts[${i}]`
  const fields = map(value, what)
  if (!isUint(fields.res) || fields.res >= res.length) bad(`${what}.res names the resource ${String(fields.res)}, and the header has ${res.length}`)

  const pieces: Piece[] = []
  let words = 0
  for (const token of numbers(fields.tok, `${what}.tok`)) {
    const piece = table[Math.floor(token / 2)]
    if (piece === undefined) bad(`${what}.tok names the string ${Math.floor(token / 2)}, and the table has ${table.length}`)
    const isWord = token % 2 === 1
    if (isWord) words++
    pieces.push([piece, isWord])
  }

  const ev = numbers(fields.ev, `${what}.ev`)
  if (ev.length % 3 !== 0) bad(`${what}.ev has ${ev.length} numbers, which is not a whole number of events`)
  const events: Event[] = []
  let position = 0
  for (let n = 0; n < ev.length; n += 3) {
    const [since, code, argument] = [ev[n], ev[n + 1], ev[n + 2]]
    const kind = eventKind(code)
    if (kind === undefined) bad(`${what}, event ${n / 3} has the code ${code}`)
    position += since
    if (position > pieces.length) bad(`${what}, event ${n / 3} is at piece ${position}, and there are ${pieces.length}`)
    if (kind === 'close') {
      if (argument !== 0) bad(`${what}, event ${n / 3} closes a node and has the argument ${argument}`)
      events.push([position, kind, ''])
    } else {
      const arg = table[argument]
      if (arg === undefined) bad(`${what}, event ${n / 3} names the string ${argument}, and the table has ${table.length}`)
      events.push([position, kind, arg])
    }
  }

  const text: TextModel = { res: res[fields.res][0], pieces, events }
  if (fields.attrs !== undefined) text.attrs = attributesOf(fields.attrs, `${what}.attrs`, events.length)
  return { text, words }
}

/**
 * One entry of `align`, for a text of `words` words: `words` is one column of uvarints, per word `k` and then `k`
 * numbers, each the zigzag of the position minus the last one written in the column (the first minus 0). The column has
 * to be used up exactly. `align` and `alignMissing` are given to the text only when it has some alignment.
 */
function readAlign(value: unknown, i: number, text: TextModel, words: number): void {
  const what = `align[${i}]`
  const entry = map(value, what)
  const column = numbers(entry.words, `${what}.words`)
  const lists: number[][] = []
  let at = 0
  let previous = 0
  for (let word = 0; word < words; word++) {
    if (at >= column.length) bad(`${what}.words ends at word ${word}, and the text has ${words}`)
    const k = column[at++]
    // A count above what is left would only make the loop long: the column cannot hold that many numbers.
    if (k > column.length - at) bad(`${what}.words: word ${word} translates ${k} original words, and the column has ${column.length - at} numbers left`)
    const positions: number[] = []
    for (let j = 0; j < k; j++) {
      previous += unzigzag(column[at++])
      if (!isUint(previous)) bad(`${what}.words: word ${word} has the position ${previous}`)
      positions.push(previous)
    }
    lists.push(positions)
  }
  if (at !== column.length) bad(`${what}.words has ${column.length - at} numbers after the ${words} words of the text`)

  const missing: [number, number, string, number][] = []
  if (entry.missing !== undefined) {
    for (const [n, item] of list(entry.missing, `${what}.missing`).entries()) {
      if (!Array.isArray(item) || item.length !== 4) bad(`${what}.missing[${n}] is not [word, verse, original, occurrence]`)
      const [word, verse, original, occurrence] = item
      if (!isUint(word) || word >= words) bad(`${what}.missing[${n}] names the word ${String(word)}, and the text has ${words}`)
      if (!isUint(verse)) bad(`${what}.missing[${n}] has the verse ${String(verse)}`)
      if (typeof original !== 'string') bad(`${what}.missing[${n}] has an original word that is not text`)
      if (!isUint(occurrence)) bad(`${what}.missing[${n}] has the occurrence ${String(occurrence)}`)
      missing.push([word, verse, original, occurrence])
    }
  }
  if (lists.some((positions) => positions.length > 0) || missing.length > 0) text.align = lists
  if (missing.length > 0) text.alignMissing = missing
}

// Notes, questions and word links

/**
 * A column of `n` rows (`common.cddl`, `column`): for each row its value, or `undefined` for a row the column lacks. The
 * values are text (`strings`, `texts`; a `uints` column gives the number as text, the model has no numbers) or true and
 * false (`flags`). `has` says which rows have a value and the column lists only those.
 */
function readColumn(value: unknown, n: number, what: string, table: string[]): (string | boolean | undefined)[] {
  const fields = map(value, what)
  const kinds = ['strings', 'texts', 'flags', 'uints'].filter((kind) => fields[kind] !== undefined)
  if (kinds.length !== 1) bad(`${what} has ${kinds.length} of strings, texts, flags and uints, and it needs one`)
  const kind = kinds[0]

  let present: boolean[] = new Array<boolean>(n).fill(true)
  if (fields.has !== undefined) {
    if (!(fields.has instanceof Uint8Array)) bad(`${what}.has is not a byte string`)
    present = decodeBits(fields.has, n)
  }
  const count = present.reduce((sum, has) => sum + (has ? 1 : 0), 0)
  const length = (found: number, name: string) => {
    if (found !== count) bad(`${what}.${name} has ${found} values and ${count} rows have one`)
  }

  let values: (string | boolean)[]
  if (kind === 'strings') {
    const nums = numbers(fields.strings, `${what}.strings`)
    length(nums.length, 'strings')
    values = nums.map((number) => {
      const text = table[number]
      if (text === undefined) bad(`${what}.strings names the string ${number}, and the table has ${table.length}`)
      return text
    })
  } else if (kind === 'texts') {
    const texts = map(fields.texts, `${what}.texts`)
    if (!(texts.utf8 instanceof Uint8Array) || !(texts.len instanceof Uint8Array)) bad(`${what}.texts needs utf8 and len as byte strings`)
    values = decodeTexts({ utf8: texts.utf8, len: texts.len })
    length(values.length, 'texts')
  } else if (kind === 'flags') {
    if (!(fields.flags instanceof Uint8Array)) bad(`${what}.flags is not a byte string`)
    values = decodeBits(fields.flags, count)
  } else {
    values = numbers(fields.uints, `${what}.uints`).map(String)
    length(values.length, 'uints')
  }

  let next = 0
  return present.map((has) => (has ? values[next++] : undefined))
}

/** One of `notes`, `questions` and `links` (`helps` in `book.cddl`), read into rows without their quotes. */
function readHelps(value: unknown, name: string, table: string[], res: [string, string][], book: string): HelpTable {
  const what = `the table "${name}"`
  const fields = map(value, what)
  if (!isUint(fields.res) || fields.res >= res.length) bad(`${what}.res names the resource ${String(fields.res)}, and the header has ${res.length}`)
  if (!isUint(fields.n)) bad(`${what}.n is not a count`)
  const n = fields.n

  const idFields = map(fields.id, `${what}.id`)
  let ids: string[]
  if ((idFields.ascii4 !== undefined) === (idFields.strings !== undefined)) bad(`${what}.id has both ascii4 and strings, or neither: it has one`)
  if (idFields.ascii4 !== undefined) {
    const bytes = idFields.ascii4
    if (!(bytes instanceof Uint8Array) || bytes.length !== 4 * n) bad(`${what}.id.ascii4 is not ${4 * n} bytes`)
    if (bytes.some((byte) => byte > 0x7f)) bad(`${what}.id.ascii4 has a byte that is not ASCII`)
    ids = Array.from({ length: n }, (_, i) => String.fromCharCode(...bytes.subarray(4 * i, 4 * i + 4)))
  } else {
    const nums = numbers(idFields.strings, `${what}.id.strings`)
    if (nums.length !== n) bad(`${what}.id.strings has ${nums.length} numbers and the table has ${n} rows`)
    ids = nums.map((number) => {
      const id = table[number]
      if (id === undefined) bad(`${what}.id.strings names the string ${number}, and the table has ${table.length}`)
      return id
    })
  }

  const ref = map(fields.ref, `${what}.ref`)
  if (!(ref.from instanceof Uint8Array)) bad(`${what}.ref.from is not a byte string`)
  const from = decodeDeltas(ref.from)
  const span = numbers(ref.span, `${what}.ref.span`)
  if (from.length !== n || span.length !== n) bad(`${what}.ref has ${from.length} starts and ${span.length} spans for ${n} rows`)
  from.forEach((start, i) => {
    if (!isUint(start)) bad(`${what}.ref.from: row ${i} starts at ${start}`)
    if (!Number.isSafeInteger(start + span[i])) bad(`${what}.ref: row ${i} ends beyond 2^53 - 1`)
  })

  const refText = new Map<number, string>()
  if (fields.refText !== undefined) {
    for (const [k, item] of list(fields.refText, `${what}.refText`).entries()) {
      if (!Array.isArray(item) || item.length !== 2) bad(`${what}.refText[${k}] is not [row, text]`)
      const [row, text] = item
      if (!isUint(row) || row >= n) bad(`${what}.refText[${k}] names the row ${String(row)}, and the table has ${n}`)
      if (typeof text !== 'string') bad(`${what}.refText[${k}] is not text`)
      if (refText.has(row)) bad(`${what}.refText names the row ${row} twice`)
      refText.set(row, text)
    }
  }

  let concepts: (string | boolean | undefined)[] | undefined
  if (fields.concept !== undefined) {
    concepts = readColumn(fields.concept, n, `${what}.concept`, table)
    if (concepts.some((concept) => typeof concept === 'boolean')) bad(`${what}.concept has flags, and a concept is text`)
  }
  const colFields = map(fields.cols, `${what}.cols`)
  const columns = Object.keys(colFields).map((column): [string, (string | boolean | undefined)[]] => [
    column,
    readColumn(colFields[column], n, `${what}.cols[${JSON.stringify(column)}]`, table),
  ])

  const rows: HelpRow[] = ids.map((id, i) => {
    let text: string | undefined = refText.get(i)
    if (text === undefined) {
      try {
        text = formatRef(book, from[i], from[i] + span[i])
      } catch (error) {
        if (!(error instanceof RangeError)) throw error
        bad(`${what}: row ${i} has no refText and its range ${from[i]} to ${from[i] + span[i]} has no canonical text in the book ${book}`)
      }
    }
    // `fromEntries` defines every key, a column named "__proto__" included.
    const cols = Object.fromEntries(columns.flatMap(([column, values]) => (values[i] === undefined ? [] : [[column, values[i]!]])))
    const row: HelpRow = { id, ref: text, from: from[i], to: from[i] + span[i], cols }
    const concept = concepts?.[i]
    if (typeof concept === 'string') row.concept = concept
    return row
  })
  return { res: res[fields.res][0], rows }
}

/**
 * `quote-positions` of one table of `rows`: how many pieces each row's quote has, the position of each piece plus 1 (0
 * for a piece with no position), and which of the pieces with none are not words and which are words the original lacks.
 * Every row gets `quote` (a list, empty for a row with no pieces); `quoteKinds` and `quoteMissing` only the rows that have some.
 */
function readQuotes(value: unknown, name: string, rows: HelpRow[]): void {
  const what = `the table "quotes", ${name}`
  const fields = map(value, what)
  const counts = numbers(fields.n, `${what}.n`)
  if (counts.length !== rows.length) bad(`${what}.n has ${counts.length} numbers and the table ${name} has ${rows.length} rows`)
  const total = counts.reduce((sum, count) => sum + count, 0)
  if (!(fields.pos instanceof Uint8Array)) bad(`${what}.pos is not a byte string`)
  const pos = decodeDeltas(fields.pos)
  if (pos.length !== total) bad(`${what}.pos has ${pos.length} values and the rows have ${total} pieces`)
  pos.forEach((position, k) => {
    if (!isUint(position)) bad(`${what}.pos: piece ${k} has the value ${position}`)
  })

  let offset = 0
  rows.forEach((row, i) => {
    row.quote = pos.slice(offset, offset + counts[i]).map((position) => position - 1)
    offset += counts[i]
  })

  // A piece with no position is listed once, in `kinds` or in `missing`.
  const listed = new Set<string>()
  const piece = (item: unknown[], where: string): [number, number] => {
    const [row, k] = item
    if (!isUint(row) || row >= rows.length) bad(`${where} names the row ${String(row)}, and the table has ${rows.length}`)
    if (!isUint(k) || k >= counts[row]) bad(`${where} names the piece ${String(k)}, and row ${row} has ${counts[row]}`)
    if (rows[row].quote![k] !== -1) bad(`${where} names the piece ${k} of row ${row}, which has a position`)
    if (listed.has(`${row}:${k}`)) bad(`${where}: the piece ${k} of row ${row} is listed twice`)
    listed.add(`${row}:${k}`)
    return [row, k]
  }
  if (fields.kinds !== undefined) {
    for (const [k, item] of list(fields.kinds, `${what}.kinds`).entries()) {
      if (!Array.isArray(item) || item.length !== 3) bad(`${what}.kinds[${k}] is not [row, piece, kind]`)
      const [row, at] = piece(item, `${what}.kinds[${k}]`)
      if (typeof item[2] !== 'string') bad(`${what}.kinds[${k}] has a kind that is not text`)
      ;(rows[row].quoteKinds ??= []).push([at, item[2]])
    }
  }
  if (fields.missing !== undefined) {
    for (const [k, item] of list(fields.missing, `${what}.missing`).entries()) {
      if (!Array.isArray(item) || item.length !== 5) bad(`${what}.missing[${k}] is not [row, piece, verse, word, occurrence]`)
      const [row, at] = piece(item, `${what}.missing[${k}]`)
      const [, , verse, word, occurrence] = item
      if (!isUint(verse)) bad(`${what}.missing[${k}] has the verse ${String(verse)}`)
      if (typeof word !== 'string') bad(`${what}.missing[${k}] has a word that is not text`)
      if (!isUint(occurrence)) bad(`${what}.missing[${k}] has the occurrence ${String(occurrence)}`)
      ;(rows[row].quoteMissing ??= []).push([at, verse, word, occurrence])
    }
  }
  // Every -1 is in exactly one of the two lists: `piece` has refused a piece that is in both, and here one that is in neither.
  rows.forEach((row, i) => {
    row.quote!.forEach((position, k) => {
      if (position === -1 && !listed.has(`${i}:${k}`)) bad(`${what}: the piece ${k} of row ${i} has no position and is in neither kinds nor missing`)
    })
  })
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const BOOK_TABLES: Readonly<Record<string, number[]>> = {
  strings: [1],
  texts: [1],
  align: [1],
  notes: [1],
  questions: [1],
  links: [1],
  quotes: [1],
}

/**
 * The model of a book segment: its header, its texts with their alignment when the segment has the table `align`, and the
 * notes, questions and links it has, with their quotes when it has `quotes`. A text with no alignment (all its words with
 * `k = 0`, nothing missing) comes back without `align`, as it was built. A table with `quotes` has `quote` on every row.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not a book or its tables are not what `book.cddl` says. A
 * table that the caller did not list in `known` is not in `seg.t`, and the model has what it gives: without `align`
 * the texts have no alignment, and the quotes of a table that is not there are dropped, not half-read.
 */
export function bookView(seg: Segment): BookModel {
  try {
    const { h, t } = seg
    if (h.class !== 'book') bad(`the class is "${h.class}"`)
    if (h.lang === undefined) bad('the header has no lang')
    if (h.book === undefined) bad('the header has no book')
    if (h.orig === undefined) bad('the header has no orig')
    if (h.res === undefined || h.res.length === 0) bad('the header has no resource (res)')

    const table = strings(t.strings, 'the table "strings"')
    const entries = list(t.texts, 'the table "texts"').map((value, i) => readText(value, i, table, h.res!))
    if (t.align !== undefined) {
      const aligns = list(t.align, 'the table "align"')
      if (aligns.length !== entries.length) bad(`the table "align" has ${aligns.length} entries and there are ${entries.length} texts`)
      aligns.forEach((value, i) => readAlign(value, i, entries[i].text, entries[i].words))
    }

    const model: BookModel = {
      lang: h.lang,
      book: h.book,
      orig: [h.orig[0], h.orig[1]],
      res: h.res.map(([key, tag]): [string, string] => [key, tag]),
      texts: entries.map((entry) => entry.text),
    }
    for (const name of ['notes', 'questions', 'links'] as const) {
      if (t[name] !== undefined) model[name] = readHelps(t[name], name, table, h.res, h.book)
    }
    if (t.quotes !== undefined) {
      const quotes = map(t.quotes, 'the table "quotes"')
      for (const name of ['notes', 'links'] as const) {
        const helps = model[name]
        if (quotes[name] !== undefined && helps !== undefined) readQuotes(quotes[name], name, helps.rows)
      }
    }
    return model
  } catch (error) {
    // A malformed column: a varint that is cut short or not minimal.
    if (error instanceof ColumnError) throw new FormatError('E_BODY', `the book segment is malformed: ${error.message}`)
    throw error
  }
}
