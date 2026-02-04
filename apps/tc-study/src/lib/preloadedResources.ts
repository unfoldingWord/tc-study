/**
 * Preloaded Resources System
 * 
 * This module loads metadata for "preloaded" resources that were bundled at build time.
 * The metadata includes ingredients (file paths) for on-demand content downloading.
 * 
 * Build-time: scripts/fetch-preloaded-metadata.js fetches Door43 metadata → saves to public/preloaded/
 * Runtime: This loader reads bundled metadata → adds to catalog
 * On-demand: ScriptureLoader downloads content when resource is first used in a panel
 */

import { CatalogManager } from '@bt-synergy/catalog-manager'
import { LocationType, ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'

/**
 * Manifest structure for preloaded resources
 */
interface PreloadedManifest {
  version: string
  generatedAt: string
  resources: Array<{
    resourceKey: string
    name: string
    filename: string
  }>
  totalResources: number
}

/**
 * Door43 resource metadata (from bundled files)
 */
interface BundledDoor43Metadata {
  id: string
  name: string
  title?: string
  owner: string
  language: string
  language_title?: string
  language_direction?: 'ltr' | 'rtl'
  subject: string
  version: string
  format?: string
  content_format?: string
  flavor_type?: string
  flavor?: string
  metadata_version?: string
  description?: string
  
  // URLs
  metadata_url?: string
  html_url?: string
  
  // Ingredients (for on-demand downloading)
  ingredients?: Array<{
    identifier: string
  title: string
    path?: string
    size?: number
    categories?: string[]
    sort?: number
    alignment_count?: number
    versification?: string
    exists?: boolean
    is_dir?: boolean
  }>
  
  // Release info
  release?: {
    tag_name: string
    zipball_url: string
    tarball_url: string
    published_at: string
    html_url: string
  }
  
  // Enriched data (from build script)
  license?: string
  readme?: string
  manifestYaml?: string
  fetchedAt?: string
}

/**
 * Convert string type to ResourceType enum
 */
function getResourceType(type: string, subject?: string): ResourceType {
  const typeLower = type.toLowerCase()
  const subjectLower = (subject || '').toLowerCase()
  
  if (typeLower === 'scripture' || subjectLower.includes('bible') || subjectLower.includes('scripture')) {
    return ResourceType.SCRIPTURE
  } else if (typeLower === 'words' || subjectLower.includes('words')) {
    return ResourceType.WORDS
  } else if (typeLower === 'notes' || subjectLower.includes('notes')) {
    return ResourceType.NOTES
  } else if (typeLower === 'questions' || subjectLower.includes('questions')) {
    return ResourceType.QUESTIONS
  } else if (typeLower === 'academy' || subjectLower.includes('academy')) {
    return ResourceType.ACADEMY
  }
  
  return ResourceType.UNKNOWN
}

export class PreloadedResourcesLoader {
  private catalogManager: CatalogManager
  private baseUrl: string

  constructor(catalogManager: CatalogManager, baseUrl = '/preloaded') {
    this.catalogManager = catalogManager
    this.baseUrl = baseUrl
  }

  /**
   * Check if preloaded resources are available
   */
  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/manifest.json`)
      return response.ok
    } catch {
      return false
    }
  }

  /**
   * Load manifest
   */
  async loadManifest(): Promise<PreloadedManifest | null> {
    try {
      const response = await fetch(`${this.baseUrl}/manifest.json`)
      if (!response.ok) {
        console.warn('⚠️ Preloaded manifest not found')
        return null
      }
      return await response.json()
    } catch (error) {
      console.error('❌ Failed to load preloaded manifest:', error)
      return null
    }
  }

  /**
   * Load bundled metadata for a resource
   */
  async loadResourceMetadata(filename: string): Promise<BundledDoor43Metadata | null> {
    try {
      const response = await fetch(`${this.baseUrl}/${filename}`)
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}`)
      }
      return await response.json()
    } catch (error) {
      console.error(`❌ Failed to load ${filename}:`, error)
      return null
    }
  }

  /**
   * Load all preloaded resources and add to catalog + workspace
   */
  async loadAll(addToWorkspace?: (resource: any) => void): Promise<{ 
    success: number
    failed: number
    skipped: number 
  }> {
    console.log(`📚 Loading preloaded resources (bundled metadata)...`)

    // Load manifest
    const manifest = await this.loadManifest()
    if (!manifest) {
      console.warn('⚠️ No preloaded manifest found')
      return { success: 0, failed: 0, skipped: 0 }
    }

    let success = 0
    let failed = 0
    let skipped = 0

    for (const resource of manifest.resources) {
      try {
        // Check if already in catalog
        const existing = await this.catalogManager.getResourceMetadata(resource.resourceKey)
        if (existing) {
          console.log(`   ⊙ Already cataloged: ${resource.resourceKey}`)
          skipped++
          continue
        }

        console.log(`   📥 Loading bundled metadata: ${resource.resourceKey}`)
        
        // Load bundled Door43 metadata
        const door43Data = await this.loadResourceMetadata(resource.filename)
        
        if (!door43Data) {
          console.warn(`   ⚠️ Failed to load metadata file: ${resource.filename}`)
        failed++
          continue
        }

        // Parse ingredients
        const ingredients = door43Data.ingredients?.map(ing => ({
          identifier: ing.identifier,
          title: ing.title || ing.identifier,
          path: ing.path || '',
          size: ing.size,
          categories: ing.categories,
          sort: ing.sort,
          alignmentCount: ing.alignment_count,
          versification: ing.versification,
          exists: ing.exists,
          isDir: ing.is_dir,
        }))

        const resourceType = getResourceType(
          door43Data.flavor_type || 'scripture',
          door43Data.subject
        )

        // Create catalog entry
        const catalogMetadata = {
          resourceKey: resource.resourceKey,
          resourceId: door43Data.name || door43Data.id,
          server: 'git.door43.org',
          owner: door43Data.owner,
          language: door43Data.language,
          title: door43Data.title || door43Data.name || resource.name,
          subject: door43Data.subject,
          version: (() => {
            if (!door43Data.release?.tag_name) {
              throw new Error(
                `Resource ${door43Data.owner}/${door43Data.id} has no release tag. ` +
                `Only released resources are currently supported. ` +
                `Future versions will support non-released resources using commit SHA and last updated timestamp.`
              );
            }
            return door43Data.release.tag_name;
          })(),
          description: door43Data.description,
          longDescription: door43Data.readme || undefined,
          license: door43Data.license ? { id: door43Data.license } : undefined,
          licenseFile: undefined,
          type: resourceType,
          format: door43Data.content_format as ResourceFormat || ResourceFormat.USFM,
          contentType: 'text/usfm',
          contentStructure: 'book' as const,
          availability: {
            online: true,
            offline: false, // Content not downloaded yet - will be fetched on-demand
            bundled: false,
            partial: false,
          },
          locations: [{
            type: LocationType.NETWORK,
            path: door43Data.html_url || `git.door43.org/${door43Data.owner}/${door43Data.language}_${door43Data.name}`,
            priority: 1,
          }],
          release: door43Data.release ? {
            tag_name: door43Data.release.tag_name,
            zipball_url: door43Data.release.zipball_url,
            tarball_url: door43Data.release.tarball_url,
            published_at: door43Data.release.published_at,
            html_url: door43Data.release.html_url,
          } : undefined,
          contentMetadata: {
            ingredients, // ⭐ This enables on-demand downloading per book
            books: ingredients?.map(i => i.identifier),
          },
          catalogedAt: new Date().toISOString(),
        }

        await this.catalogManager.addResourceToCatalog(catalogMetadata)
        console.log(`   ✅ Cataloged: ${catalogMetadata.title}`)

        // Also add to workspace collection (so it appears in sidebar)
        if (addToWorkspace) {
          addToWorkspace({
            id: resource.resourceKey,
            key: resource.resourceKey,
            title: catalogMetadata.title,
            type: resourceType,
            category: String(resourceType).toLowerCase(),
            subject: door43Data.subject,
            language: door43Data.language,
            languageCode: door43Data.language,
            languageName: door43Data.language_title, // Add language name
            owner: door43Data.owner,
            server: 'git.door43.org',
            format: door43Data.content_format || 'usfm',
            location: 'network',
            resourceId: door43Data.name || door43Data.id,
            ingredients, // ⭐ Include ingredients for on-demand downloading
            version: catalogMetadata.version,
            description: door43Data.description,
            readme: door43Data.readme,
            license: door43Data.license,
          })
          console.log(`   ✅ Added to workspace: ${catalogMetadata.title}`)
        }

        success++

      } catch (error) {
        console.error(`   ❌ Failed to load ${resource.resourceKey}:`, error)
        failed++
      }
    }

    console.log(`📚 Preloaded resources: ${success} added, ${skipped} skipped, ${failed} failed`)
    return { success, failed, skipped }
  }

  /**
   * Check if preloaded resources need to be loaded
   */
  async needsLoading(): Promise<boolean> {
    const manifest = await this.loadManifest()
    if (!manifest) return false

    // Check if any preloaded resources are missing from catalog
    for (const resource of manifest.resources) {
      const existing = await this.catalogManager.getResourceMetadata(resource.resourceKey)
      if (!existing) {
        return true
      }
    }
    return false
  }
}

/**
 * Get the list of preloaded resource keys (for UI purposes)
 */
export async function getPreloadedResourceKeys(): Promise<string[]> {
  try {
    const response = await fetch('/preloaded/manifest.json')
    if (!response.ok) return []
    
    const manifest: PreloadedManifest = await response.json()
    return manifest.resources.map(r => r.resourceKey)
  } catch {
    return []
  }
}

/**
 * Get original Door43 data for a preloaded resource (including language_title)
 */
export async function getPreloadedResourceData(resourceKey: string): Promise<BundledDoor43Metadata | null> {
  try {
    // Get manifest to find the filename for this resource key
    const manifestResponse = await fetch('/preloaded/manifest.json')
    if (!manifestResponse.ok) return null
    
    const manifest: PreloadedManifest = await manifestResponse.json()
    const resource = manifest.resources.find(r => r.resourceKey === resourceKey)
    
    if (!resource) return null
    
    // Load the resource's Door43 data
    const dataResponse = await fetch(`/preloaded/${resource.filename}`)
    if (!dataResponse.ok) return null
    
    const data: BundledDoor43Metadata = await dataResponse.json()
    return data
  } catch (error) {
    console.error(`Failed to load preloaded resource data for ${resourceKey}:`, error)
    return null
  }
}

/**
 * Initialize preloaded resources (called by CatalogContext)
 * This loads bundled metadata into the catalog (but not workspace yet)
 */
export async function initializePreloadedResources(catalogManager: CatalogManager): Promise<void> {
  try {
  const loader = new PreloadedResourcesLoader(catalogManager)

  // Check if preloaded resources are available
  const available = await loader.isAvailable()
  if (!available) {
      console.log('ℹ️ No preloaded resources available')
      return
    }
    
    // Check if we need to load them
    const needsLoading = await loader.needsLoading()
    if (!needsLoading) {
      console.log('✅ Preloaded resources already cataloged')
      return
    }
    
    // Load metadata into catalog (without adding to workspace)
    console.log('📥 Loading preloaded resource metadata...')
    const result = await loader.loadAll() // Don't pass addToWorkspace here
    
    console.log(`✅ Preloaded resources: ${result.success} cataloged, ${result.skipped} skipped, ${result.failed} failed`)
  } catch (error) {
    console.error('❌ Failed to initialize preloaded resources:', error)
    throw error
  }
}
