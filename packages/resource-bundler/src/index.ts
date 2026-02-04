/**
 * @bt-synergy/resource-bundler
 * 
 * CLI tool and library for bundling and preloading BT Synergy resources
 */

// Core exports
export { ResourceBundler } from './core/Bundler.js'
export { ResourceDownloader } from './core/Downloader.js'
export { ResourceProcessor } from './core/Processor.js'

// Exporter exports
export { JSONExporter } from './exporters/JSONExporter.js'
export { ManifestGenerator } from './exporters/ManifestGenerator.js'

// Utility exports
export { CacheManager } from './utils/cache.js'
export { logger, Logger } from './utils/logger.js'

// Type exports
export type {
  ResourceSpec,
  BundleConfig,
  BundleOptions,
  BundledResource,
  ResourceMetadata,
  BundleResult,
  ResourceResult,
  ManifestFile,
  ManifestResource,
  DownloadResult,
  ProcessResult,
  CacheStats,
  BundlerConfig
} from './types/index.js'
