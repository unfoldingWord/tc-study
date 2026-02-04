/**
 * Base Storage Adapter
 * 
 * Abstract base class for catalog storage implementations
 */

import type {
  CatalogAdapter,
  ResourceMetadata,
  CatalogQuery,
  CatalogStats,
} from '@bt-synergy/catalog-manager'

/**
 * Base adapter with common query logic
 * Platform-specific adapters can extend this
 */
export abstract class BaseCatalogStorageAdapter implements CatalogAdapter {
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
    
    let oldestDate: string | undefined
    let newestDate: string | undefined
    
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
      oldestResource: oldestDate,
      newestResource: newestDate,
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
    
    // Has books filter
    if (filters.hasBooks !== undefined) {
      const hasBooks = !!resource.books && resource.books.length > 0
      if (hasBooks !== filters.hasBooks) return false
    }
    
    // Has relations filter
    if (filters.hasRelations !== undefined) {
      const hasRelations = !!resource.relations && resource.relations.length > 0
      if (hasRelations !== filters.hasRelations) return false
    }
    
    return true
  }
}

