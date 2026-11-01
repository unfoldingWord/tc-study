/**
 * The shared model types of format 3: what a builder reads from the sources and what a reader gives back.
 *
 * Plain data, with no import, so that builders and readers can both depend on it. Each segment class adds its model here
 * as its task is written.
 */

/**
 * Structure inside a sequence of pieces (`spec/cddl/book.cddl`, "Texts"): at `position`, the number of pieces before
 * the event, a chapter or a verse starts, a node opens (`arg` is `"type:marker"`, as in USJ), or the last open node
 * closes (`arg` is `""`). For a chapter or a verse `arg` is its number as published (`"1"`, `"1-2"`).
 */
export type Event = [position: number, kind: 'chapter' | 'verse' | 'open' | 'close', arg: string]

/** A piece of a text: a word of the original (`isWord`) or what lies between words. Joining the pieces gives the text. */
export type Piece = [text: string, isWord: boolean]

/**
 * A word of the original (a `\w`). A missing attribute is `""`. `other` holds every other attribute of the word, under
 * the key the source publishes it with.
 */
export type OrigWord = { form: string; lemma: string; strong: string; morph: string; other?: Record<string, string> }

/** The four attributes of a word that have a table of their own (`orig.cddl`, `orig-words`), in the order the segment lists them. */
export const WORD_ATTRIBUTES = ['form', 'lemma', 'strong', 'morph'] as const satisfies readonly (keyof OrigWord)[]

/**
 * One book of the original (UGNT or UHB). A word's position is its index in `words`; `pieces` has one word piece per
 * word, in the same order, and its text is the word's `form`. `attrs` keys the attributes of the few nodes that have
 * them by the index of the event that opens the node.
 */
export type OrigModel = {
  book: string
  /** The resource key, `unfoldingWord/el-x-koine/ugnt`. */
  key: string
  /** What other segments name to say which original their positions belong to (`ids.md`, "Positions in the original"). */
  stamp: string
  words: OrigWord[]
  pieces: Piece[]
  events: Event[]
  attrs?: Record<number, Record<string, string>>
  macula?: { release: string; trees?: unknown; referents?: unknown }
}

/**
 * A bridge text of a book (`spec/cddl/book.cddl`, "Texts"): its pieces and events as in {@link OrigModel}, and which
 * words of the original each of its words translates.
 *
 * - `res` is the resource key of the text (`es-419_gl/es-419/glt`).
 * - `align` has one list per word (the word's ordinal among the word pieces, not the index of its piece): the positions
 *   in the original (`ids.md`) of the words it translates, in the order of the milestones that enclose it, outer first.
 *   An empty list is a word that is not aligned.
 * - `alignMissing` has one entry per word and milestone that the source aligns to a word this original edition does not
 *   have: the word's ordinal, the verse id, the `x-content` and the `x-occurrence` the source names.
 * - `align` is there if and only if some word has a position or `alignMissing` has an entry: a text with neither is
 *   a text without alignment, and has neither field.
 */
export type TextModel = {
  res: string
  pieces: Piece[]
  events: Event[]
  attrs?: Record<number, Record<string, string>>
  align?: number[][]
  alignMissing?: [word: number, verse: number, original: string, occurrence: number][]
}

/** The columns of a helps table that hold long text, which the segment keeps as `texts` (`book.cddl`, "cols"). */
export const LONG_TEXT_COLUMNS: readonly string[] = ['note', 'question', 'response']

/**
 * A note, question or word link of a book (`spec/cddl/book.cddl`, "Notes, questions and word links"). `ref` is the
 * reference text as published; `from` and `to` are verse ids, both included. `cols` holds the other fields of the row
 * (a field a row lacks is not a key).
 *
 * `quote` is the original positions of the words of the quote, in the order of the quote (`-1` for a piece that has no
 * position: a word the original does not have, or a piece that is not a word). `quoteKinds` names the pieces of the quote
 * that are not words (`[piece, kind]`, an ellipsis), and `quoteMissing` the words the original does not have
 * (`[piece, verse, word, occurrence]`); each `-1` is in exactly one of them. Both are there only when they have entries.
 *
 * A table has `quote` on every row (`[]` for a row with no quote, or whose quote was not found) or on none: the segment
 * keeps the quotes of a table if some row has a piece. Whether a row has a quote at all is in `cols.quote`, the text.
 */
export type HelpRow = {
  id: string
  ref: string
  from: number
  to: number
  concept?: string
  cols: Record<string, string | boolean>
  quote?: number[]
  quoteKinds?: [piece: number, kind: string][]
  quoteMissing?: [piece: number, verse: number, word: string, occurrence: number][]
}

/** The rows of one helps resource (notes, questions or word links) of a book, in the order of the source. */
export type HelpTable = { res: string; rows: HelpRow[] }

/**
 * A book segment (`spec/cddl/book.cddl`). `orig` is the `[key, stamp]` of the original book the positions of the
 * alignment and the quotes belong to. `res` is exactly what the header holds: the key of each resource and its release
 * tag (`v42`, the part of the stamp before the `#`). A text or a table names its resource by the key.
 */
export type BookModel = {
  lang: string
  book: string
  orig: [string, string]
  res: [string, string][]
  texts: TextModel[]
  notes?: HelpTable
  questions?: HelpTable
  links?: HelpTable
}
