import { useEffect } from 'react'
import { usePackageStore } from '../../lib/stores'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'

/**
 * Auto-load active package/collection into the workspace on Studio mount.
 */
export function useStudioCollectionLoad() {
  const activePackageId = usePackageStore((s) => s.activePackageId)
  const packages = usePackageStore((s) => s.packages)
  const loadPackages = usePackageStore((s) => s.loadPackages)
  const loadFromCollection = useWorkspaceStore((s) => s.loadFromCollection)

  useEffect(() => {
    loadPackages()
  }, [loadPackages])

  useEffect(() => {
    if (!activePackageId || packages.length === 0) return
    const activeCollection = packages.find((p) => p.id === activePackageId)
    if (!activeCollection) return
    void loadFromCollection(activePackageId).catch((err) => {
      console.warn('⚠️ Failed to load collection into workspace:', err)
    })
  }, [activePackageId, packages, loadFromCollection])

  const activeCollection = activePackageId
    ? packages.find((p) => p.id === activePackageId) ?? null
    : null

  return { activePackageId, packages, activeCollection }
}
