/**
 * Resource Package Type Definitions
 * 
 * Defines types for the resource package system that allows users to:
 * - Create custom collections of resources from any language/owner
 * - Configure panel layouts with resource assignments
 * - Share packages with other users via export/import
 */

import { ResourceType } from './context';
import type { PassageSet } from './passage-sets';

// ============================================================================
// RESOURCE PACKAGE TYPES
// ============================================================================

/**
 * A Resource Package is a user-defined collection of resources
 * that can combine different languages, owners, and servers
 */
export interface ResourcePackage {
  // Package identity
  id: string;                          // Unique package ID (UUID)
  name: string;                        // User-friendly name
  description?: string;                // Optional description
  version: string;                     // Package version (for updates)
  
  // Source tracking
  source: PackageSource;
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;                  // User ID if applicable
  
  // Package configuration
  config: PackageConfig;
  
  // Resources in this package with panel assignments
  resources: PackageResource[];
  
  // Panel layout configuration
  panelLayout: PanelLayout;
  
  // Optional passage set associations
  passageSetIds?: string[];
  
  // Status and metadata
  status: PackageStatus;
  downloadedAt?: Date;
  totalSize?: number;                  // In bytes
  metadata?: PackageMetadata;
}

export type PackageSource = 'default' | 'custom' | 'imported';

export interface PackageConfig {
  // Default server for resources (can be overridden per resource)
  defaultServer: string;               // e.g., 'git.door43.org'
  
  // Default values (can be overridden per resource)
  defaultOwner?: string;               // e.g., 'unfoldingWord'
  defaultLanguage?: string;            // e.g., 'en'
  
  // Package behavior
  offlineEnabled: boolean;             // Enable offline caching
  autoUpdate: boolean;                 // Auto-check for updates
  updateFrequency?: UpdateFrequency;
}

export type UpdateFrequency = 'daily' | 'weekly' | 'monthly' | 'manual';

export interface PackageMetadata {
  author?: string;
  license?: string;
  homepage?: string;
  tags?: string[];
  category?: PackageCategory;
}

export enum PackageCategory {
  BIBLE_STUDY = 'bible-study',
  TRANSLATION = 'translation',
  REFERENCE = 'reference',
  MINIMAL = 'minimal',
  COMPREHENSIVE = 'comprehensive',
  CUSTOM = 'custom'
}

/**
 * A resource within a package with its panel assignment
 */
export interface PackageResource {
  // Resource identification
  resourceId: string;                  // e.g., 'ult', 'tn', 'tw'
  resourceType: ResourceType;          // scripture, notes, words, etc.
  
  // Source configuration (overrides package defaults)
  server: string;
  owner: string;
  language: string;
  version?: string;                    // Specific version or 'latest'
  
  // Resource role in package
  role: ResourceRole;
  
  // Panel assignment
  panelId: string;                     // Which panel this resource belongs to
  order: number;                       // Order within the panel (for display)
  
  // Dependencies (for enhanced processing)
  dependencies?: ResourceDependency[];
  
  // Status
  status: ResourceStatus;
  cachedAt?: Date;
  cachedVersion?: string;
}

export enum ResourceRole {
  ANCHOR = 'anchor',                   // Primary navigation resource
  PRIMARY = 'primary',                 // Main content resources
  SUPPLEMENTARY = 'supplementary',     // Helper resources (notes, words)
  REFERENCE = 'reference',             // Reference only (original languages)
  BACKGROUND = 'background'            // Used internally
}

export interface ResourceDependency {
  resourceId: string;
  purpose: 'alignment' | 'quotes' | 'cross_reference' | 'definitions';
  required: boolean;
}

export enum PackageStatus {
  DRAFT = 'draft',                     // Being configured
  READY = 'ready',                     // Ready to use
  DOWNLOADING = 'downloading',         // Downloading resources
  CACHED = 'cached',                   // Fully cached offline
  ERROR = 'error',                     // Error state
  UPDATING = 'updating'                // Checking for updates
}

export enum ResourceStatus {
  PENDING = 'pending',                 // Not yet fetched
  AVAILABLE = 'available',             // Available online
  CACHED = 'cached',                   // Cached locally
  OUTDATED = 'outdated',               // Newer version available
  ERROR = 'error',                     // Failed to fetch
  NOT_FOUND = 'not_found'              // Resource doesn't exist
}

// ============================================================================
// PANEL LAYOUT TYPES
// ============================================================================

/**
 * Panel layout configuration for a package
 */
export interface PanelLayout {
  panels: PanelConfig[];
  layoutVersion: string;               // For schema evolution
}

/**
 * Configuration for a single panel
 */
export interface PanelConfig {
  id: string;                          // e.g., 'panel-1', 'panel-2'
  title: string;                       // Panel title
  description?: string;
  
  // Resources assigned to this panel (ordered)
  resourceIds: string[];               // panelResourceIds in display order
  defaultResourceId: string;           // Which resource to show by default
  
  // Panel behavior
  visible: boolean;                    // Is panel visible
  closable: boolean;                   // Can user close it
  resizable: boolean;                  // Can user resize it
  
  // Layout hints
  width?: number;                      // Current width in pixels
  minWidth?: number;
  maxWidth?: number;
}

// ============================================================================
// PACKAGE TEMPLATES (For Default Package Generation)
// ============================================================================

/**
 * Template for auto-generating packages for different languages
 */
export interface PackageTemplate {
  id: string;
  name: string;                        // Template name (can include {language})
  description: string;                 // Template description
  category: PackageCategory;
  
  // Requirements for this template
  requirements: TemplateRequirements;
  
  // Package configuration when generated
  config: Partial<PackageConfig>;
  
  // Panel layout template
  panelLayoutTemplate: PanelLayoutTemplate[];
}

export interface TemplateRequirements {
  // Resource requirements (checked against Door43 catalog)
  resources: ResourceRequirement[];
  
  // Owner requirement (which organization)
  owners: string[];                    // e.g., ['unfoldingWord', 'Door43-Catalog']
  
  // Subject requirements (from Door43 catalog)
  subjects?: string[];                 // e.g., ['Bible', 'Aligned Bible']
}

export interface ResourceRequirement {
  type: ResourceType;
  resourceIds: string[];               // Priority order, e.g., ['ult', 'glt', 'ulb']
  role: ResourceRole;
  required: boolean;                   // If false, package still valid without it
  languageOverride?: string;           // e.g., 'en' for notes regardless of package language
  panelId: string;                     // Default panel for this resource
}

export interface PanelLayoutTemplate {
  panelId: string;
  title: string;
  description?: string;
  resourceRoles: ResourceRole[];       // Which roles belong in this panel
  defaultRole: ResourceRole;           // Default resource to show
}

// ============================================================================
// PACKAGE EXPORT/IMPORT TYPES
// ============================================================================

/**
 * Package export format for sharing
 */
export interface PackageExport {
  formatVersion: '1.0';
  exportedAt: string;
  exportedBy?: string;
  
  package: {
    name: string;
    description?: string;
    version: string;
    
    config: {
      defaultServer: string;
      offlineEnabled: boolean;
      autoUpdate: boolean;
    };
    
    resources: Array<{
      resourceId: string;
      type: ResourceType;
      server: string;
      owner: string;
      language: string;
      version?: string;
      role: ResourceRole;
      panelId: string;
      order: number;
      dependencies?: ResourceDependency[];
    }>;
    
    panelLayout: PanelLayout;
    
    passageSetIds?: string[];
    
    metadata?: PackageMetadata;
  };
}

/**
 * Input for creating a new package
 */
export interface CreatePackageInput {
  name: string;
  description?: string;
  source?: PackageSource;
  config?: Partial<PackageConfig>;
  resources?: PackageResource[];
  panelLayout?: PanelLayout;
}

/**
 * Options for adding a resource to a package
 */
export interface AddResourceOptions {
  role: ResourceRole;
  panelId: string;
  order?: number;
  version?: string;
}

// ============================================================================
// RESOURCE DISCOVERY TYPES
// ============================================================================

/**
 * Search query for discovering resources
 */
export interface ResourceSearchQuery {
  // Text search
  query?: string;                      // Free text search
  
  // Filters
  languages?: string[];                // Filter by language codes
  owners?: string[];                   // Filter by owners
  types?: ResourceType[];              // Filter by resource type
  servers?: string[];                  // Filter by servers
  
  // Pagination
  page?: number;
  pageSize?: number;
  
  // Sorting
  sortBy?: 'name' | 'language' | 'updated' | 'popularity';
  sortOrder?: 'asc' | 'desc';
}

/**
 * Search results with facets
 */
export interface ResourceSearchResult {
  resources: DiscoveredResource[];
  totalCount: number;
  page: number;
  pageSize: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  languages: Array<{ code: string; name: string; count: number }>;
  owners: Array<{ id: string; name: string; count: number }>;
  types: Array<{ type: ResourceType; count: number }>;
}

/**
 * A discovered resource from the catalog
 */
export interface DiscoveredResource {
  // Identity
  id: string;                          // Resource ID (ult, tn, etc.)
  name: string;                        // Display name
  title: string;                       // Full title
  description?: string;
  
  // Source
  server: string;
  owner: string;
  language: string;
  languageName?: string;
  languageDirection?: 'ltr' | 'rtl';
  
  // Type
  type: ResourceType;
  format?: string;                     // usfm, tsv, markdown, etc.
  
  // Version info
  version: string;
  releaseDate?: Date;
  commitSha?: string;
  
  // Availability
  available: boolean;
  tarballUrl?: string;
  zipballUrl?: string;
  estimatedSize?: number;              // In bytes
  
  // Content info
  books?: Array<{ code: string; name: string }>;  // For scripture
  articleCount?: number;               // For academy/words
  noteCount?: number;                  // For notes
  
  // Metadata
  subjects?: string[];
  keywords?: string[];
  license?: string;
  contributors?: string[];
}

/**
 * Language information from catalog
 */
export interface LanguageInfo {
  code: string;                        // ISO code (en, es-419, hbo)
  name: string;                        // English name
  nativeName?: string;                 // Native name
  direction: 'ltr' | 'rtl';
  isGatewayLanguage: boolean;
  resourceCount: number;               // Number of resources
  lastUpdated?: Date;
}

/**
 * Owner/Organization information
 */
export interface OwnerInfo {
  id: string;                          // Username/org ID
  name: string;                        // Display name
  description?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  resourceCount: number;
  languages: string[];                 // Languages they provide
}

/**
 * Resource identifier for lookup
 */
export interface ResourceIdentifier {
  server: string;
  owner: string;
  language: string;
  resourceId: string;
}

/**
 * Resource availability status
 */
export interface AvailabilityStatus {
  available: boolean;
  version?: string;
  lastChecked: Date;
  error?: string;
}

/**
 * Version information for a resource
 */
export interface VersionInfo {
  version: string;
  releaseDate: Date;
  commitSha: string;
  changelog?: string;
  isLatest: boolean;
}

// ============================================================================
// DCS (Door43 Content Service) TYPES
// ============================================================================

/**
 * Parameters for loading from a DCS repository
 */
export interface DCSRepoParams {
  server: string;                      // e.g., 'git.door43.org'
  owner: string;                       // Repository owner
  repo: string;                        // Repository name
  branch?: string;                     // Branch name (default: 'master')
  path?: string;                       // Path within repo
}

/**
 * Information about a passage set available on DCS
 */
export interface DCSPassageSetInfo {
  id: string;
  name: string;
  description?: string;
  server: string;
  owner: string;
  repo: string;
  path: string;
  fileUrl: string;
  size?: number;
  lastUpdated?: Date;
}

// ============================================================================
// STORAGE ADAPTER INTERFACES (Cross-Platform)
// ============================================================================

/**
 * Package storage adapter interface (implemented for SQLite and IndexedDB)
 */
export interface PackageStorageAdapter {
  // Package CRUD
  savePackage(pkg: ResourcePackage): Promise<void>;
  getPackage(id: string): Promise<ResourcePackage | null>;
  getAllPackages(): Promise<ResourcePackage[]>;
  deletePackage(id: string): Promise<void>;
  
  // Active package management
  setActivePackageId(id: string): Promise<void>;
  getActivePackageId(): Promise<string | null>;
  
  // Panel layout persistence (per package)
  savePanelLayout(packageId: string, layout: PanelLayout): Promise<void>;
  getPanelLayout(packageId: string): Promise<PanelLayout | null>;
  
  // Passage sets
  savePassageSet(set: PassageSet): Promise<void>;
  getPassageSet(id: string): Promise<PassageSet | null>;
  getAllPassageSets(): Promise<PassageSet[]>;
  deletePassageSet(id: string): Promise<void>;
  
  // Initialization
  initialize?(): Promise<void>;
}

// ============================================================================
// UTILITY TYPES
// ============================================================================

/**
 * Options for package operations
 */
export interface PackageOperationOptions {
  skipValidation?: boolean;
  forceUpdate?: boolean;
  preserveCache?: boolean;
}

/**
 * Package validation result
 */
export interface PackageValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Package statistics
 */
export interface PackageStats {
  totalResources: number;
  resourcesByType: Record<ResourceType, number>;
  resourcesByLanguage: Record<string, number>;
  totalSize: number;
  cachedSize: number;
  cachedPercentage: number;
}



