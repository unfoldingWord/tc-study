/**
 * One- vs two-panel layout + collapse-to-rail (issues #31–#32).
 * Collapse is two-panel with one parked; one-panel layout has no rail.
 */

import type { CSSProperties } from 'react'
import type { ReadPanelId } from './readPanelModel'
import type { ReadLayoutMode } from './readPanelPersistence'

export const COLLAPSE_THRESHOLD_PERCENT = 12
export const DEFAULT_SPLIT_PERCENT = 50
export const RAIL_PX = 44
export const NARROW_VIEWPORT_MQ = '(max-width: 767px)'

export function defaultLayoutForViewport(isNarrow: boolean, persisted?: ReadLayoutMode, userChosen?: boolean): ReadLayoutMode {
  if (userChosen && persisted) return persisted
  return isNarrow ? 'one' : 'two'
}

export function collapseAfterDragEnd(percent: number): {
  splitPercent: number
  collapsedPanelId: ReadPanelId | null
} {
  if (percent <= COLLAPSE_THRESHOLD_PERCENT) {
    return { splitPercent: percent, collapsedPanelId: 'panel-1' }
  }
  if (percent >= 100 - COLLAPSE_THRESHOLD_PERCENT) {
    return { splitPercent: percent, collapsedPanelId: 'panel-2' }
  }
  return { splitPercent: percent, collapsedPanelId: null }
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

export function isPanelOffFlow(options: {
  layout: ReadLayoutMode
  panelId: ReadPanelId
  collapsedPanelId: ReadPanelId | null
}): boolean {
  if (options.layout === 'one') return options.panelId === 'panel-2'
  return options.collapsedPanelId === options.panelId
}

export function showPanelRail(options: {
  layout: ReadLayoutMode
  panelId: ReadPanelId
  collapsedPanelId: ReadPanelId | null
}): boolean {
  if (options.layout !== 'two') return false
  return options.collapsedPanelId === options.panelId
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
      minWidth: 0,
      minHeight: 0,
      overflow: 'hidden',
      visibility: 'hidden',
      pointerEvents: 'none',
      position: 'absolute',
    }
  }
  if (options.layout === 'one') {
    return {
      flexGrow: 1,
      flexShrink: 1,
      flexBasis: '100%',
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
