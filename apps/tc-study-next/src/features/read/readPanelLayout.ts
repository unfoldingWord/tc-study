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

/** Stay mounted: hidden / flex 0, never unmount. */
export function panelStayMountedStyle(options: {
  layout: ReadLayoutMode
  panelId: ReadPanelId
  collapsedPanelId: ReadPanelId | null
  panel1Percent: number
}): CSSProperties {
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
    }
  }
  // Sole visible pane: grow into leftover after the 1.5px divider.
  // flexBasis 100% + flexShrink 0 puts the strip past overflow-hidden.
  if (options.layout === 'one' || options.collapsedPanelId) {
    return {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: 0,
      minWidth: 0,
      minHeight: 0,
      visibility: 'visible',
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
  }
}
