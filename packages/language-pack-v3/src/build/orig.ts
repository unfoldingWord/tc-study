/**
 * The original segment of format 3 (`spec/cddl/orig.cddl`): one book of the UGNT or the UHB, the same for every
 * language. Three parts:
 *
 * - {@link extractOrig} reads the book from a row source (the `scripture-usj:` rows of format 2.0, and MACULA when the
 *   source has it) into an {@link OrigModel};
 * - {@link origSegment} turns a model into the segment, the same bytes for the same model;
 * - {@link OrigIndex} answers the questions the other builders ask of the original: where a quoted word is, and in
 *   which verse a position lies.
 *
 * The reader of the segment is `read/orig.ts`. No Node module is used.
 */
import type { CborValue } from '../codec/cbor'
import { encodeUvarints, stringTable } from '../codec/columns'
import type { Segment } from '../codec/container'
import { hasOwn, isMap } from '../codec/values'
import { eventCode } from '../events'
import { verseId } from '../ids'
import { type Event, type OrigModel, type OrigWord, type Piece, WORD_ATTRIBUTES } from '../model'
import { ORIGINALS, type RowSource } from '../source/rows'

// Extraction

/** A JSON object of a row. `isMap` checks the shape only; every value is checked where it is read. */
export type Json = Record<string, unknown>

/** `scripture-usj:{resource}:{book}` (the book) and `scripture-usj:{resource}:{book}:{chapter}` (a chapter chunk). */
const SCRIPTURE_KEY = /^scripture-usj:([^:]+):([^:]+)(?::(\d+))?$/
/** `{resource}/trees/{BOOK}` and `{resource}/referents/{BOOK}`, where the resource key ends in `/macula`. */
const MACULA_KEY = /^(.+\/macula)\/(trees|referents)\/([A-Za-z0-9]{3})$/

/** The attributes of a USJ node: every key but the ones that make the node (`type`, `marker`, `content`) and `skip`. */
export function attributesOf(node: Json, skip: string[], where: string): [string, string][] {
  const entries: [string, string][] = []
  for (const [name, value] of Object.entries(node)) {
    if (name === 'type' || name === 'marker' || name === 'content' || skip.includes(name)) continue
    if (typeof value !== 'string') throw new Error(`${where}: the attribute "${name}" of a ${String(node.type)} node is not text`)
    entries.push([name, value])
  }
  return entries
}

/** The attributes as a record. `fromEntries` defines the keys, so one named "__proto__" is kept like any other. */
export const recordOf = (entries: [string, string][]): Record<string, string> | undefined =>
  entries.length === 0 ? undefined : Object.fromEntries(entries)

/** All the text inside a node, in order. */
export function textOf(node: unknown): string {
  if (typeof node === 'string') return node
  if (!isMap(node) || !Array.isArray(node.content)) return ''
  return node.content.map(textOf).join('')
}

function wordOf(node: Json, where: string): OrigWord {
  const word: OrigWord = { form: textOf(node), lemma: '', strong: '', morph: '' }
  const rest: [string, string][] = []
  for (const [name, value] of attributesOf(node, [], where)) {
    if (name === 'lemma') word.lemma = value
    else if (name === 'strong') word.strong = value
    else if (name === 'x-morph') word.morph = value
    else rest.push([name, value])
  }
  const other = recordOf(rest)
  if (other !== undefined) word.other = other
  return word
}

/** Walks the USJ of the chapters, in the order given, into words, pieces, events and attributes. */
function readDocument(chapters: { where: string; content: unknown[] }[]): Pick<OrigModel, 'words' | 'pieces' | 'events' | 'attrs'> {
  const words: OrigWord[] = []
  const pieces: Piece[] = []
  const events: Event[] = []
  const attrs: Record<number, Record<string, string>> = {}

  const visit = (node: unknown, where: string): void => {
    if (typeof node === 'string') {
      pieces.push([node, false])
      return
    }
    if (!isMap(node) || typeof node.type !== 'string') throw new Error(`${where}: a node has to be text or have a type`)
    const type = node.type
    const marker = typeof node.marker === 'string' ? node.marker : undefined
    if (type === 'char' && marker === 'w') {
      const word = wordOf(node, where)
      words.push(word)
      pieces.push([word.form, true])
      return
    }
    if (node.content !== undefined && !Array.isArray(node.content)) throw new Error(`${where}: the content of a ${type} node is not a list`)
    const content: unknown[] = node.content ?? []
    if (type === 'chapter' || type === 'verse') {
      if (typeof node.number !== 'string') throw new Error(`${where}: a ${type} needs its number as text`)
      // `sid` and `eid` say the book, chapter and verse again: the event and the events before it say them already.
      const extra = recordOf(attributesOf(node, ['number', 'sid', 'eid'], where))
      if (extra !== undefined) attrs[events.length] = extra
      events.push([pieces.length, type, node.number])
      for (const child of content) visit(child, where)
      return
    }
    const extra = recordOf(attributesOf(node, [], where))
    if (extra !== undefined) attrs[events.length] = extra
    events.push([pieces.length, 'open', marker === undefined ? type : `${type}:${marker}`])
    for (const child of content) visit(child, where)
    events.push([pieces.length, 'close', ''])
  }

  for (const { where, content } of chapters) for (const node of content) visit(node, where)
  return Object.keys(attrs).length > 0 ? { words, pieces, events, attrs } : { words, pieces, events }
}

/**
 * Reads one book of the original from a row source.
 *
 * - The text is the `sot` rows `scripture-usj:{resource}:{book}:{chapter}`, one per chapter chunk (chunk 0 is the front
 *   matter), read in chapter order whatever the order of the rows. Words are the `char` nodes with marker `w`, in
 *   document order, footnotes included. Everything else becomes pieces and events as in `orig.cddl`.
 * - The book row `scripture-usj:{resource}:{book}` lists the chapters the book has: if a chunk is missing, or one is
 *   not listed, extraction fails, because every later position would have moved.
 * - `stamp` is the book file's blob as format 2.0 records it (`g987ab2025a`), which the resource's `bookStamps` gives
 *   for this book (`ids.md`, "Positions in the original"). A source that does not record blobs has none, and then the
 *   stamp is the resource's own (`v0.34#2023-09-27T02_19_31Z`), its release.
 * - MACULA rows `{resource}/trees/{BOOK}` and `{resource}/referents/{BOOK}` go to `macula` as they are, and `release`
 *   is the stamp of the MACULA resource.
 *
 * Throws `Error` when the source has no text of the book, has it from two resources, or has rows that are not what
 * format 2.0 writes.
 */
export async function extractOrig(source: RowSource, book: string): Promise<OrigModel> {
  const upper = book.toUpperCase()
  let resource: string | undefined
  let listed: number[] | undefined
  const chunks = new Map<number, { where: string; content: unknown[] }>()
  const macula: { resource?: string; trees?: unknown; referents?: unknown } = {}

  for await (const row of source.rows({ lang: ORIGINALS, book, layer: 'sot' })) {
    const scripture = SCRIPTURE_KEY.exec(row.key)
    if (scripture) {
      const [, key, rowBook, chapter] = scripture
      if (rowBook !== book) continue
      if (resource !== undefined && resource !== key) {
        throw new Error(`Two originals have the book ${book}: ${resource} and ${key}`)
      }
      resource = key
      const value: Json = isMap(row.value) ? row.value : {}
      const content: Json = isMap(value.content) ? value.content : {}
      if (chapter === undefined) {
        if (!Array.isArray(content.chapterNumbers) || !content.chapterNumbers.every(Number.isInteger)) {
          throw new Error(`${row.key}: the book row lists no chapters`)
        }
        listed = content.chapterNumbers as number[]
        continue
      }
      const usj: Json = isMap(content.usj) ? content.usj : {}
      if (!Array.isArray(usj.content)) throw new Error(`${row.key}: the row has no USJ document (content.usj.content)`)
      const number = Number(chapter)
      if (chunks.has(number)) throw new Error(`${row.key}: the chapter is in the source twice`)
      chunks.set(number, { where: row.key, content: usj.content })
      continue
    }
    const found = MACULA_KEY.exec(row.key)
    if (found && found[3] === upper) {
      const [, key, part] = found
      if (macula.resource !== undefined && macula.resource !== key) {
        throw new Error(`MACULA rows of ${book} come from two resources: ${macula.resource} and ${key}`)
      }
      if (macula[part as 'trees' | 'referents'] !== undefined) throw new Error(`${row.key}: the row is in the source twice`)
      macula.resource = key
      macula[part as 'trees' | 'referents'] = row.value
    }
  }

  if (resource === undefined || chunks.size === 0) throw new Error(`The source has no text of the book ${book} in the originals`)
  if (listed !== undefined) {
    const have = [...chunks.keys()].sort((a, b) => a - b)
    const want = [...listed].sort((a, b) => a - b)
    if (have.length !== want.length || have.some((n, i) => n !== want[i])) {
      throw new Error(`${resource} ${book}: the book row lists the chapters ${want.join(',')} and the source has ${have.join(',')}`)
    }
  }

  const resources = await source.resources(ORIGINALS)
  const refOf = (key: string) => {
    const found = resources.find((r) => r.key === key)
    if (found === undefined) throw new Error(`The source does not list the resource ${key} among the originals`)
    return found
  }
  const original = refOf(resource)
  const stamp = original.bookStamps !== undefined && hasOwn(original.bookStamps, book) ? original.bookStamps[book] : original.stamp

  const ordered = [...chunks.entries()].sort(([a], [b]) => a - b).map(([, chunk]) => chunk)
  const model: OrigModel = { book, key: resource, stamp, ...readDocument(ordered) }
  if (macula.resource !== undefined) {
    model.macula = { release: refOf(macula.resource).stamp }
    if (macula.trees !== undefined) model.macula.trees = macula.trees
    if (macula.referents !== undefined) model.macula.referents = macula.referents
  }
  return model
}

// Segment

const isInteger = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value)

/** The model against what the segment can hold: a violation is a builder's bug, so it throws `Error`. */
function checkModel(m: OrigModel): void {
  if (!/^[0-9a-z]{3}$/.test(m.book)) throw new Error(`The book code ${JSON.stringify(m.book)} is not three lowercase letters or digits`)
  let word = 0
  for (const [text, isWord] of m.pieces) {
    if (!isWord) continue
    if (word >= m.words.length) throw new Error('The model has more word pieces than words')
    if (m.words[word].form !== text) {
      throw new Error(`The word piece ${word} reads ${JSON.stringify(text)} and the form of word ${word} is ${JSON.stringify(m.words[word].form)}`)
    }
    word++
  }
  if (word !== m.words.length) throw new Error(`The model has ${m.words.length} words and ${word} word pieces`)
  let last = 0
  m.events.forEach(([position, kind, arg], i) => {
    if (eventCode(kind) === undefined) throw new Error(`Event ${i}: ${JSON.stringify(kind)} is not an event kind`)
    if (!isInteger(position) || position < last || position > m.pieces.length) {
      throw new Error(`Event ${i}: position ${String(position)} is not between the previous event (${last}) and the ${m.pieces.length} pieces`)
    }
    if (kind === 'close' && arg !== '') throw new Error(`Event ${i}: a close has no argument`)
    last = position
  })
  for (const key of Object.keys(m.attrs ?? {})) {
    const event = Number(key)
    if (!isInteger(event) || String(event) !== key || event < 0 || event >= m.events.length) {
      throw new Error(`attrs names the event ${JSON.stringify(key)}, and the model has events 0 to ${m.events.length - 1}`)
    }
  }
}

/**
 * The segment of a model (`orig.cddl`): the tables `words` and `text`, and `macula` when the model has it. The same
 * model gives the same segment. Throws `Error` when the model is not one the segment can hold: word pieces that do
 * not match the words, events out of order or out of the pieces, a close with an argument, attributes of an event that
 * does not exist.
 */
export function origSegment(m: OrigModel): Segment {
  checkModel(m)

  const words: Record<string, CborValue> = {}
  const cols: Record<string, CborValue> = {}
  for (const name of WORD_ATTRIBUTES) {
    const table = stringTable(m.words.map((word) => word[name]))
    words[name] = table.list
    cols[name] = encodeUvarints(m.words.map((word) => table.index.get(word[name])!))
  }
  words.cols = cols
  if (m.words.some((word) => word.other !== undefined)) {
    words.other = m.words.flatMap((word, i): CborValue[] => (word.other === undefined ? [] : [[i, word.other]]))
  }

  // What lies between words and every argument of an event, in one table.
  const uses: string[] = []
  for (const [text, isWord] of m.pieces) if (!isWord) uses.push(text)
  for (const [, kind, arg] of m.events) if (kind !== 'close') uses.push(arg)
  const seps = stringTable(uses)
  const text: Record<string, CborValue> = {
    seps: seps.list,
    tok: encodeUvarints(m.pieces.map(([piece, isWord]) => (isWord ? 0 : seps.index.get(piece)! + 1))),
  }
  const ev: number[] = []
  let last = 0
  for (const [position, kind, arg] of m.events) {
    ev.push(position - last, eventCode(kind)!, kind === 'close' ? 0 : seps.index.get(arg)!)
    last = position
  }
  text.ev = encodeUvarints(ev)
  if (m.attrs !== undefined) {
    text.attrs = Object.keys(m.attrs)
      .map(Number)
      .sort((a, b) => a - b)
      .map((event): CborValue => [event, m.attrs![event]])
  }

  const tables: Record<string, [number, boolean]> = { words: [1, true], text: [1, true] }
  const t: Record<string, CborValue> = { words, text }
  if (m.macula !== undefined) {
    tables.macula = [1, false]
    const macula: Record<string, CborValue> = { release: m.macula.release }
    if (m.macula.trees !== undefined) macula.trees = m.macula.trees as CborValue
    if (m.macula.referents !== undefined) macula.referents = m.macula.referents as CborValue
    t.macula = macula
  }
  return { h: { class: 'orig', v: 1, tables, book: m.book, orig: [m.key, m.stamp] }, t }
}

// Index

/** What `find` compares when the exact form does not match: without `/` and U+2060, then in NFC. */
function fold(s: string): string {
  // The characters go first: one between a letter and its accent would stop NFC from composing them.
  return s.replace(/[/\u2060]/g, '').normalize('NFC')
}

/** The number a chapter or verse label starts with: `"1-2"` is 1 (`ids.md`, "Verses as published"). */
export function leadingNumber(label: string, what: string): number {
  const match = /^[0-9]+/.exec(label)
  if (match === null) throw new RangeError(`The ${what} label ${JSON.stringify(label)} does not start with a number`)
  return Number(match[0])
}

/** Where the words of an original book are, by verse. Built once from a model. */
export class OrigIndex {
  private readonly words: OrigWord[]
  /** The verse id of each word, by position. */
  private readonly verses: number[] = []
  /** The positions of the words of each verse, in order. */
  private readonly byVerse = new Map<number, number[]>()

  constructor(m: OrigModel) {
    this.words = m.words
    let chapter = 0
    let verse = 0
    let event = 0
    for (let at = 0; at < m.pieces.length; at++) {
      // An event is at the piece it comes before, so those at this position take effect before this piece.
      for (; event < m.events.length && m.events[event][0] <= at; event++) {
        const [, kind, arg] = m.events[event]
        if (kind === 'chapter') {
          chapter = leadingNumber(arg, 'chapter')
          verse = 0
        } else if (kind === 'verse') {
          verse = leadingNumber(arg, 'verse')
        }
      }
      if (!m.pieces[at][1]) continue
      const position = this.verses.length
      const id = verseId(m.book, chapter, verse)
      this.verses.push(id)
      const list = this.byVerse.get(id)
      if (list === undefined) this.byVerse.set(id, [position])
      else list.push(position)
    }
    if (this.verses.length !== m.words.length) {
      throw new Error(`The model has ${m.words.length} words and ${this.verses.length} word pieces`)
    }
  }

  /**
   * The position of the `occurrence`-th word (counting from 1) of verse `verse` whose form is `text`, or `null`. The
   * exact form is tried first; if it has no such occurrence, the folded one (NFC, without `/` and U+2060, on both
   * sides) is. A text that folds to nothing (`""` or `"/"`) names no word: `null`.
   */
  find(verse: number, text: string, occurrence: number): number | null {
    return this.locate(this.byVerse.get(verse), text, occurrence)
  }

  /**
   * {@link find} over the verses from `fromVerse` to `toVerse` (verse ids of one chapter, both included): the occurrences are counted over
   * the words of all of them in order, as a verse bridge (the label `13-14`) counts them. The exact form is tried first, then the folded one, as in
   * {@link find}. `null` when `toVerse` is below `fromVerse`, or when the verses have no such occurrence.
   */
  findInVerses(fromVerse: number, toVerse: number, text: string, occurrence: number): number | null {
    if (!Number.isInteger(fromVerse) || !Number.isInteger(toVerse) || toVerse < fromVerse || toVerse - fromVerse >= 1000) return null
    const positions: number[] = []
    for (let verse = fromVerse; verse <= toVerse; verse++) {
      const own = this.byVerse.get(verse)
      if (own !== undefined) positions.push(...own)
    }
    return this.locate(positions, text, occurrence)
  }

  /**
   * {@link find} as format 2.0's quote layer counts: for the first verse of a chapter, the words of the chapter's introduction (verse 0,
   * what the original writes before `\v 1`: the title of a psalm) come first, and the occurrences are counted over them and the verse
   * together. Any other verse is {@link find}.
   */
  findWithIntro(verse: number, text: string, occurrence: number): number | null {
    const intro = verse % 1000 === 1 ? this.byVerse.get(verse - 1) : undefined
    const own = this.byVerse.get(verse)
    return this.locate(intro === undefined ? own : own === undefined ? intro : [...intro, ...own], text, occurrence)
  }

  private locate(positions: number[] | undefined, text: string, occurrence: number): number | null {
    if (positions === undefined || !Number.isInteger(occurrence) || occurrence < 1) return null
    const folded = fold(text)
    if (folded === '') return null
    const nth = (same: (form: string) => boolean): number | null => {
      let seen = 0
      for (const position of positions) {
        if (same(this.words[position].form) && ++seen === occurrence) return position
      }
      return null
    }
    const exact = nth((form) => form === text)
    if (exact !== null) return exact
    return nth((form) => fold(form) === folded)
  }

  /** The verse id of the word at `position`. Throws `RangeError` for a position that is not a word of the book. */
  verseOf(position: number): number {
    if (!Number.isInteger(position) || position < 0 || position >= this.verses.length) {
      throw new RangeError(`The position ${String(position)} is not a word of this book (0 to ${this.verses.length - 1})`)
    }
    return this.verses[position]
  }
}
