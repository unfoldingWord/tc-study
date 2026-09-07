/**
 * Pure helpers for elastic edge overscroll → unit navigation.
 */

export type ScriptureEdge = 'top' | 'bottom'

/** Raw overscroll (px) required before release commits navigation. */
export const EDGE_NAV_THRESHOLD_PX = 120
/** Max visible rubber-band translate. */
export const EDGE_NAV_MAX_PULL_PX = 96
/** Visual resistance curve (display = raw * resistance). */
export const EDGE_NAV_RESISTANCE = 0.28
export const EDGE_NAV_EDGE_SLOP_PX = 1
/**
 * Must remain at the scroll edge this long before overscroll starts counting.
 * Blocks accidental nav from scroll inertia hitting the edge.
 */
export const EDGE_NAV_MIN_DWELL_MS = 320
/** Wheel deltas accumulate slower than touch so a flick is less likely to commit. */
export const EDGE_NAV_WHEEL_SCALE = 0.4

/** Rubber-band display pull from raw overscroll delta (px past edge). */
export function elasticPullPx(
  rawOverscrollPx: number,
  maxPullPx = EDGE_NAV_MAX_PULL_PX,
  resistance = EDGE_NAV_RESISTANCE
): number {
  if (rawOverscrollPx <= 0) return 0
  return Math.min(maxPullPx, rawOverscrollPx * resistance)
}

export function isPastCommitThreshold(
  rawOverscrollPx: number,
  thresholdPx = EDGE_NAV_THRESHOLD_PX
): boolean {
  return rawOverscrollPx >= thresholdPx
}

export function scrollEdgeState(
  scrollTop: number,
  scrollHeight: number,
  clientHeight: number,
  slopPx = EDGE_NAV_EDGE_SLOP_PX
): { atTop: boolean; atBottom: boolean } {
  const maxScroll = Math.max(0, scrollHeight - clientHeight)
  return {
    atTop: scrollTop <= slopPx,
    atBottom: scrollTop >= maxScroll - slopPx,
  }
}

/** True once the user has settled at an edge long enough to start an intentional pull. */
export function isEdgeGestureArmed(
  edgeReachedAtMs: number | null,
  nowMs: number,
  minDwellMs = EDGE_NAV_MIN_DWELL_MS
): boolean {
  if (edgeReachedAtMs == null) return false
  return nowMs - edgeReachedAtMs >= minDwellMs
}

export function scaleWheelOverscrollDelta(
  deltaY: number,
  scale = EDGE_NAV_WHEEL_SCALE
): number {
  return deltaY * scale
}

/**
 * Apply a wheel/touch delta while already at an edge.
 * Positive deltaY = scrolling down content = pulling bottom edge for "next".
 */
export function accumulateEdgeOverscroll(args: {
  atTop: boolean
  atBottom: boolean
  deltaY: number
  currentRaw: number
  currentEdge: ScriptureEdge | null
  /** When false, ignore overscroll accumulation (dwell / intentional gate). */
  armed?: boolean
}): { raw: number; edge: ScriptureEdge | null } {
  const { atTop, atBottom, deltaY, currentRaw, currentEdge, armed = true } = args

  if (!armed) {
    return { raw: 0, edge: null }
  }

  if (deltaY < 0 && atTop) {
    // Pulling content down → prev
    const next = currentEdge === 'top' || currentEdge == null ? currentRaw + -deltaY : -deltaY
    return { raw: Math.max(0, next), edge: 'top' }
  }

  if (deltaY > 0 && atBottom) {
    // Pulling content up → next
    const next = currentEdge === 'bottom' || currentEdge == null ? currentRaw + deltaY : deltaY
    return { raw: Math.max(0, next), edge: 'bottom' }
  }

  // Left the edge or scrolled inward — clear pull
  if (!atTop && !atBottom) {
    return { raw: 0, edge: null }
  }

  // At edge but delta moves away from overscroll
  if (atTop && deltaY > 0) return { raw: 0, edge: null }
  if (atBottom && deltaY < 0) return { raw: 0, edge: null }

  return { raw: currentRaw, edge: currentEdge }
}

/**
 * Extra scroll range inserted when the reader parks at a content edge.
 * Lets the scrollbar thumb travel past the text to commit next/prev.
 */
export const EDGE_TRAVEL_PAD_PX = 168
/** How much of the pad to reveal so the arrow sits in view. */
export const EDGE_PAD_PEEK_PX = 40
/** Stay armed until the user scrolls this far back into the text. */
export const EDGE_PAD_HIDE_SLOP_PX = 32

/** Overlay scrollbars report 0 gutter; still hit-test a thin inline-end strip. */
export const SCROLLBAR_HIT_FALLBACK_PX = 14
/** Synthetic raw overscroll per hold tick while the thumb stays pinned at an edge. */
export const SCROLLBAR_HOLD_DELTA_PX = 8
export const SCROLLBAR_HOLD_TICK_MS = 16

export function edgeTravelFromPads(args: {
  scrollTop: number
  scrollHeight: number
  clientHeight: number
  topPadPx: number
  bottomPadPx: number
  slopPx?: number
}): {
  topRaw: number
  bottomRaw: number
  atContentTop: boolean
  atContentBottom: boolean
  contentMin: number
  contentMax: number
} {
  const slopPx = args.slopPx ?? EDGE_NAV_EDGE_SLOP_PX
  const maxScroll = Math.max(0, args.scrollHeight - args.clientHeight)
  const contentMin = Math.max(0, args.topPadPx)
  const contentMax = Math.max(contentMin, maxScroll - Math.max(0, args.bottomPadPx))
  const topRaw = args.topPadPx > 0 ? Math.max(0, contentMin - args.scrollTop) : 0
  const bottomRaw = args.bottomPadPx > 0 ? Math.max(0, args.scrollTop - contentMax) : 0
  return {
    topRaw,
    bottomRaw,
    atContentTop: args.scrollTop <= contentMin + slopPx,
    atContentBottom: args.scrollTop >= contentMax - slopPx,
    contentMin,
    contentMax,
  }
}

export function nextEdgePadVisibility(args: {
  showTop: boolean
  showBottom: boolean
  scrollTop: number
  contentMin: number
  contentMax: number
  topRaw: number
  bottomRaw: number
  canPrev: boolean
  canNext: boolean
  hideSlopPx?: number
}): { showTop: boolean; showBottom: boolean } {
  const hideSlop = args.hideSlopPx ?? EDGE_PAD_HIDE_SLOP_PX
  const appearTop = args.scrollTop <= args.contentMin + EDGE_NAV_EDGE_SLOP_PX
  const appearBottom = args.scrollTop >= args.contentMax - EDGE_NAV_EDGE_SLOP_PX
  const keepTop = args.topRaw > 0 || args.scrollTop <= args.contentMin + hideSlop
  const keepBottom = args.bottomRaw > 0 || args.scrollTop >= args.contentMax - hideSlop
  return {
    showTop: Boolean(args.canPrev && (args.showTop ? keepTop : appearTop)),
    showBottom: Boolean(args.canNext && (args.showBottom ? keepBottom : appearBottom)),
  }
}

/**
 * True when a pointer is on the vertical scrollbar (classic gutter or overlay strip).
 * Used so mouse thumb-drag can accumulate the same edge overscroll as wheel/touch.
 */
export function isVerticalScrollbarHit(
  el: Pick<HTMLElement, 'getBoundingClientRect' | 'offsetWidth' | 'clientWidth'>,
  clientX: number,
  direction: 'ltr' | 'rtl' = 'ltr'
): boolean {
  const rect = el.getBoundingClientRect()
  const gutter = Math.max(el.offsetWidth - el.clientWidth, 0)
  const hitWidth = Math.max(gutter, SCROLLBAR_HIT_FALLBACK_PX)
  if (direction === 'rtl') {
    return clientX <= rect.left + hitWidth
  }
  return clientX >= rect.right - hitWidth
}

export function commitEdgeNavigation(args: {
  edge: ScriptureEdge | null
  rawOverscrollPx: number
  canPrev: boolean
  canNext: boolean
  thresholdPx?: number
}): 'previous' | 'next' | null {
  const { edge, rawOverscrollPx, canPrev, canNext, thresholdPx } = args
  if (!edge || !isPastCommitThreshold(rawOverscrollPx, thresholdPx)) return null
  if (edge === 'top') return canPrev ? 'previous' : null
  return canNext ? 'next' : null
}
