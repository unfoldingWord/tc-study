/**
 * The reader of the book segment (`spec/cddl/book.cddl`): a {@link Segment} that `readSegment` has accepted, back into a
 * {@link BookModel}, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a table of the
 * wrong shape, a column of another length, a number outside its string table or its resources, an `align` table that
 * does not match the texts or the words of a text, an event out of the pieces. It imports no builder code and no Node
 * module.
 */
import { ColumnError, decodeUvarints, unzigzag } from '../codec/columns'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, hasOwn, isMap } from '../codec/values'
import { eventKind } from '../events'
import type { BookModel, Event, Piece, TextModel } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the book segment is malformed: ${what}`)
}

const isUint = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0

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

/**
 * The model of a book segment: its header and its texts, with their alignment when the segment has the table `align`.
 * A text with no alignment (all its words with `k = 0`, nothing missing) comes back without `align`, as it was built.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not a book or its tables are not what `book.cddl` says. A
 * table that the caller did not list in `known` is not in `seg.t`, and the model has what it gives: without `align`
 * the texts have no alignment.
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

    return {
      lang: h.lang,
      book: h.book,
      orig: [h.orig[0], h.orig[1]],
      res: h.res.map(([key, tag]): [string, string] => [key, tag]),
      texts: entries.map((entry) => entry.text),
    }
  } catch (error) {
    // A malformed column: a varint that is cut short or not minimal.
    if (error instanceof ColumnError) throw new FormatError('E_BODY', `the book segment is malformed: ${error.message}`)
    throw error
  }
}
