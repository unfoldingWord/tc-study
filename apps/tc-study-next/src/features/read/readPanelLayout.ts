/**
 * One- vs two-panel layout + collapse-to-divider (issues #31–#32).
 * Collapse is two-panel with one parked behind the same thin resize strip.
 * One-panel layout parks panel-2 the same way so the rail can add it;
 * token reopen (#33) still requires layout === 'two'.
 */

import type { CSSProperties } from 'react'
import type { ReadPanelId } from './readPanelModel'
import type { ReadLayoutMode } from './readPanelPersistence'

/** Pane share of the panels container that is the magnetic collapse detent. */
export const COLLAPSE_THRESHOLD_PERCENT = 30
/**
 * How close the pointer must get to 30/70 before the displayed split jumps
 * to the detent and hard-locks (no further resize until commit).
 */
export const DETENT_CAPTURE_PERCENT = 4
/**
 * Container % past the 30/70 detent that commits collapse.
 * Compared against the **pointer** (raw container %), not the displayed split,
 * so the pane can stay frozen at 30/70 until this offset is reached.
 */
export const DETENT_COMMIT_OFFSET_PERCENT = 5
export const DEFAULT_SPLIT_PERCENT = 50
export const NARROW_VIEWPORT_MQ = '(max-width: 767px)'

export type CollapsedDividerArrow = 'left' | 'right' | 'up' | 'down'
export type DragSplitZone = 'live' | 'detent'

function clampPercent(percent: number): number {
  return Math.max(0, Math.min(100, percent))
}

/**
 * Pointer % → displayed split. Live 1:1 until within DETENT_CAPTURE_PERCENT
 * of 30/70, then jump to the detent and stay locked. No rubber-band.
 */
export function displayedSplitFromPointer(pointerPercent: number): {
  splitPercent: number
  zone: DragSplitZone
} {
  const pointer = clampPercent(pointerPercent)
  const low = COLLAPSE_THRESHOLD_PERCENT
  const high = 100 - COLLAPSE_THRESHOLD_PERCENT
  if (pointer > low + DETENT_CAPTURE_PERCENT && pointer < high - DETENT_CAPTURE_PERCENT) {
    return { splitPercent: pointer, zone: 'live' }
  }
  return {
    splitPercent: pointer <= 50 ? low : high,
    zone: 'detent',
  }
}

export function defaultLayoutForViewport(isNarrow: boolean, persisted?: ReadLayoutMode, userChosen?: boolean): ReadLayoutMode {
  if (userChosen && persisted) return persisted
  return isNarrow ? 'one' : 'two'
}

/** Pointer crossed detent ± DETENT_COMMIT_OFFSET_PERCENT (25% / 75%). */
export function collapseCommitPanelId(pointerPercent: number): ReadPanelId | null {
  const pointer = clampPercent(pointerPercent)
  if (pointer <= COLLAPSE_THRESHOLD_PERCENT - DETENT_COMMIT_OFFSET_PERCENT) {
    return 'panel-1'
  }
  if (pointer >= 100 - COLLAPSE_THRESHOLD_PERCENT + DETENT_COMMIT_OFFSET_PERCENT) {
    return 'panel-2'
  }
  return null
}

/**
 * Mid-drag sample. Commit (end the pointer session, no pointer-up) once the
 * pointer crosses the commit offset; otherwise keep live tracking or the
 * hard-locked detent.
 */
export function collapseDuringDrag(pointerPercent: number): {
  splitPercent: number
  collapsedPanelId: ReadPanelId | null
} {
  const drag = displayedSplitFromPointer(pointerPercent)
  return {
    splitPercent: drag.splitPercent,
    collapsedPanelId: collapseCommitPanelId(pointerPercent),
  }
}

/** Release: stay on the detent unless the pointer reached the commit offset. */
export function collapseAfterDragEnd(pointerPercent: number): {
  splitPercent: number
  collapsedPanelId: ReadPanelId | null
} {
  const collapsedPanelId = collapseCommitPanelId(pointerPercent)
  const drag = displayedSplitFromPointer(pointerPercent)
  if (collapsedPanelId) {
    return { splitPercent: drag.splitPercent, collapsedPanelId }
  }
  if (drag.zone === 'live') {
    return { splitPercent: drag.splitPercent, collapsedPanelId: null }
  }
  const detent =
    pointerPercent <= 50 ? COLLAPSE_THRESHOLD_PERCENT : 100 - COLLAPSE_THRESHOLD_PERCENT
  return { splitPercent: detent, collapsedPanelId: null }
}

export function restoredSplitPercent(previous: number | null | undefined): number {
  if (
    typeof previous === 'number' &&
    previous > COLLAPSE_THRESHOLD_PERCENT &&
    previous < 100 - COLLAPSE_THRESHOLD_PERCENT
  ) {
    return previous
  }
  return DEFAULT_SPLIT_PERCENT
}

/** Click the collapsed divider: clear park, restore previous split or ~50%. */
export function restoreCollapsedDivider(previousSplit: number | null | undefined): {
  collapsedPanelId: null
  splitPercent: number
} {
  return {
    collapsedPanelId: null,
    splitPercent: restoredSplitPercent(previousSplit),
  }
}

export function isPanelOffFlow(options: {
  layout: ReadLayoutMode
  panelId: ReadPanelId
  collapsedPanelId: ReadPanelId | null
}): boolean {
  if (options.layout === 'one') return options.panelId === 'panel-2'
  return options.collapsedPanelId === options.panelId
}

/** Panel parked behind the divider rail (includes one-panel → add panel-2). */
export function dividerCollapsedPanelId(options: {
  layout: ReadLayoutMode
  collapsedPanelId: ReadPanelId | null
}): ReadPanelId | null {
  if (options.layout === 'one') return 'panel-2'
  return options.collapsedPanelId
}

/** Arrow points inward — toward the remaining visible panel. */
export function collapsedDividerArrowDir(options: {
  collapsedPanelId: ReadPanelId
  stacked: boolean
}): CollapsedDividerArrow {
  if (options.stacked) {
    return options.collapsedPanelId === 'panel-1' ? 'down' : 'up'
  }
  return options.collapsedPanelId === 'panel-1' ? 'right' : 'left'
}

/** Snap-to-collapse / restore only — not live drag. No spring / overshoot. */
export const COLLAPSE_MOTION_MS = 200
export const COLLAPSE_MOTION_EASING = 'cubic-bezier(0.4, 0, 0.2, 1)'

/** Smaller pane goes to 0 width — same edge live drag would reach. */
export function edgeSplitPercent(collapsedPanelId: ReadPanelId): number {
  return collapsedPanelId === 'panel-1' ? 0 : 100
}

export function collapseTweenRange(collapsedPanelId: ReadPanelId, fromPercent: number): {
  from: number
  to: number
} {
  return { from: fromPercent, to: edgeSplitPercent(collapsedPanelId) }
}

export function restoreTweenRange(
  collapsedPanelId: ReadPanelId,
  previousSplit: number | null | undefined
): { from: number; to: number } {
  return {
    from: edgeSplitPercent(collapsedPanelId),
    to: restoredSplitPercent(previousSplit),
  }
}

/** One-panel restore bar: panel-1 is full, then the divider drags back in. */
export function layoutRestoreTweenRange(previousSplit: number | null | undefined): {
  from: number
  to: number
} {
  return { from: 100, to: restoredSplitPercent(previousSplit) }
}

const EASE_X1 = 0.4
const EASE_Y1 = 0
const EASE_X2 = 0.2
const EASE_Y2 = 1

function bezierCoord(u: number, a: number, b: number): number {
  const mt = 1 - u
  return 3 * mt * mt * u * a + 3 * mt * u * u * b + u * u * u
}

function bezierCoordDeriv(u: number, a: number, b: number): number {
  const mt = 1 - u
  return 3 * mt * mt * a + 6 * mt * u * (b - a) + 3 * u * u * (1 - b)
}

/** Sample CSS `cubic-bezier(0.4, 0, 0.2, 1)` at time t in [0, 1]. */
export function collapseEase(t: number): number {
  if (t <= 0) return 0
  if (t >= 1) return 1
  let u = t
  for (let i = 0; i < 8; i++) {
    const x = bezierCoord(u, EASE_X1, EASE_X2) - t
    const dx = bezierCoordDeriv(u, EASE_X1, EASE_X2)
    if (Math.abs(x) < 1e-6 || Math.abs(dx) < 1e-6) break
    u = Math.min(1, Math.max(0, u - x / dx))
  }
  return bezierCoord(u, EASE_Y1, EASE_Y2)
}

/** rAF sample of the same splitPercent live drag writes. */
export function tweenSplitAt(options: {
  from: number
  to: number
  elapsedMs: number
  durationMs?: number
  reducedMotion?: boolean
}): { splitPercent: number; done: boolean } {
  if (options.reducedMotion || options.from === options.to) {
    return { splitPercent: options.to, done: true }
  }
  const duration = options.durationMs ?? COLLAPSE_MOTION_MS
  if (options.elapsedMs >= duration) {
    return { splitPercent: options.to, done: true }
  }
  if (options.elapsedMs <= 0) {
    return { splitPercent: options.from, done: false }
  }
  const t = collapseEase(options.elapsedMs / duration)
  return { splitPercent: options.from + (options.to - options.from) * t, done: false }
}

/** Stay mounted: hidden / flex 0, never unmount. Flex-basis updates come from splitPercent (drag or rAF). */
export function panelStayMountedStyle(options: {
  layout: ReadLayoutMode
  panelId: ReadPanelId
  collapsedPanelId: ReadPanelId | null
  panel1Percent: number
}): CSSProperties {
  const noFlexTween = { transition: 'none' } as const
  if (isPanelOffFlow(options)) {
    return {
      flexGrow: 0,
      flexShrink: 0,
      flexBasis: 0,
      width: 0,
      height: 0,
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden',
      visibility: 'hidden',
      pointerEvents: 'none',
      position: 'absolute',
      top: 0,
      left: 0,
      ...noFlexTween,
    }
  }
  // Sole visible pane: grow into leftover after the restore / resize strip.
  if (options.layout === 'one' || options.collapsedPanelId) {
    return {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 0,
      visibility: 'visible',
      ...noFlexTween,
    }
  }
  const basis = options.panelId === 'panel-1' ? options.panel1Percent : 100 - options.panel1Percent
  return {
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: `${basis}%`,
    minWidth: 0,
    minHeight: 0,
    visibility: 'visible',
    ...noFlexTween,
  }
}
