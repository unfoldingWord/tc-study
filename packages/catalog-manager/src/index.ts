/**
 * @bt-synergy/catalog-manager
 * 
 * Extensible catalog manager for Bible translation resources
 * with plugin-based architecture for custom resource types
 */

export { CatalogManager } from './CatalogManager'

export type {
  ResourceMetadata,
  SearchFilters,
  ProgressCallback,
  ResourceLoader,
  CatalogAdapter,
  CacheAdapter,
  CatalogConfig,
  ResourceLoaderPlugin,
} from './types'

// UI Components and Registry
export { ViewerRegistry } from './ui'
export type { ResourceViewer, ResourceViewerProps } from './ui'
