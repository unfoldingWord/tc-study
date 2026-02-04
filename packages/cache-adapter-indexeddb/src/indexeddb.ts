/**
 * IndexedDB Storage Adapter
 * 
 * Browser-based persistent storage using IndexedDB
 */

import type { CacheEntry, CacheStorageAdapter } from '@bt-synergy/resource-cache'

export interface IndexedDBStorageOptions {
  dbName?: string
  storeName?: string
  version?: number
}

/**
 * IndexedDB adapter for web browsers
 * Provides persistent cache storage
 */
export class IndexedDBCacheAdapter implements CacheStorageAdapter {
  private dbName: string
  private storeName: string
  private version: number
  private db: IDBDatabase | null = null
  
  constructor(options: IndexedDBStorageOptions = {}) {
    this.dbName = options.dbName || 'resource-cache'
    this.storeName = options.storeName || 'cache-entries'
    this.version = options.version || 1
  }
  
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
        
        if (!db.objectStoreNames.contains(this.storeName)) {
          const store = db.createObjectStore(this.storeName, { keyPath: 'key' })
          store.createIndex('expiresAt', 'entry.expiresAt', { unique: false })
        }
      }
    })
  }
  
  private async getStore(mode: IDBTransactionMode): Promise<IDBObjectStore> {
    const db = await this.initDB()
    const transaction = db.transaction(this.storeName, mode)
    return transaction.objectStore(this.storeName)
  }
  
  async set(key: string, entry: CacheEntry): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.put({ key, entry })
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async get(key: string): Promise<CacheEntry | null> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.get(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const result = request.result
        if (!result) {
          resolve(null)
          return
        }
        
        // Check if expired
        if (result.entry.expiresAt && new Date(result.entry.expiresAt) < new Date()) {
          // Delete expired entry
          this.delete(key).then(() => resolve(null))
          return
        }
        
        resolve(result.entry)
      }
    })
  }
  
  async has(key: string): Promise<boolean> {
    const entry = await this.get(key)
    return entry !== null
  }
  
  async delete(key: string): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      const request = store.delete(key)
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve()
    })
  }
  
  async setMany(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      let completed = 0
      let hasError = false
      
      if (items.length === 0) {
        resolve()
        return
      }
      
      for (const item of items) {
        if (hasError) break
        
        const request = store.put({ key: item.key, entry: item.entry })
        
        request.onerror = () => {
          if (!hasError) {
            hasError = true
            reject(request.error)
          }
        }
        
        request.onsuccess = () => {
          completed++
          if (completed === items.length) {
            resolve()
          }
        }
      }
    })
  }
  
  async getMany(keys: string[]): Promise<Map<string, CacheEntry>> {
    const results = new Map<string, CacheEntry>()
    const now = new Date()
    
    for (const key of keys) {
      const entry = await this.get(key)
      if (entry) {
        results.set(key, entry)
      }
    }
    
    return results
  }
  
  async deleteMany(keys: string[]): Promise<void> {
    const store = await this.getStore('readwrite')
    
    return new Promise((resolve, reject) => {
      let completed = 0
      let hasError = false
      
      if (keys.length === 0) {
        resolve()
        return
      }
      
      for (const key of keys) {
        if (hasError) break
        
        const request = store.delete(key)
        
        request.onerror = () => {
          if (!hasError) {
            hasError = true
            reject(request.error)
          }
        }
        
        request.onsuccess = () => {
          completed++
          if (completed === keys.length) {
            resolve()
          }
        }
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
  
  async keys(): Promise<string[]> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.getAllKeys()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => resolve(request.result as string[])
    })
  }
  
  async size(): Promise<number> {
    const store = await this.getStore('readonly')
    
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        let totalSize = 0
        for (const item of request.result) {
          const entry = item.entry
          if (entry.metadata?.size) {
            totalSize += entry.metadata.size
          }
        }
        resolve(totalSize)
      }
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
  
  async prune(): Promise<number> {
    const store = await this.getStore('readwrite')
    const now = new Date()
    
    return new Promise((resolve, reject) => {
      const request = store.getAll()
      request.onerror = () => reject(request.error)
      request.onsuccess = () => {
        const items = request.result
        let pruned = 0
        
        for (const item of items) {
          if (item.entry.expiresAt && new Date(item.entry.expiresAt) < now) {
            store.delete(item.key)
            pruned++
          }
        }
        
        resolve(pruned)
      }
    })
  }
  
  async optimize(): Promise<void> {
    // IndexedDB handles optimization automatically
    await this.prune()
  }
  
  async close(): Promise<void> {
    if (this.db) {
      this.db.close()
      this.db = null
    }
  }
}

