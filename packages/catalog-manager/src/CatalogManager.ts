/**
 * CatalogManager - Orchestrates resource loading with plugin architecture
 * Manages metadata, caching, and delegates to appropriate loaders
 */

import type {
  CatalogConfig,
  ResourceMetadata,
  SearchFilters,
  ResourceLoader,
  ProgressCallback,
  CatalogAdapter,
  CacheAdapter,
} from './types'

export class CatalogManager {
  private loaders = new Map<string, ResourceLoader>()
  public catalogAdapter: CatalogAdapter  // Public for ResourceTypeRegistry
  public cacheAdapter: CacheAdapter  // Public for ResourceTypeRegistry
  public door43Client: any  // Public for ResourceTypeRegistry
  private debug: boolean

  constructor(config: CatalogConfig) {
    this.catalogAdapter = config.catalogAdapter
    this.cacheAdapter = config.cacheAdapter
    this.door43Client = (config as any).door43Client  // Store for loaders
    this.debug = config.debug ?? false

    // Register any pre-configured loaders
    if (config.loaders) {
      for (const loader of config.loaders) {
        this.registerResourceType(loader)
      }
    }

    if (this.debug) {
      console.log('📦 CatalogManager initialized')
    }
  }

  /**
   * PUBLIC API: Register a new resource type handler
   * Called by third-party packages to add support for new resource types
   * 
   * @example
   * ```typescript
   * const audioLoader = new AudioBibleLoader(...)
   * catalogManager.registerResourceType(audioLoader)
   * // Audio resources now work!
   * ```
   */
  registerResourceType(loader: ResourceLoader): void {
    this.loaders.set(loader.resourceType, loader)
  }

  /**
   * Unregister a resource type handler
   */
  unregisterResourceType(resourceType: string): boolean {
    return this.loaders.delete(resourceType)
  }

  /**
   * Get list of supported resource types
   */
  getSupportedTypes(): string[] {
    return Array.from(this.loaders.keys())
  }

  /**
   * Check if a resource type is supported
   */
  isTypeSupported(resourceType: string): boolean {
    return this.loaders.has(resourceType)
  }
  
  /**
   * Get loader for a resource
   */
  private getLoaderForResource(metadata: ResourceMetadata): ResourceLoader | null {
    // Try by type first
    if (metadata.type && this.loaders.has(metadata.type)) {
      return this.loaders.get(metadata.type)!
    }
    
    // Try by subject
    for (const loader of this.loaders.values()) {
      if (loader.canHandle && loader.canHandle(metadata)) {
        return loader
      }
    }
    
    return null
  }

  /**
   * Load resource content
   * Automatically finds the appropriate loader and delegates
   * 
   * @param resourceKey - Unique resource identifier
   * @param contentId - Content identifier (e.g., book ID, chapter ID)
   * @returns Loaded content (type varies by resource type)
   * @throws Error if resource not found or no loader available
   */
  async loadContent(resourceKey: string, contentId: string): Promise<unknown> {
    // 1. Get resource metadata
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      throw new Error(`Resource not found: ${resourceKey}`)
    }

    // 2. Find appropriate loader
    const loader = this.getLoaderForResource(metadata)
    if (!loader) {
      throw new Error(
        `No loader registered for resource type: ${metadata.type}. ` +
        `Supported types: ${this.getSupportedTypes().join(', ')}`
      )
    }

    // 3. Delegate to loader
    if (this.debug) {
      console.log(`📖 Loading content: ${resourceKey}/${contentId} via ${loader.resourceType}`)
    }

    return loader.loadContent(resourceKey, contentId)
  }

  /**
   * Get resource metadata
   * 
   * @param resourceKey - Unique resource identifier
   * @returns Resource metadata or null if not found
   */
  async getResourceMetadata(resourceKey: string): Promise<ResourceMetadata | null> {
    return this.catalogAdapter.get(resourceKey)
  }

  // ============================================================================
  // GENERIC GETTERS (Work for ALL resource types)
  // ============================================================================

  /**
   * Check if a resource exists in the catalog
   * 
   * @param resourceKey - Resource identifier to check
   * @returns true if resource exists, false otherwise
   */
  async hasResource(resourceKey: string): Promise<boolean> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    return metadata !== null
  }

  /**
   * Get basic resource info (without loading full content)
   * 
   * @param resourceKey - Resource identifier
   * @returns Basic resource info or null if not found
   */
  async getResourceInfo(resourceKey: string): Promise<{
    resourceKey: string
    title: string
    language: string
    type: string
    format: string
    subject: string
    isAvailableOffline: boolean
    isPartiallyDownloaded: boolean
  } | null> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) return null

    return {
      resourceKey: metadata.resourceKey,
      title: metadata.title,
      language: metadata.language,
      type: metadata.type,
      format: metadata.format,
      subject: metadata.subject,
      isAvailableOffline: metadata.availability?.offline || false,
      isPartiallyDownloaded: metadata.availability?.partial || false
    }
  }

  /**
   * Check if resource is fully downloaded for offline use
   * 
   * @param resourceKey - Resource identifier
   * @returns true if fully downloaded, false otherwise
   */
  async isFullyDownloaded(resourceKey: string): Promise<boolean> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    return metadata?.availability?.offline === true
  }

  /**
   * Get list of all resources for a specific language
   * 
   * @param languageCode - Language code (e.g., 'en', 'es-419')
   * @returns Array of resource keys
   */
  async getResourcesByLanguage(languageCode: string): Promise<string[]> {
    const allKeys = await this.catalogAdapter.getAll()
    const results: string[] = []

    for (const key of allKeys) {
      const metadata = await this.catalogAdapter.get(key)
      if (metadata?.language === languageCode) {
        results.push(key)
      }
    }

    return results
  }

  /**
   * Get list of all resources of a specific type
   * 
   * @param resourceType - Resource type (e.g., 'scripture', 'notes')
   * @returns Array of resource keys
   */
  async getResourcesByType(resourceType: string): Promise<string[]> {
    const allKeys = await this.catalogAdapter.getAll()
    const results: string[] = []

    for (const key of allKeys) {
      const metadata = await this.catalogAdapter.get(key)
      if (metadata?.type === resourceType) {
        results.push(key)
      }
    }

    return results
  }

  /**
   * Add resource to catalog
   * 
   * @param metadata - Resource metadata to store
   */
  async addResourceToCatalog(metadata: ResourceMetadata): Promise<void> {
    await this.catalogAdapter.set(metadata.resourceKey, metadata)
    
    if (this.debug) {
      console.log(`➕ Added to catalog: ${metadata.resourceKey}`)
    }
  }

  /**
   * Search for resources
   * Works across all resource types
   * 
   * @param filters - Search criteria
   * @returns Array of matching resources
   */
  async searchResources(filters: SearchFilters): Promise<ResourceMetadata[]> {
    return this.catalogAdapter.search(filters)
  }

  /**
   * Alias for searchResources (for convenience)
   */
  async searchCatalog(filters: SearchFilters): Promise<ResourceMetadata[]> {
    return this.searchResources(filters)
  }

  /**
   * Download resource for offline use (bulk download - all files)
   * Delegates to the appropriate loader
   * 
   * @param resourceKey - Resource to download
   * @param options - Download options
   * @param onProgress - Optional progress callback
   * @throws Error if resource not found or loader doesn't support download
   */
  async downloadResource(
    resourceKey: string,
    options?: {
      method?: 'zip' | 'individual'  // Default: 'individual'
      skipExisting?: boolean          // Default: true
    },
    onProgress?: ProgressCallback
  ): Promise<void> {
    // Get metadata
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      throw new Error(`Resource not found: ${resourceKey}`)
    }

    // Find loader
    const loader = this.getLoaderForResource(metadata)
    if (!loader) {
      throw new Error(`No loader for resource type: ${metadata.type}`)
    }

    // Check if download is supported
    if (!loader.downloadResource) {
      throw new Error(
        `Resource type '${loader.resourceType}' does not support downloading`
      )
    }

    if (this.debug) {
      console.log(`📥 Downloading all: ${resourceKey}`, options)
    }

    await loader.downloadResource(resourceKey, options, onProgress)

    if (this.debug) {
      console.log(`✅ Downloaded all: ${resourceKey}`)
    }
  }

  /**
   * ✅ NEW: Download a single ingredient (file) on-demand
   * 
   * @param resourceKey - Resource identifier
   * @param ingredientId - Ingredient identifier (e.g., "gen", "01-GEN")
   * @param options - Download options
   * @returns Promise that resolves when download completes
   * @throws Error if resource, ingredient, or loader not found
   */
  async downloadIngredient(
    resourceKey: string,
    ingredientId: string,
    options?: {
      priority?: 'low' | 'normal' | 'high'
      onProgress?: (progress: number) => void
    }
  ): Promise<void> {
    // Get metadata
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      throw new Error(`Resource not found: ${resourceKey}`)
    }

    // Find loader
    const loader = this.getLoaderForResource(metadata)
    if (!loader) {
      throw new Error(`No loader for resource type: ${metadata.type}`)
    }

    // Check if loader supports single-file download
    if (!loader.downloadIngredient) {
      throw new Error(
        `Resource type '${loader.resourceType}' does not support single-file downloading. ` +
        `Use downloadResource() instead.`
      )
    }

    if (this.debug) {
      console.log(`📥 Downloading ingredient: ${resourceKey}/${ingredientId}`)
    }

    await loader.downloadIngredient(resourceKey, ingredientId, options)

    if (this.debug) {
      console.log(`✅ Downloaded ingredient: ${resourceKey}/${ingredientId}`)
    }
  }

  /**
   * ✅ NEW: Download multiple ingredients (batch download)
   * 
   * @param resourceKey - Resource identifier
   * @param ingredientIds - Array of ingredient identifiers
   * @param onProgress - Optional progress callback
   * @throws Error if resource or loader not found
   */
  async downloadIngredients(
    resourceKey: string,
    ingredientIds: string[],
    onProgress?: (progress: { current: number; total: number; percentage: number }) => void
  ): Promise<void> {
    // Get metadata
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      throw new Error(`Resource not found: ${resourceKey}`)
    }

    // Find loader
    const loader = this.getLoaderForResource(metadata)
    if (!loader) {
      throw new Error(`No loader for resource type: ${metadata.type}`)
    }

    if (this.debug) {
      console.log(`📥 Downloading ${ingredientIds.length} ingredients: ${resourceKey}`)
    }

    // Download each ingredient
    for (let i = 0; i < ingredientIds.length; i++) {
      const ingredientId = ingredientIds[i]
      
      try {
        await this.downloadIngredient(resourceKey, ingredientId)
        
        // Report progress
        if (onProgress) {
          onProgress({
            current: i + 1,
            total: ingredientIds.length,
            percentage: ((i + 1) / ingredientIds.length) * 100
          })
        }
      } catch (error) {
        if (this.debug) {
          console.warn(`⚠️ Failed to download ingredient: ${ingredientId}`, error)
        }
        // Continue with other ingredients
      }
    }

    if (this.debug) {
      console.log(`✅ Downloaded ${ingredientIds.length} ingredients: ${resourceKey}`)
    }
  }

  /**
   * ✅ NEW: Check if a specific ingredient is downloaded
   * 
   * @param resourceKey - Resource identifier
   * @param ingredientId - Ingredient identifier
   * @returns true if ingredient is cached locally
   */
  async isIngredientDownloaded(
    resourceKey: string,
    ingredientId: string
  ): Promise<boolean> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      return false
    }

    const loader = this.getLoaderForResource(metadata)
    if (!loader) {
      return false
    }

    // If loader has a method to check ingredient availability, use it
    if (loader.isIngredientCached) {
      return loader.isIngredientCached(resourceKey, ingredientId)
    }

    // Fallback: Check metadata
    const downloadedIngredients = metadata.contentMetadata?.downloadedIngredients || []
    return downloadedIngredients.includes(ingredientId)
  }

  /**
   * ✅ NEW: Get list of downloaded ingredients for a resource
   * 
   * @param resourceKey - Resource identifier
   * @returns Array of downloaded ingredient identifiers
   */
  async getDownloadedIngredients(resourceKey: string): Promise<string[]> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      return []
    }

    return metadata.contentMetadata?.downloadedIngredients || []
  }

  /**
   * ✅ NEW: Get download statistics for a resource
   * 
   * @param resourceKey - Resource identifier
   * @returns Download statistics or null if not found
   */
  async getDownloadStats(resourceKey: string): Promise<{
    totalFiles: number
    downloadedFiles: number
    totalSize: number
    downloadedSize: number
    lastDownload?: string
    downloadMethod?: 'tar' | 'individual' | 'zip'
  } | null> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      return null
    }

    const downloadStats = metadata.contentMetadata?.downloadStats
    if (!downloadStats) {
      // Calculate from ingredients
      const ingredients = metadata.contentMetadata?.ingredients || []
      const downloadedIngredients = metadata.contentMetadata?.downloadedIngredients || []
      
      return {
        totalFiles: ingredients.length,
        downloadedFiles: downloadedIngredients.length,
        totalSize: ingredients.reduce((sum: number, ing: any) => sum + (ing.size || 0), 0),
        downloadedSize: ingredients
          .filter((ing: any) => downloadedIngredients.includes(ing.identifier))
          .reduce((sum: number, ing: any) => sum + (ing.size || 0), 0)
      }
    }

    return downloadStats
  }

  /**
   * Check if resource is available offline
   * 
   * @param resourceKey - Resource to check
   * @returns true if resource is cached offline
   */
  async isResourceCached(resourceKey: string): Promise<boolean> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (!metadata) {
      return false
    }

    const loader = this.getLoaderForResource(metadata)
    if (!loader) {
      return false
    }

    // If loader supports checking offline availability, use it
    if (loader.isOfflineAvailable) {
      return loader.isOfflineAvailable(resourceKey)
    }

    // Otherwise, assume not cached
    return false
  }

  /**
   * Remove resource from catalog
   * 
   * @param resourceKey - Resource to remove
   */
  async removeResource(resourceKey: string): Promise<void> {
    await this.catalogAdapter.delete(resourceKey)
    
    if (this.debug) {
      console.log(`🗑️ Removed from catalog: ${resourceKey}`)
    }
  }

  /**
   * Clear all cached content (but keep metadata)
   */
  async clearCache(): Promise<void> {
    await this.cacheAdapter.clear()
    
    if (this.debug) {
      console.log('🗑️ Cleared all cached content')
    }
  }

  /**
   * Clear everything (metadata and cache)
   */
  async clearAll(): Promise<void> {
    await this.catalogAdapter.clear()
    await this.cacheAdapter.clear()
    
    if (this.debug) {
      console.log('🗑️ Cleared all catalog data')
    }
  }

  /**
   * Get all resource keys in catalog
   */
  async getAllResourceKeys(): Promise<string[]> {
    return this.catalogAdapter.getAll()
  }

  /**
   * Get catalog statistics
   * Provides counts and breakdowns of resources by language, owner, type, etc.
   * 
   * @returns Statistics about the catalog contents
   */
  async getCatalogStats(): Promise<{
    totalResources: number
    totalLanguages: number
    totalOwners: number
    byLanguage: Record<string, number>
    byOwner: Record<string, number>
    bySubject: Record<string, number>
    byType: Record<string, number>
  }> {
    // Try to use adapter's getStats if available
    if ('getStats' in this.catalogAdapter && typeof this.catalogAdapter.getStats === 'function') {
      return (this.catalogAdapter as any).getStats()
    }
    
    // Fallback: Calculate stats manually
    const keys = await this.catalogAdapter.getAll()
    const stats: {
      totalResources: number
      totalLanguages: number
      totalOwners: number
      byLanguage: Record<string, number>
      byOwner: Record<string, number>
      bySubject: Record<string, number>
      byType: Record<string, number>
    } = {
      totalResources: keys.length,
      totalLanguages: 0,
      totalOwners: 0,
      byLanguage: {},
      byOwner: {},
      bySubject: {},
      byType: {},
    }
    
    for (const key of keys) {
      const metadata = await this.catalogAdapter.get(key)
      if (!metadata) continue
      
      // Count by language
      if (metadata.language) {
        stats.byLanguage[metadata.language] = (stats.byLanguage[metadata.language] || 0) + 1
      }
      
      // Count by owner
      if (metadata.owner) {
        stats.byOwner[metadata.owner] = (stats.byOwner[metadata.owner] || 0) + 1
      }
      
      // Count by subject
      if (metadata.subject) {
        stats.bySubject[metadata.subject] = (stats.bySubject[metadata.subject] || 0) + 1
      }
      
      // Count by type
      if (metadata.type) {
        stats.byType[metadata.type] = (stats.byType[metadata.type] || 0) + 1
      }
    }
    
    stats.totalLanguages = Object.keys(stats.byLanguage).length
    stats.totalOwners = Object.keys(stats.byOwner).length
    
    return stats
  }

  /**
   * Get direct access to adapters (advanced usage)
   */
  getAdapters(): { catalog: CatalogAdapter; cache: CacheAdapter } {
    return {
      catalog: this.catalogAdapter,
      cache: this.cacheAdapter,
    }
  }
}
