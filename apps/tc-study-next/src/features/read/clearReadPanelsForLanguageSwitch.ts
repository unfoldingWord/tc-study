/**
 * Atomically clear Read panel(s) when switching text or helps language.
 *
 * Per-key removeResourceFromPanel re-runs CombinedHelps reconcile against English
 * leftovers still in the package, which re-injects English CombinedHelps mid-clear
 * and can leave panel membership / AppStore projection racing the new language load.
 *
 * Text switch clears panel-1 only (panel-2 / CombinedHelps stay). Helps switch
 * clears panel-2 only. Full `both` still flushes stale AppStore projections.
 */

import { useAppStore } from '../../contexts/AppContext'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import type { PanelConfig } from '../../lib/stores/workspaceStore'
import { ensureCombinedHelpsInWorkspace } from '../helps/ensureCombinedHelps'
import { useNavigationStore } from '../nav/navigationStore'
import { projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'

const READ_PANEL_IDS = new Set(['panel-1', 'panel-2'])

export type ReadPanelClearTarget = 'panel-1' | 'panel-2' | 'both'

export function panelClearTargetForLoad(
  loadTarget: CatalogLoadTarget,
  destPanelId?: ReadPanelClearTarget
): ReadPanelClearTarget {
  if (destPanelId === 'panel-1' || destPanelId === 'panel-2') return destPanelId
  if (loadTarget === 'text') return 'panel-1'
  if (loadTarget === 'helps') return 'panel-2'
  return 'both'
}

/** Text dest (including panel-2 scripture) must not re-inject CombinedHelps onto that pane. */
export function shouldReconcileHelpsOnPanelClear(
  loadTarget: CatalogLoadTarget,
  panelTarget: ReadPanelClearTarget
): boolean {
  if (loadTarget === 'text') return false
  return panelTarget === 'panel-2' || panelTarget === 'both'
}

function panelsToClear(panelTarget: ReadPanelClearTarget): Set<string> {
  if (panelTarget === 'both') return new Set(READ_PANEL_IDS)
  return new Set([panelTarget])
}

/**
 * Clears the targeted Read panel(s), optionally reconciles CombinedHelps for the
 * *helps* gateway language, and prunes AppStore entries that left the surviving panels.
 */
export function clearReadPanelsForLanguageSwitch(
  languageCode?: string,
  panelTarget: ReadPanelClearTarget = 'both',
  options?: { reconcileHelps?: boolean }
): string[] {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return []

  const clearIds = panelsToClear(panelTarget)
  const pruneKeys = new Set<string>()
  for (const panel of pkg.panels) {
    if (!clearIds.has(panel.id)) continue
    for (const key of panel.resourceKeys) {
      if (key) pruneKeys.add(key)
    }
  }

  if (panelTarget === 'both') {
    for (const key of Object.keys(useAppStore.getState().loadedResources)) {
      if (key) pruneKeys.add(key)
    }
  }

  const shouldReconcileHelps =
    options?.reconcileHelps ?? (panelTarget === 'panel-2' || panelTarget === 'both')

  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    for (const panel of state.currentPackage.panels) {
      if (!clearIds.has(panel.id)) continue
      panel.resourceKeys = []
      panel.activeIndex = 0
    }

    if (shouldReconcileHelps) {
      const ensured = ensureCombinedHelpsInWorkspace({
        resources: state.currentPackage.resources,
        panels: state.currentPackage.panels,
        languageCode,
      })
      state.currentPackage.resources = ensured.resources
      state.currentPackage.panels = ensured.panels as PanelConfig[]
      for (const id of ensured.removed) pruneKeys.add(id)
    }
    state.isPackageModified = true
  })

  projectCurrentWorkspacePanels({ pruneKeys })

  if (panelTarget === 'panel-1' || panelTarget === 'both') {
    useNavigationStore.setState((state) => {
      state.availableBooks = []
    })
  }

  return [...pruneKeys]
}
