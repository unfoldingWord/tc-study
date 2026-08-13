/**
 * Atomically clear Read panels when switching language.
 *
 * Per-key removeResourceFromPanel re-runs CombinedHelps reconcile against English
 * leftovers still in the package, which re-injects English CombinedHelps mid-clear
 * and can leave panel membership / AppStore projection racing the new language load.
 *
 * Also flushes AppStore `loadedResources` for prior panel keys — stale
 * `verifiedIngredients` on a previous-language key (still in AppStore but off-panel)
 * would otherwise be preserved on re-project and hide GL scripture tabs for the
 * current book.
 */

import { useAppStore } from '../../contexts/AppContext'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import type { PanelConfig } from '../../lib/stores/workspaceStore'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import { useNavigationStore } from '../nav/navigationStore'
import { projectCurrentWorkspacePanels } from '../workspace/resourceMutations'

const READ_PANEL_IDS = new Set(['panel-1', 'panel-2'])

/**
 * Clears panel-1/panel-2 membership, resets activeIndex, reconciles CombinedHelps
 * for the *target* gateway language (so English leftovers cannot re-inject), and
 * prunes AppStore entries that left all panels (plus any lingering loaded keys).
 */
export function clearReadPanelsForLanguageSwitch(languageCode?: string): string[] {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return []

  const pruneKeys = new Set<string>()
  for (const panel of pkg.panels) {
    if (!READ_PANEL_IDS.has(panel.id)) continue
    for (const key of panel.resourceKeys) {
      if (key) pruneKeys.add(key)
    }
  }
  // Drop stale AppStore projections from earlier languages (may be off-panel already)
  for (const key of Object.keys(useAppStore.getState().loadedResources)) {
    if (key) pruneKeys.add(key)
  }

  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    for (const panel of state.currentPackage.panels) {
      if (!READ_PANEL_IDS.has(panel.id)) continue
      panel.resourceKeys = []
      panel.activeIndex = 0
    }

    const ensured = ensureCombinedHelpsInWorkspace({
      resources: state.currentPackage.resources,
      panels: state.currentPackage.panels,
      languageCode,
    })
    state.currentPackage.resources = ensured.resources
    state.currentPackage.panels = ensured.panels as PanelConfig[]
    for (const id of ensured.removed) pruneKeys.add(id)
    state.isPackageModified = true
  })

  projectCurrentWorkspacePanels({ pruneKeys })

  // Drop prior-language book catalog so deep-links / navigateToReference do not
  // snap against stale partial GL books (e.g. es-419) while the new language loads.
  useNavigationStore.setState((state) => {
    state.availableBooks = []
  })

  return [...pruneKeys]
}
