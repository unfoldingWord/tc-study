import {
  LocationType,
  ResourceFormat,
  ResourceType,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'

export function door43LanguageResourceToMetadata(
  resource: {
    owner: string
    language: string
    id: string
    title?: string
    name?: string
    subject?: string
    ingredients?: unknown
    metadata_version?: string
    version?: string
  },
  subjectFallback: string
): ResourceMetadata {
  const resourceKey = `${resource.owner}/${resource.language}/${resource.id}`
  const ingredientsArr = Array.isArray(resource.ingredients) ? resource.ingredients : undefined
  return {
    resourceKey,
    resourceId: resource.id,
    server: 'git.door43.org',
    owner: resource.owner,
    language: resource.language,
    title: resource.title || resource.name || resource.id,
    subject: resource.subject || subjectFallback,
    version: resource.metadata_version || resource.version || '1.0.0',
    type: ResourceType.SCRIPTURE,
    format: ResourceFormat.USFM,
    contentType: 'text/usfm',
    contentStructure: 'book',
    availability: {
      online: true,
      offline: false,
      bundled: false,
      partial: false,
    },
    locations: [
      {
        type: LocationType.NETWORK,
        path: `https://git.door43.org/${resource.owner}/${resource.language}_${resource.id}`,
        priority: 1,
      },
    ],
    catalogedAt: new Date().toISOString(),
    contentMetadata: ingredientsArr
      ? {
          ingredients: ingredientsArr as NonNullable<
            ResourceMetadata['contentMetadata']
          >['ingredients'],
        }
      : undefined,
  }
}
