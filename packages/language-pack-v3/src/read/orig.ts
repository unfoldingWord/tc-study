/**
 * The reader of the original segment (`spec/cddl/orig.cddl`): a {@link Segment} that `readSegment` has accepted, back
 * into an {@link OrigModel}, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a table of the
 * wrong shape, a column of another length, a number outside its string table, word pieces that do not match the words,
 * an event out of the pieces. It imports no builder code and no Node module.
 */
import { ColumnError, decodeUvarints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, isMap } from '../codec/values'
import { eventKind } from '../events'
import { type Event, type OrigModel, type OrigWord, type Piece, WORD_ATTRIBUTES } from '../model'

function bad(what: string): never {
  throw new FormatError('E_BODY', `the original segment is malformed: ${what}`)
}

function map(value: unknown, what: string): CborMap {
  if (!isMap(value)) bad(`${what} is not a map`)
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
  const source = map(value, what)
  const entries = Object.entries(source)
  if (!entries.every(([, item]) => typeof item === 'string')) bad(`${what} has a value that is not text`)
  return Object.fromEntries(entries) as Record<string, string>
}

/** `[* [n: uint, {* tstr => tstr}]]`: the entries by `n`, each `n` once and below `limit`. */
function entriesOf(value: unknown, what: string, limit: number, noun: string): [number, Record<string, string>][] {
  if (!Array.isArray(value)) bad(`${what} is not a list`)
  const seen = new Set<number>()
  return value.map((entry, i) => {
    if (!Array.isArray(entry) || entry.length !== 2) bad(`${what}[${i}] is not [${noun}, {...}]`)
    const [n, attributes] = entry
    if (typeof n !== 'number' || !Number.isSafeInteger(n) || n < 0 || n >= limit) {
      bad(`${what}[${i}] names the ${noun} ${String(n)}, and there are ${limit}`)
    }
    if (seen.has(n)) bad(`${what} names the ${noun} ${n} twice`)
    seen.add(n)
    return [n, textMap(attributes, `${what}[${i}]`)]
  })
}

function readWords(value: unknown): OrigWord[] {
  const table = map(value, 'the table "words"')
  const tables = Object.fromEntries(WORD_ATTRIBUTES.map((name) => [name, strings(table[name], `words.${name}`)]))
  const cols = map(table.cols, 'words.cols')
  const columns = Object.fromEntries(WORD_ATTRIBUTES.map((name) => [name, numbers(cols[name], `words.cols.${name}`)]))
  const count = columns.form.length
  for (const name of WORD_ATTRIBUTES) {
    if (columns[name].length !== count) bad(`words.cols.${name} has ${columns[name].length} rows and words.cols.form has ${count}`)
  }
  const pick = (name: (typeof WORD_ATTRIBUTES)[number], row: number): string => {
    const found = tables[name][columns[name][row]]
    if (found === undefined) bad(`word ${row} names the ${name} ${columns[name][row]}, and the table has ${tables[name].length}`)
    return found
  }
  const words: OrigWord[] = []
  for (let row = 0; row < count; row++) {
    words.push({ form: pick('form', row), lemma: pick('lemma', row), strong: pick('strong', row), morph: pick('morph', row) })
  }
  if (table.other !== undefined) {
    for (const [word, other] of entriesOf(table.other, 'words.other', count, 'word')) words[word].other = other
  }
  return words
}

function readText(
  value: unknown,
  words: OrigWord[],
): Pick<OrigModel, 'pieces' | 'events'> & { attrs?: Record<number, Record<string, string>> } {
  const table = map(value, 'the table "text"')
  const seps = strings(table.seps, 'text.seps')

  const pieces: Piece[] = []
  let word = 0
  for (const token of numbers(table.tok, 'text.tok')) {
    if (token === 0) {
      if (word >= words.length) bad(`text.tok has more word pieces than the ${words.length} words`)
      // The segment stores 0 for "the next word": its text is the word's form.
      pieces.push([words[word++].form, true])
    } else {
      const sep = seps[token - 1]
      if (sep === undefined) bad(`text.tok names the separator ${token - 1}, and text.seps has ${seps.length}`)
      pieces.push([sep, false])
    }
  }
  if (word !== words.length) bad(`text.tok has ${word} word pieces and there are ${words.length} words`)

  const ev = numbers(table.ev, 'text.ev')
  if (ev.length % 3 !== 0) bad(`text.ev has ${ev.length} numbers, which is not a whole number of events`)
  const events: Event[] = []
  let position = 0
  for (let i = 0; i < ev.length; i += 3) {
    const [since, code, argument] = [ev[i], ev[i + 1], ev[i + 2]]
    const kind = eventKind(code)
    if (kind === undefined) bad(`event ${i / 3} has the code ${code}`)
    position += since
    if (position > pieces.length) bad(`event ${i / 3} is at piece ${position}, and there are ${pieces.length}`)
    if (kind === 'close') {
      if (argument !== 0) bad(`event ${i / 3} closes a node and has the argument ${argument}`)
      events.push([position, kind, ''])
    } else {
      const arg = seps[argument]
      if (arg === undefined) bad(`event ${i / 3} names the string ${argument}, and text.seps has ${seps.length}`)
      events.push([position, kind, arg])
    }
  }

  if (table.attrs === undefined) return { pieces, events }
  const attrs: Record<number, Record<string, string>> = {}
  for (const [event, attributes] of entriesOf(table.attrs, 'text.attrs', events.length, 'event')) attrs[event] = attributes
  return { pieces, events, attrs }
}

/**
 * The model of an original segment. The words' texts come from the `form` table, so the word pieces are rebuilt from
 * them. `macula.trees` and `macula.referents` are the decoded values of the segment, not copies.
 *
 * Throws {@link FormatError} `E_BODY` when the segment is not an original or its tables are not what `orig.cddl` says.
 * A `macula` table that the caller did not list in `known` is not in `seg.t` and the model has none.
 */
export function origView(seg: Segment): OrigModel {
  try {
    const { h, t } = seg
    if (h.class !== 'orig') bad(`the class is "${h.class}"`)
    if (h.book === undefined) bad('the header has no book')
    if (h.orig === undefined) bad('the header has no orig')
    const words = readWords(t.words)
    const model: OrigModel = { book: h.book, key: h.orig[0], stamp: h.orig[1], words, ...readText(t.text, words) }
    if (t.macula !== undefined) {
      const macula = map(t.macula, 'the table "macula"')
      if (typeof macula.release !== 'string') bad('macula.release is not text')
      model.macula = { release: macula.release }
      if (macula.trees !== undefined) model.macula.trees = macula.trees
      if (macula.referents !== undefined) model.macula.referents = macula.referents
    }
    return model
  } catch (error) {
    // A malformed column: a varint that is cut short or not minimal.
    if (error instanceof ColumnError) throw new FormatError('E_BODY', `the original segment is malformed: ${error.message}`)
    throw error
  }
}
