/**
 * OBS story references: the `_A Bible story from: Exodus 5-10_` line that closes each story of English OBS v9, as pairs
 * of verse ids (`xtopics` `ranges`). English books and numbering are those of the UHB: no conversion. A whole chapter
 * ends at the verse given by `lastVerse(book, chapter)`; the repository has no verse-count table, so without it the
 * end is `LAST_VERSE_OF_CHAPTER` (999), the largest verse number an id holds. No Node module is used.
 */
import { verseId } from '../ids'

/** The end verse used for a whole chapter when the caller gives no verse count. */
export const LAST_VERSE_OF_CHAPTER = 999

/** English book names (lower case) to the codes of `ids.ts`. */
const NAMES: ReadonlyMap<string, string> = new Map(
  'Genesis:gen|Exodus:exo|Leviticus:lev|Numbers:num|Deuteronomy:deu|Joshua:jos|Judges:jdg|Ruth:rut|1 Samuel:1sa|2 Samuel:2sa|1 Kings:1ki|2 Kings:2ki|1 Chronicles:1ch|2 Chronicles:2ch|Ezra:ezr|Nehemiah:neh|Esther:est|Job:job|Psalm:psa|Psalms:psa|Proverbs:pro|Ecclesiastes:ecc|Song of Solomon:sng|Song of Songs:sng|Isaiah:isa|Jeremiah:jer|Lamentations:lam|Ezekiel:ezk|Daniel:dan|Hosea:hos|Joel:jol|Amos:amo|Obadiah:oba|Jonah:jon|Micah:mic|Nahum:nam|Habakkuk:hab|Zephaniah:zep|Haggai:hag|Zechariah:zec|Malachi:mal|Matthew:mat|Mark:mrk|Luke:luk|John:jhn|Acts:act|Romans:rom|1 Corinthians:1co|2 Corinthians:2co|Galatians:gal|Ephesians:eph|Philippians:php|Colossians:col|1 Thessalonians:1th|2 Thessalonians:2th|1 Timothy:1ti|2 Timothy:2ti|Titus:tit|Philemon:phm|Hebrews:heb|James:jas|1 Peter:1pe|2 Peter:2pe|1 John:1jn|2 John:2jn|3 John:3jn|Jude:jud|Revelation:rev'
    .split('|')
    .map((pair) => pair.split(':') as [string, string])
    .map(([name, code]) => [name.toLowerCase(), code] as [string, string]),
)

const LINE = /^_A Bible story from:\s*(.+?)_\s*$/m
const WITH_BOOK = /^((?:[1-3] )?[A-Za-z][A-Za-z ]*?)\s+(\d.*)$/
const PLACE = /^(\d+)(?::(\d+))?(?:-(\d+)(?::(\d+))?)?$/

/**
 * The ranges of the closing line of each story (`stories`: number to its text). A piece that cannot be read is
 * described in `issues` and skipped; a story without the line, or with no readable piece, is reported and left out.
 */
export function parseObsRefs(
  stories: Map<number, string>,
  issues: string[],
  lastVerse?: (book: string, chapter: number) => number | undefined,
): Map<number, [number, number][]> {
  const out = new Map<number, [number, number][]>()
  for (const [story, text] of stories) {
    const m = LINE.exec(text)
    if (!m) {
      issues.push(`obs:${story}: no "A Bible story from" line`)
      continue
    }
    const ranges: [number, number][] = []
    let book: string | null = null
    for (const raw of m[1].split(/[;,]/)) {
      const piece = raw.trim()
      let rest = piece
      const wb = WITH_BOOK.exec(piece)
      if (wb) {
        const code = NAMES.get(wb[1].toLowerCase())
        if (!code) {
          issues.push(`obs:${story}: unknown book in ${JSON.stringify(piece)}`)
          book = null
          continue
        }
        book = code
        rest = wb[2]
      }
      const p = PLACE.exec(rest)
      if (!book || !p) {
        issues.push(`obs:${story}: cannot read ${JSON.stringify(piece)}`)
        continue
      }
      const end = (c: number) => lastVerse?.(book as string, c) ?? LAST_VERSE_OF_CHAPTER
      const c1 = Number(p[1])
      let range: [number, number]
      if (p[2] === undefined && p[4] !== undefined) {
        // "3-4:22": from the first verse of chapter 3 to 4:22
        range = [verseId(book, c1, 1), verseId(book, Number(p[3]), Number(p[4]))]
      } else if (p[2] === undefined) {
        // whole chapters: "3" or "5-10"
        const c2 = p[3] === undefined ? c1 : Number(p[3])
        range = [verseId(book, c1, 1), verseId(book, c2, end(c2))]
      } else if (p[3] === undefined) {
        range = [verseId(book, c1, Number(p[2])), verseId(book, c1, Number(p[2]))]
      } else if (p[4] === undefined) {
        range = [verseId(book, c1, Number(p[2])), verseId(book, c1, Number(p[3]))]
      } else {
        range = [verseId(book, c1, Number(p[2])), verseId(book, Number(p[3]), Number(p[4]))]
      }
      if (range[1] < range[0]) issues.push(`obs:${story}: range runs backwards in ${JSON.stringify(piece)}`)
      else ranges.push(range)
    }
    if (ranges.length > 0) out.set(story, ranges)
    else issues.push(`obs:${story}: no readable reference`)
  }
  return out
}
