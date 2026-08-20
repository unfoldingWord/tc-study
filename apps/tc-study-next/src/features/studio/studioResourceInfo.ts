import {
  ResourceFormat,
  ResourceType,
  type ResourceMetadata as CatalogResourceMetadata,
} from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../../contexts'

export function resourceInfoFromCatalogMetadata(
  resourceKey: string,
  metadata: CatalogResourceMetadata
): ResourceInfo {
  const subject = metadata.subject?.toLowerCase() ?? ''
  const category =
    subject.includes('bible')
      ? 'scripture'
      : subject.includes('words')
        ? 'words'
        : subject.includes('notes')
          ? 'notes'
          : subject.includes('questions')
            ? 'questions'
            : String(metadata.type)

  return {
    ...metadata,
    id: resourceKey,
    key: resourceKey,
    category,
    ingredients: metadata.contentMetadata?.ingredients as ResourceInfo['ingredients'],
    metadata,
    location: metadata.locations?.[0]?.type ?? 'network',
  } as ResourceInfo
}

export function minimalResourceInfoFallback(resourceKey: string): ResourceInfo {
  const owner = resourceKey.split('/')[0] ?? 'unknown'
  return {
    id: resourceKey,
    key: resourceKey,
    resourceKey,
    title: resourceKey.split('/').pop() || resourceKey,
    type: ResourceType.UNKNOWN,
    category: 'unknown',
    format: ResourceFormat.MARKDOWN,
    language: 'en',
    owner,
    server: 'git.door43.org',
  } as ResourceInfo
}
