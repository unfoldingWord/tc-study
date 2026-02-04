/**
 * Resource Catalog
 * 
 * Main catalog management class for organizing resource metadata
 */

import type {
  ResourceMetadata,
  ResourceKey,
  CatalogQuery,
  CatalogQueryResult,
  CatalogStats,
  CatalogOptions,
  ExportOptions,
  ImportOptions,
  CatalogStorageAdapter,
} from './types'
import { resourceKeyToString, parseResourceKey } from './types'

// Default in-memory adapter (minimal implementation for when no adapter is provided)
class DefaultMemoryAdapter implements CatalogStorageAdapter {
  private store = new Map<string, ResourceMetadata>()
  
  async save(key: string, metadata: ResourceMetadata): Promise<void> {
    this.store.set(key, { ...metadata })
  }
  
  async get(key: string): Promise<ResourceMetadata | null> {
    const metadata = this.store.get(key)
    return metadata ? { ...metadata } : null
  }
  
  async has(key: string): Promise<boolean> {
    return this.store.has(key)
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  
  async saveMany(items: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void> {
    for (const item of items) {
      this.store.set(item.key, { ...item.metadata })
    }
  }
  
  async getAll(): Promise<Map<string, ResourceMetadata>> {
    const copy = new Map<string, ResourceMetadata>()
    this.store.forEach((value, key) => {
      copy.set(key, { ...value })
    })
    return copy
  }
  
  async clear(): Promise<void> {
    this.store.clear()
  }
  
  async query(filters: CatalogQuery): Promise<ResourceMetadata[]> {
    const all = await this.getAll()
    return Array.from(all.values())
  }
  
  async count(): Promise<number> {
    return this.store.size
  }
  
  async getStats(): Promise<CatalogStats> {
    return {
      totalResources: this.store.size,
      totalServers: 0,
      totalOwners: 0,
      totalLanguages: 0,
      bySubject: {},
      byLanguage: {},
      byOwner: {},
      byType: {},
      byFormat: {},
      availableOffline: 0,
      availableOnline: 0,
      bundledResources: 0,
    }
  }
}

/**
 * Resource Catalog
 * 
 * Manages a catalog of resource metadata organized by server/owner/language/resource_id
 * 
 * @example
 * ```typescript
 * const catalog = new ResourceCatalog()
 * 
 * await catalog.addResource({
 *   server: 'git.door43.org',
 *   owner: 'unfoldingWord',
 *   language: 'en',
 *   resourceId: 'ult',
 *   subject: 'Bible',
 *   version: '1.0.0',
 *   title: 'unfoldingWord Literal Text',
 *   catalogedAt: new Date().toISOString()
 * })
 * 
 * const resource = await catalog.get('git.door43.org', 'unfoldingWord', 'en', 'ult')
 * ```
 */
export class ResourceCatalog {
  private adapter: CatalogStorageAdapter
  private options: CatalogOptions
  
  constructor(adapter?: CatalogStorageAdapter, options: CatalogOptions = {}) {
    this.adapter = adapter || new DefaultMemoryAdapter()
    this.options = {
      autoSave: true,
      cacheInMemory: false,
      validateOnAdd: true,
      allowDuplicates: false,
      ...options,
    }
  }
  
  // ============================================================================
  // BASIC OPERATIONS
  // ============================================================================
  
  /**
   * Add resource to catalog
   */
  async addResource(metadata: ResourceMetadata): Promise<void> {
    // Validate if enabled
    if (this.options.validateOnAdd) {
      this.validateMetadata(metadata)
    }
    
    // Set cataloged timestamp if not present
    if (!metadata.catalogedAt) {
      metadata.catalogedAt = new Date().toISOString()
    }
    
    // Build key
    const key = this.buildKey(metadata.server, metadata.owner, metadata.language, metadata.resourceId)
    
    // Check for duplicates if not allowed
    if (!this.options.allowDuplicates) {
      const exists = await this.adapter.has(key)
      if (exists) {
        throw new Error(`Resource already exists: ${key}`)
      }
    }
    
    // Save
    await this.adapter.save(key, metadata)
  }
  
  /**
   * Add multiple resources
   */
  async addMany(resources: ResourceMetadata[]): Promise<void> {
    const items = resources.map(metadata => {
      // Validate if enabled
      if (this.options.validateOnAdd) {
        this.validateMetadata(metadata)
      }
      
      // Set cataloged timestamp if not present
      if (!metadata.catalogedAt) {
        metadata.catalogedAt = new Date().toISOString()
      }
      
      const key = this.buildKey(
        metadata.server,
        metadata.owner,
        metadata.language,
        metadata.resourceId
      )
      
      return { key, metadata }
    })
    
    await this.adapter.saveMany(items)
  }
  
  /**
   * Get resource by key components
   */
  async get(
    server: string,
    owner: string,
    language: string,
    resourceId: string
  ): Promise<ResourceMetadata | null> {
    const key = this.buildKey(server, owner, language, resourceId)
    return this.adapter.get(key)
  }
  
  /**
   * Get resource by key string
   */
  async getByKey(key: string): Promise<ResourceMetadata | null> {
    return this.adapter.get(key)
  }
  
  /**
   * Check if resource exists
   */
  async has(
    server: string,
    owner: string,
    language: string,
    resourceId: string
  ): Promise<boolean> {
    const key = this.buildKey(server, owner, language, resourceId)
    return this.adapter.has(key)
  }
  
  /**
   * Update resource
   */
  async updateResource(
    key: ResourceKey | string,
    updates: Partial<ResourceMetadata>
  ): Promise<void> {
    const keyStr = typeof key === 'string' ? key : resourceKeyToString(key)
    
    const existing = await this.adapter.get(keyStr)
    if (!existing) {
      throw new Error(`Resource not found: ${keyStr}`)
    }
    
    const updated: ResourceMetadata = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }
    
    await this.adapter.save(keyStr, updated)
  }
  
  /**
   * Remove resource
   */
  async removeResource(key: ResourceKey | string): Promise<void> {
    const keyStr = typeof key === 'string' ? key : resourceKeyToString(key)
    await this.adapter.delete(keyStr)
  }
  
  /**
   * Get all resources
   */
  async getAll(): Promise<ResourceMetadata[]> {
    const map = await this.adapter.getAll()
    return Array.from(map.values())
  }
  
  /**
   * Clear entire catalog
   */
  async clear(): Promise<void> {
    await this.adapter.clear()
  }
  
  // ============================================================================
  // QUERIES
  // ============================================================================
  
  /**
   * Query resources by filters
   */
  async query(filters: CatalogQuery): Promise<CatalogQueryResult> {
    const resources = await this.adapter.query(filters)
    const total = await this.adapter.count()
    
    return {
      resources,
      total,
      filtered: resources.length,
    }
  }
  
  /**
   * Get all unique languages
   */
  async getLanguages(filters?: Omit<CatalogQuery, 'language'>): Promise<string[]> {
    const resources = await this.adapter.query(filters || {})
    const languages = new Set(resources.map(r => r.language))
    return Array.from(languages).sort()
  }
  
  /**
   * Get all unique owners
   */
  async getOwners(language?: string, filters?: Omit<CatalogQuery, 'owner'>): Promise<string[]> {
    const query: CatalogQuery = { ...filters, language }
    const resources = await this.adapter.query(query)
    const owners = new Set(resources.map(r => r.owner))
    return Array.from(owners).sort()
  }
  
  /**
   * Get all resources for owner/language
   */
  async getResources(
    owner: string,
    language: string,
    filters?: Omit<CatalogQuery, 'owner' | 'language'>
  ): Promise<ResourceMetadata[]> {
    const query: CatalogQuery = { ...filters, owner, language }
    return this.adapter.query(query)
  }
  
  /**
   * Get all unique subjects
   */
  async getSubjects(filters?: Omit<CatalogQuery, 'subject'>): Promise<string[]> {
    const resources = await this.adapter.query(filters || {})
    const subjects = new Set(resources.map(r => r.subject))
    return Array.from(subjects).sort()
  }
  
  /**
   * Get resources by type
   */
  async getResourcesByType(type: import('./types').ResourceType, filters?: Omit<CatalogQuery, 'type'>): Promise<ResourceMetadata[]> {
    const query: CatalogQuery = { ...filters, type }
    return this.adapter.query(query)
  }
  
  /**
   * Get resources available offline
   */
  async getOfflineResources(filters?: Omit<CatalogQuery, 'availableOffline'>): Promise<ResourceMetadata[]> {
    const query: CatalogQuery = { ...filters, availableOffline: true }
    return this.adapter.query(query)
  }
  
  /**
   * Get bundled resources
   */
  async getBundledResources(filters?: Omit<CatalogQuery, 'bundled'>): Promise<ResourceMetadata[]> {
    const query: CatalogQuery = { ...filters, bundled: true }
    return this.adapter.query(query)
  }
  
  /**
   * Get resources with specific book
   */
  async getResourcesWithBook(bookCode: string, filters?: Omit<CatalogQuery, 'book'>): Promise<ResourceMetadata[]> {
    const query: CatalogQuery = { ...filters, book: bookCode }
    return this.adapter.query(query)
  }
  
  /**
   * Get related resources
   */
  async getRelatedResources(
    server: string,
    owner: string,
    language: string,
    resourceId: string
  ): Promise<ResourceMetadata[]> {
    const resource = await this.get(server, owner, language, resourceId)
    if (!resource?.contentMetadata?.relations) return []
    
    const related: ResourceMetadata[] = []
    for (const relation of resource.contentMetadata.relations) {
      const relatedResource = await this.get(
        server,
        relation.owner || owner,
        relation.language || language,
        relation.resourceId
      )
      if (relatedResource) {
        related.push(relatedResource)
      }
    }
    return related
  }
  
  /**
   * Update availability
   */
  async updateAvailability(
    key: ResourceKey | string,
    availability: Partial<ResourceMetadata['availability']>
  ): Promise<void> {
    const keyStr = typeof key === 'string' ? key : resourceKeyToString(key)
    const resource = await this.adapter.get(keyStr)
    if (!resource) {
      throw new Error(`Resource not found: ${keyStr}`)
    }
    
    await this.updateResource(keyStr, {
      availability: { ...resource.availability, ...availability }
    })
  }
  
  /**
   * Add location to resource
   */
  async addLocation(
    key: ResourceKey | string,
    location: import('./types').ResourceLocation
  ): Promise<void> {
    const keyStr = typeof key === 'string' ? key : resourceKeyToString(key)
    const resource = await this.adapter.get(keyStr)
    if (!resource) {
      throw new Error(`Resource not found: ${keyStr}`)
    }
    
    const locations = [...resource.locations, location]
    await this.updateResource(keyStr, { locations })
  }
  
  /**
   * Track resource access
   */
  async trackAccess(key: ResourceKey | string): Promise<void> {
    const keyStr = typeof key === 'string' ? key : resourceKeyToString(key)
    const resource = await this.adapter.get(keyStr)
    if (!resource) return
    
    await this.updateResource(keyStr, {
      accessedAt: new Date().toISOString(),
      accessCount: (resource.accessCount || 0) + 1
    })
  }
  
  // ============================================================================
  // STATISTICS
  // ============================================================================
  
  /**
   * Get catalog statistics
   */
  async getStats(): Promise<CatalogStats> {
    return this.adapter.getStats()
  }
  
  /**
   * Get catalog size
   */
  async count(): Promise<number> {
    return this.adapter.count()
  }
  
  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================
  
  /**
   * Export catalog as JSON
   */
  async export(options: ExportOptions = {}): Promise<string> {
    let resources: ResourceMetadata[]
    
    if (options.filter) {
      resources = await this.adapter.query(options.filter)
    } else {
      const all = await this.adapter.getAll()
      resources = Array.from(all.values())
    }
    
    // Remove timestamps if requested
    if (!options.includeTimestamps) {
      resources = resources.map(r => {
        const { catalogedAt, updatedAt, ...rest } = r
        return rest as ResourceMetadata
      })
    }
    
    const json = JSON.stringify(resources, null, options.pretty ? 2 : 0)
    return json
  }
  
  /**
   * Import catalog from JSON
   */
  async import(json: string, options: ImportOptions = {}): Promise<number> {
    let resources: ResourceMetadata[]
    
    try {
      resources = JSON.parse(json)
    } catch (error) {
      throw new Error(`Invalid JSON: ${error}`)
    }
    
    if (!Array.isArray(resources)) {
      throw new Error('Expected array of resources')
    }
    
    // Clear if not merging
    if (!options.merge) {
      await this.adapter.clear()
    }
    
    let imported = 0
    const items: Array<{ key: string; metadata: ResourceMetadata }> = []
    
    for (const resource of resources) {
      // Validate if not skipping invalid
      if (!options.skipInvalid) {
        try {
          this.validateMetadata(resource)
        } catch (error) {
          throw new Error(`Invalid resource: ${error}`)
        }
      } else {
        try {
          this.validateMetadata(resource)
        } catch {
          continue // Skip invalid
        }
      }
      
      const key = this.buildKey(
        resource.server,
        resource.owner,
        resource.language,
        resource.resourceId
      )
      
      // Check if exists and update behavior
      if (options.merge && options.updateExisting) {
        const exists = await this.adapter.has(key)
        if (exists) {
          await this.adapter.save(key, resource)
          imported++
          continue
        }
      }
      
      items.push({ key, metadata: resource })
      imported++
    }
    
    if (items.length > 0) {
      await this.adapter.saveMany(items)
    }
    
    return imported
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  /**
   * Build resource key
   */
  private buildKey(server: string, owner: string, language: string, resourceId: string): string {
    return `${server}/${owner}/${language}/${resourceId}`
  }
  
  /**
   * Validate resource metadata
   */
  private validateMetadata(metadata: ResourceMetadata): void {
    if (!metadata.server) throw new Error('server is required')
    if (!metadata.owner) throw new Error('owner is required')
    if (!metadata.language) throw new Error('language is required')
    if (!metadata.resourceId) throw new Error('resourceId is required')
    if (!metadata.subject) throw new Error('subject is required')
    if (!metadata.version) throw new Error('version is required')
    if (!metadata.title) throw new Error('title is required')
    if (!metadata.type) throw new Error('type is required')
    if (!metadata.format) throw new Error('format is required')
    if (!metadata.contentType) throw new Error('contentType is required')
    if (!metadata.availability) throw new Error('availability is required')
    if (!metadata.locations || metadata.locations.length === 0) {
      throw new Error('at least one location is required')
    }
  }
}
