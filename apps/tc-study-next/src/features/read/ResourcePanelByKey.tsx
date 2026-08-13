import { useAppStore } from '../../contexts/AppContext'
import { useViewerRegistry } from '../../contexts'
import { LoadingSpinner } from '../../shared/LoadingSpinner'
import { resolveViewerForResource } from './resolveViewerForResource'

/**
 * Renders a panel resource by id. Subscribes only to loadedResources[resourceId],
 * so metadata updates for other resources do not cause this panel to re-render.
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
  const resource = useAppStore((s) => s.loadedResources[resourceId])
  if (!resource) {
    return (
      <LoadingSpinner
        centered
        label="Loading resource"
        containerClassName="h-full"
      />
    )
  }
  const resourceKey = resource.key || resource.id
  return resolveViewerForResource({
    resource,
    resourceKey,
    viewerRegistry,
    onEntryLinkClick,
  })
}
