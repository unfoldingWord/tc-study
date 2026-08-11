import type { Panel, ResourcePackage } from '@bt-synergy/package-storage'
import type { WorkspacePackage } from '../workspace/workspaceTypes'

/** Convert a stored ResourcePackage into a WorkspacePackage shell (empty resources Map). */
export function resourcePackageToWorkspace(pkg: ResourcePackage): WorkspacePackage {
  return {
    id: pkg.id,
    name: pkg.name,
    version: pkg.version,
    description: pkg.description,
    resources: new Map(),
    panels: (pkg.panelLayout?.panels || []).map((panel: Panel, idx: number) => ({
      id: panel.id,
      name: panel.title || `Panel ${idx + 1}`,
      resourceKeys: panel.resourceIds || [],
      activeIndex: panel.defaultResourceId
        ? panel.resourceIds?.indexOf(panel.defaultResourceId) ?? 0
        : 0,
      position: idx,
    })),
  }
}
