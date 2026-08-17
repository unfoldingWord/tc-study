import { BookOpen } from 'lucide-react'
import { useMemo } from 'react'
import { useAppStore } from '../../contexts/AppContext'
import { useViewerRegistry } from '../../contexts'
import { getBaseResourceKey } from '../workspace/projectPanelResourcesToAppStore'
import { resolveViewerForResource } from './resolveViewerForResource'

/**
 * Renders a panel resource by id. Subscribes to the instance and its base key
 * (`ult#2` → `ult`) so dual-pane scripture does not spin forever.
 */
export function ResourcePanelByKey({
  resourceId,
  viewerRegistry,
  onEntryLinkClick,
}: {
  resourceId: string
  viewerRegistry: ReturnType<typeof useViewerRegistry>
  onEntryLinkClick: (resourceId: string, entryId?: string) => void
}) {
  const baseKey = getBaseResourceKey(resourceId)
  const direct = useAppStore((s) => s.loadedResources[resourceId])
  const base = useAppStore((s) => (resourceId === baseKey ? undefined : s.loadedResources[baseKey]))
  const resource = useMemo(() => {
    if (direct) return direct
    if (!base) return undefined
    return { ...base, id: resourceId, key: base.key || baseKey }
  }, [direct, base, resourceId, baseKey])
  if (!resource) {
    return (
      <div
        className="flex items-center justify-center h-full"
        role="status"
        aria-label="Resource unavailable"
        title="Resource unavailable"
      >
        <BookOpen className="w-16 h-16 text-fg-muted opacity-60" />
      </div>
    )
  }
  const resourceKey = resource.key || baseKey || resource.id
  return resolveViewerForResource({
    resource,
    resourceKey,
    viewerRegistry,
    onEntryLinkClick,
  })
}
