/**
 * @bt-synergy/package-builder-engine
 * 
 * Platform-agnostic engine for downloading, parsing, building, and compressing resource packages
 */

// Types
export type {
  BuildConfig,
  BuildResult,
  BuildError,
  ProgressCallback,
  DownloadProgress,
  FileSystemAdapter,
  ArchiveExtractor,
  Compressor,
} from './types'

// Engine
export { PackageBuilderEngine } from './engine'
export type { PackageBuildRequest } from './engine'

// Downloader
export { ResourceDownloader } from './downloader'

// Builder
export { PackageBuilder } from './builders'

// Compressors
export { ZipCompressor } from './compressors'

// File System
export { MemoryFileSystemAdapter } from './filesystem'

/**
 * Create a default engine instance
 */
import { PackageBuilderEngine } from './engine'
import { MemoryFileSystemAdapter } from './filesystem'
import type { FileSystemAdapter as FSAdapter } from './types'

export function createEngine(filesystem?: FSAdapter) {
  return new PackageBuilderEngine(filesystem)
}

export function createMemoryEngine() {
  return new PackageBuilderEngine(new MemoryFileSystemAdapter())
}
