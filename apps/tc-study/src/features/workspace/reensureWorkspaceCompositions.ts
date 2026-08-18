/**
 * Re-run composition ensure after the live registry binds.
 * Persist may have loaded before compositions registered (no-op then).
 *
 * Defaults to panel-2 (unscoped persist id) with forceHelpsPanel so the
 * default helps pane gets the CombinedHelps stub even if leftover
 * scripture/OBS keys would otherwise strip it. Do not add forceHelpsPanel
 * to catalog reconcile / no-destPanelId ensure (dual-scripture panel-2).
 */

import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { getActivePanelEntryRegistry } from '../../resourceTypes/activeRegistry'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { defaultHelpsPanelId } from '../helps/combinedHelpsIds'

export function reensureCurrentWorkspaceCompositions(): string[] {
  if (!getActivePanelEntryRegistry()?.getCompositions().length) return []
  if (!useWorkspaceStore.getState().currentPackage) return []
  return applyCombinedHelpsEnsure(undefined, defaultHelpsPanelId(), { forceHelpsPanel: true })
}
