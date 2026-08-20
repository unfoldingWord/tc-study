import type { CatalogManager } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { LocationType, ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { createResourceMetadata } from '../../../lib/services/ResourceMetadataFactory'
import type { Door43Resource } from '../../../lib/services/ResourceMetadataFactory'
import {
  addResource,
  addResourceToPackage,
} from '../../../features/workspace/resourceMutations'
import { checkResourceDependencies, getRequiredDependencyResources } from '../../../utils/resourceDependencies'
import { createResourceInfo } from '../../../utils/resourceInfo'
import type { useResourceTypeRegistry } from '../../../contexts/CatalogContext'
import { getResourceTypeFromSubjectUsingRegistry } from './getResourceTypeFromSubject'
import type { WizardSelectableResource } from './types'

interface AddOnlyParams {
  selectedForDownload: Set<string>
  reviewResources: Map<string, WizardSelectableResource>
  catalogManager: CatalogManager
  resourceTypeRegistry: ReturnType<typeof useResourceTypeRegistry>
  currentPackageResources: Map<string, unknown> | undefined
  availableResources: Map<string, unknown>
  targetPanel: 'panel-1' | 'panel-2' | null
}

export async function addCatalogResourcesOnly({
  selectedForDownload,
  reviewResources,
  catalogManager,
  resourceTypeRegistry,
  currentPackageResources,
  availableResources,
  targetPanel,
}: AddOnlyParams): Promise<void> {
  const resourcesToAdd = new Set<string>(selectedForDownload)

  for (const resourceKey of selectedForDownload) {
    const resource = reviewResources.get(resourceKey)
    if (!resource) continue

    const resourceType = getResourceTypeFromSubjectUsingRegistry(
      resource.subject || resource.category,
      resource.type,
      resourceTypeRegistry
    )

    const depCheck = checkResourceDependencies(
      resourceType,
      resource.language || 'en',
      resource.owner || 'unfoldingWord',
      resourceTypeRegistry,
      currentPackageResources || new Map()
    )

    if (!depCheck.canAdd) {
      console.warn(
        `⚠️  ${resource.title} requires: ${depCheck.missingDependencies.map((d) => d.displayName).join(', ')}`
      )

      const requiredResourceKeys = getRequiredDependencyResources(
        resourceType,
        resource.language || 'en',
        resource.owner || 'unfoldingWord',
        resourceTypeRegistry,
        currentPackageResources || new Map(),
        availableResources
      )

      if (requiredResourceKeys.length > 0) {
        requiredResourceKeys.forEach((key) => resourcesToAdd.add(key))
      } else {
        console.error(`   ❌ Could not find required dependencies for ${resource.title}`)
      }
    }
  }

  const addedKeys: string[] = []

  for (const resourceKey of resourcesToAdd) {
    const resource = reviewResources.get(resourceKey)
    if (!resource) {
      console.warn(`⚠️ Resource not found: ${resourceKey}`)
      continue
    }

    try {
      const existingMetadata = await catalogManager.getResourceMetadata(resourceKey)
      let info = existingMetadata ? createResourceInfo(existingMetadata) : null

      if (!info) {
        let resourceData: Door43Resource = {
          id: resource.resourceId || resource.id,
          name: resource.name || resource.resourceId || resource.id,
          title: resource.title,
          owner: resource.owner,
          language: resource.language,
          subject: resource.subject || resource.category,
          version: resource.version || '1.0.0',
          format: typeof resource.format === 'string' ? resource.format : undefined,
          ingredients: resource.ingredients as Door43Resource['ingredients'],
          release: resource.release,
          server: resource.server,
        }

        if (resourceData.owner && resourceData.language && resourceData.id) {
          const repoName = `${resourceData.language}_${resourceData.id}`
          const ref = resourceData.release?.tag_name || 'master'
          const refType = resourceData.release?.tag_name ? 'tag' : 'branch'
          const metadata_url = `https://git.door43.org/${resourceData.owner}/${repoName}/raw/${refType}/${ref}/manifest.yaml`
          resourceData = { ...resourceData, metadata_url }
        }

        const resourceMetadata = await createResourceMetadata(resourceData, {
          // Enrichment is best-effort; Door43 mocks / offline must not block add
          includeEnrichment: false,
          getResourceType: (subject) =>
            getResourceTypeFromSubjectUsingRegistry(subject || resource.category, resource.type, resourceTypeRegistry),
          resourceTypeRegistry,
          debug: true,
        })

        await catalogManager.addResourceToCatalog(resourceMetadata)
        info = createResourceInfo(resourceMetadata)
      }

      if (!info) {
        console.error(`   ❌ No metadata for ${resourceKey}`)
        continue
      }

      if (targetPanel) {
        addResource(info, { panelId: targetPanel })
      } else {
        addResourceToPackage(info)
      }
      addedKeys.push(info.key || resourceKey)
    } catch (error) {
      console.error(`   ❌ Failed to add ${resource.title}:`, error)
    }
  }

  if (addedKeys.length === 0 && selectedForDownload.size > 0) {
    throw new Error('No resources were added to the workspace')
  }
}

interface DownloadParams {
  selectedForDownload: Set<string>
  reviewResources: Map<string, WizardSelectableResource>
  catalogManager: CatalogManager
  resourceTypeRegistry: ReturnType<typeof useResourceTypeRegistry>
  targetPanel: 'panel-1' | 'panel-2' | null
}

export async function downloadCatalogResources({
  selectedForDownload,
  reviewResources,
  catalogManager,
  resourceTypeRegistry,
  targetPanel,
}: DownloadParams): Promise<void> {
  const resourcesToDownload: string[] = []

  for (const resourceKey of selectedForDownload) {
    const resource = reviewResources.get(resourceKey)
    if (!resource) {
      console.warn(`⚠️ Resource not found: ${resourceKey}`)
      continue
    }

    try {
      let metadata = await catalogManager.getResourceMetadata(resourceKey)

      if (!metadata) {
        const resourceData = resource as WizardSelectableResource

        const ingredients = resourceData.ingredients?.map((ing) => ({
          identifier: ing.identifier,
          title: ing.title || ing.identifier,
          path: ing.path || '',
          size: ing.size,
          categories: ing.categories,
          sort: ing.sort,
          alignmentCount: ing.alignmentCount ?? ing.alignment_count,
          versification: ing.versification,
          exists: ing.exists,
          isDir: ing.isDir ?? ing.is_dir,
        }))

        let enrichedData: {
          license?: string
          readme?: string
          licenseFile?: string
          ingredients?: Door43Resource['ingredients']
        } = {}
        try {
          const door43Client = getDoor43ApiClient({ debug: false })

          let metadataUrl = resourceData.metadata_url
          if (!metadataUrl && resourceData.owner && resourceData.language && resource.id) {
            const repoName = `${resourceData.language}_${resource.id}`
            metadataUrl = `https://git.door43.org/${resourceData.owner}/${repoName}/raw/branch/master/manifest.yaml`
          }

          if (metadataUrl) {
            const enrichedResource: Door43Resource = {
              id: resourceData.resourceId || resourceData.id || resourceKey.split('/').pop() || resourceKey,
              name: resourceData.name || resourceData.resourceId || resourceData.id || resourceKey,
              title: resourceData.title,
              owner: resourceData.owner,
              language: resourceData.language,
              subject: resourceData.subject || resourceData.category,
              version: resourceData.version || '1.0.0',
              metadata_url: metadataUrl,
              release: resourceData.release,
              ingredients: resourceData.ingredients as Door43Resource['ingredients'],
            }
            enrichedData = await door43Client.enrichResourceMetadata(
              enrichedResource as unknown as Parameters<typeof door43Client.enrichResourceMetadata>[0]
            )
          }
        } catch (err) {
          console.warn(`   ⚠️  Failed to enrich metadata:`, err)
        }

        const finalIngredients = ingredients || enrichedData?.ingredients

        await catalogManager.addResourceToCatalog({
          resourceKey,
          resourceId: resourceData.resourceId || resource.id,
          server: resourceData.server || 'git.door43.org',
          owner: resourceData.owner || 'unknown',
          language: resourceData.language || 'en',
          title: resource.title,
          subject: resourceData.subject || resource.category || 'Unknown',
          version: resourceData.version || '1.0.0',
          description: resourceData.description,
          license: enrichedData?.license ? { id: enrichedData.license } : undefined,
          type: getResourceTypeFromSubjectUsingRegistry(
            resourceData.subject || resource.category,
            resource.type,
            resourceTypeRegistry
          ) as ResourceType,
          format: ResourceFormat.USFM,
          contentType: 'text/usfm',
          contentStructure: 'book' as const,
          availability: {
            online: true,
            offline: false,
            bundled: false,
            partial: false,
          },
          locations: [
            {
              type: LocationType.NETWORK,
              path: `${resourceData.server || 'git.door43.org'}/${resourceData.owner}/${resourceData.language}_${resource.id}`,
              priority: 1,
            },
          ],
          release:
            resourceData.zipball_url || resourceData.release?.zipball_url
              ? {
                  tag_name: resourceData.version || resourceData.release?.tag_name || '1.0.0',
                  zipball_url: resourceData.zipball_url || resourceData.release?.zipball_url || '',
                  tarball_url: resourceData.tarball_url || resourceData.release?.tarball_url,
                  published_at: resourceData.released || resourceData.release?.published_at || '',
                  html_url: resourceData.html_url || resourceData.release?.html_url,
                }
              : undefined,
          contentMetadata: {
            ingredients: finalIngredients,
            books: finalIngredients?.map((i) => i.identifier),
          },
          catalogedAt: new Date().toISOString(),
        })

        metadata = await catalogManager.getResourceMetadata(resourceKey)
      }

      if (metadata) {
        const info = createResourceInfo(metadata)
        if (targetPanel) {
          addResource(info, { panelId: targetPanel })
        } else {
          addResourceToPackage(info)
        }
        resourcesToDownload.push(resourceKey)
      }
    } catch (error) {
      console.error(`   ❌ Failed to add ${resource.title}:`, error)
    }
  }

  if (resourcesToDownload.length > 0) {
    Promise.all(
      resourcesToDownload.map(async (resourceKey) => {
        try {
          await catalogManager.downloadResource(resourceKey, { method: 'zip' }, () => {})
        } catch (error) {
          console.error(`❌ Failed to download ${resourceKey}:`, error)
        }
      })
    ).catch((error) => {
      console.error('❌ Some downloads failed:', error)
    })
  }
}
