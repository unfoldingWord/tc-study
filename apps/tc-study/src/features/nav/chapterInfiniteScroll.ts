/**
 * Chapter-mode scroll decisions (edge-reveal).
 *
 * Paint only revealed chapters (max 3). Intentional elastic overscroll appends
 * the next chapter underneath (or previous above), then unloads the farthest
 * chapter to keep performance. Neighbors stay warm in the prepared cache
 * before they are revealed.
 */

export type ChapterSlotKind = 'rendered' | 'paragraph'

export interface ChapterSlot {
  chapter: number
  kind: ChapterSlotKind
}

/** Painted content is a stack of up to this many chapters. */
export const MAX_MOUNTED_CHAPTERS = 3
/** Long enough that a continuous slow scroll stays “scrolling”, not a chain of settles. */
export const SETTLE_HOLD_MS = 280
/**
 * After edge-reveal, nudge this far toward the new chapter so its incoming
 * edge/title peeks in. Not a snap-to-heading reset and not a travel pad.
 */
export const CHAPTER_REVEAL_PEEK_PX = 56
/**
 * Extra hold after settle before mounting token trees / swapping light→full.
 * Settle already waited {@link SETTLE_HOLD_MS}; keep this at 0 so helps
 * underlines/highlights can paint on the settled chapter immediately.
 */
export const FULL_TIER_HOLD_MS = 0

export function isChapterInfiniteScrollEnabled(
  navigationMode: string,
  book: string
): boolean {
  return navigationMode === 'chapter' && book !== 'obs'
}

/** Open chapter only — neighbors warm in cache until edge reveal. */
export function singlePaintedChapterSlots(
  chapter: number,
  kind: ChapterSlotKind = 'paragraph'
): ChapterSlot[] {
  return [{ chapter: Math.max(1, chapter), kind }]
}

/**
 * Append/prepend a revealed chapter under/above the stack, then unload from the
 * opposite end so at most `maxMounted` content chapters stay painted.
 */
export function revealChapterInWindow(
  prev: readonly ChapterSlot[],
  target: number,
  direction: 'next' | 'previous',
  lastChapter: number,
  maxMounted = MAX_MOUNTED_CHAPTERS
): ChapterSlot[] {
  if (!chapterInBook(target, lastChapter)) return [...prev]

  const painted = new Map<number, ChapterSlotKind>()
  for (const slot of prev) painted.set(slot.chapter, slot.kind)
  const existing = painted.get(target)
  painted.set(target, existing === 'rendered' ? 'rendered' : 'paragraph')

  const chapters = [...painted.keys()]
    .filter((chapter) => chapterInBook(chapter, lastChapter))
    .sort((a, b) => a - b)

  while (chapters.length > maxMounted) {
    if (direction === 'next') chapters.shift()
    else chapters.pop()
  }

  return chapters.map((chapter) => ({
    chapter,
    kind: painted.get(chapter) === 'rendered' ? 'rendered' : 'paragraph',
  }))
}

/** Chapter at the low or high edge of the painted stack. */
export function paintedStackEdgeChapter(
  slots: readonly ChapterSlot[],
  edge: 'min' | 'max'
): number | null {
  const chapters = contentChaptersFromSlots(slots)
  if (chapters.length === 0) return null
  return edge === 'min' ? Math.min(...chapters) : Math.max(...chapters)
}

/** Next chapter to reveal via elastic overscroll at the stack edge. */
export function edgeRevealTargetChapter(
  slots: readonly ChapterSlot[],
  direction: 'next' | 'previous',
  lastChapter: number
): number | null {
  const from = paintedStackEdgeChapter(slots, direction === 'next' ? 'max' : 'min')
  if (from == null) return null
  const target = adjacentChapterToRequest(from, direction === 'next' ? 'next' : 'prev', lastChapter)
  if (target == null) return null
  if (contentChaptersFromSlots(slots).includes(target)) return null
  return target
}

export function canRevealChapterAtEdge(
  slots: readonly ChapterSlot[],
  direction: 'next' | 'previous',
  lastChapter: number
): boolean {
  return edgeRevealTargetChapter(slots, direction, lastChapter) != null
}

export function lastChapterNumber(chapterNumbers: readonly number[]): number {
  if (chapterNumbers.length === 0) return 0
  return Math.max(...chapterNumbers)
}

export function chapterInBook(chapter: number, lastChapter: number): boolean {
  return chapter >= 1 && lastChapter >= 1 && chapter <= lastChapter
}

export function adjacentChapterToRequest(
  fromChapter: number,
  direction: 'next' | 'prev',
  lastChapter: number
): number | null {
  const next = direction === 'next' ? fromChapter + 1 : fromChapter - 1
  return chapterInBook(next, lastChapter) ? next : null
}

export function chapterWindowAround(settled: number, lastChapter: number): number[] {
  const out: number[] = []
  const prev = adjacentChapterToRequest(settled, 'prev', lastChapter)
  const next = adjacentChapterToRequest(settled, 'next', lastChapter)
  if (prev != null) out.push(prev)
  if (chapterInBook(settled, lastChapter)) out.push(settled)
  if (next != null) out.push(next)
  return out
}

export function slotsEqual(a: readonly ChapterSlot[], b: readonly ChapterSlot[]): boolean {
  return (
    a.length === b.length &&
    a.every((slot, i) => slot.chapter === b[i]!.chapter && slot.kind === b[i]!.kind)
  )
}

/** After the upgrade hold, replace paragraph text with the full token tree. */
export function upgradeSlot(slots: readonly ChapterSlot[], chapter: number): ChapterSlot[] {
  return slots.map((slot) =>
    slot.chapter === chapter && slot.kind === 'paragraph'
      ? { chapter, kind: 'rendered' as const }
      : slot
  )
}

export function contentChaptersFromSlots(slots: readonly ChapterSlot[]): number[] {
  return slots.map((slot) => slot.chapter)
}

export function paragraphChaptersFromSlots(slots: readonly ChapterSlot[]): number[] {
  return slots.filter((slot) => slot.kind === 'paragraph').map((slot) => slot.chapter)
}

export function viewportSettledChapter(
  entries: ReadonlyArray<{ chapter: number; top: number; bottom: number }>,
  rootTop: number,
  rootBottom: number
): number | null {
  if (entries.length === 0) return null
  const span = Math.max(1, rootBottom - rootTop)
  const readLine = rootTop + Math.min(80, span * 0.2)
  const containing = entries.filter((entry) => entry.top <= readLine && entry.bottom > readLine)
  if (containing.length > 0) {
    return [...containing].sort((a, b) => b.top - a.top)[0]!.chapter
  }
  const visible = entries
    .map((entry) => {
      const top = Math.max(entry.top, rootTop)
      const bottom = Math.min(entry.bottom, rootBottom)
      return { entry, visible: Math.max(0, bottom - top) }
    })
    .filter((item) => item.visible > 0)
    .sort((a, b) => b.visible - a.visible)
  return visible[0] ? visible[0].entry.chapter : null
}

/**
 * At the document end, a short last chapter can sit below the read-line
 * while the previous chapter still owns it. Prefer the last visible slot.
 */
export function settleViewportChapter(args: {
  entries: ReadonlyArray<{ chapter: number; top: number; bottom: number }>
  rootTop: number
  rootBottom: number
  nearEnd: boolean
}): number | null {
  const parked = viewportSettledChapter(args.entries, args.rootTop, args.rootBottom)
  if (!args.nearEnd) return parked
  const lastVisible = args.entries
    .filter((entry) => entry.bottom > args.rootTop && entry.top < args.rootBottom)
    .sort((a, b) => b.chapter - a.chapter)[0]
  if (!lastVisible) return parked
  if (parked == null || parked < lastVisible.chapter) return lastVisible.chapter
  return parked
}

/**
 * After a CombinedHelps / picker jump, ignore settle that would commit the
 * previous chapter (align scroll still sees the old pane for one frame).
 *
 * After an edge-cue peek, the stay chapter still owns the read-line (~56px).
 * Click already committed chrome — do not settle-snap until the user
 * actually scrolls. Once they have, follow whatever painted chapter is
 * parked (stacked infinite), not an exclusive hold on the reveal target.
 */
export function shouldCommitSettledChapter(args: {
  parked: number | null
  navChapter: number
  paintedHasParked: boolean
  blockSnapBackTo: number | null
  userMovedSinceReveal?: boolean
}): boolean {
  if (args.parked == null || !args.paintedHasParked) return false
  if (args.parked === args.navChapter) return false
  if (args.blockSnapBackTo != null && args.parked === args.blockSnapBackTo) return false
  if (!args.userMovedSinceReveal) return false
  return true
}

/** Leave the peek snap-back pin once the user has scrolled onto another chapter. */
export function shouldReleaseEdgeRevealSnapBack(args: {
  parked: number | null
  blockSnapBackTo: number | null
  userMovedSinceReveal?: boolean
}): boolean {
  if (!args.userMovedSinceReveal) return false
  return args.blockSnapBackTo != null && args.parked != null && args.parked !== args.blockSnapBackTo
}

/**
 * Same-tick peek/settle/commit must not request the same target again.
 * `slotsRef` is otherwise stale until React paints, so canReveal/overscroll
 * latch would recurse (Maximum update depth).
 *
 * A *different* neighbor must stay allowed while an earlier reveal is still
 * loading — blocking every target (e.g. via programmatic peek suppress)
 * overwrites nothing but also cannot protect the first target, and a second
 * reveal then retriggers the first → commit oscillation.
 */
export function shouldBlockEdgeRevealRetrigger(args: {
  inFlightTargets: readonly number[]
  target: number | null
}): boolean {
  if (args.target == null) return true
  return args.inFlightTargets.includes(args.target)
}

/** Drop in-flight targets once they are in the painted stack (peek applied). */
export function inFlightTargetsAfterPeek(
  inFlight: readonly number[],
  paintedChapters: readonly number[]
): number[] {
  if (inFlight.length === 0) return []
  const painted = new Set(paintedChapters)
  return inFlight.filter((chapter) => !painted.has(chapter))
}

/**
 * Keep the user near the edge they left, then nudge a little toward the newly
 * painted chapter. Clamped to the scroll range — never a verse-1 / heading snap.
 *
 * When the incoming chapter box is known, peek relative to that junction so
 * scroll-anchoring (pin-to-end when content grows) cannot skip the new chapter.
 */
export function peekScrollTopAfterEdgeReveal(args: {
  direction: 'next' | 'previous'
  parentScrollTop: number
  scrollHeight: number
  clientHeight: number
  peekPx?: number
  incomingTop?: number
  incomingHeight?: number
}): number {
  const peek = args.peekPx ?? CHAPTER_REVEAL_PEEK_PX
  const maxScroll = Math.max(0, args.scrollHeight - args.clientHeight)
  const clamp = (top: number) => Math.min(maxScroll, Math.max(0, top))

  const incomingTop = args.incomingTop
  const incomingHeight = args.incomingHeight ?? 0
  if (incomingTop != null && Number.isFinite(incomingTop)) {
    if (args.direction === 'next') {
      return clamp(incomingTop - args.clientHeight + peek)
    }
    if (incomingHeight > 0) {
      return clamp(incomingTop + incomingHeight - peek)
    }
  }

  const nextTop =
    args.direction === 'next'
      ? args.parentScrollTop + peek
      : args.parentScrollTop - peek
  return clamp(nextTop)
}
