/**
 * One-way panel → AppStore projection after layout mutations / restore.
 */

import { projectPanelResourcesToAppStore } from './projectPanelResourcesToAppStore'
import type { WorkspacePackage } from './workspaceTypes'

export function projectPanelsFromPackage(
  pkg: WorkspacePackage | null | undefined,
  pruneKeys?: Iterable<string>
) {
  if (!pkg) return
  projectPanelResourcesToAppStore({
    panels: pkg.panels,
    resources: pkg.resources,
    pruneKeys,
  })
}
