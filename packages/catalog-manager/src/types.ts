/**
 * Type definitions for the extensible catalog manager
 */

import type { ResourceMetadata as CatalogResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceLoader as BaseResourceLoader } from '@bt-synergy/resource-types'

/**
 * Re-export ResourceMetadata from resource-catalog for consistency
 */
export type ResourceMetadata = CatalogResourceMetadata

/**
 * Re-export ResourceLoader from resource-types to prevent circular dependencies
 */
export type ResourceLoader = BaseResourceLoader

/**
 * Search filters for finding resources
 */
export interface SearchFilters {
  /** Filter by resource type */
  type?: string
  
  /** Filter by subject */
  subject?: string
  
  /** Filter by language */
  language?: string
  
  /** Filter by owner */
  owner?: string
  
  /** Search query (title, description) */
  query?: string
  
  /** Limit results */
  limit?: number
  
  /** Offset for pagination */
  offset?: number
}

/**
 * Progress callback for long-running operations
 */
export interface ProgressCallback {
  (progress: {
    loaded: number
    total: number
    percentage: number
    message?: string
  }): void
}

/**
 * Catalog adapter interface (metadata storage)
 */
export interface CatalogAdapter {
  /** Get resource metadata */
  get(resourceKey: string): Promise<ResourceMetadata | null>
  
  /** Set resource metadata */
  set(resourceKey: string, metadata: ResourceMetadata): Promise<void>
  
  /** Search resources */
  search(filters: SearchFilters): Promise<ResourceMetadata[]>
  
  /** Delete resource metadata */
  delete(resourceKey: string): Promise<void>
  
  /** Get all resource keys */
  getAll(): Promise<string[]>
  
  /** Clear all metadata */
  clear(): Promise<void>
}

/**
 * Cache adapter interface (content storage)
 */
export interface CacheAdapter {
  /** Get cached content */
  get(key: string): Promise<{ content: unknown; contentType?: string } | null>
  
  /** Set cached content */
  set(key: string, data: { content: unknown; contentType?: string }): Promise<void>
  
  /** Delete cached content */
  delete(key: string): Promise<void>
  
  /** Check if content exists */
  has(key: string): Promise<boolean>
  
  /** Clear all cached content */
  clear(): Promise<void>
}

/**
 * Configuration for CatalogManager
 */
export interface CatalogConfig {
  /** Metadata storage adapter (IndexedDB, SQLite, etc.) */
  catalogAdapter: CatalogAdapter
  
  /** Content cache adapter */
  cacheAdapter: CacheAdapter
  
  /** Pre-register resource loaders */
  loaders?: ResourceLoader[]
  
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Plugin descriptor for resource loaders
 */
export interface ResourceLoaderPlugin {
  /** Plugin name */
  name: string
  
  /** Plugin version (semver) */
  version: string
  
  /** Resource loader implementation */
  loader: ResourceLoader
  
  /** Optional dependencies on other plugins */
  dependencies?: string[]
  
  /** Plugin description */
  description?: string
}
