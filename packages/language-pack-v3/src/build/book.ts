/**
 * The book segment of format 3 (`spec/cddl/book.cddl`): one language, one book. Its texts and their alignment are here;
 * the notes, questions and word links come with the helps.
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
import { encodeUvarints, stringTable, zigzag } from '../codec/columns'
import type { Segment } from '../codec/container'
import { eventCode } from '../events'
import type { BookModel, TextModel } from '../model'

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
export function resIndexOf(m: BookModel): Map<string, number> {
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

// Segment

/**
 * The segment of a model (`book.cddl`): the tables `strings`, `texts` and, when some text has alignment, `align`. The
 * same model gives the same segment. The header's `res` is the model's, as it is: the caller gives the release tag of
 * each resource (`v42`), not its whole stamp. Throws `Error` when the model is not one the segment can hold: a book code
 * that is not three lowercase letters or digits, no resource or one twice, a text of a resource the header does not
 * list, an `align` of another length than the words, a position or a number that is not an integer from 0 to 2^53 - 1,
 * events out of order or out of the pieces, a close with an argument, attributes of an event that does not exist.
 */
export function bookSegment(m: BookModel): Segment {
  if (!/^[0-9a-z]{3}$/.test(m.book)) throw new Error(`The book code ${JSON.stringify(m.book)} is not three lowercase letters or digits`)
  const resIndex = resIndexOf(m)

  // The helps (notes, questions, links, quotes) are parts too: add them here.
  const parts: TablePart[] = [textsPart(m, resIndex)]

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
