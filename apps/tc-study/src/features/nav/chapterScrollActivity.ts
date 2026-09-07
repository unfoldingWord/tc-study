/**
 * Shared “chapter scroll still moving” signal.
 *
 * Adjacent scripture stays light/placeholder until settle on that gap.
 * Quote-build, underlines, highlights, token broadcast, and helps hydrate
 * wait until scroll has settled on one chapter.
 *
 * Only chapter infinite-scroll should publish settle activity. Verse / section /
 * custom-range modes clear this store so they keep the full BCV span.
 */

export interface ChapterScrollActivity {
  unsettled: boolean
  settledChapter: number | null
}

export interface PinnableReference {
  chapter: number
  endChapter?: number
}

const EMPTY_ACTIVITY: ChapterScrollActivity = {
  unsettled: false,
  settledChapter: null,
}

let activity: ChapterScrollActivity = EMPTY_ACTIVITY
const listeners = new Set<() => void>()
/** Ignore scroll events caused by edge-pad peek/hide `scrollTop` adjusts. */
let suppressUnsettledUntilMs = 0

function notify(): void {
  for (const listener of listeners) listener()
}

export function getChapterScrollActivity(): ChapterScrollActivity {
  return activity
}

export function subscribeChapterScrollActivity(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/**
 * Programmatic `scrollTop` writes (edge travel pad peek/hide) must not pause
 * quote-build / underline broadcast for a full settle hold.
 */
export function beginProgrammaticScrollSuppress(durationMs = 120): void {
  const until = Date.now() + Math.max(0, durationMs)
  if (until > suppressUnsettledUntilMs) suppressUnsettledUntilMs = until
}

/** First scroll event / stitch: one notify. Later events are silent while already unsettled. */
export function markChapterScrollUnsettled(): void {
  if (Date.now() < suppressUnsettledUntilMs) return
  if (activity.unsettled) return
  activity = { ...activity, unsettled: true }
  notify()
}

export function markChapterScrollSettled(chapter: number): void {
  if (!Number.isFinite(chapter) || chapter < 1) return
  if (!activity.unsettled && activity.settledChapter === chapter) return
  activity = { unsettled: false, settledChapter: chapter }
  notify()
}

/**
 * Leave chapter infinite-scroll: drop settle pinning so verse/section/range
 * modes hydrate and align against the full currentRef span.
 */
export function clearChapterScrollActivity(): void {
  if (!activity.unsettled && activity.settledChapter == null) return
  activity = EMPTY_ACTIVITY
  notify()
}

/** Test-only: drop activity between cases. */
export function resetChapterScrollActivity(): void {
  activity = EMPTY_ACTIVITY
  listeners.clear()
  suppressUnsettledUntilMs = 0
}

/** Quote-build / align — only when scroll is settled. */
export function shouldEnqueueQuoteBuild(unsettled: boolean): boolean {
  return !unsettled
}

/** Scripture token broadcast that rebinds CombinedHelps — only when settled. */
export function shouldBroadcastScriptureTokens(unsettled: boolean): boolean {
  return !unsettled
}

/**
 * Underline groups from quoteTokens may broadcast while scrolling.
 * Skip only when groups are empty while unsettled (avoid flash-empty).
 */
export function shouldBroadcastUnderlineGroups(args: {
  unsettled: boolean
  groupCount: number
}): boolean {
  if (args.groupCount > 0) return true
  return !args.unsettled
}

/**
 * Helps catalog/content hydrate for a chapter.
 * While scrolling, skip. After settle, only the settled chapter.
 * `settledChapter == null` means infinite-scroll is inactive — allow the full range.
 */
export function shouldHydrateHelpsForChapter(args: {
  unsettled: boolean
  requestedChapter: number
  settledChapter: number | null
}): boolean {
  if (args.unsettled) return false
  if (args.settledChapter == null) return true
  return args.requestedChapter === args.settledChapter
}

/**
 * True when a chapter falls inside the open BCV span (section / custom range).
 * When settle pinning is active, only the settled chapter is in-span for hydrate.
 */
export function chapterInHelpsPassageSpan(args: {
  chapter: number
  startChapter: number
  endChapter: number
  unsettled: boolean
  settledChapter: number | null
}): boolean {
  if (args.unsettled) return false
  if (args.settledChapter != null) {
    return args.chapter === args.settledChapter
  }
  return args.chapter >= args.startChapter && args.chapter <= args.endChapter
}

/**
 * Footnotes, xref popovers, and heading ref-link parsing.
 * Already-painted chapters keep extras (avoid layout shift + remount).
 * A chapter first seen while scroll is unsettled paints words only.
 */
export function shouldPaintScriptureChromeExtras(args: {
  unsettled: boolean
  chapterHydrated: boolean
}): boolean {
  return args.chapterHydrated || !args.unsettled
}

/** Keep helps / quote work on the last settled chapter while the user is still scrolling. */
export function pinReferenceWhileScrolling<T extends PinnableReference>(
  currentRef: T,
  next: ChapterScrollActivity
): T {
  if (!next.unsettled || next.settledChapter == null) return currentRef
  if (
    currentRef.chapter === next.settledChapter &&
    (currentRef.endChapter ?? currentRef.chapter) === next.settledChapter
  ) {
    return currentRef
  }
  return { ...currentRef, chapter: next.settledChapter, endChapter: next.settledChapter }
}
