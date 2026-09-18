/**
 * Chapter-mode scroll decisions.
 *
 * Edge-reveal mode (default): paint only revealed chapters (max 3). Intentional
 * elastic overscroll appends the next chapter underneath (or previous above),
 * then unloads the farthest chapter to keep performance. Neighbors stay warm in
 * the prepared cache before they are revealed.
 *
 * Legacy infinite-scroll helpers (spacers, settle→commit stitch) remain for tests.
 */

export type ChapterSlotKind = 'rendered' | 'paragraph' | 'placeholder' | 'spacer'

export interface ChapterSlot {
  chapter: number
  kind: ChapterSlotKind
  /** Inclusive end chapter when `kind === 'spacer'`. */
  toChapter?: number
}

/**
 * Gate chapter expansion behind intentional edge overscroll (not continuous stitch).
 * Painted content is a stack of up to {@link MAX_MOUNTED_CHAPTERS} chapters.
 */
export const CHAPTER_EDGE_SWAP_MODE = true

/** Short-chapter floor so the scrollbar thumb shows “more above/below.” */
export const PLACEHOLDER_MIN_HEIGHT_PX = 280
export const PLACEHOLDER_VIEWPORT_FRACTION = 0.55

export const MAX_MOUNTED_CHAPTERS = 3
export const FAST_SCROLL_PX_PER_MS = 1.25
export const SCROLL_PAUSE_MS = 120
export const PREFETCH_DISTANCE_PX = 120
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
/** @deprecated Prefer FULL_TIER_HOLD_MS — kept as the upgrade-effect constant. */
export const PHASE_UPGRADE_HOLD_MS = FULL_TIER_HOLD_MS
/** Near band around painted content — prefer light panes; skeleton only if cold. */
export const NEAR_SKELETON_COUNT = 2
/**
 * @deprecated Far gaps always use spacers now (light is cheap near the window).
 * Kept so call sites/tests that imported the threshold still resolve.
 */
export const BOOK_SPACER_CHAPTER_THRESHOLD = 0

export type ScrollDirection = 'up' | 'down'

export function isChapterInfiniteScrollEnabled(
  navigationMode: string,
  book: string
): boolean {
  return navigationMode === 'chapter' && book !== 'obs'
}

/** Open chapter only — neighbors warm in cache until edge reveal. */
export function singlePaintedChapterSlots(
  chapter: number,
  kind: 'paragraph' | 'rendered' = 'paragraph'
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
  if (!chapterInBook(target, lastChapter)) {
    return prev.filter((slot) => slot.kind === 'rendered' || slot.kind === 'paragraph')
  }

  const painted = new Map<number, 'rendered' | 'paragraph'>()
  for (const slot of prev) {
    if (slot.kind === 'rendered' || slot.kind === 'paragraph') {
      painted.set(slot.chapter, slot.kind)
    }
  }
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

export function shouldAllowChapterStitch(velocityPxPerMs: number): boolean {
  return Number.isFinite(velocityPxPerMs) && velocityPxPerMs <= FAST_SCROLL_PX_PER_MS
}

export function effectiveScrollVelocity(
  lastVelocityPxPerMs: number,
  lastScrollTimeMs: number,
  nowMs: number,
  pauseMs = SCROLL_PAUSE_MS
): number {
  if (nowMs - lastScrollTimeMs >= pauseMs) return 0
  return lastVelocityPxPerMs
}

export function measureScrollVelocity(args: {
  prevTop: number
  nextTop: number
  prevTimeMs: number
  nextTimeMs: number
}): number {
  const dt = args.nextTimeMs - args.prevTimeMs
  if (dt <= 0) return Number.POSITIVE_INFINITY
  return Math.abs(args.nextTop - args.prevTop) / dt
}

export function scrollDirectionFromDelta(delta: number): ScrollDirection | null {
  if (delta < 0) return 'up'
  if (delta > 0) return 'down'
  return null
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

export function resetMountedChapters(navChapter: number): number[] {
  return [navChapter]
}

export function slotsEqual(a: readonly ChapterSlot[], b: readonly ChapterSlot[]): boolean {
  return (
    a.length === b.length &&
    a.every((slot, i) => {
      const other = b[i]!
      return (
        slot.chapter === other.chapter &&
        slot.kind === other.kind &&
        (slot.toChapter ?? slot.chapter) === (other.toChapter ?? other.chapter)
      )
    })
  )
}

export function isContentSlotKind(kind: ChapterSlotKind): boolean {
  return kind === 'rendered' || kind === 'paragraph'
}

export function slotEndChapter(slot: ChapterSlot): number {
  return slot.toChapter ?? slot.chapter
}

export function slotCoversChapter(slot: ChapterSlot, chapter: number): boolean {
  return chapter >= slot.chapter && chapter <= slotEndChapter(slot)
}

export function bookSpanFromSlots(
  slots: readonly ChapterSlot[]
): { from: number; to: number } | null {
  if (slots.length === 0) return null
  return { from: slots[0]!.chapter, to: slotEndChapter(slots[slots.length - 1]!) }
}

export function chapterCountInSlots(slots: readonly ChapterSlot[]): number {
  return slots.reduce((sum, slot) => sum + (slotEndChapter(slot) - slot.chapter + 1), 0)
}

function paintedKindsFromSlots(
  slots: readonly ChapterSlot[]
): Map<number, 'rendered' | 'paragraph'> {
  const painted = new Map<number, 'rendered' | 'paragraph'>()
  for (const slot of slots) {
    if (slot.kind === 'rendered' || slot.kind === 'paragraph') {
      painted.set(slot.chapter, slot.kind)
    }
  }
  return painted
}

function trimPaintedToWindow(
  painted: ReadonlyMap<number, 'rendered' | 'paragraph'>,
  settled: number,
  lastChapter: number
): Map<number, 'rendered' | 'paragraph'> {
  const keep = new Map<number, 'rendered' | 'paragraph'>()
  // Always keep prev + settled + next as content so scrolling never hits blank
  // chrome on the immediate neighbor.
  for (const chapter of chapterWindowAround(settled, lastChapter)) {
    const existing = painted.get(chapter)
    keep.set(chapter, existing === 'rendered' ? 'rendered' : 'paragraph')
  }
  return keep
}

/** Book-length slots: painted content, near placeholders (light), far spacer. */
export function bookExtentSlots(
  lastChapter: number,
  painted: ReadonlyMap<number, 'rendered' | 'paragraph'>
): ChapterSlot[] {
  if (lastChapter < 1) {
    const first = [...painted.entries()][0]
    return first ? [{ chapter: first[0], kind: first[1] }] : []
  }

  const anchors = [...painted.keys()].filter((chapter) => chapterInBook(chapter, lastChapter))
  const lo = anchors.length > 0 ? Math.min(...anchors) : 1
  const hi = anchors.length > 0 ? Math.max(...anchors) : 1
  const nearBefore = Math.max(1, lo - NEAR_SKELETON_COUNT)
  const nearAfter = Math.min(lastChapter, hi + NEAR_SKELETON_COUNT)

  const slots: ChapterSlot[] = []

  const pushNearRange = (from: number, to: number) => {
    for (let chapter = from; chapter <= to; chapter++) {
      const paint = painted.get(chapter)
      slots.push({ chapter, kind: paint ?? 'placeholder' })
    }
  }

  if (nearBefore > 1) {
    slots.push({ kind: 'spacer', chapter: 1, toChapter: nearBefore - 1 })
  }

  pushNearRange(nearBefore, nearAfter)

  if (nearAfter < lastChapter) {
    slots.push({ kind: 'spacer', chapter: nearAfter + 1, toChapter: lastChapter })
  }

  return slots
}

/** Always reserve book-length gaps; nav chapter ±1 start as paragraph/light. */
export function resetChapterSlots(navChapter: number, lastChapter: number): ChapterSlot[] {
  const painted = new Map<number, 'rendered' | 'paragraph'>()
  for (const chapter of chapterWindowAround(navChapter, lastChapter)) {
    painted.set(chapter, 'paragraph')
  }
  if (lastChapter < 1) {
    return [{ chapter: Math.max(1, navChapter), kind: 'paragraph' }]
  }
  return bookExtentSlots(lastChapter, painted)
}

export function chapterSlotsAround(
  settled: number,
  lastChapter: number,
  rendered: ReadonlySet<number>
): ChapterSlot[] {
  const painted = new Map<number, 'rendered' | 'paragraph'>()
  for (const chapter of chapterWindowAround(settled, lastChapter)) {
    painted.set(chapter, rendered.has(chapter) ? 'rendered' : 'paragraph')
  }
  for (const chapter of rendered) {
    if (chapterInBook(chapter, lastChapter) && painted.has(chapter)) {
      painted.set(chapter, 'rendered')
    }
  }
  return bookExtentSlots(lastChapter, painted)
}

export function recenterSlots(
  prev: readonly ChapterSlot[],
  settled: number,
  lastChapter: number
): ChapterSlot[] {
  const painted = paintedKindsFromSlots(prev)
  for (const chapter of chapterWindowAround(settled, lastChapter)) {
    const existing = painted.get(chapter)
    painted.set(chapter, existing === 'rendered' ? 'rendered' : 'paragraph')
  }
  return bookExtentSlots(lastChapter, trimPaintedToWindow(painted, settled, lastChapter))
}

/** Reveal a chapter as paragraph text. Never downgrade a tokenized chapter. */
export function promoteSlot(slots: readonly ChapterSlot[], chapter: number): ChapterSlot[] {
  return slots.map((slot) => {
    if (slot.kind === 'spacer') return slot
    if (slot.chapter !== chapter) return slot
    if (slot.kind === 'rendered') return slot
    return { chapter, kind: 'paragraph' as const }
  })
}

/**
 * Ensure `chapter` is painted as paragraph/light (splitting a spacer if needed).
 * Caps painted content at {@link MAX_MOUNTED_CHAPTERS}, keeping chapters nearest
 * to the ensured chapter so approach never flashes blank chrome.
 */
export function ensureChapterPainted(
  slots: readonly ChapterSlot[],
  chapter: number,
  lastChapter: number
): ChapterSlot[] {
  if (!chapterInBook(chapter, lastChapter)) return slots as ChapterSlot[]
  const painted = paintedKindsFromSlots(slots)
  const existing = painted.get(chapter)
  if (existing === 'rendered' || existing === 'paragraph') {
    return slots as ChapterSlot[]
  }

  // Fast path: placeholder in the near band — flip kind without rebuild.
  const asPlaceholder = slots.some(
    (slot) => slot.kind === 'placeholder' && slot.chapter === chapter
  )
  if (asPlaceholder && painted.size < MAX_MOUNTED_CHAPTERS) {
    return promoteSlot(slots, chapter)
  }

  if (painted.size > 0) {
    const lo = Math.min(...painted.keys())
    const hi = Math.max(...painted.keys())
    // Distant ensure teleports the window instead of merging gaps that thrash
    // spacer heights and oscillate nav (e.g. Ps 113 ↔ 125).
    if (chapter !== hi + 1 && chapter !== lo - 1) {
      const next = new Map<number, 'rendered' | 'paragraph'>()
      for (const c of chapterWindowAround(chapter, lastChapter)) {
        next.set(c, painted.get(c) === 'rendered' ? 'rendered' : 'paragraph')
      }
      return bookExtentSlots(lastChapter, next)
    }
  }

  painted.set(chapter, 'paragraph')
  if (painted.size > MAX_MOUNTED_CHAPTERS) {
    const ranked = [...painted.keys()].sort(
      (a, b) => Math.abs(a - chapter) - Math.abs(b - chapter) || a - b
    )
    const keep = new Set(ranked.slice(0, MAX_MOUNTED_CHAPTERS))
    for (const key of [...painted.keys()]) {
      if (!keep.has(key)) painted.delete(key)
    }
  }
  return bookExtentSlots(lastChapter, painted)
}

/** After the upgrade hold, replace paragraph text with the full token tree. */
export function upgradeSlot(slots: readonly ChapterSlot[], chapter: number): ChapterSlot[] {
  return slots.map((slot) =>
    slot.chapter === chapter && slot.kind === 'paragraph'
      ? { chapter, kind: 'rendered' as const }
      : slot
  )
}

export function upgradeParagraphSlots(slots: readonly ChapterSlot[]): ChapterSlot[] {
  return slots.map((slot) =>
    slot.kind === 'paragraph' ? { chapter: slot.chapter, kind: 'rendered' as const } : slot
  )
}

export function renderedChaptersFromSlots(slots: readonly ChapterSlot[]): number[] {
  return slots.filter((slot) => slot.kind === 'rendered').map((slot) => slot.chapter)
}

export function contentChaptersFromSlots(slots: readonly ChapterSlot[]): number[] {
  return slots.filter((slot) => isContentSlotKind(slot.kind)).map((slot) => slot.chapter)
}

export function paragraphChaptersFromSlots(slots: readonly ChapterSlot[]): number[] {
  return slots.filter((slot) => slot.kind === 'paragraph').map((slot) => slot.chapter)
}

export function placeholderChaptersFromSlots(slots: readonly ChapterSlot[]): number[] {
  return slots.filter((slot) => slot.kind === 'placeholder').map((slot) => slot.chapter)
}

/**
 * Promote an adjacent placeholder only after settle, when the read-line is
 * parked on that gap. Settling on the current chapter leaves the hint.
 */
export function shouldPromotePlaceholderOnSettle(args: {
  viewportChapter: number | null
  navChapter: number
  velocityPxPerMs: number
}): boolean {
  if (args.viewportChapter == null) return false
  return settledNavChapter({
    viewportChapter: args.viewportChapter,
    navChapter: args.navChapter,
    velocityPxPerMs: args.velocityPxPerMs,
  }) != null
}

export function adjacentSlotKindAfterSettle(args: {
  viewportChapter: number | null
  navChapter: number
  adjacentChapter: number
  velocityPxPerMs: number
}): ChapterSlotKind {
  if (!shouldPromotePlaceholderOnSettle(args)) return 'placeholder'
  return args.viewportChapter === args.adjacentChapter ? 'paragraph' : 'placeholder'
}

export function placeholderHeightPx(args: {
  cachedHeightPx: number | null
  viewportHeightPx: number
}): number {
  if (
    args.cachedHeightPx != null &&
    Number.isFinite(args.cachedHeightPx) &&
    args.cachedHeightPx > 8
  ) {
    return Math.round(args.cachedHeightPx)
  }
  const viewport =
    Number.isFinite(args.viewportHeightPx) && args.viewportHeightPx > 0
      ? args.viewportHeightPx
      : 640
  return Math.max(
    PLACEHOLDER_MIN_HEIGHT_PX,
    Math.round(viewport * PLACEHOLDER_VIEWPORT_FRACTION)
  )
}

/** Sum of per-chapter placeholder heights so a far spacer matches book scroll extent. */
export function spacerHeightPx(args: {
  fromChapter: number
  toChapter: number
  heightForChapter: (chapter: number) => number | null
  viewportHeightPx: number
}): number {
  const from = Math.min(args.fromChapter, args.toChapter)
  const to = Math.max(args.fromChapter, args.toChapter)
  let total = 0
  for (let chapter = from; chapter <= to; chapter++) {
    total += placeholderHeightPx({
      cachedHeightPx: args.heightForChapter(chapter),
      viewportHeightPx: args.viewportHeightPx,
    })
  }
  return total
}

export function chapterFromSpacerOffset(args: {
  fromChapter: number
  toChapter: number
  offsetPx: number
  heightPx: number
}): number {
  const from = args.fromChapter
  const to = args.toChapter
  if (to <= from) return from
  if (!(args.heightPx > 0)) return from
  const count = to - from + 1
  const t = Math.min(1, Math.max(0, args.offsetPx / args.heightPx))
  const idx = Math.min(count - 1, Math.floor(t * count))
  return from + idx
}

export function trimMountedToWindow(
  mounted: readonly number[],
  settled: number,
  lastChapter: number
): number[] {
  const allowed = new Set(chapterWindowAround(settled, lastChapter))
  return [...mounted]
    .filter((chapter) => allowed.has(chapter))
    .sort((a, b) => a - b)
    .slice(0, MAX_MOUNTED_CHAPTERS)
}

export function stitchMountedChapters(args: {
  mounted: readonly number[]
  incoming: number
  settled: number
  lastChapter: number
}): number[] {
  if (!chapterInBook(args.incoming, args.lastChapter)) {
    return trimMountedToWindow(args.mounted, args.settled, args.lastChapter)
  }
  const next = new Set(args.mounted)
  next.add(args.incoming)
  return trimMountedToWindow([...next], args.settled, args.lastChapter)
}

export function edgeProximity(args: {
  scrollTop: number
  clientHeight: number
  scrollHeight: number
  prefetchDistancePx?: number
}): { nearStart: boolean; nearEnd: boolean } {
  const prefetch = args.prefetchDistancePx ?? PREFETCH_DISTANCE_PX
  return {
    nearStart: args.scrollTop <= prefetch,
    nearEnd: args.scrollTop + args.clientHeight >= args.scrollHeight - prefetch,
  }
}

/**
 * When the viewport is within `prefetchDistancePx` of a painted chapter's edge,
 * return the neighbor that should already be light/paragraph so scroll never
 * blanks into a spacer.
 */
export function approachingNeighborChapter(args: {
  entries: ReadonlyArray<{ chapter: number; top: number; bottom: number }>
  rootTop: number
  rootBottom: number
  lastChapter: number
  prefetchDistancePx?: number
}): number | null {
  const prefetch = args.prefetchDistancePx ?? PREFETCH_DISTANCE_PX
  const content = args.entries
    .filter((e) => e.bottom > args.rootTop && e.top < args.rootBottom)
    .sort((a, b) => a.top - b.top)
  if (content.length === 0) return null

  const first = content[0]!
  const last = content[content.length - 1]!

  if (last.bottom - args.rootBottom <= prefetch) {
    const next = adjacentChapterToRequest(last.chapter, 'next', args.lastChapter)
    if (next != null) return next
  }
  if (args.rootTop - first.top <= prefetch) {
    const prev = adjacentChapterToRequest(first.chapter, 'prev', args.lastChapter)
    if (prev != null) return prev
  }
  return null
}

/**
 * Only paint the chapter immediately outside the current painted window.
 * Ignores approach targets that would teleport the window (spacer flicker).
 */
export function neighborChapterToPaint(args: {
  approach: number | null
  paintedChapters: readonly number[]
}): number | null {
  if (args.approach == null || args.paintedChapters.length === 0) return null
  const lo = Math.min(...args.paintedChapters)
  const hi = Math.max(...args.paintedChapters)
  if (args.approach === hi + 1 || args.approach === lo - 1) return args.approach
  return null
}

export type SettledCommitMode = 'step' | 'jump' | null

/**
 * Step (±1) recenters in place. Jump (spacer / multi-chapter) must reset +
 * align once — otherwise upper-spacer height thrash oscillates nav.
 */
export function settledCommitMode(args: {
  parked: number
  navChapter: number
  parkedOnSpacer: boolean
}): SettledCommitMode {
  if (args.parked === args.navChapter) return null
  const delta = Math.abs(args.parked - args.navChapter)
  if (args.parkedOnSpacer || delta > 1) return 'jump'
  return 'step'
}

export function entryCoversReadLine(
  entry: { top: number; bottom: number },
  rootTop: number,
  rootBottom: number
): boolean {
  const span = Math.max(1, rootBottom - rootTop)
  const readLine = rootTop + Math.min(80, span * 0.2)
  return entry.top <= readLine && entry.bottom > readLine
}

export function isSpacerEntry(entry: { chapter: number; toChapter?: number }): boolean {
  return entry.toChapter != null && entry.toChapter > entry.chapter
}

export function shouldStitchAtDocumentEdge(args: {
  nearStart: boolean
  nearEnd: boolean
  velocityPxPerMs: number
  lastDirection: ScrollDirection | null
}): { requestNext: boolean; requestPrev: boolean } {
  if (!shouldAllowChapterStitch(args.velocityPxPerMs)) {
    return { requestNext: false, requestPrev: false }
  }
  return {
    requestNext: args.nearEnd && args.lastDirection !== 'up',
    requestPrev: args.nearStart && args.lastDirection === 'up',
  }
}

export function chapterToStitch(args: {
  requestNext: boolean
  requestPrev: boolean
  mounted: readonly number[]
  lastChapter: number
}): number | null {
  if (args.mounted.length === 0) return null
  const lo = Math.min(...args.mounted)
  const hi = Math.max(...args.mounted)
  if (args.requestNext) return adjacentChapterToRequest(hi, 'next', args.lastChapter)
  if (args.requestPrev) return adjacentChapterToRequest(lo, 'prev', args.lastChapter)
  return null
}

export function settledNavChapter(args: {
  viewportChapter: number
  navChapter: number
  velocityPxPerMs: number
}): number | null {
  if (!shouldAllowChapterStitch(args.velocityPxPerMs)) return null
  if (args.viewportChapter === args.navChapter) return null
  return args.viewportChapter
}

export function viewportSettledChapter(
  entries: ReadonlyArray<{
    chapter: number
    top: number
    bottom: number
    toChapter?: number
  }>,
  rootTop: number,
  rootBottom: number
): number | null {
  if (entries.length === 0) return null
  const span = Math.max(1, rootBottom - rootTop)
  const readLine = rootTop + Math.min(80, span * 0.2)
  const resolveEntry = (entry: (typeof entries)[number]): number => {
    if (entry.toChapter != null && entry.toChapter > entry.chapter) {
      return chapterFromSpacerOffset({
        fromChapter: entry.chapter,
        toChapter: entry.toChapter,
        offsetPx: readLine - entry.top,
        heightPx: entry.bottom - entry.top,
      })
    }
    return entry.chapter
  }
  const containing = entries.filter((entry) => entry.top <= readLine && entry.bottom > readLine)
  if (containing.length === 1) return resolveEntry(containing[0]!)
  if (containing.length > 1) {
    return resolveEntry([...containing].sort((a, b) => b.top - a.top)[0]!)
  }
  const visible = entries
    .map((entry) => {
      const top = Math.max(entry.top, rootTop)
      const bottom = Math.min(entry.bottom, rootBottom)
      return { entry, visible: Math.max(0, bottom - top) }
    })
    .filter((item) => item.visible > 0)
    .sort((a, b) => b.visible - a.visible)
  return visible[0] ? resolveEntry(visible[0].entry) : null
}

/**
 * At the document end, a short last-chapter gap can sit below the read-line
 * while the previous chapter still owns it. Prefer the last visible slot.
 */
export function settleViewportChapter(args: {
  entries: ReadonlyArray<{
    chapter: number
    top: number
    bottom: number
    toChapter?: number
  }>
  rootTop: number
  rootBottom: number
  nearEnd: boolean
}): number | null {
  const parked = viewportSettledChapter(args.entries, args.rootTop, args.rootBottom)
  if (!args.nearEnd) return parked
  const lastVisible = args.entries
    .filter((entry) => entry.bottom > args.rootTop && entry.top < args.rootBottom)
    .sort((a, b) => (b.toChapter ?? b.chapter) - (a.toChapter ?? a.chapter))[0]
  if (!lastVisible) return parked
  const lastChapter = lastVisible.toChapter ?? lastVisible.chapter
  if (parked == null || parked < lastChapter) return lastChapter
  return parked
}

export function shouldResetWindowOnNavChange(args: {
  navChapter: number
  navBook: string
  prevNavChapter: number
  prevNavBook: string
  committedByUs: number | null
}): boolean {
  if (args.navBook !== args.prevNavBook) return true
  if (args.committedByUs === args.navChapter) return false
  return args.navChapter !== args.prevNavChapter
}

/**
 * After a CombinedHelps / picker jump, ignore settle that would commit the
 * previous chapter (align scroll still sees the old pane for one frame).
 *
 * After an edge-cue reveal, `holdToChapter` keeps settle from snapping nav
 * back to the chapter that still owns the read-line (peek is only ~56px).
 */
export function shouldCommitSettledChapter(args: {
  parked: number | null
  navChapter: number
  paintedHasParked: boolean
  blockSnapBackTo: number | null
  holdToChapter?: number | null
}): boolean {
  if (args.parked == null || !args.paintedHasParked) return false
  if (args.parked === args.navChapter) return false
  if (args.blockSnapBackTo != null && args.parked === args.blockSnapBackTo) return false
  if (args.holdToChapter != null && args.parked !== args.holdToChapter) return false
  return true
}

export function wouldEnqueueWholeBook(
  mounted: readonly number[],
  lastChapter: number
): boolean {
  return lastChapter > MAX_MOUNTED_CHAPTERS && mounted.length > MAX_MOUNTED_CHAPTERS
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
