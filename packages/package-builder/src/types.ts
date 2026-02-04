/**
 * Core types for package building
 */

import type { Door43Resource, Door43Language, Door43Owner } from '@bt-synergy/door43-api'

// ============================================================================
// Package Manifest Types
// ============================================================================

export interface PackageManifest {
  formatVersion: string
  id: string
  name: string
  description?: string
  version: string
  createdAt: string
  updatedAt: string
  createdBy?: string
  resources: ResourceManifestEntry[]
  config: PackageConfig
  stats: PackageStats
}

export interface ResourceManifestEntry {
  id: string
  type: ResourceType
  owner: string
  language: {
    code: string
    name: string
    direction: 'ltr' | 'rtl'
    isGatewayLanguage?: boolean
  }
  resourceId: string
  version: string
  
  // Download information
  download: ResourceDownload
  
  // Source attribution
  source: ResourceSource
  
  // Content metadata (uncompressed)
  content: ResourceContent
  
  // Quality & Standards
  metadata?: {
    type: string // e.g., "rc"
    version: string // e.g., "0.2"
    checkingLevel?: string // e.g., "3"
  }
  
  // Dependencies
  dependencies: string[]
}

export interface ResourceDownload {
  url: string
  format: 'zip' | 'tar.gz' | 'tar'
  tarballUrl?: string // Alternative .tar.gz download
  size?: number
  checksum?: string // If available from API
}

export interface ResourceSource {
  repoUrl: string
  releaseTag?: string // e.g., "v87"
  releasedAt?: string // ISO date
  releaseUrl?: string // Link to release page
  
  // Metadata URLs (from catalog - guaranteed to exist)
  manifestUrl?: string // Direct URL to manifest.yaml raw file
  metadataApiUrl?: string // API endpoint for parsed metadata JSON
  contentsApiUrl?: string // API endpoint to browse repo contents
  
  // Documentation URLs (constructed - may not exist, verify before using)
  readmeUrl?: string // Potential URL to README.md (not guaranteed)
  licenseUrl?: string // Potential URL to LICENSE.md (not guaranteed)
}

export interface ResourceIngredient {
  identifier: string
  title: string
  categories?: string[]
  sort?: number
  path?: string
  size?: number
  alignmentCount?: number
  versification?: string
  exists?: boolean
  isDir?: boolean
}

export interface ResourceContent {
  subject: string
  title: string
  description?: string // Short description from repo
  format?: string // File format (usfm, markdown, tsv)
  flavorType?: string // Resource type classification
  flavor?: string // Specific flavor
  lastUpdated: string
  books?: string[] // Book codes
  ingredients?: ResourceIngredient[]
}

export interface ResourceLocation {
  type: 'bundled' | 'phone' | 'sdcard' | 'web' | 'url'
  path: string
  format: 'compressed' | 'uncompressed'
}

export interface PanelLayout {
  panels: PanelConfig[]
  layoutVersion: string
}

export interface PanelConfig {
  id: string
  title: string
  description?: string
  resourceIds: string[]
  defaultResourceId: string
  visible: boolean
  closable: boolean
  resizable: boolean
  minWidth: number
  maxWidth?: number
}

export interface PackageConfig {
  defaultServer: string
}

export interface PackageMetadata {
  author?: string
  license?: string
  category?: string
  tags?: string[]
}

export interface LanguageInfo {
  code: string
  name: string
  direction?: 'ltr' | 'rtl'
}

export interface PackageStats {
  estimatedSize: number // Total estimated download size in bytes (for UI progress)
}

export type ResourceType = 'scripture' | 'notes' | 'questions' | 'words' | 'words_links' | 'academy' | 'stories'

// Legacy types (deprecated, for backwards compatibility)
export type PackageStatus = 'draft' | 'ready' | 'downloading' | 'cached' | 'error' | 'updating'
export type ResourceStatus = 'available' | 'downloading' | 'cached' | 'error' | 'missing'
export type ResourceRole = 'anchor' | 'primary' | 'reference' | 'supplementary'

// ============================================================================
// Package Builder State Types
// ============================================================================

export interface PackageBuilderState {
  // Selection state
  selectedLanguages: Set<string>
  selectedLanguagesInfo: Map<string, Door43Language>
  selectedOrganizations: Set<string>
  selectedResources: Map<string, Door43Resource>
  
  // Manifest being built
  manifest: Partial<PackageManifest>
  
  // Available data
  availableLanguages: Door43Language[]
  availableOrganizations: Door43Owner[]
  
  // Loading states
  loadingLanguages: boolean
  loadingOrganizations: boolean
  loadingResources: boolean
}

// ============================================================================
// Package Builder Configuration
// ============================================================================

export interface PackageBuilderConfig {
  defaultServer: string
  subjects: string[]
  stage: string
  topic: string
  includeOriginalLanguages: boolean
}

// ============================================================================
// Validation Types
// ============================================================================

export interface ValidationResult {
  valid: boolean
  errors: ValidationError[]
  warnings: ValidationWarning[]
}

export interface ValidationError {
  field: string
  message: string
  code: string
}

export interface ValidationWarning {
  field: string
  message: string
  code: string
}
