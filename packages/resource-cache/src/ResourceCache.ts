/**
 * Resource Cache
 * 
 * Multi-tier caching: Memory → Storage → Network
 */

import { MemoryCache } from './cache/MemoryCache'
import type {
  CacheEntry,
  CacheOptions,
  SetOptions,
  GetOptions,
  CacheStats,
  NetworkFetcher,
  NetworkSecurityOptions,
  CacheStorageAdapter,
  CacheExport,
  ImportOptions,
} from './types'

// Default in-memory storage adapter (minimal implementation)
class DefaultMemoryStorage implements CacheStorageAdapter {
  private store = new Map<string, CacheEntry>()
  
  async set(key: string, entry: CacheEntry): Promise<void> {
    this.store.set(key, { ...entry })
  }
  
  async get(key: string): Promise<CacheEntry | null> {
    const entry = this.store.get(key)
    if (!entry) return null
    if (entry.expiresAt && new Date(entry.expiresAt) < new Date()) {
      this.store.delete(key)
      return null
    }
    return { ...entry }
  }
  
  async has(key: string): Promise<boolean> {
    const entry = this.store.get(key)
    if (!entry) return false
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
    for (const key of keys) {
      const entry = await this.get(key)
      if (entry) results.set(key, entry)
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
    return this.store.size * 1000 // Rough estimate
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
}

/**
 * Multi-tier resource cache
 * 
 * Lookup order: Memory → Storage → Network
 * 
 * @example
 * ```typescript
 * const cache = new ResourceCache()
 * 
 * // Set content
 * await cache.set('git.door43.org/unfoldingWord/en/ult', {
 *   type: 'text',
 *   content: 'Genesis 1...',
 *   cachedAt: new Date().toISOString()
 * })
 * 
 * // Get content (checks all tiers)
 * const entry = await cache.get('git.door43.org/unfoldingWord/en/ult')
 * ```
 */
export class ResourceCache {
  private memoryCache: MemoryCache
  private storage: CacheStorageAdapter
  private networkFetcher?: NetworkFetcher
  private networkSecurity: NetworkSecurityOptions
  private options: CacheOptions & {
    memoryMaxSize: number
    defaultTTL: number
    maxStorageSize: number
    autoOptimize: boolean
    enableNetwork: boolean
    storage: CacheStorageAdapter
    networkSecurity: NetworkSecurityOptions
  }
  
  // Statistics
  private stats = {
    memory: { hits: 0, misses: 0 },
    storage: { hits: 0, misses: 0 },
    network: { requests: 0, hits: 0, misses: 0, errors: 0 },
    startedAt: new Date().toISOString(),
    lastAccessAt: undefined as string | undefined,
  }
  
  constructor(options: CacheOptions = {}) {
    this.options = {
      memoryMaxSize: options.memoryMaxSize || 50 * 1024 * 1024,
      memoryPolicy: options.memoryPolicy,
      storage: options.storage || new DefaultMemoryStorage(),
      enableNetwork: options.enableNetwork ?? true,
      networkSecurity: options.networkSecurity || {},
      networkFetcher: options.networkFetcher,
      defaultTTL: options.defaultTTL || 7 * 24 * 60 * 60 * 1000, // 7 days
      maxStorageSize: options.maxStorageSize || 500 * 1024 * 1024,
      autoOptimize: options.autoOptimize ?? true,
    }
    
    this.memoryCache = new MemoryCache({
      maxSize: this.options.memoryMaxSize,
      policy: this.options.memoryPolicy,
    })
    
    this.storage = this.options.storage
    this.networkFetcher = this.options.networkFetcher
    this.networkSecurity = this.options.networkSecurity
  }
  
  // ============================================================================
  // BASIC OPERATIONS
  // ============================================================================
  
  /**
   * Set cache entry
   * Stores in both memory and storage by default
   */
  async set(key: string, entry: CacheEntry, options: SetOptions = {}): Promise<void> {
    // Set expiration if TTL provided
    if (options.ttl || this.options.defaultTTL) {
      const ttl = options.ttl || this.options.defaultTTL
      entry.expiresAt = new Date(Date.now() + ttl).toISOString()
    }
    
    // Set cached timestamp if not present
    if (!entry.cachedAt) {
      entry.cachedAt = new Date().toISOString()
    }
    
    // Store in memory cache
    if (!options.skipMemory) {
      this.memoryCache.set(key, entry)
    }
    
    // Store in storage cache
    if (!options.skipStorage) {
      await this.storage.set(key, entry)
    }
  }
  
  /**
   * Get cache entry
   * Checks memory → storage → network (if enabled)
   */
  async get(key: string, options: GetOptions = {}): Promise<CacheEntry | null> {
    this.stats.lastAccessAt = new Date().toISOString()
    
    // 1. Check memory cache
    if (!options.skipMemory) {
      const memoryEntry = this.memoryCache.get(key)
      if (memoryEntry) {
        this.stats.memory.hits++
        
        // Refresh TTL if requested
        if (options.refreshTTL && this.options.defaultTTL) {
          memoryEntry.expiresAt = new Date(Date.now() + this.options.defaultTTL).toISOString()
          await this.storage.set(key, memoryEntry)
        }
        
        return { ...memoryEntry, source: 'memory' }
      }
      this.stats.memory.misses++
    }
    
    // 2. Check storage cache
    if (!options.skipStorage) {
      const storageEntry = await this.storage.get(key)
      if (storageEntry) {
        this.stats.storage.hits++
        
        // Load into memory cache
        if (!options.skipMemory) {
          this.memoryCache.set(key, storageEntry)
        }
        
        // Refresh TTL if requested
        if (options.refreshTTL && this.options.defaultTTL) {
          storageEntry.expiresAt = new Date(Date.now() + this.options.defaultTTL).toISOString()
          await this.storage.set(key, storageEntry)
        }
        
        return { ...storageEntry, source: 'storage' }
      }
      this.stats.storage.misses++
    }
    
    // 3. Try network fallback
    if (options.allowNetwork && this.options.enableNetwork && this.networkFetcher) {
      this.stats.network.requests++
      
      // Check network security
      const networkAllowed = await this.isNetworkAllowed()
      if (!networkAllowed) {
        return null
      }
      
      try {
        const networkEntry = await this.networkFetcher(key)
        
        if (networkEntry) {
          this.stats.network.hits++
          
          // Cache the fetched entry
          await this.set(key, networkEntry)
          
          return { ...networkEntry, source: 'network' }
        } else {
          this.stats.network.misses++
        }
      } catch (error) {
        this.stats.network.errors++
        console.error(`Network fetch failed for ${key}:`, error)
      }
    }
    
    return null
  }
  
  /**
   * Check if key exists in cache
   */
  async has(key: string): Promise<boolean> {
    if (this.memoryCache.has(key)) return true
    return await this.storage.has(key)
  }
  
  /**
   * Delete entry from cache
   */
  async delete(key: string): Promise<void> {
    this.memoryCache.delete(key)
    await this.storage.delete(key)
  }
  
  /**
   * Clear entire cache
   */
  async clear(): Promise<void> {
    this.memoryCache.clear()
    await this.storage.clear()
    
    // Reset stats
    this.stats.memory.hits = 0
    this.stats.memory.misses = 0
    this.stats.storage.hits = 0
    this.stats.storage.misses = 0
    this.stats.network.requests = 0
    this.stats.network.hits = 0
    this.stats.network.misses = 0
    this.stats.network.errors = 0
  }
  
  // ============================================================================
  // BULK OPERATIONS
  // ============================================================================
  
  /**
   * Set multiple entries
   */
  async setMany(items: Array<{ key: string; entry: CacheEntry; options?: SetOptions }>): Promise<void> {
    // Process entries
    const storageItems = items.map(({ key, entry, options }) => {
      // Set expiration
      if ((options?.ttl || this.options.defaultTTL) && !entry.expiresAt) {
        const ttl = options?.ttl || this.options.defaultTTL
        entry.expiresAt = new Date(Date.now() + ttl).toISOString()
      }
      
      // Set cached timestamp
      if (!entry.cachedAt) {
        entry.cachedAt = new Date().toISOString()
      }
      
      // Add to memory cache
      if (!options?.skipMemory) {
        this.memoryCache.set(key, entry)
      }
      
      return { key, entry }
    })
    
    // Batch save to storage
    const toSave = storageItems.filter((_, i) => !items[i].options?.skipStorage)
    if (toSave.length > 0) {
      await this.storage.setMany(toSave)
    }
  }
  
  /**
   * Get multiple entries
   */
  async getMany(keys: string[], options: GetOptions = {}): Promise<Map<string, CacheEntry>> {
    const results = new Map<string, CacheEntry>()
    const missingKeys: string[] = []
    
    // Check memory cache
    if (!options.skipMemory) {
      for (const key of keys) {
        const entry = this.memoryCache.get(key)
        if (entry) {
          results.set(key, { ...entry, source: 'memory' })
          this.stats.memory.hits++
        } else {
          missingKeys.push(key)
          this.stats.memory.misses++
        }
      }
    }
    
    // Check storage for missing keys
    if (!options.skipStorage && missingKeys.length > 0) {
      const storageResults = await this.storage.getMany(missingKeys)
      
      for (const [key, entry] of storageResults) {
        results.set(key, { ...entry, source: 'storage' })
        this.stats.storage.hits++
        
        // Load into memory
        if (!options.skipMemory) {
          this.memoryCache.set(key, entry)
        }
      }
    }
    
    return results
  }
  
  /**
   * Delete multiple entries
   */
  async deleteMany(keys: string[]): Promise<void> {
    for (const key of keys) {
      this.memoryCache.delete(key)
    }
    await this.storage.deleteMany(keys)
  }
  
  // ============================================================================
  // NETWORK CONFIGURATION
  // ============================================================================
  
  /**
   * Set network fetcher
   */
  setNetworkFetcher(fetcher: NetworkFetcher): void {
    this.networkFetcher = fetcher
  }
  
  /**
   * Set network security options
   */
  setNetworkSecurity(options: NetworkSecurityOptions): void {
    this.networkSecurity = { ...this.networkSecurity, ...options }
  }
  
  /**
   * Check if network is allowed based on security settings
   */
  async isNetworkAllowed(): Promise<boolean> {
    // Always allow if no restrictions
    if (!this.networkSecurity.requireSecureConnection && 
        !this.networkSecurity.requireSecureWifi &&
        !this.networkSecurity.allowedDomains?.length) {
      return true
    }
    
    // TODO: Implement actual security checks
    // For now, always allow (platform-specific implementation needed)
    return true
  }
  
  // ============================================================================
  // STATISTICS & MONITORING
  // ============================================================================
  
  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    const memoryStats = this.memoryCache.getStats()
    const storageSize = await this.storage.size()
    const storageCount = await this.storage.count()
    
    const totalHits = this.stats.memory.hits + this.stats.storage.hits
    const totalMisses = this.stats.memory.misses + this.stats.storage.misses
    const hitRate = totalHits + totalMisses > 0 ? totalHits / (totalHits + totalMisses) : 0
    
    return {
      totalEntries: memoryStats.entries + storageCount,
      totalSize: memoryStats.size + storageSize,
      hitRate,
      missRate: 1 - hitRate,
      memory: memoryStats,
      storage: {
        entries: storageCount,
        size: storageSize,
        maxSize: this.options.maxStorageSize,
        hits: this.stats.storage.hits,
        misses: this.stats.storage.misses,
      },
      network: {
        requests: this.stats.network.requests,
        hits: this.stats.network.hits,
        misses: this.stats.network.misses,
        errors: this.stats.network.errors,
      },
      startedAt: this.stats.startedAt,
      lastAccessAt: this.stats.lastAccessAt,
    }
  }
  
  /**
   * Get total cache size
   */
  async getSize(): Promise<number> {
    const memorySize = this.memoryCache.size
    const storageSize = await this.storage.size()
    return memorySize + storageSize
  }
  
  // ============================================================================
  // MAINTENANCE
  // ============================================================================
  
  /**
   * Prune expired entries
   */
  async prune(): Promise<number> {
    const memoryPruned = this.memoryCache.prune()
    const storagePruned = await this.storage.prune()
    return memoryPruned + storagePruned
  }
  
  /**
   * Optimize storage
   */
  async optimize(): Promise<void> {
    await this.prune()
    if (this.storage.optimize) {
      await this.storage.optimize()
    }
  }
  
  /**
   * Export cache data
   */
  async export(): Promise<CacheExport> {
    const keys = await this.storage.keys()
    const entries = await this.storage.getMany(keys)
    
    return {
      exportedAt: new Date().toISOString(),
      entries: Array.from(entries.entries()),
    }
  }
  
  /**
   * Import cache data
   */
  async import(data: CacheExport, options: ImportOptions = {}): Promise<number> {
    const now = new Date()
    let imported = 0
    
    // Clear if not merging
    if (!options.merge) {
      await this.clear()
    }
    
    const items: Array<{ key: string; entry: CacheEntry }> = []
    
    for (const [key, entry] of data.entries) {
      // Skip expired if requested
      if (options.skipExpired && entry.expiresAt && new Date(entry.expiresAt) < now) {
        continue
      }
      
      // Update timestamps if requested
      if (options.updateTimestamps) {
        entry.cachedAt = now.toISOString()
        if (entry.expiresAt) {
          // Recalculate expiration based on default TTL
          entry.expiresAt = new Date(now.getTime() + this.options.defaultTTL).toISOString()
        }
      }
      
      items.push({ key, entry })
      imported++
    }
    
    if (items.length > 0) {
      await this.storage.setMany(items)
    }
    
    return imported
  }
}
