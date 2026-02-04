import type { ResourceMetadata, ResourceFilter } from '../core/types'

/**
 * Check if a value matches a filter criteria
 * 
 * Supports single values or arrays (OR logic for arrays)
 */
function matchesCriteria(value: any, filter: any): boolean {
  if (filter === undefined) return true
  if (value === undefined) return false
  
  // Array filter - value must match at least one (OR logic)
  if (Array.isArray(filter)) {
    if (Array.isArray(value)) {
      // Both arrays - check if any filter item matches any value item
      return filter.some(f => value.includes(f))
    }
    // Value is single, filter is array
    return filter.includes(value)
  }
  
  // Single filter
  if (Array.isArray(value)) {
    // Value is array, filter is single - check if filter is in value
    return value.includes(filter)
  }
  
  // Both single values
  return value === filter
}

/**
 * Check if resource metadata matches a filter
 * 
 * All specified filter criteria must match (AND logic).
 * Arrays within criteria use OR logic.
 * 
 * @example
 * ```typescript
 * const metadata: ResourceMetadata = {
 *   type: 'scripture',
 *   tags: ['NT', 'Gospel'],
 *   language: 'en',
 *   testament: 'NT'
 * }
 * 
 * matchesFilter(metadata, { tags: ['NT', 'OT'] })        // true (has NT tag)
 * matchesFilter(metadata, { language: 'en' })             // true
 * matchesFilter(metadata, { type: 'commentary' })         // false
 * matchesFilter(metadata, { tags: ['OT'], language: 'en' }) // false (has en but not OT)
 * ```
 */
export function matchesFilter(
  metadata: ResourceMetadata | undefined,
  filter: ResourceFilter | undefined
): boolean {
  // No filter means match all
  if (!filter) return true
  
  // No metadata but filter exists - try to match (will fail most checks)
  const meta = metadata || {}
  
  // Check each filter criterion (AND logic)
  if (filter.type !== undefined) {
    if (!matchesCriteria(meta.type, filter.type)) return false
  }
  
  if (filter.tags !== undefined) {
    if (!matchesCriteria(meta.tags, filter.tags)) return false
  }
  
  if (filter.categories !== undefined) {
    if (!matchesCriteria(meta.categories, filter.categories)) return false
  }
  
  if (filter.language !== undefined) {
    if (!matchesCriteria(meta.language, filter.language)) return false
  }
  
  if (filter.subject !== undefined) {
    if (!matchesCriteria(meta.subject, filter.subject)) return false
  }
  
  if (filter.testament !== undefined) {
    if (!matchesCriteria(meta.testament, filter.testament)) return false
  }
  
  if (filter.scope !== undefined) {
    if (!matchesCriteria(meta.scope, filter.scope)) return false
  }
  
  if (filter.owner !== undefined) {
    if (!matchesCriteria(meta.owner, filter.owner)) return false
  }
  
  // Check custom fields
  if (filter.custom) {
    for (const [key, value] of Object.entries(filter.custom)) {
      if (!matchesCriteria(meta.custom?.[key], value)) return false
    }
  }
  
  return true
}

/**
 * Normalize metadata to ensure backward compatibility
 * 
 * Handles both old (sourceResourceType) and new (sourceMetadata) formats
 */
export function normalizeMetadata(
  metadata: ResourceMetadata | undefined,
  legacyType: string | undefined
): ResourceMetadata {
  if (metadata) return metadata
  
  if (legacyType) {
    return { type: legacyType as any }
  }
  
  return {}
}

/**
 * Normalize filter to ensure backward compatibility
 * 
 * Handles both old (targetResourceTypes) and new (targetFilter) formats
 */
export function normalizeFilter(
  filter: ResourceFilter | undefined,
  legacyTypes: string[] | undefined
): ResourceFilter | undefined {
  if (filter) return filter
  
  if (legacyTypes && legacyTypes.length > 0) {
    return { type: legacyTypes as any }
  }
  
  return undefined
}

