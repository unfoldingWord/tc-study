/**
 * Resource Catalog Types
 * 
 * Metadata-only types for organizing resources by server/owner/language/resource_id
 */

// ============================================================================
// ENUMS
// ============================================================================

/**
 * Resource types
 */
export enum ResourceType {
  SCRIPTURE = 'scripture',
  NOTES = 'notes',
  WORDS = 'words',
  WORDS_LINKS = 'words-links',
  QUESTIONS = 'questions',
  ACADEMY = 'academy',
  AUDIO = 'audio',
  VIDEO = 'video',
  ALIGNMENT = 'alignment',
  UNKNOWN = 'unknown'
}

/**
 * Resource formats
 */
export enum ResourceFormat {
  USFM = 'usfm',
  TSV = 'tsv',
  MARKDOWN = 'markdown',
  JSON = 'json',
  ZIP = 'zip',
  AUDIO_MP3 = 'audio/mp3',
  VIDEO_MP4 = 'video/mp4',
  UNKNOWN = 'unknown'
}

/**
 * Location types - where resources can be found
 */
export enum LocationType {
  BUNDLED = 'bundled',          // Included in app
  PHONE = 'phone',              // Phone internal storage
  SDCARD = 'sdcard',            // SD card/external storage
  WEB = 'web',                  // Web URL (cached)
  NETWORK = 'network',          // Network URL (not cached)
  CUSTOM = 'custom'             // Custom location
}

/**
 * Relation types between resources
 */
export enum RelationType {
  ALIGNMENT = 'alignment',      // Aligned to this resource
  DEPENDENCY = 'dependency',    // Depends on this resource
  SUPPLEMENT = 'supplement',    // Supplements this resource
  TRANSLATION = 'translation',  // Translation of this resource
  REVISION = 'revision'         // Revision of this resource
}

/**
 * Resource status
 */
export enum ResourceStatus {
  DRAFT = 'draft',
  PUBLISHED = 'published',
  DEPRECATED = 'deprecated'
}

// ============================================================================
// RESOURCE METADATA
// ============================================================================

/**
 * Resource ingredient - file/content piece within a resource
 * Aligned with @bt-synergy/package-builder for consistency
 */
export interface ResourceIngredient {
  identifier: string      // e.g., "gen", "intro"
  title: string          // e.g., "Genesis", "Introduction"
  path: string           // File path in repo (e.g., "./01-GEN.usfm") ⭐ KEY!
  size?: number          // File size in bytes
  categories?: string[]  // e.g., ["bible-ot"]
  sort?: number          // Display order
  
  // Scripture-specific
  alignmentCount?: number
  versification?: string
  
  // Metadata
  exists?: boolean       // File exists in repo
  isDir?: boolean        // Is directory
  
  // ✅ NEW: Download tracking (on-demand downloads)
  downloaded?: boolean    // Is this file cached locally?
  downloadedAt?: string   // ISO timestamp of download
  downloadedSize?: number // Actual size downloaded (may differ from size)
}

/**
 * Core resource metadata stored in catalog
 * This is metadata ONLY - no content
 * 
 * NOTE: Aligned with @bt-synergy/package-builder ResourceManifestEntry
 */
export interface ResourceMetadata {
  // Resource identity (hierarchical key)
  resourceKey: string         // Computed: owner/language/resourceId
  server: string              // e.g., 'git.door43.org', 'custom-server.com'
  owner: string               // e.g., 'unfoldingWord', 'Door43-Catalog'
  language: string            // e.g., 'en', 'es', 'el-x-koine'
  resourceId: string          // e.g., 'ult', 'tn', 'tw'
  
  // Basic info
  subject: string             // e.g., 'Bible', 'Translation Notes'
  version: string             // e.g., '1.0.0', 'v45'
  title: string               // Display name
  description?: string        // Optional description
  
  // Resource type & format
  type: ResourceType          // scripture, notes, words, etc.
  format: ResourceFormat      // usfm, tsv, markdown, etc.
  contentType: string         // MIME type or custom (e.g., 'text/usfm')
  
  // ✅ Content structure - how the resource content is organized
  // Auto-detected by server adapters, not hardcoded
  contentStructure: 'book' | 'entry'  // book: organized by Bible books (scripture, notes, questions, links), entry: organized by individual articles (translation words, academy)
  
  // Availability (fast lookups!)
  availability: {
    online: boolean           // Available from network
    offline: boolean          // Cached locally (ANY file downloaded)
    bundled: boolean          // Included in app
    partial: boolean          // ✅ NEW: Only some files downloaded
  }
  
  // Locations (where to find this resource)
  locations: ResourceLocation[]
  
  // Content metadata (not content itself)
  contentMetadata?: {
    // ✅ ALIGNED: Full ingredient objects with paths (not just strings!)
    ingredients?: ResourceIngredient[]  // File details with paths
    
    // ✅ NEW: Download tracking (on-demand downloads)
    downloadedIngredients?: string[]    // Array of downloaded ingredient identifiers
    downloadStats?: {
      totalFiles: number                // Total number of files
      downloadedFiles: number           // Number downloaded
      totalSize: number                 // Total size in bytes
      downloadedSize: number            // Downloaded size in bytes
      lastDownload?: string             // ISO timestamp of last download
      downloadMethod?: 'tar' | 'individual' | 'zip' // How it was downloaded
    }
    
    // Derived/convenience fields
    books?: string[]          // Book codes (derived from ingredients)
    testament?: 'ot' | 'nt' | 'both'
    
    // For all resources
    size?: number             // Bytes
    checksum?: string         // For validation
    lastModified?: string     // ISO date
    
    // For linked resources
    relations?: ResourceRelation[]  // Related resources
  }
  
  // Quality metadata
  quality?: {
    checkingLevel?: string    // '1', '2', '3'
    status?: ResourceStatus   // draft, published, deprecated
  }
  
  // License & attribution
  license?: {
    id: string                // e.g., 'CC BY-SA 4.0'
    url?: string              // License URL
  }
  contributors?: Contributor[]  // Authors, translators, etc.
  
  // Release information (for downloads)
  release?: {
    tag_name: string          // Version tag
    zipball_url: string       // ZIP archive download URL
    tarball_url?: string      // TAR archive download URL (alternative)
    published_at: string      // ISO timestamp
    html_url?: string         // Web URL
  }
  
  // Catalog tracking
  catalogedAt: string         // When added to catalog (ISO)
  updatedAt?: string          // Last update in catalog (ISO)
  accessedAt?: string         // Last accessed (ISO)
  accessCount?: number        // Usage tracking
  
  // URLs (for reference, not content)
  urls?: {
    metadata?: string         // manifest.yaml URL
    repository?: string       // Git repo URL
    release?: string          // Release page URL
    homepage?: string         // Project homepage
  }
}

/**
 * Resource location - where to find the resource
 */
export interface ResourceLocation {
  type: LocationType
  path: string                  // Path or URL
  priority: number              // 1 = highest priority
  verified?: boolean            // Location verified
  lastChecked?: string          // ISO date
}

/**
 * Resource relation (e.g., alignment to original language)
 */
export interface ResourceRelation {
  type: RelationType
  resourceId: string            // Related resource
  language?: string             // Language if different
  owner?: string                // Owner if different
  required: boolean             // Is this relation required?
}

/**
 * Contributor info
 */
export interface Contributor {
  name: string
  role: string                  // 'author', 'translator', 'reviewer', etc.
  contact?: string              // Email or URL
}

/**
 * Resource key - unique identifier for hierarchical organization
 */
export interface ResourceKey {
  server: string
  owner: string
  language: string
  resourceId: string
}

/**
 * Convert ResourceKey to string path
 */
export function resourceKeyToString(key: ResourceKey): string {
  return `${key.server}/${key.owner}/${key.language}/${key.resourceId}`
}

/**
 * Parse string path to ResourceKey
 */
export function parseResourceKey(path: string): ResourceKey | null {
  const parts = path.split('/')
  if (parts.length !== 4) return null
  
  return {
    server: parts[0],
    owner: parts[1],
    language: parts[2],
    resourceId: parts[3],
  }
}

// ============================================================================
// CATALOG QUERY
// ============================================================================

/**
 * Query filters for searching catalog
 */
export interface CatalogQuery {
  server?: string | string[]
  owner?: string | string[]
  language?: string | string[]
  resourceId?: string | string[]
  subject?: string | string[]
  version?: string
  
  // Resource type & format
  type?: ResourceType | ResourceType[]
  format?: ResourceFormat | ResourceFormat[]
  
  // Availability filters
  availableOnline?: boolean
  availableOffline?: boolean
  bundled?: boolean
  
  // Location filters
  locationType?: LocationType | LocationType[]
  
  // Content filters
  hasBooks?: boolean          // Has book list
  book?: string               // Has specific book
  testament?: 'ot' | 'nt' | 'both'
  hasRelations?: boolean      // Has relations
  relationType?: RelationType // Has specific relation type
  
  // Quality filters
  checkingLevel?: string
  status?: ResourceStatus
}

/**
 * Catalog query result
 */
export interface CatalogQueryResult {
  resources: ResourceMetadata[]
  total: number
  filtered: number
}

// ============================================================================
// CATALOG STATISTICS
// ============================================================================

/**
 * Catalog statistics
 */
export interface CatalogStats {
  totalResources: number
  totalServers: number
  totalOwners: number
  totalLanguages: number
  bySubject: Record<string, number>
  byLanguage: Record<string, number>
  byOwner: Record<string, number>
  byType: Record<string, number>        // NEW: By resource type
  byFormat: Record<string, number>      // NEW: By format
  availableOffline: number              // NEW: Offline resources
  availableOnline: number               // NEW: Online resources
  bundledResources: number              // NEW: Bundled resources
  totalSize?: number                    // NEW: Total content size (bytes)
  oldestResource?: string               // catalogedAt
  newestResource?: string               // catalogedAt
  mostAccessed?: string                 // NEW: Most accessed resource
}

// ============================================================================
// STORAGE ADAPTER
// ============================================================================

/**
 * Platform-agnostic storage adapter interface
 * Implement this for different platforms (IndexedDB, SQLite, etc.)
 */
export interface CatalogStorageAdapter {
  // Basic CRUD
  save(key: string, metadata: ResourceMetadata): Promise<void>
  get(key: string): Promise<ResourceMetadata | null>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  
  // Bulk operations
  saveMany(items: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void>
  getAll(): Promise<Map<string, ResourceMetadata>>
  clear(): Promise<void>
  
  // Queries (basic - can be optimized per platform)
  query(filters: CatalogQuery): Promise<ResourceMetadata[]>
  
  // Statistics
  count(): Promise<number>
  getStats(): Promise<CatalogStats>
}

// ============================================================================
// CATALOG OPTIONS
// ============================================================================

/**
 * Options for catalog operations
 */
export interface CatalogOptions {
  // Storage
  adapter?: CatalogStorageAdapter
  
  // Behavior
  autoSave?: boolean          // Auto-save on changes
  cacheInMemory?: boolean     // Keep memory cache
  
  // Validation
  validateOnAdd?: boolean     // Validate before adding
  allowDuplicates?: boolean   // Allow same key with different versions
}

/**
 * Options for import/export
 */
export interface ExportOptions {
  pretty?: boolean            // Pretty-print JSON
  includeTimestamps?: boolean // Include catalogedAt/updatedAt
  filter?: CatalogQuery       // Export subset
}

export interface ImportOptions {
  merge?: boolean             // Merge or replace
  skipInvalid?: boolean       // Skip invalid entries
  updateExisting?: boolean    // Update if already exists
}
