/**
 * Base Storage Adapter
 * 
 * Abstract base class for catalog storage implementations
 */

import type {
  CatalogStorageAdapter,
  ResourceMetadata,
  CatalogQuery,
  CatalogStats,
} from '../types'

/**
 * Base adapter with common query logic
 * Platform-specific adapters can extend this
 */
export abstract class BaseCatalogStorageAdapter implements CatalogStorageAdapter {
  // Abstract methods - must be implemented by subclasses
  abstract save(key: string, metadata: ResourceMetadata): Promise<void>
  abstract get(key: string): Promise<ResourceMetadata | null>
  abstract has(key: string): Promise<boolean>
  abstract delete(key: string): Promise<void>
  abstract saveMany(items: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void>
  abstract getAll(): Promise<Map<string, ResourceMetadata>>
  abstract clear(): Promise<void>
  abstract count(): Promise<number>
  
  /**
   * Query resources by filters
   * Default implementation - subclasses can override for optimized queries
   */
  async query(filters: CatalogQuery): Promise<ResourceMetadata[]> {
    const all = await this.getAll()
    const resources = Array.from(all.values())
    
    return resources.filter(resource => this.matchesFilters(resource, filters))
  }
  
  /**
   * Get catalog statistics
   * Default implementation - subclasses can override for optimized stats
   */
  async getStats(): Promise<CatalogStats> {
    const all = await this.getAll()
    const resources = Array.from(all.values())
    
    const servers = new Set<string>()
    const owners = new Set<string>()
    const languages = new Set<string>()
    const bySubject: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}
    const byOwner: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byFormat: Record<string, number> = {}
    
    let oldestDate: string | undefined
    let newestDate: string | undefined
    let mostAccessedResource: string | undefined
    let maxAccessCount = 0
    let totalSize = 0
    let availableOffline = 0
    let availableOnline = 0
    let bundledResources = 0
    
    for (const resource of resources) {
      servers.add(resource.server)
      owners.add(resource.owner)
      languages.add(resource.language)
      
      // Count by subject
      bySubject[resource.subject] = (bySubject[resource.subject] || 0) + 1
      
      // Count by language
      byLanguage[resource.language] = (byLanguage[resource.language] || 0) + 1
      
      // Count by owner
      byOwner[resource.owner] = (byOwner[resource.owner] || 0) + 1
      
      // Count by type
      byType[resource.type] = (byType[resource.type] || 0) + 1
      
      // Count by format
      byFormat[resource.format] = (byFormat[resource.format] || 0) + 1
      
      // Track availability
      if (resource.availability.offline) availableOffline++
      if (resource.availability.online) availableOnline++
      if (resource.availability.bundled) bundledResources++
      
      // Track size
      if (resource.contentMetadata?.size) {
        totalSize += resource.contentMetadata.size
      }
      
      // Track most accessed
      if (resource.accessCount && resource.accessCount > maxAccessCount) {
        maxAccessCount = resource.accessCount
        mostAccessedResource = `${resource.server}/${resource.owner}/${resource.language}/${resource.resourceId}`
      }
      
      // Track oldest/newest
      if (!oldestDate || resource.catalogedAt < oldestDate) {
        oldestDate = resource.catalogedAt
      }
      if (!newestDate || resource.catalogedAt > newestDate) {
        newestDate = resource.catalogedAt
      }
    }
    
    return {
      totalResources: resources.length,
      totalServers: servers.size,
      totalOwners: owners.size,
      totalLanguages: languages.size,
      bySubject,
      byLanguage,
      byOwner,
      byType,
      byFormat,
      availableOffline,
      availableOnline,
      bundledResources,
      totalSize: totalSize > 0 ? totalSize : undefined,
      oldestResource: oldestDate,
      newestResource: newestDate,
      mostAccessed: mostAccessedResource,
    }
  }
  
  /**
   * Check if resource matches filters
   */
  protected matchesFilters(resource: ResourceMetadata, filters: CatalogQuery): boolean {
    // Server filter
    if (filters.server) {
      const servers = Array.isArray(filters.server) ? filters.server : [filters.server]
      if (!servers.includes(resource.server)) return false
    }
    
    // Owner filter
    if (filters.owner) {
      const owners = Array.isArray(filters.owner) ? filters.owner : [filters.owner]
      if (!owners.includes(resource.owner)) return false
    }
    
    // Language filter
    if (filters.language) {
      const languages = Array.isArray(filters.language) ? filters.language : [filters.language]
      if (!languages.includes(resource.language)) return false
    }
    
    // Resource ID filter
    if (filters.resourceId) {
      const ids = Array.isArray(filters.resourceId) ? filters.resourceId : [filters.resourceId]
      if (!ids.includes(resource.resourceId)) return false
    }
    
    // Subject filter
    if (filters.subject) {
      const subjects = Array.isArray(filters.subject) ? filters.subject : [filters.subject]
      if (!subjects.includes(resource.subject)) return false
    }
    
    // Version filter
    if (filters.version && resource.version !== filters.version) {
      return false
    }
    
    // Type filter
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type]
      if (!types.includes(resource.type)) return false
    }
    
    // Format filter
    if (filters.format) {
      const formats = Array.isArray(filters.format) ? filters.format : [filters.format]
      if (!formats.includes(resource.format)) return false
    }
    
    // Availability filters
    if (filters.availableOnline !== undefined && resource.availability.online !== filters.availableOnline) {
      return false
    }
    if (filters.availableOffline !== undefined && resource.availability.offline !== filters.availableOffline) {
      return false
    }
    if (filters.bundled !== undefined && resource.availability.bundled !== filters.bundled) {
      return false
    }
    
    // Location type filter
    if (filters.locationType) {
      const locationTypes = Array.isArray(filters.locationType) ? filters.locationType : [filters.locationType]
      const hasMatchingLocation = resource.locations.some(loc => locationTypes.includes(loc.type))
      if (!hasMatchingLocation) return false
    }
    
    // Has books filter
    if (filters.hasBooks !== undefined) {
      const hasBooks = !!resource.contentMetadata?.books && resource.contentMetadata.books.length > 0
      if (hasBooks !== filters.hasBooks) return false
    }
    
    // Specific book filter
    if (filters.book) {
      if (!resource.contentMetadata?.books?.includes(filters.book)) return false
    }
    
    // Testament filter
    if (filters.testament && resource.contentMetadata?.testament !== filters.testament) {
      return false
    }
    
    // Has relations filter
    if (filters.hasRelations !== undefined) {
      const hasRelations = !!resource.contentMetadata?.relations && resource.contentMetadata.relations.length > 0
      if (hasRelations !== filters.hasRelations) return false
    }
    
    // Relation type filter
    if (filters.relationType) {
      const hasRelationType = resource.contentMetadata?.relations?.some(r => r.type === filters.relationType)
      if (!hasRelationType) return false
    }
    
    // Quality filters
    if (filters.checkingLevel && resource.quality?.checkingLevel !== filters.checkingLevel) {
      return false
    }
    if (filters.status && resource.quality?.status !== filters.status) {
      return false
    }
    
    return true
  }
}
