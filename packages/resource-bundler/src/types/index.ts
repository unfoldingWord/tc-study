/**
 * Resource Bundler Types
 */

export interface ResourceSpec {
  owner: string
  language: string
  resourceId: string
  version?: string
  stage?: 'prod' | 'preprod' | 'draft' | 'latest'
}

export interface BundleConfig {
  resources: ResourceSpec[]
  output: string
  format: 'json' | 'indexeddb' | 'both'
  compress?: boolean
  manifest?: boolean
  parallel?: boolean
  verbose?: boolean
}

export interface BundleOptions {
  format?: 'json' | 'indexeddb' | 'both'
  compress?: boolean
  manifest?: boolean
  parallel?: boolean
  cacheDir?: string
  outputDir?: string
  verbose?: boolean
}

export interface BundledResource {
  metadata: ResourceMetadata
  content: any
  checksum: string
}

export interface ResourceMetadata {
  resourceKey: string
  resourceId: string
  owner: string
  language: string
  title: string
  version: string
  downloadedAt: string
  format: string
  type: string
  size: number
  books?: number
  chapters?: number
  verses?: number
}

export interface BundleResult {
  success: boolean
  resources: ResourceResult[]
  totalSize: number
  totalSizeCompressed?: number
  duration: number
  errors: string[]
}

export interface ResourceResult {
  resourceKey: string
  resourceId: string
  success: boolean
  filename: string
  size: number
  sizeCompressed?: number
  duration: number
  error?: string
}

export interface ManifestFile {
  version: '1.0'
  generatedAt: string
  resources: ManifestResource[]
  totalSize: number
  totalSizeCompressed?: number
}

export interface ManifestResource {
  resourceKey: string
  resourceId: string
  owner: string
  language: string
  title: string
  version: string
  filename: string
  size: number
  sizeCompressed?: number
  checksum: string
  type: string
  format: string
}

export interface DownloadResult {
  success: boolean
  filePath: string
  size: number
  fromCache: boolean
  error?: string
}

export interface ProcessResult {
  success: boolean
  metadata: ResourceMetadata
  content: any
  error?: string
}

export interface CacheStats {
  totalFiles: number
  totalSize: number
  oldestFile?: string
  newestFile?: string
}

export interface BundlerConfig {
  cacheDir?: string
  outputDir?: string
  door43BaseUrl?: string
  userAgent?: string
}
