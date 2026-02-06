/**
 * Resource Metadata Normalization Utility
 * 
 * Ensures all ResourceInfo objects have a complete metadata field,
 * regardless of where they come from (UI, collections, preloaded, etc.)
 */

import type { ResourceInfo } from '../contexts/types'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

/**
 * Normalize a ResourceInfo object - promotes metadata to top-level fields
 * 
 * Top-level fields are the source of truth. If rich metadata exists (from Door43),
 * we promote those fields to top-level so all viewers can access them consistently.
 * 
 * @param resource - ResourceInfo object (possibly with nested metadata)
 * @returns ResourceInfo with promoted top-level fields
 */
export function normalizeResourceInfo(resource: ResourceInfo): ResourceInfo {
  // If we have rich metadata from Door43 API, promote it to top-level
  if (resource.metadata && typeof resource.metadata === 'object') {
    return {
      ...resource,
      // Promote metadata fields to top-level (these become source of truth)
      title: resource.metadata.title || resource.title,
      language: resource.metadata.language || resource.language,
      languageCode: resource.metadata.language || resource.languageCode,
      languageTitle: resource.metadata.languageTitle || resource.languageTitle,
      owner: resource.metadata.owner || resource.owner,
      resourceId: resource.metadata.resourceId || resource.resourceId,
      type: resource.metadata.type || resource.type,
      subject: resource.metadata.subject || resource.subject,
      description: resource.metadata.description || resource.description,
      version: resource.metadata.version || resource.version,
      // Keep metadata object for modal displays and detailed info
      metadata: resource.metadata,
    }
  }
  
  // No metadata - top-level fields are already set, nothing to promote
  return resource
}

/**
 * Normalize an array of ResourceInfo objects
 */
export function normalizeResourceInfoArray(resources: ResourceInfo[]): ResourceInfo[] {
  return resources.map(normalizeResourceInfo)
}

/**
 * Normalize a Map of ResourceInfo objects
 */
export function normalizeResourceInfoMap(resourcesMap: Map<string, ResourceInfo>): Map<string, ResourceInfo> {
  const normalized = new Map<string, ResourceInfo>()
  
  for (const [key, resource] of resourcesMap) {
    normalized.set(key, normalizeResourceInfo(resource))
  }
  
  return normalized
}
