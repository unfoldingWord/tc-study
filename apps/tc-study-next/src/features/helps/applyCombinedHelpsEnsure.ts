import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import type { PanelConfig } from '../../lib/stores/workspaceStore'
import { projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import { ensureCombinedHelpsInWorkspace } from './ensureCombinedHelps'

/**
 * Sole store-facing CombinedHelps inject/reconcile for Read bootstrap (and any
 * caller that needs ensure + one-way AppStore projection).
 *
 * Runs {@link ensureCombinedHelpsInWorkspace} against the current workspace
 * package, writes panels/resources back, then projects all panel keys into
 * AppStore (pruning reconciled-away CombinedHelps ids).
 */
export function applyCombinedHelpsEnsure(languageCode?: string): string[] {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return []

  const ensured = ensureCombinedHelpsInWorkspace({
    resources: pkg.resources,
    panels: pkg.panels,
    languageCode,
  })

  useWorkspaceStore.setState((state) => {
    if (!state.currentPackage) return
    state.currentPackage.resources = ensured.resources
    state.currentPackage.panels = ensured.panels as PanelConfig[]
    state.isPackageModified = true
  })

  projectCurrentWorkspacePanels({
    pruneKeys: ensured.removed,
  })

  return ensured.injected.length > 0
    ? ensured.injected
    : [COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID].filter((id) =>
        ensured.resources.has(id)
      )
}
