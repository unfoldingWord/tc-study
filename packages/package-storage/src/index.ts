/**
 * @bt-synergy/package-storage
 * 
 * Resource package management - virtual groupings of catalog resources
 */

// Main package manager
export { PackageManager } from './PackageManager'

// Types
export type {
  ResourcePackage,
  PackageResource,
  PackageSettings,
  PanelLayout,
  Panel,
  PackageManager as IPackageManager,
  PackageFilters,
  LoadPackageResult,
  CanLoadResult,
  ImportOptions,
  PackageStorageAdapter,
} from './types/index'

export {
  packageResourceToKey,
  parsePackageResourceKey,
} from './types/index'

// Storage adapters
export { MemoryPackageStorage } from './storage/memory'
export { IndexedDBPackageStorage } from './storage/indexeddb'
export type { IndexedDBStorageOptions } from './storage/indexeddb'