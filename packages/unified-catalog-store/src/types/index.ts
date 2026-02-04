/**
 * Type definitions for Unified Catalog Store
 */

export interface ResourceMetadata {
  server: string
  owner: string
  language: string
  resourceId: string
  title?: string
  subject?: string
  type?: string
  availability?: {
    offline: boolean
    bundled?: boolean
  }
  [key: string]: any
}

export interface ResourcePackage {
  id: string
  name: string
  version: string
  resources: ResourceMetadata[]
  [key: string]: any
}

export interface CatalogQuery {
  language?: string
  owner?: string
  subject?: string
  type?: string
  [key: string]: any
}

export interface PackageFilters {
  language?: string
  [key: string]: any
}

export interface CacheOptions {
  ttl?: number
  [key: string]: any
}

export interface CatalogStoreConfig {
  catalog: any
  cache?: any
  packageManager?: any
}

export interface CatalogStoreOptions {
  initialResources?: ResourceMetadata[]
  initialPackages?: ResourcePackage[]
  autoLoadStats?: boolean
}

export interface CatalogStoreState {
  resources: Map<string, ResourceMetadata>
  packages: Map<string, ResourcePackage>
  stats: any
  isLoading: boolean
  error: string | null
  loadResources: (filters?: CatalogQuery) => Promise<void>
  loadPackages: (filters?: PackageFilters) => Promise<void>
  getResource: (resourceKey: string) => ResourceMetadata | undefined
  getPackage: (packageId: string) => ResourcePackage | undefined
  cacheResource: (key: string, content: any, options?: CacheOptions) => Promise<void>
  clearCache: () => Promise<void>
  setError: (error: string | null) => void
  setLoading: (isLoading: boolean) => void
  [key: string]: any
}
