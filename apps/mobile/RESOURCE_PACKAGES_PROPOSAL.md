# Resource Packages Proposal

## Executive Summary

Enable users to create **custom resource packages** combining resources from different languages, owners, and servers into a single workspace. This includes a **resource discovery system** for finding and adding resources to packages.

---

## 🎯 Goals

1. **Custom Resource Combinations**: Users can mix resources from different sources
2. **Multi-Language Support**: Combine e.g., Spanish ULT + English Translation Notes
3. **Multi-Owner Support**: Use resources from unfoldingWord + other organizations
4. **Offline Packages**: Pre-bundle resources for offline use
5. **Resource Discovery**: Search and browse available resources across servers
6. **Shareable Packages**: Export/import package configurations

---

## 📐 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        RESOURCE PACKAGE SYSTEM                          │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                         │
│  ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐     │
│  │   Resource      │    │    Package      │    │    Package      │     │
│  │   Discovery     │───▶│   Composer      │───▶│   Builder       │     │
│  │   Service       │    │   (UI)          │    │   (Processor)   │     │
│  └─────────────────┘    └─────────────────┘    └─────────────────┘     │
│          │                      │                      │               │
│          ▼                      ▼                      ▼               │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                     Package Storage Layer                        │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │   │
│  │  │ Package     │  │ Resource    │  │ Content     │              │   │
│  │  │ Manifest    │  │ Index       │  │ Cache       │              │   │
│  │  └─────────────┘  └─────────────┘  └─────────────┘              │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 1️⃣ Resource Package Data Model

### Package Manifest Interface

```typescript
// lib/types/resource-package.ts

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
  
  // Metadata
  createdAt: Date;
  updatedAt: Date;
  createdBy?: string;                  // User ID if applicable
  
  // Package configuration
  config: PackageConfig;
  
  // Resources in this package
  resources: PackageResource[];
  
  // Status
  status: PackageStatus;
  downloadedAt?: Date;
  totalSize?: number;                  // In bytes
}

export interface PackageConfig {
  // Default server for resources (can be overridden per resource)
  defaultServer: string;               // e.g., 'git.door43.org'
  
  // Default values (can be overridden per resource)
  defaultOwner?: string;               // e.g., 'unfoldingWord'
  defaultLanguage?: string;            // e.g., 'en'
  
  // Package behavior
  offlineEnabled: boolean;             // Enable offline caching
  autoUpdate: boolean;                 // Auto-check for updates
  updateFrequency?: 'daily' | 'weekly' | 'monthly';
}

export interface PackageResource {
  // Resource identification
  resourceId: string;                  // e.g., 'ult', 'tn', 'tw'
  resourceType: ResourceType;          // scripture, notes, words, etc.
  
  // Source configuration (overrides package defaults)
  server?: string;                     // Override server
  owner?: string;                      // Override owner
  language?: string;                   // Override language
  version?: string;                    // Specific version or 'latest'
  
  // Resource role in package
  role: ResourceRole;
  priority: number;                    // Load order
  
  // Panel configuration (optional)
  panelConfig?: {
    visible: boolean;
    panelId?: string;                  // Which panel to display in
  };
  
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
```

### Example Package Configurations

```typescript
// Example 1: Bilingual Spanish-English Package
const spanishEnglishPackage: ResourcePackage = {
  id: 'pkg-spanish-english-bible',
  name: 'Spanish-English Bible Study',
  description: 'Spanish GLT with English translation helps',
  version: '1.0.0',
  config: {
    defaultServer: 'git.door43.org',
    defaultOwner: 'unfoldingWord',
    offlineEnabled: true,
    autoUpdate: true,
    updateFrequency: 'weekly'
  },
  resources: [
    // Spanish GLT as anchor
    {
      resourceId: 'glt',
      resourceType: ResourceType.SCRIPTURE,
      language: 'es-419',
      role: ResourceRole.ANCHOR,
      priority: 1
    },
    // Spanish GST
    {
      resourceId: 'gst',
      resourceType: ResourceType.SCRIPTURE,
      language: 'es-419',
      role: ResourceRole.PRIMARY,
      priority: 2
    },
    // English Translation Notes (for helps)
    {
      resourceId: 'tn',
      resourceType: ResourceType.NOTES,
      language: 'en',
      role: ResourceRole.SUPPLEMENTARY,
      priority: 3,
      dependencies: [
        { resourceId: 'glt', purpose: 'quotes', required: true }
      ]
    },
    // English Translation Words
    {
      resourceId: 'tw',
      resourceType: ResourceType.WORDS,
      language: 'en',
      role: ResourceRole.SUPPLEMENTARY,
      priority: 4
    },
    // Hebrew Bible for OT
    {
      resourceId: 'uhb',
      resourceType: ResourceType.SCRIPTURE,
      language: 'hbo',
      role: ResourceRole.REFERENCE,
      priority: 10
    },
    // Greek NT for NT
    {
      resourceId: 'ugnt',
      resourceType: ResourceType.SCRIPTURE,
      language: 'el-x-koine',
      role: ResourceRole.REFERENCE,
      priority: 11
    }
  ],
  status: PackageStatus.DRAFT,
  createdAt: new Date(),
  updatedAt: new Date()
};

// Example 2: Multi-Owner Research Package
const researchPackage: ResourcePackage = {
  id: 'pkg-research-multi-source',
  name: 'Research Multi-Source Package',
  description: 'Resources from multiple organizations',
  version: '1.0.0',
  config: {
    defaultServer: 'git.door43.org',
    offlineEnabled: true,
    autoUpdate: false
  },
  resources: [
    // unfoldingWord ULT
    {
      resourceId: 'ult',
      resourceType: ResourceType.SCRIPTURE,
      owner: 'unfoldingWord',
      language: 'en',
      role: ResourceRole.ANCHOR,
      priority: 1
    },
    // Different organization's resources
    {
      resourceId: 'tn',
      resourceType: ResourceType.NOTES,
      owner: 'Door43-Catalog',  // Different owner
      language: 'en',
      role: ResourceRole.SUPPLEMENTARY,
      priority: 2
    },
    // Custom server resource
    {
      resourceId: 'custom-notes',
      resourceType: ResourceType.NOTES,
      server: 'custom-server.org',  // Different server
      owner: 'my-organization',
      language: 'en',
      role: ResourceRole.SUPPLEMENTARY,
      priority: 3
    }
  ],
  status: PackageStatus.DRAFT,
  createdAt: new Date(),
  updatedAt: new Date()
};
```

---

## 2️⃣ Resource Discovery Service

### Discovery API Interface

```typescript
// lib/services/discovery/ResourceDiscoveryService.ts

export interface ResourceDiscoveryService {
  // Search for resources
  searchResources(query: ResourceSearchQuery): Promise<ResourceSearchResult>;
  
  // Get resource details
  getResourceDetails(params: ResourceIdentifier): Promise<DiscoveredResource>;
  
  // Browse by category
  browseByLanguage(language: string): Promise<DiscoveredResource[]>;
  browseByOwner(owner: string): Promise<DiscoveredResource[]>;
  browseByType(type: ResourceType): Promise<DiscoveredResource[]>;
  
  // Get available languages
  getAvailableLanguages(server?: string): Promise<LanguageInfo[]>;
  
  // Get available owners/organizations
  getAvailableOwners(server?: string): Promise<OwnerInfo[]>;
  
  // Check resource availability
  checkAvailability(params: ResourceIdentifier): Promise<AvailabilityStatus>;
  
  // Get resource versions
  getVersions(params: ResourceIdentifier): Promise<VersionInfo[]>;
}

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

export interface ResourceSearchResult {
  resources: DiscoveredResource[];
  totalCount: number;
  page: number;
  pageSize: number;
  facets: SearchFacets;
}

export interface SearchFacets {
  languages: { code: string; name: string; count: number }[];
  owners: { id: string; name: string; count: number }[];
  types: { type: ResourceType; count: number }[];
}

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
  
  // Availability
  available: boolean;
  tarballUrl?: string;
  zipballUrl?: string;
  estimatedSize?: number;              // In bytes
  
  // Content info
  books?: BookInfo[];                  // For scripture
  articleCount?: number;               // For academy/words
  noteCount?: number;                  // For notes
  
  // Metadata
  subjects?: string[];
  keywords?: string[];
  license?: string;
  contributors?: string[];
}

export interface LanguageInfo {
  code: string;                        // ISO code (en, es-419, hbo)
  name: string;                        // English name
  nativeName?: string;                 // Native name
  direction: 'ltr' | 'rtl';
  isGatewayLanguage: boolean;
  resourceCount: number;               // Number of resources
  lastUpdated?: Date;
}

export interface OwnerInfo {
  id: string;                          // Username/org ID
  name: string;                        // Display name
  description?: string;
  avatarUrl?: string;
  websiteUrl?: string;
  resourceCount: number;
  languages: string[];                 // Languages they provide
}

export interface ResourceIdentifier {
  server: string;
  owner: string;
  language: string;
  resourceId: string;
}

export interface AvailabilityStatus {
  available: boolean;
  version?: string;
  lastChecked: Date;
  error?: string;
}

export interface VersionInfo {
  version: string;
  releaseDate: Date;
  commitSha: string;
  changelog?: string;
  isLatest: boolean;
}
```

### Discovery Service Implementation

```typescript
// lib/services/discovery/Door43DiscoveryService.ts

export class Door43DiscoveryService implements ResourceDiscoveryService {
  private baseUrl = 'https://git.door43.org';
  private catalogCache = new Map<string, CatalogEntry[]>();
  private cacheExpiry = 60 * 60 * 1000; // 1 hour
  
  async searchResources(query: ResourceSearchQuery): Promise<ResourceSearchResult> {
    // Use Door43 Catalog API for searching
    const catalogUrl = `${this.baseUrl}/api/v1/catalog/search`;
    const params = new URLSearchParams();
    
    if (query.query) params.append('q', query.query);
    if (query.languages?.length) params.append('lang', query.languages.join(','));
    if (query.owners?.length) params.append('owner', query.owners.join(','));
    
    // Fetch and filter results
    const response = await fetch(`${catalogUrl}?${params}`);
    const data = await response.json();
    
    // Transform to DiscoveredResource[]
    const resources = this.transformCatalogResults(data.data);
    
    // Apply local filtering for types
    const filtered = query.types 
      ? resources.filter(r => query.types!.includes(r.type))
      : resources;
    
    // Build facets
    const facets = this.buildFacets(resources);
    
    return {
      resources: filtered.slice(
        (query.page || 0) * (query.pageSize || 20),
        ((query.page || 0) + 1) * (query.pageSize || 20)
      ),
      totalCount: filtered.length,
      page: query.page || 0,
      pageSize: query.pageSize || 20,
      facets
    };
  }
  
  async getAvailableLanguages(): Promise<LanguageInfo[]> {
    // Fetch all catalog entries and extract unique languages
    const catalogUrl = `${this.baseUrl}/api/v1/catalog/list/languages`;
    const response = await fetch(catalogUrl);
    const data = await response.json();
    
    return data.data.map((lang: any) => ({
      code: lang.identifier,
      name: lang.title,
      nativeName: lang.anglicized_name,
      direction: lang.direction || 'ltr',
      isGatewayLanguage: lang.is_gl || false,
      resourceCount: lang.resources?.length || 0
    }));
  }
  
  async browseByLanguage(language: string): Promise<DiscoveredResource[]> {
    const result = await this.searchResources({ languages: [language] });
    return result.resources;
  }
  
  // ... other methods
}
```

---

## 3️⃣ Resource Finding Path

### Resource Finding Flow

```
┌─────────────────────────────────────────────────────────────────────┐
│                    RESOURCE FINDING PATH                            │
└─────────────────────────────────────────────────────────────────────┘

User wants to add a resource to their package:

    ┌─────────────────┐
    │  1. BROWSE      │  User browses by:
    │                 │  • Language (Spanish, French, etc.)
    │                 │  • Type (Scripture, Notes, Words)
    │                 │  • Owner (unfoldingWord, Door43-Catalog)
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  2. SEARCH      │  User searches:
    │                 │  • "Spanish translation notes"
    │                 │  • "GLT es-419"
    │                 │  • "unfoldingWord Greek"
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  3. DISCOVER    │  System shows:
    │                 │  • Available resources matching criteria
    │                 │  • Resource metadata (title, description)
    │                 │  • Available versions
    │                 │  • Size estimates
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  4. INSPECT     │  User can:
    │                 │  • View resource details
    │                 │  • See what books are included
    │                 │  • Check dependencies
    │                 │  • Preview content (optional)
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  5. SELECT      │  User selects:
    │                 │  • Resource to add
    │                 │  • Role (anchor, primary, supplementary)
    │                 │  • Version (latest or specific)
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  6. CONFIGURE   │  System:
    │                 │  • Validates dependencies
    │                 │  • Suggests related resources
    │                 │  • Checks compatibility
    └────────┬────────┘
             │
             ▼
    ┌─────────────────┐
    │  7. ADD         │  Resource added to package:
    │                 │  • Package manifest updated
    │                 │  • Ready for download
    └─────────────────┘
```

### Resource Finder Component

```typescript
// lib/components/packages/ResourceFinder.tsx

interface ResourceFinderProps {
  onResourceSelect: (resource: DiscoveredResource) => void;
  currentPackage?: ResourcePackage;
  excludeResources?: string[];  // Already in package
}

interface ResourceFinderState {
  // Search state
  searchQuery: string;
  activeFilters: {
    languages: string[];
    types: ResourceType[];
    owners: string[];
  };
  
  // Browse state
  browseMode: 'search' | 'language' | 'type' | 'owner';
  selectedLanguage?: string;
  selectedType?: ResourceType;
  selectedOwner?: string;
  
  // Results
  searchResults: DiscoveredResource[];
  isLoading: boolean;
  error?: string;
  
  // Selected resource for preview
  previewResource?: DiscoveredResource;
}

// Component provides:
// 1. Search bar with auto-complete
// 2. Filter chips for language/type/owner
// 3. Browse tabs (Languages | Types | Owners)
// 4. Results grid with resource cards
// 5. Resource preview modal
// 6. "Add to Package" action
```

---

## 4️⃣ Package Composer Service

```typescript
// lib/services/packages/PackageComposer.ts

export class PackageComposer {
  constructor(
    private discoveryService: ResourceDiscoveryService,
    private packageStorage: PackageStorageAdapter
  ) {}
  
  /**
   * Create a new package
   */
  async createPackage(config: CreatePackageInput): Promise<ResourcePackage> {
    const pkg: ResourcePackage = {
      id: generateUUID(),
      name: config.name,
      description: config.description,
      version: '1.0.0',
      config: {
        defaultServer: config.defaultServer || 'git.door43.org',
        defaultOwner: config.defaultOwner,
        defaultLanguage: config.defaultLanguage,
        offlineEnabled: config.offlineEnabled ?? true,
        autoUpdate: config.autoUpdate ?? true
      },
      resources: [],
      status: PackageStatus.DRAFT,
      createdAt: new Date(),
      updatedAt: new Date()
    };
    
    await this.packageStorage.savePackage(pkg);
    return pkg;
  }
  
  /**
   * Add resource to package
   */
  async addResource(
    packageId: string, 
    resource: DiscoveredResource,
    options: AddResourceOptions
  ): Promise<ResourcePackage> {
    const pkg = await this.packageStorage.getPackage(packageId);
    
    // Validate resource can be added
    await this.validateResourceAddition(pkg, resource, options);
    
    // Check dependencies
    const dependencies = await this.resolveDependencies(resource, pkg);
    
    // Create package resource entry
    const packageResource: PackageResource = {
      resourceId: resource.id,
      resourceType: resource.type,
      server: resource.server,
      owner: resource.owner,
      language: resource.language,
      version: options.version || 'latest',
      role: options.role || ResourceRole.SUPPLEMENTARY,
      priority: options.priority || pkg.resources.length + 1,
      status: ResourceStatus.PENDING,
      dependencies
    };
    
    // Add to package
    pkg.resources.push(packageResource);
    pkg.updatedAt = new Date();
    
    // If this is the first resource, make it anchor
    if (pkg.resources.length === 1) {
      packageResource.role = ResourceRole.ANCHOR;
    }
    
    await this.packageStorage.savePackage(pkg);
    return pkg;
  }
  
  /**
   * Validate resource can be added to package
   */
  private async validateResourceAddition(
    pkg: ResourcePackage,
    resource: DiscoveredResource,
    options: AddResourceOptions
  ): Promise<void> {
    // Check if already in package
    const exists = pkg.resources.some(r => 
      r.resourceId === resource.id && 
      r.language === resource.language &&
      r.owner === resource.owner
    );
    if (exists) {
      throw new Error(`Resource ${resource.id} (${resource.language}) already in package`);
    }
    
    // Check availability
    const available = await this.discoveryService.checkAvailability({
      server: resource.server,
      owner: resource.owner,
      language: resource.language,
      resourceId: resource.id
    });
    if (!available.available) {
      throw new Error(`Resource ${resource.id} is not available: ${available.error}`);
    }
    
    // Check compatibility (e.g., can't have two anchors)
    if (options.role === ResourceRole.ANCHOR && 
        pkg.resources.some(r => r.role === ResourceRole.ANCHOR)) {
      throw new Error('Package already has an anchor resource');
    }
  }
  
  /**
   * Get suggested resources for a package
   */
  async getSuggestedResources(pkg: ResourcePackage): Promise<DiscoveredResource[]> {
    const suggestions: DiscoveredResource[] = [];
    
    // Get languages in package
    const languages = [...new Set(pkg.resources.map(r => r.language))];
    
    // Suggest complementary resources
    for (const resource of pkg.resources) {
      // If has scripture, suggest notes
      if (resource.resourceType === ResourceType.SCRIPTURE) {
        const notes = await this.discoveryService.searchResources({
          languages: [resource.language!],
          types: [ResourceType.NOTES]
        });
        suggestions.push(...notes.resources.slice(0, 2));
      }
      
      // If has notes, suggest translation words
      if (resource.resourceType === ResourceType.NOTES) {
        const words = await this.discoveryService.searchResources({
          languages: [resource.language!],
          types: [ResourceType.WORDS]
        });
        suggestions.push(...words.resources.slice(0, 1));
      }
    }
    
    // Always suggest original languages
    if (!pkg.resources.some(r => r.language === 'hbo')) {
      const uhb = await this.discoveryService.getResourceDetails({
        server: 'git.door43.org',
        owner: 'unfoldingWord',
        language: 'hbo',
        resourceId: 'uhb'
      });
      suggestions.push(uhb);
    }
    
    return suggestions;
  }
}
```

---

## 5️⃣ Package Storage Schema

```typescript
// db/schema/packages.ts

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const resourcePackages = sqliteTable('resource_packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  config: text('config').notNull(),  // JSON string
  status: text('status').notNull().default('draft'),
  totalSize: integer('total_size'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' })
});

export const packageResources = sqliteTable('package_resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: text('package_id').references(() => resourcePackages.id).notNull(),
  resourceId: text('resource_id').notNull(),
  resourceType: text('resource_type').notNull(),
  server: text('server'),
  owner: text('owner'),
  language: text('language'),
  version: text('version'),
  role: text('role').notNull().default('supplementary'),
  priority: integer('priority').notNull().default(100),
  panelConfig: text('panel_config'),  // JSON string
  dependencies: text('dependencies'),  // JSON string
  status: text('status').notNull().default('pending'),
  cachedAt: integer('cached_at', { mode: 'timestamp' }),
  cachedVersion: text('cached_version')
});

// Index for language discovery
export const languageIndex = sqliteTable('language_index', {
  code: text('code').primaryKey(),
  name: text('name').notNull(),
  nativeName: text('native_name'),
  direction: text('direction').notNull().default('ltr'),
  isGatewayLanguage: integer('is_gl', { mode: 'boolean' }).default(false),
  resourceCount: integer('resource_count').default(0),
  lastUpdated: integer('last_updated', { mode: 'timestamp' })
});

// Index for discovered resources
export const resourceIndex = sqliteTable('resource_index', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  server: text('server').notNull(),
  owner: text('owner').notNull(),
  language: text('language').notNull(),
  resourceId: text('resource_id').notNull(),
  resourceType: text('resource_type').notNull(),
  title: text('title').notNull(),
  description: text('description'),
  version: text('version'),
  available: integer('available', { mode: 'boolean' }).default(true),
  estimatedSize: integer('estimated_size'),
  metadata: text('metadata'),  // JSON string
  discoveredAt: integer('discovered_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
});
```

---

## 6️⃣ Implementation Phases

### Phase 1: Foundation (Week 1-2)
- [ ] Define TypeScript interfaces for packages
- [ ] Create database schema for packages
- [ ] Implement PackageStorageAdapter
- [ ] Create basic Package model

### Phase 2: Discovery Service (Week 2-3)
- [ ] Implement Door43DiscoveryService
- [ ] Add language/owner/type browsing
- [ ] Implement search functionality
- [ ] Add resource caching for offline discovery

### Phase 3: Package Composer (Week 3-4)
- [ ] Implement PackageComposer service
- [ ] Add resource validation
- [ ] Implement dependency resolution
- [ ] Add resource suggestions

### Phase 4: UI Components (Week 4-5)
- [ ] Create ResourceFinder component
- [ ] Create PackageEditor component
- [ ] Add resource preview modal
- [ ] Create package management screen

### Phase 5: Integration (Week 5-6)
- [ ] Connect with existing WorkspaceContext
- [ ] Update app initialization for packages
- [ ] Add package download/sync
- [ ] Implement offline support

### Phase 6: Polish (Week 6-7)
- [ ] Add import/export functionality
- [ ] Create package templates
- [ ] Add usage analytics
- [ ] Performance optimization

---

## 7️⃣ UI Mockup

### Resource Finder Screen

```
┌─────────────────────────────────────────────────────────────────┐
│  Find Resources                                           [X]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ 🔍 Search resources...                                  │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  Filters:  [Spanish ×] [Scripture ×] [Clear All]               │
│                                                                 │
├─────────────────────────────────────────────────────────────────┤
│  Languages    Types    Organizations                            │
│  ──────────────────────────────────────────────                │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐                  │
│  │ 📖 GLT            │  │ 📖 GST            │                  │
│  │ Gateway Literal   │  │ Gateway Simplified│                  │
│  │ Spanish (es-419)  │  │ Spanish (es-419)  │                  │
│  │ unfoldingWord     │  │ unfoldingWord     │                  │
│  │ [Add to Package]  │  │ [Add to Package]  │                  │
│  └───────────────────┘  └───────────────────┘                  │
│                                                                 │
│  ┌───────────────────┐  ┌───────────────────┐                  │
│  │ 📝 Translation    │  │ ❓ Translation    │                  │
│  │    Notes          │  │    Questions      │                  │
│  │ Spanish (es-419)  │  │ Spanish (es-419)  │                  │
│  │ unfoldingWord     │  │ unfoldingWord     │                  │
│  │ [Add to Package]  │  │ [Add to Package]  │                  │
│  └───────────────────┘  └───────────────────┘                  │
│                                                                 │
│  Suggested for your package:                                    │
│  ┌───────────────────┐                                         │
│  │ 🔤 Translation    │  Hebrew Bible and Greek NT               │
│  │    Words (en)     │  are recommended for alignment           │
│  │ [+ Add]           │                                         │
│  └───────────────────┘                                         │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## 8️⃣ Files to Create

```
lib/
├── types/
│   └── resource-package.ts           # Package interfaces
├── services/
│   ├── discovery/
│   │   ├── ResourceDiscoveryService.ts
│   │   ├── Door43DiscoveryService.ts
│   │   └── DiscoveryCache.ts
│   └── packages/
│       ├── PackageComposer.ts
│       ├── PackageBuilder.ts
│       ├── PackageStorageAdapter.ts
│       └── PackageValidator.ts
├── components/
│   └── packages/
│       ├── ResourceFinder.tsx
│       ├── ResourceCard.tsx
│       ├── ResourcePreview.tsx
│       ├── PackageEditor.tsx
│       ├── PackageList.tsx
│       └── LanguageBrowser.tsx
├── contexts/
│   └── PackageContext.tsx
└── hooks/
    ├── useResourceDiscovery.ts
    ├── usePackage.ts
    └── usePackageResources.ts

db/
└── schema/
    └── packages.ts                   # Package database schema

app/
├── packages/
│   ├── index.tsx                     # Package list
│   ├── [id].tsx                      # Package editor
│   └── new.tsx                       # Create package
└── packages/resources/
    └── index.tsx                     # Resource finder
```

---

## 9️⃣ Next Steps

1. **Review this proposal** - Confirm the approach aligns with your vision
2. **Prioritize features** - Which aspects are most important first?
3. **Design the UI** - Create mockups for key screens
4. **Start implementation** - Begin with Phase 1 foundation

Would you like me to start implementing any specific part of this proposal?



