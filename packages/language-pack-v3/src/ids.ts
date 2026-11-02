/**
 * Ids, references and links of format 3 (`spec/ids.md`).
 *
 * Pure functions on strings and numbers, with no Node module, so builders and readers run in a browser and in a
 * Worker. A book is its USFM code in lowercase; a verse is the integer `LLCCCVVV` (book number, chapter, verse); a
 * concept is a namespace and a name (`tw:kt/grace`).
 */

/** The 66 books in the canonical order of `ids.md`. The number of a book is its index here plus 1. */
export const BOOKS: readonly string[] = Object.freeze([
  // Old Testament
  'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa', '1ki', '2ki', '1ch', '2ch',
  'ezr', 'neh', 'est', 'job', 'psa', 'pro', 'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos',
  'jol', 'amo', 'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal',
  // New Testament
  'mat', 'mrk', 'luk', 'jhn', 'act', 'rom', '1co', '2co', 'gal', 'eph', 'php', 'col', '1th', '2th', '1ti', '2ti',
  'tit', 'phm', 'heb', 'jas', '1pe', '2pe', '1jn', '2jn', '3jn', 'jud', 'rev',
])

const BOOK_NUMBERS: ReadonlyMap<string, number> = new Map(BOOKS.map((code, index) => [code, index + 1]))

const BOOK_FACTOR = 1_000_000
const CHAPTER_FACTOR = 1_000
const MAX_PART = 999

/** The number of a book, from 1 (`gen`) to 66 (`rev`). Throws `RangeError` for a code that is not one of the 66. */
export function bookNumber(code: string): number {
  const number = BOOK_NUMBERS.get(code)
  if (number === undefined) throw new RangeError(`unknown book code: ${JSON.stringify(code)}`)
  return number
}

function checkPart(name: string, value: number): void {
  if (!Number.isInteger(value) || value < 0 || value > MAX_PART) {
    throw new RangeError(`${name} must be an integer from 0 to ${MAX_PART}, got ${String(value)}`)
  }
}

/**
 * The id `LLCCCVVV` of a verse: `verseId('tit', 2, 11)` is `56002011`. Verse 0 is the introduction of the chapter and
 * chapter 0 the introduction of the book. Throws `RangeError` for an unknown book or a chapter or verse outside 0-999.
 */
export function verseId(book: string, chapter: number, verse: number): number {
  const number = bookNumber(book)
  checkPart('chapter', chapter)
  checkPart('verse', verse)
  return number * BOOK_FACTOR + chapter * CHAPTER_FACTOR + verse
}

// References

/** A number of a reference: 1 to 999, without leading zeros. */
const N = '([1-9][0-9]{0,2})'

const REF_BOOK_INTRO = /^front:intro$/
const REF_CHAPTER_INTRO = new RegExp(`^${N}:intro$`)
const REF_VERSE = new RegExp(`^${N}:${N}$`)
const REF_VERSES = new RegExp(`^${N}:${N}-${N}$`)
const REF_ACROSS = new RegExp(`^${N}:${N}-${N}:${N}$`)

/**
 * The range of verse ids that a reference of a TSV row names, both ends included, or `null` when the text is anything
 * else. It never throws, not even for a book that is not one of the 66.
 *
 * Accepted forms, without spaces and without leading zeros:
 * `front:intro` (the book's introduction), `N:intro`, `N:V`, `N:V1-V2` and `N1:V1-N2:V2`. A list (`1:1,3`), `0:0`, a
 * range that runs backwards and any other text give `null`.
 */
export function parseRef(book: string, ref: string): [number, number] | null {
  if (!BOOK_NUMBERS.has(book)) return null
  const id = (chapter: string, verse: string) => verseId(book, Number(chapter), Number(verse))
  let m: RegExpExecArray | null
  if (REF_BOOK_INTRO.test(ref)) {
    const from = id('0', '0')
    return [from, from]
  }
  if ((m = REF_CHAPTER_INTRO.exec(ref))) {
    const from = id(m[1], '0')
    return [from, from]
  }
  if ((m = REF_VERSE.exec(ref))) {
    const from = id(m[1], m[2])
    return [from, from]
  }
  if ((m = REF_VERSES.exec(ref))) {
    const from = id(m[1], m[2])
    const to = id(m[1], m[3])
    return to >= from ? [from, to] : null
  }
  if ((m = REF_ACROSS.exec(ref))) {
    const from = id(m[1], m[2])
    const to = id(m[3], m[4])
    return to >= from ? [from, to] : null
  }
  return null
}

/** Chapter and verse of an id of `book`, or a `RangeError` when the id is not in that book. */
function splitId(book: string, id: number): { chapter: number; verse: number } {
  const number = bookNumber(book)
  if (!Number.isSafeInteger(id) || id < 0 || Math.floor(id / BOOK_FACTOR) !== number) {
    throw new RangeError(`verse id ${String(id)} is not in the book ${book}`)
  }
  const rest = id % BOOK_FACTOR
  return { chapter: Math.floor(rest / CHAPTER_FACTOR), verse: rest % CHAPTER_FACTOR }
}

/**
 * The canonical text of a range, the inverse of {@link parseRef}: `front:intro`, `2:intro`, `2:11`, `1:2-4` or
 * `1:12-2:3`. Throws `RangeError` when the range is not expressible: an id of another book, `from` after `to`, or an
 * introduction inside a range of several verses.
 */
export function formatRef(book: string, from: number, to: number): string {
  const a = splitId(book, from)
  const b = splitId(book, to)
  if (from > to) throw new RangeError(`the range ${String(from)}-${String(to)} runs backwards`)
  if (from === to) {
    if (a.chapter === 0) {
      if (a.verse !== 0) throw new RangeError(`verse id ${String(from)} has verse ${a.verse} in chapter 0`)
      return 'front:intro'
    }
    return a.verse === 0 ? `${a.chapter}:intro` : `${a.chapter}:${a.verse}`
  }
  if (a.chapter === 0 || a.verse === 0 || b.verse === 0) {
    throw new RangeError(`the range ${String(from)}-${String(to)} has an introduction inside it`)
  }
  return a.chapter === b.chapter
    ? `${a.chapter}:${a.verse}-${b.verse}`
    : `${a.chapter}:${a.verse}-${b.chapter}:${b.verse}`
}

// Book sets

/**
 * The `book-set` of `common.cddl`: 9 bytes, one bit per book of the canonical order. Bit `n - 1` is the book number
 * `n`, least significant bit first within a byte. Throws `RangeError` for a code that is not one of the 66.
 */
export function bookSet(books: Iterable<string>): Uint8Array {
  const out = new Uint8Array(Math.ceil(BOOKS.length / 8))
  for (const code of books) {
    const bit = bookNumber(code) - 1
    out[bit >> 3] |= 1 << (bit & 7)
  }
  return out
}

// Strong keys

/**
 * The key under which the maps count a Strong number: what the original publishes after its last `:` (`b:H4999` is
 * `H4999`; `H7462b` and the Greek `G54850` have no `:` and stay as they are).
 */
export function strongKey(published: string): string {
  return published.slice(published.lastIndexOf(':') + 1)
}

// Concepts

/**
 * The language part of an `rc://` address: `*` (any language) or a language code (`es-419`). The SupportReference column
 * of a tN row writes `*`; the links inside the text of a translated note write the language of the note.
 */
const RC_LANGUAGE = String.raw`(?:\*|[a-z]{2,3}(?:-[a-z0-9]+)*)`

// The manual and the category are lowercase; the slug or name may be published with capitals (`figs-orderHeb`) and the id is lowercase.
const TA_ADDRESS = new RegExp(String.raw`^rc://${RC_LANGUAGE}/ta/man/([a-z0-9_-]+)/([A-Za-z0-9_-]+)$`)
const TW_ADDRESS = new RegExp(String.raw`^rc://${RC_LANGUAGE}/tw/dict/bible/(kt|names|other)/([A-Za-z0-9_-]+)$`)

/**
 * The concept of a SupportReference: `rc://*\/ta/man/translate/figs-metaphor` is `ta:translate/figs-metaphor`. A language
 * code in place of the `*` (`rc://es-419/ta/man/...`) means the same. A slug published with capitals gives a lowercase id
 * (`rc://*\/ta/man/translate/figs-orderHeb` is `ta:translate/figs-orderheb`, `ids.md`, "Concepts"). `null` for any other text.
 */
export function conceptOfSupportReference(s: string): string | null {
  const m = TA_ADDRESS.exec(s)
  return m ? `ta:${m[1]}/${m[2].toLowerCase()}` : null
}

/**
 * The concept of a TWLink: `rc://*\/tw/dict/bible/kt/grace` is `tw:kt/grace`; a name with capitals gives a lowercase id. `null`
 * for any other text, and for a category other than `kt`, `names` and `other`.
 */
export function conceptOfTwLink(s: string): string | null {
  const m = TW_ADDRESS.exec(s)
  return m ? `tw:${m[1]}/${m[2].toLowerCase()}` : null
}

// Links inside text

const TN_ADDRESS = new RegExp(String.raw`^rc://${RC_LANGUAGE}/tn/help/([a-z0-9]{3})/(\d{1,3})/(\d{1,3})$`)
const RELATIVE_ADDRESS = /^\.\.\/(\d{1,3})\/(\d{1,3})\.md$/

/** One pass over both link forms: `[[rc://...]]` and `[text](target)`. */
const LINK = /\[\[(rc:\/\/[^\]]*)\]\]|\[([^\]]*)\]\(([^)]*)\)/g

/** `ref:tit 2:3` for a chapter and a verse written as digits, or `null` if they are not a verse of the book. */
function verseLink(book: string, chapter: string, verse: string): string | null {
  const ref = `${Number(chapter)}:${Number(verse)}`
  return parseRef(book, ref) ? `ref:${book} ${ref}` : null
}

/**
 * Rewrites the `rc://` and relative links of a note, question or article as ids (`ids.md`, "Links inside text"):
 *
 * - `[[rc://*\/ta/man/translate/figs-metaphor]]` becomes `[[ta:translate/figs-metaphor]]`;
 * - `[[rc://*\/tw/dict/bible/kt/grace]]` becomes `[[tw:kt/grace]]`;
 * - `[text](rc://*\/tn/help/tit/02/03)` becomes `[text](ref:tit 2:3)`;
 * - `[text](../02/03.md)` becomes `[text](ref:{book} 2:3)`, where `book` is the book the text belongs to.
 *
 * In the three `rc://` forms the `*` may be a language code: a translated note writes `[[rc://es-419/ta/man/...]]`.
 *
 * A link in any other form is kept as it is, and so is any text outside a link. With `book === null` the relative
 * links are kept, because there is no book to resolve them against. The text is read once, so what the rewrite
 * writes is never read again. Throws `RangeError` when `book` is not null and not one of the 66.
 */
export function rewriteLinks(md: string, book: string | null): string {
  if (book !== null) bookNumber(book)
  return md.replace(LINK, (whole: string, address: string | undefined, text: string, target: string) => {
    if (address !== undefined) {
      const concept = conceptOfSupportReference(address) ?? conceptOfTwLink(address)
      return concept === null ? whole : `[[${concept}]]`
    }
    const tn = TN_ADDRESS.exec(target)
    if (tn) {
      const ref = verseLink(tn[1], tn[2], tn[3])
      return ref === null ? whole : `[${text}](${ref})`
    }
    const relative = RELATIVE_ADDRESS.exec(target)
    if (relative && book !== null) {
      const ref = verseLink(book, relative[1], relative[2])
      return ref === null ? whole : `[${text}](${ref})`
    }
    return whole
  })
}

// TSV escapes

/** The escapes of a TSV cell in note, question and response: `\n` (a backslash and an n) and `<br>` are line breaks. */
export function unescapeTsv(s: string): string {
  return s.replace(/\\n|<br>/g, '\n')
}
