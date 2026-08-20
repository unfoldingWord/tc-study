import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

export function getLibraryResourceKey(resource: ResourceMetadata): string {
  return `${resource.owner}/${resource.language}/${resource.resourceId}`
}

export function filterLibraryResources(
  resources: ResourceMetadata[],
  searchQuery: string
): ResourceMetadata[] {
  if (!searchQuery) return resources
  const query = searchQuery.toLowerCase()
  return resources.filter(
    (r) =>
      r.title?.toLowerCase().includes(query) ||
      r.resourceId?.toLowerCase().includes(query) ||
      r.owner?.toLowerCase().includes(query) ||
      r.language?.toLowerCase().includes(query) ||
      r.subject?.toLowerCase().includes(query)
  )
}
