/**
 * The shared model types of format 3: what a builder reads from the sources and what a reader gives back.
 *
 * Plain data, with no import, so that builders and readers can both depend on it. Each segment class adds its model here
 * as its task is written.
 */
import type { CountRows, CountUnit, Coverage, VerseLists } from './codec/counts'

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

/** What a section of an article is for (`spec/cddl/art.cddl`, `section-role`). `intro` is the text before the first heading. */
export const ROLES = [
  'intro',
  'definition',
  'facts',
  'translation-suggestions',
  'examples',
  'strategies',
  'description',
  'reason',
  'bible-references',
  'word-data',
  'unknown',
] as const

export type Role = (typeof ROLES)[number]

/**
 * A section of an article (`art.cddl`, `section`). `level` is 0 for the text before the first heading, else the heading's
 * level; `title` is the heading as published; `lang` is the language the section is written in; `md` is the text of the
 * section without its heading line, with the links rewritten (`ids.md`); `aliases` are the sids it had before it was
 * split, merged or renamed.
 */
export type SectionModel = { sid: string; level: number; role: Role; title?: string; lang: string; md: string; aliases?: string[] }

/**
 * An article of the word (tW) or the Academy (tA) (`art.cddl`, `article`). `id` is its concept (`tw:kt/grace`,
 * `ta:translate/figs-metaphor`); `res` is the key of the resource that published it (`es-419_gl/es-419/tw`).
 */
export type ArticleModel = {
  id: string
  res: string
  title: string
  subtitle?: string
  related?: string[]
  aliases?: string[]
  sections: SectionModel[]
}

/**
 * A sense of a lexicon entry (`spec/cddl/lex.cddl`, `lex-sense`), as the lexicon publishes it. `refs` are verse ranges
 * `[from, to]` (both included) in the original's numbering.
 */
export type LexSense = {
  code?: string
  definition?: string
  glosses?: string[]
  domain?: string
  domainCode?: string
  comments?: string
  etymology?: string
  lang?: string
  definitionLang?: string
  refs?: [number, number][]
}

/**
 * An entry of the lexicon (`lex.cddl`, `lex-entry`). `res` is the key of the resource that published it
 * (`es-419_gl/es-419/ugl`); `strong` is as the lexicon publishes it (`G976`, `H0001`, `G127a`). `brief` and `long` belong to
 * the file the entry came from, and every entry of that file has them.
 */
export type LexEntry = {
  res: string
  strong: string
  lemma: string
  brief?: string
  long?: string
  pos?: string[]
  senses: LexSense[]
  notes?: string[]
  aramaic?: boolean
  source?: string
  review?: string
}

/** A frame of an Open Bible Story (`spec/cddl/obs.cddl`, `frame`): `text` is minimal markdown, `image` the image's URL as published. */
export type ObsFrame = { n: number; text: string; image?: string }

/**
 * A story of Open Bible Stories (`obs.cddl`, `story`). `res` is the key of the resource (`unfoldingWord/en/obs`), `reference` the
 * closing line as published. `refs` (the same as verse ranges) is in the schema and the builder does not build it yet.
 */
export type ObsStory = { res: string; n: number; title: string; reference?: string; refs?: [number, number][]; frames: ObsFrame[] }

/**
 * A note, question, word link, study note or study question of Open Bible Stories (`obs.cddl`, `obs-helps`). `frame` is
 * story × 100 + frame (frame 0 is the story's title or introduction);
 * `ref` is the reference text as published (`10:3`, or `10:03`); `cols` and `concept` are as in {@link HelpRow}.
 */
export type ObsHelpRow = { id: string; ref: string; frame: number; concept?: string; cols: Record<string, string | boolean> }

/** The rows of one helps resource of Open Bible Stories, in the order of the source. */
export type ObsHelpTable = { res: string; rows: ObsHelpRow[] }

/**
 * The Open Bible Stories segment of a language (`obs.cddl`). `res` is exactly what the header holds: the key of each resource
 * and its release tag. A story or a table names its resource by the key. Study notes and study questions have no rows in
 * format 2.0: only a model can carry them.
 */
export type ObsModel = {
  lang: string
  res: [string, string][]
  stories: ObsStory[]
  notes?: ObsHelpTable
  questions?: ObsHelpTable
  links?: ObsHelpTable
  studyNotes?: ObsHelpTable
  studyQuestions?: ObsHelpTable
}

/**
 * The `about` of a catalog (`spec/cddl/catalog.cddl`). `catalog` is the language tag, or `"common"`; `previous` is the id of the
 * revision before (32 bytes); `built` is an RFC 3339 date and time, and the only thing in a catalog that changes with the day.
 */
export type About = {
  format: '3.0'
  catalog: string
  publisher: string
  origin: 'published' | 'local'
  revision: number
  previous?: Uint8Array
  built: string
  builder: string
  name?: string
  direction?: 'ltr' | 'rtl'
}

/** A resource a catalog lists (`catalog.cddl`, `resource`). `books` is the 9-byte book set (`ids.ts`, `bookSet`): all zeros for a resource without books. */
export type CatalogResource = {
  key: string
  title: string
  subject: string
  release: string
  license: string
  rights?: string
  attribution?: string
  books: Uint8Array
}

/** A complement (`catalog.cddl`, `complement`): a file a reader is not obliged to read. `id` is the sha256 of its bytes (32 bytes). */
export type Complement = {
  kind: string
  lang?: string
  id: Uint8Array
  size: number
  media: string
  version: string
  for?: string
  license?: string
}

/**
 * A segment a catalog lists (`catalog.cddl`, `segment-entry`). `id` and `inputs` are 32 bytes; `size` is the length of the file and
 * `ulen` the length of its uncompressed body.
 */
export type SegmentEntry = {
  id: Uint8Array
  class: string
  book?: string
  part?: string
  group?: string
  size: number
  ulen: number
  inputs: Uint8Array
}

/** A unit (`catalog.cddl`, `unit`): `segments` are indexes in the catalog's `segments`; `needs` are unit ids. */
export type Unit = { id: string; segments: number[]; needs?: string[]; optional?: true }

/**
 * A catalog (`catalog.cddl`). `lang` is the header's: set for a language catalog (the same as `about.catalog`), absent in the
 * common catalog. `requires` is `[catalog, revision, id]` with the id as 32 bytes.
 */
export type CatalogModel = {
  lang?: string
  about: About
  resources: CatalogResource[]
  segments: SegmentEntry[]
  units: Unit[]
  requires?: [catalog: string, revision: number, id: Uint8Array][]
  complements?: Complement[]
}

// The common map (`spec/cddl/xmap.cddl`)

export const CONCEPT_KINDS = ['none', 'person', 'place', 'event', 'topic', 'story'] as const
export const TW_CATEGORIES = ['none', 'kt', 'names', 'other'] as const

/** A concept: its kind, its tW category and the key of the resource (an entry of `res`) that defines it. */
export type Concept = { kind: (typeof CONCEPT_KINDS)[number]; tw: (typeof TW_CATEGORIES)[number]; source: string }

/** A typed relation between two concepts (ids), where it comes from (a res key) and how sure it is (0 to 100). */
export type Relation = { from: string; to: string; type: string; source: string; confidence: number }

export type CountTable = { unit: CountUnit; rows: CountRows }

/** The core of the common map. */
export type XmapCore = {
  part: 'core'
  res: [string, string][]
  coverage: Coverage
  strong: CountTable
  concepts: Map<string, Concept>
  links?: CountTable
  notes?: CountTable
  relations?: Relation[]
  aliases?: Record<string, string>
  strongs?: Record<string, string[]>
}

/** The part of one book: the verses behind the counts of the core. `part` is the book code. */
export type XmapPart = { part: string; strong: VerseLists; links?: VerseLists; notes?: VerseLists }

// The language map (`spec/cddl/map.cddl`)

/** A book's names: the name, the short name, the abbreviation, and where they came from. */
export type BookName = [name: string, short: string, abbreviation: string, source: 'text' | 'list' | 'none']

/** The core of a language's map: what the language calls things and what it has. */
export type MapCore = {
  lang: string
  part: 'core'
  res: [string, string][]
  books: BookName[]
  names: Record<string, string[]>
  subtitles?: Record<string, string>
  coverage: Coverage
  usage?: CountTable
  obs?: [number, string][]
}

/** The part of one book: the verses behind the core's `usage`. `part` is the book code. */
export type MapPart = { lang: string; part: string; usage?: VerseLists }

// The common topics (`spec/cddl/xtopics.cddl`) and the language topics (`spec/cddl/topics.cddl`)

/** Index 0 is not a kind: the column `topics.kind` of `xtopics` holds 1 to 6. */
export const TOPIC_KINDS = ['', 'person', 'place', 'event', 'topic', 'story', 'section'] as const
export const TOPIC_NAME_SOURCES = ['alignment', 'outline', 'obs', 'list'] as const

/**
 * A topic of the common topics: its kind, the key of the resource (an entry of `res`) that defines it, the source's own key
 * (`ref`), the English title and the TIPNR uStrong (`""` for none).
 */
export type Topic = { kind: (typeof TOPIC_KINDS)[number]; source: string; ref: string; title: string; ustrong: string }

/** A relation of `xtopics`: an end is a topic of the segment or, if not, a concept of the map (named in `external`). */
export type TopicRelation = Relation

/** The core of the common topics. `occurrences` rows are `[count, verses]` with `count == verses` (unit "verses"). */
export type XtopicsCore = {
  part: 'core'
  res: [string, string][]
  coverage: Coverage
  topics: Map<string, Topic>
  occurrences: CountRows
  relations?: TopicRelation[]
  strongs?: Record<string, string[]>
  ranges?: Record<string, [first: number, last: number][]>
}

/** The part of one book: the verses behind the core's `occurrences`. `part` is the book code. */
export type XtopicsPart = { part: string; occurrences: VerseLists }

/** A name: the text, where it came from, how many times it was found and the books (codes) it was found in. */
export type TopicName = [name: string, source: (typeof TOPIC_NAME_SOURCES)[number], count: number, books: string[]]

/** The core of a language's topics. `local` is the table `local-topics` of `map.cddl`, as the file has it. */
export type TopicsCore = {
  lang: string
  part: 'core'
  res: [string, string][]
  names: Record<string, TopicName[]>
  local?: Record<string, { names: string[]; refs?: [number, number][]; related?: string[] }>
  coverage: Coverage
}

/** The part of one book: the verses each topic's alignment names were taken from. */
export type TopicsPart = { lang: string; part: string; names?: VerseLists }

// The index of aligned phrases (`spec/cddl/aligned.cddl`)

/**
 * One part of a language's index of aligned phrases. `group` is the range of first code points of its keys (`a`, `b-c` or
 * `other`); `res` the bridge texts (`[key, release tag]`). `entries`: key, then Strong key, then book code, to
 * `[verses, occurrences]`. The writer sorts keys, Strong keys and books itself.
 */
export type AlignedModel = {
  lang: string
  group: string
  res: [string, string][]
  entries: Map<string, Map<string, Map<string, [verses: number, occurrences: number]>>>
}
