/**
 * LocalStorage-based Catalog Adapter
 * 
 * Persists catalog metadata to localStorage so it survives page reloads.
 * Uses JSON serialization for data storage.
 */

import type { CatalogAdapter, ResourceMetadata } from '@bt-synergy/catalog-manager'

interface CatalogQuery {
  server?: string
  owner?: string
  language?: string
  subject?: string
}

interface CatalogStats {
  totalResources: number
  totalServers: number
  totalOwners: number
  totalLanguages: number
  bySubject: Record<string, number>
  byLanguage: Record<string, number>
  byOwner: Record<string, number>
  byType: Record<string, number>
}

const STORAGE_KEY_PREFIX = 'bt-synergy:catalog:'
const STORAGE_KEY_INDEX = 'bt-synergy:catalog:index'

export class LocalStorageCatalogAdapter implements CatalogAdapter {
  private memoryCache = new Map<string, ResourceMetadata>()
  private initialized = false

  /**
   * Load all catalog data from localStorage into memory cache
   */
  private async initialize(): Promise<void> {
    if (this.initialized) return

    try {
      // Load the index of all catalog keys
      const indexJson = localStorage.getItem(STORAGE_KEY_INDEX)
      if (indexJson) {
        const keys = JSON.parse(indexJson) as string[]
        
        // Load each resource metadata
        for (const key of keys) {
          const dataJson = localStorage.getItem(`${STORAGE_KEY_PREFIX}${key}`)
          if (dataJson) {
            const metadata = JSON.parse(dataJson) as ResourceMetadata
            this.memoryCache.set(key, metadata)
          }
        }
      }
      
      this.initialized = true
      const keys = Array.from(this.memoryCache.keys())
      console.log(`📚 Loaded ${this.memoryCache.size} resources from localStorage catalog`)
      console.log(`🔑 Catalog keys:`, keys)
    } catch (error) {
      console.error('❌ Failed to initialize catalog from localStorage:', error)
      this.memoryCache.clear()
      this.initialized = true
    }
  }

  /**
   * Save the index of all keys to localStorage
   */
  private saveIndex(): void {
    try {
      const keys = Array.from(this.memoryCache.keys())
      localStorage.setItem(STORAGE_KEY_INDEX, JSON.stringify(keys))
    } catch (error) {
      console.error('❌ Failed to save catalog index:', error)
    }
  }

  async save(key: string, metadata: ResourceMetadata): Promise<void> {
    await this.initialize()
    
    try {
      const ingredientsCount = metadata.contentMetadata?.ingredients?.length || 0
      
      // Check if we're about to overwrite richer data with incomplete data
      const existing = this.memoryCache.get(key)
      const existingIngredientsCount = existing?.contentMetadata?.ingredients?.length || 0
      
      // PROTECTION: Don't overwrite richer ingredient data with incomplete data
      // This prevents generated ingredients (e.g., 953 TW entries) from being overwritten 
      // by incomplete data (e.g., 1 directory ingredient from Door43 API)
      if (existingIngredientsCount > 10 && ingredientsCount < existingIngredientsCount) {
        console.warn(`🛡️ Catalog protection: Keeping ${key} with ${existingIngredientsCount} ingredients (ignoring update with ${ingredientsCount})`)
        return // Skip this save to protect the richer data
      }
      
      // Save to memory cache
      this.memoryCache.set(key, metadata)
      console.log(`[LocalStorageCatalogAdapter] SAVE ${key}:`, {
        ingredientsCount,
        hasContentMetadata: !!metadata.contentMetadata
      })
      
      // Persist to localStorage
      const dataJson = JSON.stringify(metadata)
      localStorage.setItem(`${STORAGE_KEY_PREFIX}${key}`, dataJson)
      
      // Update index
      this.saveIndex()
    } catch (error) {
      console.error(`❌ Failed to save resource ${key}:`, error)
      throw error
    }
  }

  async set(key: string, metadata: ResourceMetadata): Promise<void> {
    return this.save(key, metadata)
  }

  async addResource(metadata: ResourceMetadata): Promise<void> {
    await this.save(metadata.resourceKey, metadata)
  }

  async get(key: string): Promise<ResourceMetadata | null> {
    await this.initialize()
    const result = this.memoryCache.get(key) || null
    console.log(`[LocalStorageCatalogAdapter] GET ${key}:`, {
      found: !!result,
      hasContentMetadata: !!result?.contentMetadata,
      ingredientsCount: result?.contentMetadata?.ingredients?.length || 0
    })
    return result
  }

  async getAll(): Promise<ResourceMetadata[]> {
    await this.initialize()
    return Array.from(this.memoryCache.values())
  }

  async getAllKeys(): Promise<string[]> {
    await this.initialize()
    return Array.from(this.memoryCache.keys())
  }

  async search(query: CatalogQuery): Promise<ResourceMetadata[]> {
    await this.initialize()
    let results = Array.from(this.memoryCache.values())
    
    if (query.server) results = results.filter(r => r.server === query.server)
    if (query.owner) results = results.filter(r => r.owner === query.owner)
    if (query.language) results = results.filter(r => r.language === query.language)
    if (query.subject) results = results.filter(r => r.subject === query.subject)
    
    return results
  }

  async delete(key: string): Promise<void> {
    await this.initialize()
    
    try {
      // Remove from memory cache
      const existed = this.memoryCache.delete(key)
      
      if (existed) {
        // Remove from localStorage
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`)
        
        // Update index
        this.saveIndex()
      }
    } catch (error) {
      console.error(`❌ Failed to delete resource ${key}:`, error)
      throw error
    }
  }

  async clear(): Promise<void> {
    await this.initialize()
    
    try {
      // Clear memory cache
      const keys = Array.from(this.memoryCache.keys())
      this.memoryCache.clear()
      
      // Remove all from localStorage
      for (const key of keys) {
        localStorage.removeItem(`${STORAGE_KEY_PREFIX}${key}`)
      }
      
      // Clear index
      localStorage.removeItem(STORAGE_KEY_INDEX)
      
      console.log('🗑️ Cleared catalog from localStorage')
    } catch (error) {
      console.error('❌ Failed to clear catalog:', error)
    }
  }

  async getStats(): Promise<CatalogStats> {
    await this.initialize()
    const all = Array.from(this.memoryCache.values())
    
    const bySubject: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}
    const byOwner: Record<string, number> = {}
    const byType: Record<string, number> = {}
    
    for (const resource of all) {
      bySubject[resource.subject] = (bySubject[resource.subject] || 0) + 1
      byLanguage[resource.language] = (byLanguage[resource.language] || 0) + 1
      byOwner[resource.owner] = (byOwner[resource.owner] || 0) + 1
      byType[resource.type] = (byType[resource.type] || 0) + 1
    }
    
    return {
      totalResources: all.length,
      totalServers: new Set(all.map(r => r.server)).size,
      totalOwners: new Set(all.map(r => r.owner)).size,
      totalLanguages: new Set(all.map(r => r.language)).size,
      bySubject,
      byLanguage,
      byOwner,
      byType,
    }
  }
}
