/**
 * Reopen a collapsed panel when a cross-panel token/quote/help-link fires
 * from the visible panel (issue #33). One-panel layout does not invent a
 * second panel.
 */

import type { ReadLayoutMode } from './readPanelPersistence'
import type { ReadPanelId } from './readPanelModel'

export const CROSS_PANEL_REOPEN_SIGNALS = [
  'token-click',
  'verse-filter',
  'obs-frame-highlight',
  'entry-link-click',
] as const

export type CrossPanelReopenSignal = (typeof CROSS_PANEL_REOPEN_SIGNALS)[number]

export function isCrossPanelReopenSignal(type: string): type is CrossPanelReopenSignal {
  return (CROSS_PANEL_REOPEN_SIGNALS as readonly string[]).includes(type)
}

export function shouldReopenCollapsedPanel(options: {
  layout: ReadLayoutMode
  collapsedPanelId: ReadPanelId | null
  sourcePanelId: ReadPanelId
  signalType: string
}): boolean {
  if (options.layout !== 'two') return false
  if (!options.collapsedPanelId) return false
  if (options.collapsedPanelId === options.sourcePanelId) return false
  return isCrossPanelReopenSignal(options.signalType)
}
