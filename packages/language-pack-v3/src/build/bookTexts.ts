/**
 * The bridge texts of a book segment (`spec/cddl/book.cddl`, "Texts"): a GLT or a GST, as format 2.0 keeps it in the
 * `scripture-usj:` rows, read into a {@link TextModel}: pieces, events, attributes, and for each word the original words
 * it translates.
 *
 * The segment that holds the texts is `book.ts`, and its reader `read/book.ts`. No Node module is used.
 */
import { isMap } from '../codec/values'
import { verseId } from '../ids'
import type { Event, Piece, TextModel } from '../model'
import type { Row } from '../source/rows'
import { attributesOf, leadingNumber, type OrigIndex, recordOf, textOf } from './orig'

/** A milestone `zaln-s` that is open, with the position its `x-content` has in the original (`null`: this edition lacks it). */
type OpenMilestone = { position: number | null; verse: number; content: string; occurrence: number }

const DIGITS = /^[0-9]+$/

/** The chapter chunks of a resource, in chapter order: `scripture-usj:{res}:{book}:{chapter}`, chunk 0 included. */
function chunksOf(rows: Row[], book: string, res: string): { where: string; content: unknown[] }[] {
  const prefix = `scripture-usj:${res}:${book}:`
  const chunks = new Map<number, { where: string; content: unknown[] }>()
  for (const row of rows) {
    // The book row, `scripture-usj:{res}:{book}`, has no colon after the book and is not a chunk.
    if (row.layer !== 'sot' || !row.key.startsWith(prefix)) continue
    const chapter = row.key.slice(prefix.length)
    if (!DIGITS.test(chapter)) continue
    const value = isMap(row.value) ? row.value : {}
    const content = isMap(value.content) ? value.content : {}
    const usj = isMap(content.usj) ? content.usj : {}
    if (!Array.isArray(usj.content)) throw new Error(`${row.key}: the row has no USJ document (content.usj.content)`)
    const number = Number(chapter)
    if (chunks.has(number)) throw new Error(`${row.key}: the chapter is in the source twice`)
    chunks.set(number, { where: row.key, content: usj.content })
  }
  if (chunks.size === 0) throw new Error(`The rows have no text of the book ${book} in ${res}`)
  return [...chunks.entries()].sort(([a], [b]) => a - b).map(([, chunk]) => chunk)
}

/**
 * Reads one bridge text of a book from rows of a source (the caller has filtered them to the language and the book; rows
 * of other resources and of other layers are ignored).
 *
 * - The text is the `sot` rows `scripture-usj:{res}:{book}:{chapter}`, one per chapter chunk (chunk 0 is the front
 *   matter), read in chapter order whatever the order of the rows. The book row `scripture-usj:{res}:{book}` is not text.
 * - A `char` node with marker `w` is a word: a piece with `isWord`, whose text is all the text inside it. Its
 *   attributes (`x-occurrence`, `x-occurrences`) are not kept. Text between nodes is a piece that is not a word.
 * - The USJ of format 2.0 drops the blank between two alignment milestones, so two words can follow each other with no
 *   piece between them. The builder puts one `" "` piece (not a word) before a word piece when the piece before it is a
 *   word piece, as format 2.0 does when it shows the text: joining the pieces gives the text. Text that is a blank
 *   already, punctuation, or the start of a note is a piece between the words, and nothing is added.
 * - A chapter is the event `chapter` with its number as published, a verse the event `verse` (`"1"`, `"1-2"`), and every
 *   other node, a milestone included, the events `open` (`"type:marker"`) and `close`; a milestone opens and closes at
 *   the same position. Their attributes, other than `type`, `marker`, `content`, `sid` and `eid`, go to `attrs`.
 * - The milestones `zaln-s` and `zaln-e` are not events. The `zaln-s` that are open when a word is read are the words
 *   it translates, outer first and not sorted: each is looked for in `orig` with `find(verse, x-content, x-occurrence)`,
 *   the verse being the one open when the milestone starts (before the first chapter and the first verse, the
 *   introduction of the book, then of the chapter). One that `orig` does not have gives no position and an entry in
 *   `alignMissing` for each word it encloses. A `zaln-e` with nothing open, and a `zaln-s` that never closes, are ignored.
 * - `align` is there when some word had a milestone around it, that is, when some word has a position or `alignMissing`
 *   has an entry; a text without milestones has neither.
 *
 * Throws `Error` for rows that are not what format 2.0 writes: a chunk twice or with no USJ document, a node with no
 * type or with an attribute that is not text, a chapter or verse without a number, a milestone without `x-content` or
 * with an `x-occurrence` that is not a whole number, or no chunk of this text at all.
 */
export function extractText(rows: Row[], book: string, res: string, orig: OrigIndex): TextModel {
  const pieces: Piece[] = []
  const events: Event[] = []
  const attrs: Record<number, Record<string, string>> = {}
  const align: number[][] = []
  const missing: [number, number, string, number][] = []
  const stack: OpenMilestone[] = []
  let aligned = false
  let chapter = 0
  let verse = 0

  const visit = (node: unknown, where: string): void => {
    if (typeof node === 'string') {
      pieces.push([node, false])
      return
    }
    if (!isMap(node) || typeof node.type !== 'string') throw new Error(`${where}: a node has to be text or have a type`)
    const type = node.type
    const marker = typeof node.marker === 'string' ? node.marker : undefined

    if (type === 'char' && marker === 'w') {
      const word = align.length
      const positions: number[] = []
      for (const open of stack) {
        if (open.position !== null) positions.push(open.position)
        else missing.push([word, open.verse, open.content, open.occurrence])
      }
      if (stack.length > 0) aligned = true
      align.push(positions)
      // The USJ of format 2.0 drops the blank that the USFM has between two alignment milestones, so two words can follow
      // each other with nothing between them. A blank piece goes between them, and the pieces join into the text. Events
      // already written stay before it: a verse that starts with a word right after a word starts with the blank.
      if (pieces.length > 0 && pieces[pieces.length - 1][1]) pieces.push([' ', false])
      pieces.push([textOf(node), true])
      return
    }
    if (type === 'ms' && marker === 'zaln-s') {
      const content = node['x-content']
      if (typeof content !== 'string') throw new Error(`${where}: a zaln-s milestone has no x-content as text`)
      const occurrence = node['x-occurrence']
      if (typeof occurrence !== 'string' || !DIGITS.test(occurrence)) {
        throw new Error(`${where}: the x-occurrence ${JSON.stringify(occurrence)} of the zaln-s of ${JSON.stringify(content)} is not a whole number`)
      }
      const id = verseId(book, chapter, verse)
      stack.push({ position: orig.find(id, content, Number(occurrence)), verse: id, content, occurrence: Number(occurrence) })
      return
    }
    if (type === 'ms' && marker === 'zaln-e') {
      stack.pop()
      return
    }

    if (node.content !== undefined && !Array.isArray(node.content)) throw new Error(`${where}: the content of a ${type} node is not a list`)
    const content: unknown[] = node.content ?? []
    if (type === 'chapter' || type === 'verse') {
      if (typeof node.number !== 'string') throw new Error(`${where}: a ${type} needs its number as text`)
      const number = leadingNumber(node.number, type)
      if (type === 'chapter') {
        chapter = number
        verse = 0
      } else {
        verse = number
      }
      // `sid` and `eid` say the book, chapter and verse again: the events say them already.
      const extra = recordOf(attributesOf(node, ['number', 'sid', 'eid'], where))
      if (extra !== undefined) attrs[events.length] = extra
      events.push([pieces.length, type, node.number])
      for (const child of content) visit(child, where)
      return
    }
    const extra = recordOf(attributesOf(node, ['sid', 'eid'], where))
    if (extra !== undefined) attrs[events.length] = extra
    events.push([pieces.length, 'open', marker === undefined ? type : `${type}:${marker}`])
    for (const child of content) visit(child, where)
    events.push([pieces.length, 'close', ''])
  }

  for (const { where, content } of chunksOf(rows, book, res)) for (const node of content) visit(node, where)

  const text: TextModel = { res, pieces, events }
  if (Object.keys(attrs).length > 0) text.attrs = attrs
  if (aligned) text.align = align
  if (missing.length > 0) text.alignMissing = missing
  return text
}
