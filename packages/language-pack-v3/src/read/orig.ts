/**
 * The reader of the original segment (`spec/cddl/orig.cddl`): a {@link Segment} that `readSegment` has accepted, back
 * into an {@link OrigModel}, the output the conformance cases expect (`tests/README.md`, "Reader output").
 *
 * It checks the tables against the schema and rejects the segment with `E_BODY` at the first defect: a table of the
 * wrong shape, a column of another length, a number outside its string table, word pieces that do not match the words,
 * an event out of the pieces. It imports no builder code and no Node module.
 */
import { ColumnError, decodeDeltas, decodeUvarints } from '../codec/columns'
import type { Segment } from '../codec/container'
import { FormatError } from '../codec/errors'
import { type CborMap, isMap } from '../codec/values'
import { eventKind } from '../events'
import { type Event, type MaculaReferents, type MaculaTrees, type OrigModel, type OrigWord, type Piece, WORD_ATTRIBUTES } from '../model'

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

function readTrees(value: unknown, n: number): MaculaTrees {
  const table = map(value, 'macula.trees')
  const labels = strings(table.labels, 'macula.trees.labels')
  const pieces = strings(table.pieces, 'macula.trees.pieces')
  if (!(table.lo instanceof Uint8Array)) bad('macula.trees.lo is not a byte string')
  const lo = decodeDeltas(table.lo)
  const span = numbers(table.span, 'macula.trees.span')
  const nodes = table.nodes
  if (!Array.isArray(nodes) || !nodes.every((node) => node instanceof Uint8Array)) bad('macula.trees.nodes is not a list of byte strings')
  if (lo.length !== span.length || lo.length !== nodes.length) {
    bad(`macula.trees has ${lo.length} lo, ${span.length} span and ${nodes.length} nodes`)
  }
  for (let i = 0; i < lo.length; i++) {
    // Tested without overflow: lo + span < n.
    if (span[i] > n - 1) bad(`sentence ${i} has the span ${span[i]}, and the book has ${n} words`)
    if (lo[i] < 0 || lo[i] > n - 1 - span[i]) bad(`sentence ${i} starts at ${lo[i]} with the span ${span[i]}, and the book has ${n} words`)
  }
  return { labels, pieces, lo, span, nodes: nodes as Uint8Array[] }
}

function readReferents(value: unknown, n: number): MaculaReferents {
  const table = map(value, 'macula.referents')
  const kinds = strings(table.kinds, 'macula.referents.kinds')
  const pieces = strings(table.pieces, 'macula.referents.pieces')
  if (!Array.isArray(table.ents)) bad('macula.referents.ents is not a list')
  const ents = table.ents.map((ent, i): [string, string] => {
    if (!Array.isArray(ent) || ent.length !== 2 || typeof ent[0] !== 'string' || typeof ent[1] !== 'string') {
      bad(`macula.referents.ents[${i}] is not [text, text]`)
    }
    return [ent[0], ent[1]]
  })
  const cols = map(table.cols, 'macula.referents.cols')
  const col = (name: string): number[] => numbers(cols[name], `macula.referents.cols.${name}`)
  const [deltas, kind, piece, ent, ch, vs, ante] = ['word', 'kind', 'piece', 'ent', 'ch', 'vs', 'ante'].map(col)
  const rows = deltas.length
  for (const [name, list] of Object.entries({ kind, piece, ent, ch, vs, ante })) {
    if (list.length !== rows) bad(`macula.referents.cols.${name} has ${list.length} rows and cols.word has ${rows}`)
  }
  const word: number[] = []
  let at = 0
  for (let row = 0; row < rows; row++) {
    at += deltas[row]
    word.push(at)
    if (at >= n) bad(`referent row ${row} is at the word ${at}, and the book has ${n} words`)
    if (kind[row] >= kinds.length) bad(`referent row ${row} names the kind ${kind[row]}, and there are ${kinds.length}`)
    if (piece[row] >= pieces.length) bad(`referent row ${row} names the piece ${piece[row]}, and there are ${pieces.length}`)
    if (ent[row] >= ents.length) bad(`referent row ${row} names the entity ${ent[row]}, and there are ${ents.length}`)
    if (ch[row] === 0 || vs[row] === 0) bad(`referent row ${row} has the chapter ${ch[row]} and the verse ${vs[row]}`)
    if (ante[row] > n) bad(`referent row ${row} has the antecedent ${ante[row]}, and the book has ${n} words`)
  }
  return { ents, kinds, pieces, word, kind, piece, ent, ch, vs, ante }
}

/** The tables this reader knows, as `readSegment` takes them in `known`. */
export const ORIG_TABLES: Readonly<Record<string, number[]>> = { words: [1], text: [1], macula: [1, 2] }

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
      if (h.tables.macula?.[0] === 2) {
        const v2: Extract<NonNullable<OrigModel['macula']>, { v: 2 }> = { release: macula.release, v: 2 }
        if (macula.trees !== undefined) v2.trees = readTrees(macula.trees, words.length)
        if (macula.referents !== undefined) v2.referents = readReferents(macula.referents, words.length)
        model.macula = v2
      } else {
        const v1: { release: string; v: 1; trees?: unknown; referents?: unknown } = { release: macula.release, v: 1 }
        if (macula.trees !== undefined) v1.trees = macula.trees
        if (macula.referents !== undefined) v1.referents = macula.referents
        model.macula = v1
      }
    }
    return model
  } catch (error) {
    // A malformed column: a varint that is cut short or not minimal.
    if (error instanceof ColumnError) throw new FormatError('E_BODY', `the original segment is malformed: ${error.message}`)
    throw error
  }
}
