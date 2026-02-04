/**
 * Memory Storage Adapter
 * 
 * In-memory storage for testing
 */

import type { CacheEntry, CacheStorageAdapter } from '@bt-synergy/resource-cache'

/**
 * Simple in-memory storage adapter
 * For testing purposes only - not persistent
 */
export class MemoryCacheStorage implements CacheStorageAdapter {
  private store = new Map<string, CacheEntry>()
  
  async set(key: string, entry: CacheEntry): Promise<void> {
    this.store.set(key, { ...entry })
  }
  
  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.store.get(key)
    
    if (!entry) return null
    
    // Check if expired
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      this.store.delete(key)
      return null
    }
    
    return { ...entry }
  }
  
  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key)
    
    if (!entry) return false
    
    // Check if expired
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      this.store.delete(key)
      return false
    }
    
    return true
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  
  async setMany(items: Array<{ key: string; entry: CacheEntry }>): Promise<void> {
    for (const item of items) {
      this.store.set(item.key, { ...item.entry })
    }
  }
  
  async getMany(keys: string[]): Promise<Map<string, CacheEntry>> {
    const results = new Map<string, CacheEntry>()
    const now = new Date()
    
    for (const key of keys) {
      const entry = this.store.get(key)
      
      if (!entry) continue
      
      // Check if expired
      if (entry.expiresAt && new Date(entry.expiresAt) < now) {
        this.store.delete(key)
        continue
      }
      
      results.set(key, { ...entry })
    }
    
    return results
  }
  
  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.store.delete(key)
    }
  }
  
  async clear(): Promise<void> {
    this.store.clear()
  }
  
  async keys(): Promise<string[]> {
    return Array.from(this.store.keys())
  }
  
  async size(): Promise<number> {
    let totalSize = 0
    
    for (const entry of this.store.values()) {
      if (entry.metadata?.size) {
        totalSize += entry.metadata.size
      } else {
        // Estimate
        if (typeof entry.content === 'string') {
          totalSize += entry.content.length * 2
        }
      }
    }
    
    return totalSize
  }
  
  async count(): Promise<number> {
    return this.store.size
  }
  
  async prune(): Promise<number> {
    const now = new Date()
    let pruned = 0
    
    for (const [key, entry] of this.store) {
      if (entry.expiresAt && new Date(entry.expiresAt) < now) {
        this.store.delete(key)
        pruned++
      }
    }
    
    return pruned
  }
  
  // Testing helpers
  
  reset(): void {
    this.store.clear()
  }
  
  getSize(): number {
    return this.store.size
  }
}

