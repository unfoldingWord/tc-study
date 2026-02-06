/**
 * Resource Info Utilities
 * 
 * Utilities for working with ResourceInfo (app wrapper around ResourceMetadata)
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceInfo } from '../contexts/types'

/**
 * Create ResourceInfo from ResourceMetadata
 * 
 * This is the ONLY way to create ResourceInfo objects.
 * It ensures all required fields are populated correctly.
 * 
 * @param metadata - Complete ResourceMetadata from catalog
 * @param toc - Optional runtime TOC from loaders
 * @returns ResourceInfo ready for use in app
 */
export function createResourceInfo(
  metadata: ResourceMetadata,
  options: {
    toc?: any
  } = {}
): ResourceInfo {
  return {
    // Spread all ResourceMetadata fields
    ...metadata,
    
    // Add convenience aliases
    id: metadata.resourceKey,
    key: metadata.resourceKey,
    category: metadata.type, // Use type as category
    
    // Add app-specific state
    toc: options.toc,
  }
}

/**
 * Create ResourceInfo from partial data (for legacy/migration code)
 * 
 * This is a temporary helper for migrating old code that creates partial resource objects.
 * Use createResourceInfo with full ResourceMetadata whenever possible.
 * 
 * @param partial - Partial resource data
 * @returns ResourceInfo with filled defaults
 */
export function createResourceInfoFromPartial(partial: Partial<ResourceInfo> & { 
  id?: string
  key?: string 
  resourceKey?: string 
}): ResourceInfo {
  const key = partial.resourceKey || partial.key || partial.id || 'unknown'
  
  return {
    // Required ResourceMetadata fields with defaults
    resourceKey: key,
    resourceId: partial.resourceId || key.split('/')[2] || 'unknown',
    server: partial.server || 'git.door43.org',
    owner: partial.owner || 'unknown',
    language: partial.language || 'en',
    title: partial.title || 'Unknown',
    subject: partial.subject || 'unknown',
    version: partial.version || '1.0.0',
    type: partial.type || 'unknown',
    format: (partial.format || 'unknown') as any,
    contentType: partial.contentType || 'unknown',
    contentStructure: partial.contentStructure || 'book',
    availability: partial.availability || {
      online: false,
      offline: false,
      bundled: false,
      partial: false,
    },
    locations: partial.locations || [],
    catalogedAt: partial.catalogedAt || new Date().toISOString(),
    
    // Optional fields
    ...partial,
    
    // App-specific aliases
    id: key,
    key: key,
    category: partial.category || partial.type || 'unknown',
  }
}

/**
 * Update ResourceInfo with new metadata
 * 
 * Use this when metadata changes (e.g., after enrichment)
 */
export function updateResourceInfo(
  current: ResourceInfo,
  updates: Partial<ResourceMetadata>
): ResourceInfo {
  return createResourceInfo(
    { ...current, ...updates },
    { toc: current.toc }
  )
}

/**
 * Check if ResourceInfo has complete metadata
 */
export function hasCompleteMetadata(resource: ResourceInfo): boolean {
  return !!(
    resource.title &&
    resource.language &&
    resource.owner &&
    resource.type &&
    resource.version
  )
}
