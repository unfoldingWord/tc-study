import {
  LocationType,
  ResourceFormat,
  ResourceType,
  type ResourceMetadata,
} from '@bt-synergy/resource-catalog'
import type { ResourceLoader } from '@bt-synergy/resource-types'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { isCombinedHelpsResourceType } from '../../utils/normalizeResourceTypeId'

function syntheticCombinedHelpsMetadata(resourceKey: string): ResourceMetadata {
  const parts = resourceKey.split('/')
  const owner = parts[0] ?? 'unknown'
  const language = parts[1] ?? 'en'
  const resourceId = parts[2] ?? RESOURCE_TYPE_IDS.COMBINED_HELPS
  const isObs = isCombinedHelpsResourceType(resourceId) && resourceId.startsWith('obs')
  const type = isObs ? ResourceType.OBS_COMBINED_HELPS : ResourceType.COMBINED_HELPS

  return {
    resourceKey,
    server: 'git.door43.org',
    owner,
    language,
    resourceId,
    subject: isObs ? 'OBS Combined Helps' : 'Combined Helps',
    version: '0.0.0',
    title: isObs ? 'OBS Helps' : 'Helps',
    type,
    format: ResourceFormat.JSON,
    contentType: 'application/json',
    contentStructure: 'book',
    availability: {
      online: false,
      offline: true,
      bundled: false,
      partial: false,
    },
    locations: [
      {
        type: LocationType.CUSTOM,
        path: resourceKey,
        priority: 1,
      },
    ],
    catalogedAt: new Date(0).toISOString(),
  }
}

/**
 * No-op loader for synthetic CombinedHelps composition resources.
 * Content is loaded by the viewer via TN/TWL loaders.
 */
export class CombinedHelpsLoader implements ResourceLoader {
  readonly resourceType = RESOURCE_TYPE_IDS.COMBINED_HELPS

  canHandle(metadata: ResourceMetadata): boolean {
    return isCombinedHelpsResourceType(String(metadata.type ?? ''))
  }

  async loadContent(_resourceKey: string, _contentId: string): Promise<unknown> {
    return {
      type: RESOURCE_TYPE_IDS.COMBINED_HELPS,
      composed: true,
      notes: [],
      links: [],
    }
  }

  async getMetadata(resourceKey: string): Promise<ResourceMetadata> {
    return syntheticCombinedHelpsMetadata(resourceKey)
  }
}
