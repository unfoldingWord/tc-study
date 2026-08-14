/**
 * One- vs two-panel layout + collapse-to-divider (issues #31–#32).
 * Collapse is two-panel with one parked behind the same thin resize strip.
 * One-panel layout parks panel-2 the same way so the rail can add it;
 * token reopen (#33) still requires layout === 'two'.
 */

import type { CSSProperties } from 'react'
import type { ReadPanelId } from './readPanelModel'
import type { ReadLayoutMode } from './readPanelPersistence'

/** Pane share of the panels container at or below which drag-end snaps to collapse. */
export const COLLAPSE_THRESHOLD_PERCENT = 30
export const DEFAULT_SPLIT_PERCENT = 50
export const NARROW_VIEWPORT_MQ = '(max-width: 767px)'

export type CollapsedDividerArrow = 'left' | 'right' | 'up' | 'down'

export function defaultLayoutForViewport(isNarrow: boolean, persisted?: ReadLayoutMode, userChosen?: boolean): ReadLayoutMode {
  if (userChosen && persisted) return persisted
  return isNarrow ? 'one' : 'two'
}

export function collapseAfterDragEnd(percent: number): {
  splitPercent: number
  collapsedPanelId: ReadPanelId | null
} {
  const panel1Share = percent
  const panel2Share = 100 - percent
  const panel1TooSmall = panel1Share <= COLLAPSE_THRESHOLD_PERCENT
  const panel2TooSmall = panel2Share <= COLLAPSE_THRESHOLD_PERCENT
  if (!panel1TooSmall && !panel2TooSmall) {
    return { splitPercent: percent, collapsedPanelId: null }
  }
  // Collapse only the smaller pane (even if both somehow meet the threshold).
  const collapsedPanelId: ReadPanelId = panel1Share <= panel2Share ? 'panel-1' : 'panel-2'
  return { splitPercent: percent, collapsedPanelId }
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

export type PanelCollapseAnimPhase = 'idle' | 'out' | 'in'

export function slideOffTransform(panelId: ReadPanelId, stacked: boolean): string {
  if (stacked) return panelId === 'panel-1' ? 'translateY(-100%)' : 'translateY(100%)'
  return panelId === 'panel-1' ? 'translateX(-100%)' : 'translateX(100%)'
}

/** Same axis as slide-off so the browser interpolates one transform, not `none` → translate. */
export function slideOnTransform(stacked: boolean): string {
  return stacked ? 'translateY(0)' : 'translateX(0)'
}

/**
 * During restore (`in`), keep treating the entering pane as parked so the
 * remaining pane stays pinned at 100% — do not tween its flex-basis.
 */
export function layoutCollapsedPanelId(options: {
  collapsedPanelId: ReadPanelId | null
  phase: PanelCollapseAnimPhase
  animPanelId: ReadPanelId | null
}): ReadPanelId | null {
  if (options.phase === 'in' && options.animPanelId) return options.animPanelId
  return options.collapsedPanelId
}

export function nextCollapseAnimPhase(options: {
  prevCollapsed: ReadPanelId | null
  nextCollapsed: ReadPanelId | null
  prevLayout: ReadLayoutMode
  nextLayout: ReadLayoutMode
  reducedMotion: boolean
}): { phase: PanelCollapseAnimPhase; panelId: ReadPanelId | null } {
  if (options.reducedMotion) return { phase: 'idle', panelId: null }
  if (options.prevLayout === 'one' && options.nextLayout === 'two') {
    return { phase: 'in', panelId: 'panel-2' }
  }
  if (options.prevLayout === 'two' && options.nextLayout === 'one') {
    return { phase: 'out', panelId: 'panel-2' }
  }
  if (!options.prevCollapsed && options.nextCollapsed) {
    return { phase: 'out', panelId: options.nextCollapsed }
  }
  if (options.prevCollapsed && !options.nextCollapsed) {
    return { phase: 'in', panelId: options.prevCollapsed }
  }
  return { phase: 'idle', panelId: null }
}

function collapseSlideEdge(panelId: ReadPanelId, stacked: boolean): CSSProperties {
  if (stacked) {
    return panelId === 'panel-1'
      ? { top: 0, bottom: 'auto', left: 0, right: 0 }
      : { top: 'auto', bottom: 0, left: 0, right: 0 }
  }
  return panelId === 'panel-1'
    ? { top: 0, bottom: 0, left: 0, right: 'auto' }
    : { top: 0, bottom: 0, left: 'auto', right: 0 }
}

/** Overlay styles while a pane slides off or back in. Empty when idle / reduced motion. */
export function panelCollapseMotionStyle(options: {
  panelId: ReadPanelId
  animPanelId: ReadPanelId | null
  phase: PanelCollapseAnimPhase
  sliding: boolean
  stacked: boolean
  panel1Percent: number
  reducedMotion: boolean
}): CSSProperties {
  if (options.reducedMotion || options.phase === 'idle') {
    return {}
  }
  if (options.animPanelId !== options.panelId) {
    return { transition: 'none' }
  }
  const share =
    options.panelId === 'panel-1' ? options.panel1Percent : 100 - options.panel1Percent
  const off = slideOffTransform(options.panelId, options.stacked)
  const on = slideOnTransform(options.stacked)
  // First frame: park at the start transform with no transition so restore
  // does not tween from identity → off (that reads as a bounce).
  const transition = options.sliding
    ? `transform ${COLLAPSE_MOTION_MS}ms ${COLLAPSE_MOTION_EASING}`
    : 'none'
  const transform =
    options.phase === 'out'
      ? options.sliding
        ? off
        : on
      : options.sliding
        ? on
        : off

  return {
    position: 'absolute',
    zIndex: 2,
    overflow: 'hidden',
    visibility: 'visible',
    pointerEvents: 'none',
    flexGrow: 0,
    flexShrink: 0,
    flexBasis: 'auto',
    minWidth: 0,
    minHeight: 0,
    ...collapseSlideEdge(options.panelId, options.stacked),
    ...(options.stacked
      ? { height: `${share}%`, width: '100%' }
      : { width: `${share}%`, height: '100%' }),
    transform,
    transition,
    willChange: 'transform',
  }
}

/** Stay mounted: hidden / flex 0, never unmount. Never tween flex (cascade). */
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
  // Pin immediately (flexGrow) — do not animate flex-basis alongside the slide.
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
