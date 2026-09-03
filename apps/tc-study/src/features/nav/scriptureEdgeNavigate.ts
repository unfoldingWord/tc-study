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
