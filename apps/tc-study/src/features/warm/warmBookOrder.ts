/**
 * Whole-Bible warm fill — Protestant canon order, wrap from the current book.
 * Lane 3 walks this list until every book/chapter is covered (throttled per pass).
 */

import { BOOK_CHAPTER_COUNTS, knownChapterCount } from '../nav/bookChapterCounts'

/** Protestant OT + NT book codes in canon order (matches BOOK_CHAPTER_COUNTS). */
export const CANON_BOOK_ORDER: readonly string[] = Object.keys(BOOK_CHAPTER_COUNTS)

/** Max new lane-3 jobs admitted per maybeAdmitLane3 pass. Resume on job-done. */
export const LANE3_JOBS_PER_PASS = 32

/** OBS stories when ingredients / TOC are missing. */
export const OBS_STORY_COUNT = 50

/**
 * Books to fill from `fromBook`, wrapping through the full canon.
 * Unknown codes are emitted first, then the whole canon (so OT still fills).
 */
export function nextCanonBooks(fromBook: string): string[] {
  const cur = fromBook.toLowerCase()
  const idx = CANON_BOOK_ORDER.indexOf(cur)
  if (idx < 0) return cur ? [cur, ...CANON_BOOK_ORDER] : [...CANON_BOOK_ORDER]
  return [...CANON_BOOK_ORDER.slice(idx), ...CANON_BOOK_ORDER.slice(0, idx)]
}

/** Next chapters of `book` whose job keys are not yet admitted, up to `budget`. */
export function nextUnadmittedChapters(args: {
  book: string
  admittedKeys: Iterable<string>
  jobKey: (chapter: number) => string
  budget: number
  /** Override when the book is not in BOOK_CHAPTER_COUNTS (e.g. OBS stories). */
  last?: number
}): number[] {
  const admitted =
    args.admittedKeys instanceof Set ? args.admittedKeys : new Set(args.admittedKeys)
  const last = args.last ?? knownChapterCount(args.book)
  const out: number[] = []
  for (let ch = 1; ch <= last && out.length < args.budget; ch++) {
    if (admitted.has(args.jobKey(ch))) continue
    out.push(ch)
  }
  return out
}

/**
 * Current-book chapter order for lane 2: adjacent first, then the rest.
 * Visible resources skip current + adjacent (lane 1 already owns those).
 */
export function nextCurrentBookChapters(args: {
  chapter: number
  lastChapter: number
  skipCurrentAndAdjacent?: boolean
}): number[] {
  const last = args.lastChapter
  const ch = args.chapter
  if (last < 1) return []
  const adj = [ch - 1, ch + 1].filter((c) => c >= 1 && c <= last)
  const rest: number[] = []
  for (let c = 1; c <= last; c++) {
    if (c === ch || adj.includes(c)) continue
    rest.push(c)
  }
  if (args.skipCurrentAndAdjacent) return rest
  const withCurrent = [ch, ...rest].filter((c) => c >= 1 && c <= last)
  return [...adj, ...withCurrent]
}
