/**
 * The shared model types of format 3: what a builder reads from the sources and what a reader gives back.
 *
 * Plain data, with no code and no import, so that builders and readers can both depend on it. Each segment class adds
 * its model here as its task is written.
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
