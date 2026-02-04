/**
 * @bt-synergy/resource-cache
 * 
 * Multi-tier caching for resource content
 * 
 * Note: Storage adapters are now separate packages:
 * - @bt-synergy/cache-adapter-memory
 * - @bt-synergy/cache-adapter-indexeddb
 * - @bt-synergy/cache-adapter-sqlite (future)
 */

// Main cache class
export { ResourceCache } from './ResourceCache'

// Memory cache
export { MemoryCache } from './cache/MemoryCache'

// Types
export type {
  CacheEntry,
  CacheEntryMetadata,
  CacheSource,
  CacheOptions,
  SetOptions,
  GetOptions,
  CachePriority,
  NetworkSecurityOptions,
  NetworkFetcher,
  NetworkStatus,
  CachePolicy,
  CacheStorageAdapter,
  CacheStats,
  CacheExport,
  ImportOptions,
} from './types'

// Policies
export {
  LRUCachePolicy,
  LFUCachePolicy,
  TTLCachePolicy,
  SizeCachePolicy,
} from './cache/policies'
