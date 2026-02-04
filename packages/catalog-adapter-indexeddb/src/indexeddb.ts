/**
 * IndexedDB Catalog Adapter
 * 
 * Browser-based persistent catalog storage using IndexedDB
 * Compatible with Web Workers
 */

import type { CatalogAdapter, ResourceMetadata, SearchFilters } from '@bt-synergy/catalog-manager'

export interface IndexedDBAdapterOptions {
  dbName?: string
  storeName?: string
  version?: number
}

/**
 * IndexedDB adapter for web browsers
 * Provides persistent offline catalog storage
 * Works in both main thread and Web Workers
 */
export class IndexedDBCatalogAdapter implements CatalogAdapter {
  private dbName: string
  private storeName: string
  private version: number
  private db: IDBDatabase | null = null
  
  constructor(options: IndexedDBAdapterOptions = {}) {
    this.dbName = options.dbName || 'resource-catalog'
    this.storeName = options.storeName || 'resources'
    this.version = options.version || 1
  }
  
  /**
   * Initialize database connection
   */
  private async initDB(): Promise<IDBDatabase> {
    if (this.db) return this.db
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.version)
      
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        this.db = request.result
        resolve(request.result)
      }
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result
        
        // Create object store if it doesn't exist
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' })
          
          // Create indexes for common queries
          store.createIndex('server', 'metadata.server', { unique: false })
          store.createIndex('owner', 'metadata.owner', { unique: false })
          store.createIndex('language', 'metadata.language', { unique: false })
          store.createIndex('resourceId', 'metadata.resourceId', { unique: false })
          store.createIndex('subject', 'metadata.subject', { unique: false })
        }
      }
    })
  }
  
  /**
   * Get object store for transactions
   */
  private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.initDB()
    const transaction = db.transaction(this.storeName, mode)
    return transaction.objectStore(this.storeName)
  }
  
  /**
   * Set resource metadata (CatalogAdapter interface)
   */
  async set(resourceKey: string, metadata: ResourceMetadata): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key: resourceKey, metadata })
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async get(key: string): Promise<ResourceMetadata | null> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        resolve(result ? result.metadata : null)
      }
    })
  }
  
  /**
   * Delete resource metadata (CatalogAdapter interface)
   */
  async delete(key: string): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.delete(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  /**
   * Get all resource keys (CatalogAdapter interface)
   */
  async getAll(): Promise<string[]> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const keys = request.result as string[]
        resolve(keys)
      }
    })
  }
  
  /**
   * Clear all metadata (CatalogAdapter interface)
   */
  async clear(): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  /**
   * Search resources (CatalogAdapter interface)
   * Uses IndexedDB indexes when possible for better performance
   */
  async search(filters: SearchFilters): Promise<ResourceMetadata[]> {
    const store = await this.getStore('readonly')
    
    // Try to use an index if we have a single filter
    if (filters.language && Object.keys(filters).length === 1) {
      return this.searchByIndex(store, 'language', filters.language)
    }
    if (filters.owner && Object.keys(filters).length === 1) {
      return this.searchByIndex(store, 'owner', filters.owner)
    }
    if (filters.subject && Object.keys(filters).length === 1) {
      return this.searchByIndex(store, 'subject', filters.subject)
    }
    
    // Fall back to full scan with filtering
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const results = request.result
        let resources = results.map(item => item.metadata as ResourceMetadata)
        
        // Apply filters
        resources = this.applyFilters(resources, filters)
        
        // Apply limit and offset
        if (filters.offset) {
          resources = resources.slice(filters.offset)
        }
        if (filters.limit) {
          resources = resources.slice(0, filters.limit)
        }
        
        resolve(resources)
      }
    })
  }
  
  /**
   * Search using an IndexedDB index
   */
  private async searchByIndex(
    store: IDBObjectStore,
    indexName: string,
    indexValue: string
  ): Promise<ResourceMetadata[]> {
    const index = store.index(indexName)
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(indexValue)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const results = request.result
        const resources = results.map(item => item.metadata as ResourceMetadata)
        resolve(resources)
      }
    })
  }
  
  /**
   * Apply search filters to resource list
   */
  private applyFilters(resources: ResourceMetadata[], filters: SearchFilters): ResourceMetadata[] {
    return resources.filter(resource => {
      // Type filter
      if (filters.type && resource.subject !== filters.type) {
        return false
      }
      
      // Subject filter
      if (filters.subject && resource.subject !== filters.subject) {
        return false
      }
      
      // Language filter
      if (filters.language && resource.language !== filters.language) {
        return false
      }
      
      // Owner filter
      if (filters.owner && resource.owner !== filters.owner) {
        return false
      }
      
      // Query filter (search in title and description)
      if (filters.query) {
        const query = filters.query.toLowerCase()
        const titleMatch = resource.title?.toLowerCase().includes(query)
        const descMatch = resource.description?.toLowerCase().includes(query)
        if (!titleMatch && !descMatch) {
          return false
        }
      }
      
      return true
    })
  }
  
  /**
   * Close database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

