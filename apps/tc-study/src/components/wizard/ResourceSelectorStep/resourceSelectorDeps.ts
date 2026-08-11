import type { CatalogManager, ResourceMetadata, ViewerRegistry } from '@bt-synergy/catalog-manager'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceTypeRegistry } from '@bt-synergy/resource-types'
import { checkAllDependencies } from '../../../utils/comprehensiveDependencySearch'
import type { ResourceWithStatus } from './types'

type WorkspacePackageResource = ResourceWithStatus & {
  languageCode?: string
  id?: string
  name?: string
  category?: string
}

function resolveResourceTypeId(
  resource: ResourceWithStatus,
  resourceTypeRegistry: ResourceTypeRegistry
): string | undefined {
  const allTypes = resourceTypeRegistry.getAll()
  for (const type of allTypes) {
    if (type.subjects.some((s) => s.toLowerCase() === (resource.subject || '').toLowerCase())) {
      return type.id
    }
  }
  return undefined
}

function resolveDepTypeAndFormat(
  depResource: Record<string, unknown>,
  resourceTypeRegistry: ResourceTypeRegistry
): { depType: ResourceType; depFormat: ResourceFormat; registeredTypeId?: string } {
  const depSubject = ((depResource.subject || '') as string).toLowerCase()
  let depType = ResourceType.UNKNOWN
  let depFormat = ResourceFormat.UNKNOWN
  let registeredTypeId: string | undefined

  for (const typeDef of resourceTypeRegistry.getAll()) {
    if (typeDef.subjects.some((s) => s.toLowerCase() === depSubject)) {
      registeredTypeId = typeDef.id
      depType = typeDef.id as ResourceType
      break
    }
  }

  if (registeredTypeId) {
    if (depSubject.includes('words')) {
      depFormat = ResourceFormat.MARKDOWN
    } else if (depSubject.includes('notes') || depSubject.includes('links')) {
      depFormat = ResourceFormat.TSV
    } else if (depSubject.includes('bible')) {
      depFormat = ResourceFormat.USFM
    } else {
      depFormat = ResourceFormat.MARKDOWN
    }
  } else {
    if (depSubject.includes('words')) {
      depType = ResourceType.WORDS
      depFormat = ResourceFormat.MARKDOWN
    } else if (depSubject.includes('notes')) {
      depType = ResourceType.NOTES
      depFormat = ResourceFormat.TSV
    } else if (depSubject.includes('bible')) {
      depType = ResourceType.SCRIPTURE
      depFormat = ResourceFormat.USFM
    }
  }

  return { depType, depFormat, registeredTypeId }
}

function addDependencyFromDoor43(
  depKey: string,
  depResource: Record<string, unknown>,
  supportedResources: Map<string, ResourceWithStatus>,
  viewerRegistry: ViewerRegistry,
  resourceTypeRegistry: ResourceTypeRegistry
) {
  const depViewer = viewerRegistry.getViewer({
    subject: depResource.subject,
    format: depResource.format || 'markdown',
  } as ResourceMetadata)

  const { depType, depFormat } = resolveDepTypeAndFormat(depResource, resourceTypeRegistry)

  supportedResources.set(depKey, {
    resourceKey: depKey,
    resourceId: (depResource.abbreviation || depResource.id) as string,
    server: 'git.door43.org',
    owner: depResource.owner as string,
    language: depResource.language as string,
    title: (depResource.title || depResource.name) as string,
    subject: depResource.subject as string,
    type: depType,
    format: depFormat,
    contentType: 'text/plain',
    contentStructure: 'entry' as const,
    availability: {
      online: true,
      offline: false,
      bundled: false,
      partial: false,
    },
    locations: [],
    catalogedAt: new Date().toISOString(),
    version: (depResource.version || '1.0.0') as string,
    isCached: false,
    isInWorkspace: false,
    isSupported: !!depViewer,
    viewerName: depViewer?.displayName,
    isAutoIncluded: true,
    ingredients: depResource.ingredients as ResourceWithStatus['ingredients'],
    release: depResource.release as ResourceWithStatus['release'],
  })
}

function addDependencyFromWorkspace(
  depKey: string,
  workspaceResources: Map<string, WorkspacePackageResource>,
  supportedResources: Map<string, ResourceWithStatus>
) {
  let workspaceResource = workspaceResources.get(depKey)

  if (!workspaceResource) {
    workspaceResource = Array.from(workspaceResources.values()).find((r) => {
      const constructedKey = `${r.owner}/${r.languageCode || r.language}/${r.resourceId || r.id}`
      return constructedKey === depKey
    })
  }

  if (!workspaceResource) return

  supportedResources.set(depKey, {
    ...workspaceResource,
    resourceKey: depKey,
    resourceId: workspaceResource.resourceId || workspaceResource.id || depKey,
    title: workspaceResource.title || workspaceResource.name || depKey,
    subject: workspaceResource.subject || workspaceResource.category || 'Unknown',
    isCached: workspaceResource.isCached ?? true,
    isInWorkspace: true,
    isSupported: true,
    isAutoIncluded: true,
  })
}

export async function processSupportedResourceDependencies(
  supportedResources: Map<string, ResourceWithStatus>,
  originalLanguageResources: Map<string, ResourceWithStatus>,
  workspaceResources: Map<string, WorkspacePackageResource>,
  deps: {
    catalogManager: CatalogManager
    resourceTypeRegistry: ResourceTypeRegistry
    viewerRegistry: ViewerRegistry
  }
) {
  for (const [, resource] of supportedResources.entries()) {
    const resourceTypeId = resolveResourceTypeId(resource, deps.resourceTypeRegistry)
    if (!resourceTypeId) continue

    const allAvailableResources = new Map([...supportedResources, ...originalLanguageResources])
    const depCheck = await checkAllDependencies(
      resourceTypeId,
      resource.language,
      resource.owner,
      workspaceResources,
      deps.catalogManager,
      deps.resourceTypeRegistry,
      allAvailableResources
    )

    if (depCheck.results.length === 0) continue

    resource.hasDependencies = true
    resource.dependenciesAvailable = depCheck.allAvailable
    resource.missingDependencies = depCheck.results.filter((r) => !r.searchResult.found)

    const autoAddKeys: string[] = []
    for (const result of depCheck.results) {
      if (!result.searchResult.found || !result.searchResult.resourceKey) continue

      const depKey = result.searchResult.resourceKey
      const isInWorkspace = result.searchResult.location === 'workspace'
      const isOriginalLang = originalLanguageResources.has(depKey)
      const isInCatalog = result.searchResult.location === 'catalog' && supportedResources.has(depKey)
      const needsAutoAdd =
        result.searchResult.location === 'door43' || isInWorkspace || isOriginalLang || isInCatalog

      if (needsAutoAdd) {
        autoAddKeys.push(depKey)
      }

      if (result.searchResult.location === 'door43' && !supportedResources.has(depKey) && !isOriginalLang) {
        const depResource = result.searchResult.resource
        if (depResource) {
          addDependencyFromDoor43(depKey, depResource, supportedResources, deps.viewerRegistry, deps.resourceTypeRegistry)
        }
      } else if (isOriginalLang && !supportedResources.has(depKey)) {
        const origResource = originalLanguageResources.get(depKey)
        if (origResource) {
          supportedResources.set(depKey, {
            ...origResource,
            isAutoIncluded: true,
          })
        }
      } else if (isInWorkspace && !supportedResources.has(depKey)) {
        addDependencyFromWorkspace(depKey, workspaceResources, supportedResources)
      }
    }

    if (autoAddKeys.length > 0) {
      resource.autoAddedDependencies = autoAddKeys
    }
  }
}
