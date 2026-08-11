import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceWithStatus } from './types'

type Door43CatalogResult = {
  language?: Record<string, unknown>
  door43_metadata?: Record<string, unknown>
  release?: ResourceWithStatus['release']
}

function inferResourceTypeFromSubject(subject: string): {
  resourceType: ResourceType
  resourceFormat: ResourceFormat
} {
  const normalized = subject.toLowerCase()
  if (normalized.includes('bible')) {
    return { resourceType: ResourceType.SCRIPTURE, resourceFormat: ResourceFormat.USFM }
  }
  if (normalized.includes('words')) {
    return { resourceType: ResourceType.WORDS, resourceFormat: ResourceFormat.MARKDOWN }
  }
  if (normalized.includes('notes')) {
    return { resourceType: ResourceType.NOTES, resourceFormat: ResourceFormat.TSV }
  }
  return { resourceType: ResourceType.UNKNOWN, resourceFormat: ResourceFormat.UNKNOWN }
}

function buildDoor43Metadata(
  resource: Record<string, unknown>,
  resourceKey: string,
  resourceType: ResourceType,
  resourceFormat: ResourceFormat
): ResourceMetadata {
  return {
    resourceKey,
    resourceId: (resource.abbreviation || resource.id || resource.name) as string,
    server: 'git.door43.org',
    owner: resource.owner as string,
    language: resource.language as string,
    title: (resource.title || resource.name) as string,
    subject: (resource.subject || 'Unknown') as string,
    type: resourceType,
    format: resourceFormat,
    contentType: 'text/plain',
    contentStructure:
      resourceType === ResourceType.SCRIPTURE || resourceType === ResourceType.NOTES
        ? ('book' as const)
        : ('entry' as const),
    availability: {
      online: true,
      offline: false,
      bundled: false,
      partial: false,
    },
    locations: [],
    catalogedAt: new Date().toISOString(),
    version: (resource.metadata_version || resource.version || '1.0.0') as string,
  }
}

export function addDoor43CatalogResults(
  catalogResults: Door43CatalogResult[],
  allResources: Map<string, ResourceWithStatus>,
  supportedSubjects: string[],
  hasResourceInPackage: (resourceKey: string) => boolean
) {
  for (const result of catalogResults) {
    const resource = (result.language ? result : result.door43_metadata) as Record<string, unknown> | undefined
    if (!resource) continue

    const release = result.release || (resource.release as ResourceWithStatus['release'])
    const resourceKey = `${resource.owner}/${resource.language}/${resource.abbreviation || resource.id}`

    if (allResources.has(resourceKey)) continue

    const { resourceType, resourceFormat } = inferResourceTypeFromSubject((resource.subject || '') as string)
    const metadata = buildDoor43Metadata(resource, resourceKey, resourceType, resourceFormat)
    const isSupported = supportedSubjects.includes(metadata.subject)
    const isInWorkspace = hasResourceInPackage(resourceKey)

    allResources.set(resourceKey, {
      ...metadata,
      isCached: false,
      isInWorkspace,
      isSupported,
      viewerName: isSupported ? metadata.subject : undefined,
      ingredients: resource.ingredients as ResourceWithStatus['ingredients'],
      release,
    })
  }
}
