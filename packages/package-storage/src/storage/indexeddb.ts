/**
 * IndexedDB Package Storage Adapter
 * 
 * Browser-based persistent storage using IndexedDB
 */

import type {
  ResourcePackage,
  PackageStorageAdapter,
  PackageFilters,
} from '../types/index'

export interface IndexedDBStorageOptions {
  dbName?: string
  storeName?: string
  version?: number
}

/**
 * IndexedDB adapter for web browsers
 * Provides persistent package storage
 */
export class IndexedDBPackageStorage implements PackageStorageAdapter {
  private dbName: string
  private storeName: string
  private version: number
  private db: IDBDatabase | null = null
  
  constructor(options: IndexedDBStorageOptions = {}) {
    this.dbName = options.dbName || 'resource-packages'
    this.storeName = options.storeName || 'packages'
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
          const store = db.createObjectStore(this.storeName, { keyPath: 'id' })
          
          // Create indexes for common queries
          store.createIndex('category', 'category', { unique: false })
          store.createIndex('author', 'author', { unique: false })
          store.createIndex('tags', 'tags', { unique: false, multiEntry: true })
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
  
  async save(pkg: ResourcePackage): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.put(pkg)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async get(packageId: string): Promise<ResourcePackage | null> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.get(packageId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || null)
    })
  }
  
  async has(packageId: string): Promise<boolean> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.count(packageId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result > 0)
    })
  }
  
  async delete(packageId: string): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.delete(packageId)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async getAll(): Promise<ResourcePackage[]> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result || [])
    })
  }
  
  async query(filters: PackageFilters): Promise<ResourcePackage[]> {
    // Try to use indexes for optimization
    if (filters.category && !filters.tags && !filters.author && !filters.search) {
      return this.queryByIndex('category', filters.category, filters)
    }
    
    if (filters.author && !filters.category && !filters.tags && !filters.search) {
      return this.queryByIndex('author', filters.author, filters)
    }
    
    // Fall back to full scan with filtering
    const all = await this.getAll()
    return all.filter(pkg => this.matchesFilters(pkg, filters))
  }
  
  /**
   * Query using an index
   */
  private async queryByIndex(
    indexName: string,
    indexValue: string,
    filters: PackageFilters
  ): Promise<ResourcePackage[]> {
    const store = await this.getStore('readonly')
    const index = store.index(indexName)
    
    return new Promise((resolve, reject) => {
      const request = index.getAll(indexValue)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const results = request.result || []
        // Apply remaining filters
        const filtered = results.filter(pkg => this.matchesFilters(pkg, filters))
        resolve(filtered)
      }
    })
  }
  
  async clear(): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.clear()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async count(): Promise<number> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.count()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result)
    })
  }
  
  /**
   * Check if package matches filters
   */
  private matchesFilters(pkg: ResourcePackage, filters: PackageFilters): boolean {
    // Category filter
    if (filters.category && pkg.category !== filters.category) {
      return false
    }
    
    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      if (!pkg.tags) return false
      const hasAllTags = filters.tags.every(tag => pkg.tags!.includes(tag))
      if (!hasAllTags) return false
    }
    
    // Author filter
    if (filters.author && pkg.author !== filters.author) {
      return false
    }
    
    // Search filter (name or description)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const nameMatch = pkg.name.toLowerCase().includes(searchLower)
      const descMatch = pkg.description?.toLowerCase().includes(searchLower)
      if (!nameMatch && !descMatch) return false
    }
    
    return true
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
