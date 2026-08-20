import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ComponentType, ReactNode } from 'react'
import type { ResourceInfo } from '../../contexts/types'
import {
  isCombinedHelpsResourceType,
  normalizeResourceTypeId,
} from '../../utils/normalizeResourceTypeId'
import { FallbackViewer } from '../../components/resources'

export interface ViewerRegistryLike {
  // Boundary type: registry implementations use ResourceMetadata; callers cast looser shapes.
  getViewer(metadata: ResourceMetadata): unknown
  getViewerByType(type: string): unknown
}

/**
 * Resolve a resource viewer component instance for Read/Studio panels.
 */
export function resolveViewerForResource(options: {
  resource: ResourceInfo
  resourceKey: string
  viewerRegistry: ViewerRegistryLike
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
  extraProps?: Record<string, unknown>
}): ReactNode {
  const { resource, resourceKey, viewerRegistry, onEntryLinkClick, extraProps } = options

  const resourceMetadata: Record<string, unknown> = {
    type: resource.type,
    subject: resource.subject || resource.category,
    language: resource.language,
    owner: resource.owner,
    resourceId: resource.resourceId || resource.id,
  }

  let ViewerComponent = viewerRegistry.getViewer(
    resourceMetadata as unknown as ResourceMetadata
  ) as ComponentType<Record<string, unknown>> | undefined | null
  if (!ViewerComponent && resource.type) {
    ViewerComponent = viewerRegistry.getViewerByType(resource.type) as
      | ComponentType<Record<string, unknown>>
      | undefined
      | null
  }

  if (ViewerComponent) {
    const viewerProps: Record<string, unknown> = {
      resourceId: resource.id,
      resourceKey,
      resource,
      language: resource.language,
      ...extraProps,
    }
    const normalizedType = normalizeResourceTypeId(resource.type)
    const normalizedCategory = normalizeResourceTypeId(resource.category)
    if (
      normalizedType === 'words' ||
      normalizedType === 'words-links' ||
      normalizedType === 'academy' ||
      normalizedType === 'notes' ||
      normalizedType === 'obs-notes' ||
      normalizedType === 'obs-words-links' ||
      isCombinedHelpsResourceType(resource.type) ||
      normalizedCategory === 'words-links'
    ) {
      viewerProps.onEntryLinkClick = onEntryLinkClick
    }
    return <ViewerComponent {...viewerProps} />
  }

  return (
    <FallbackViewer
      resourceId={resource.id}
      resourceKey={resourceKey}
      resourceType={resource.type}
    />
  )
}
