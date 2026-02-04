/**
 * @bt-synergy/resource-catalog
 * 
 * Resource catalog management - organize and query resource metadata
 * 
 * Note: Storage adapters are now separate packages:
 * - @bt-synergy/catalog-adapter-memory
 * - @bt-synergy/catalog-adapter-indexeddb
 * - @bt-synergy/catalog-adapter-sqlite (future)
 */

// Main catalog class
export { ResourceCatalog } from './ResourceCatalog'

// Server Adapters
export { Door43ServerAdapter } from './server-adapters/Door43ServerAdapter'
export { BaseServerAdapter } from './server-adapters/types'

// Types
export type {
  ResourceMetadata,
  ResourceIngredient,
  ResourceRelation,
  ResourceLocation,
  ResourceKey,
  CatalogQuery,
  CatalogQueryResult,
  CatalogStats,
  CatalogStorageAdapter,
  CatalogOptions,
  ExportOptions,
  ImportOptions,
  Contributor,
} from './types'

export {
  ResourceType,
  ResourceFormat,
  LocationType,
  RelationType,
  ResourceStatus,
  resourceKeyToString,
  parseResourceKey,
} from './types'
