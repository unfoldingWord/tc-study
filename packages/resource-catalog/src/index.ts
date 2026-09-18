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

// Canonical short resource type IDs (SoT for loaders / catalog / apps)
export {
  RESOURCE_TYPE_IDS,
  getResourceTypeDisplayName,
  inferDoor43ResourceTypeId,
  isValidResourceTypeId,
  type ResourceTypeId,
} from './resourceTypeIds'

// Stamped ingest receipt (resource:{key} metadata)
export {
  resourceContentStamp,
  expectedIngestReleaseStamp,
  scriptureIngestSchema,
  helpsIngestSchema,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  isLegacyUnstampedComplete,
  buildIngestReceiptMetadata,
  buildIngestReceiptFromCatalog,
  readIngestReceiptMeta,
  HELPS_INGEST_SCHEMA,
  INGEST_RECEIPT_KEYS,
  type ResourceStampSource,
  type IngestDownloadMethod,
  type BuildIngestReceiptMetadataInput,
} from './ingestReceipt'

// Catalog phantoms vs release tree/zip (shared by scripture + TSV loaders)
export {
  ABSENT_FROM_RELEASE_KEY,
  normalizeIngredientPath,
  ingredientPresentInPathSet,
  partitionIngredientsByReleasePaths,
  pathSetFromZipFileNames,
  omitAbsentIngredients,
  readAbsentFromRelease,
  mergeAbsentFromReleaseIds,
  presentIngredientCount,
  persistAbsentFromRelease,
  fetchReleasePathSet,
  type IngredientPathRef,
} from './releaseIngredientPresence'

// Zip vs per-file fill after interrupted / partial caches
export {
  PARTIAL_CACHE_INDIVIDUAL_MIN_CACHED,
  chooseIngredientFetchMode,
  type IngredientFetchMode,
} from './ingredientFetchPolicy'
