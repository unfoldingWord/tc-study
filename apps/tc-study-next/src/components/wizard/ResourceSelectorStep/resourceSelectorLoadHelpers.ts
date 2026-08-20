import type { CatalogManager, ResourceMetadata, ViewerRegistry } from '@bt-synergy/catalog-manager'
import { isOriginalLanguageResource } from '../../../utils/resourceHelpers'
import type { ResourceInfo } from '../../../contexts/types'
import type { ResourceWithStatus } from './types'

export function partitionResourcesByLanguageSupport(allResources: Map<string, ResourceWithStatus>) {
  const supportedResources = new Map(
    Array.from(allResources.entries()).filter(([_, res]) => {
      return res.isSupported && !isOriginalLanguageResource(res.language, res.subject || '')
    })
  )

  const originalLanguageResources = new Map(
    Array.from(allResources.entries()).filter(([_, res]) => {
      return res.isSupported && isOriginalLanguageResource(res.language, res.subject || '')
    })
  )

  return { supportedResources, originalLanguageResources }
}

type WorkspacePackageResource = ResourceWithStatus & {
  languageCode?: string
  id?: string
  name?: string
  category?: string
}

export function mergeWorkspaceOriginalLanguageResources(
  originalLanguageResources: Map<string, ResourceWithStatus>,
  workspaceResources: Map<string, WorkspacePackageResource>
) {
  for (const [key, wsRes] of workspaceResources.entries()) {
    const resource = wsRes
    if (isOriginalLanguageResource(resource.languageCode || resource.language, resource.subject || '')) {
      if (!originalLanguageResources.has(key)) {
        originalLanguageResources.set(key, {
          resourceKey: key,
          resourceId: resource.resourceId || resource.id || key,
          server: resource.server || 'git.door43.org',
          owner: resource.owner,
          language: resource.languageCode || resource.language,
          title: resource.title || resource.name || key,
          subject: resource.subject || resource.category || 'Unknown',
          type: resource.type,
          format: resource.format,
          contentType: resource.contentType || 'text/plain',
          contentStructure: resource.contentStructure || 'entry',
          availability: resource.availability || {
            online: false,
            offline: true,
            bundled: false,
            partial: false,
          },
          locations: resource.locations || [],
          catalogedAt: resource.catalogedAt || new Date().toISOString(),
          version: resource.version || '1.0.0',
          isCached: true,
          isInWorkspace: true,
          isSupported: true,
          viewerName: resource.viewerName,
        })
      }
    }
  }
}

export function buildResourceInfoMap(
  supportedResources: Map<string, ResourceWithStatus>,
  hasResourceInPackage: (resourceKey: string) => boolean
) {
  return new Map<string, ResourceInfo>(
    Array.from(supportedResources.entries()).map(([resourceKey, res]) => [
      resourceKey,
      {
        ...res,
        id: res.resourceId,
        key: resourceKey,
        resourceKey,
        title: res.title,
        type: '' as ResourceInfo['type'],
        category: res.subject || 'unknown',
        language: res.language,
        owner: res.owner,
        server: res.server,
        subject: res.subject,
        format: res.format,
        resourceId: res.resourceId,
        ingredients: res.ingredients,
        version: res.version,
        release: res.release,
        hasDependencies: res.hasDependencies,
        dependenciesAvailable: res.dependenciesAvailable,
        missingDependencies: res.missingDependencies,
        autoAddedDependencies: res.autoAddedDependencies,
        isAutoIncluded: res.isAutoIncluded || false,
        isCached: res.isCached,
        isInWorkspace: hasResourceInPackage(resourceKey),
      } as unknown as ResourceInfo,
    ])
  )
}

export function getWorkspaceResourceKeys(
  supportedResources: Map<string, ResourceWithStatus>,
  hasResourceInPackage: (resourceKey: string) => boolean
) {
  return Array.from(supportedResources.entries())
    .filter(([key]) => hasResourceInPackage(key))
    .map(([key]) => key)
}

export function addCatalogResultToMap(
  allResources: Map<string, ResourceWithStatus>,
  metadata: ResourceMetadata,
  deps: {
    viewerRegistry: ViewerRegistry
    catalogManager: CatalogManager
    hasResourceInPackage: (resourceKey: string) => boolean
  }
) {
  const viewer = deps.viewerRegistry.getViewer(metadata)
  return Promise.all([
    deps.catalogManager.isResourceCached(metadata.resourceKey),
    Promise.resolve(deps.hasResourceInPackage(metadata.resourceKey)),
  ]).then(([isCached, isInWorkspace]) => {
    allResources.set(metadata.resourceKey, {
      ...metadata,
      isCached,
      isInWorkspace,
      isSupported: !!viewer,
      viewerName: viewer?.displayName,
    })
  })
}
