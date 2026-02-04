/**
 * Resource Completeness Checker
 * 
 * Tracks which resources are fully cached and automatically triggers
 * background downloads for incomplete resources.
 * 
 * Architecture:
 * - Checks cache metadata for completion status
 * - Compares catalog resources with cached resources
 * - Identifies missing or incomplete downloads
 * - Auto-starts background worker for incomplete resources
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { CacheStorageAdapter } from '@bt-synergy/resource-cache'

export interface ResourceCompletenessStatus {
  /** Resource key */
  resourceKey: string
  
  /** Is fully cached? */
  isComplete: boolean
  
  /** Cache status */
  status: 'complete' | 'partial' | 'missing' | 'error'
  
  /** When was it last downloaded */
  lastDownloadedAt?: string
  
  /** Download size (if known) */
  size?: number
  
  /** Any error message */
  error?: string
}

export interface CompletenessReport {
  /** Total resources in catalog */
  totalResources: number
  
  /** Fully cached resources */
  completeResources: number
  
  /** Partially cached or missing */
  incompleteResources: number
  
  /** Resources with errors */
  errorResources: number
  
  /** List of incomplete resource keys */
  incompleteKeys: string[]
  
  /** Detailed status per resource */
  details: ResourceCompletenessStatus[]
  
  /** Completion percentage */
  completionPercentage: number
}

/**
 * Cache Metadata Keys
 */
export const CACHE_METADATA_KEYS = {
  /** Mark resource as fully downloaded */
  DOWNLOAD_COMPLETE: 'downloadComplete',
  
  /** Timestamp of last successful download */
  DOWNLOAD_COMPLETED_AT: 'downloadCompletedAt',
  
  /** Download method used */
  DOWNLOAD_METHOD: 'downloadMethod',
  
  /** Total size of resource */
  RESOURCE_SIZE: 'resourceSize',
  
  /** Number of entries/chapters cached */
  ENTRY_COUNT: 'entryCount',
  
  /** Expected number of entries */
  EXPECTED_ENTRY_COUNT: 'expectedEntryCount',
  
  /** Download error (if any) */
  DOWNLOAD_ERROR: 'downloadError',
} as const

export interface ResourceCompletenessCheckerOptions {
  /** Catalog manager */
  catalogManager: CatalogManager
  
  /** Cache adapter */
  cacheAdapter: CacheStorageAdapter
  
  /** Enable debug logging */
  debug?: boolean
}

export class ResourceCompletenessChecker {
  private catalogManager: CatalogManager
  private cacheAdapter: CacheStorageAdapter
  private debug: boolean
  
  constructor(options: ResourceCompletenessCheckerOptions) {
    this.catalogManager = options.catalogManager
    this.cacheAdapter = options.cacheAdapter
    this.debug = options.debug || false
  }
  
  /**
   * Check completeness for all resources in catalog
   */
  async checkAll(): Promise<CompletenessReport> {
    const startTime = Date.now()
    
    if (this.debug) {
      console.log('[BG-DL] 📦 Cache Checking all resources...')
    }
    
    try {
      // Get all resources from catalog
      const resourceKeys = await this.catalogManager.getAllResources()
      
      if (this.debug) {
        console.log(`[BG-DL] 📦 Cache Found ${resourceKeys.length} resources in catalog`)
      }
      
      // Check each resource
      const details: ResourceCompletenessStatus[] = []
      for (const resourceKey of resourceKeys) {
        const status = await this.checkResource(resourceKey)
        details.push(status)
      }
      
      // Calculate stats
      const complete = details.filter(d => d.isComplete).length
      const incomplete = details.filter(d => !d.isComplete && d.status !== 'error').length
      const errors = details.filter(d => d.status === 'error').length
      
      const report: CompletenessReport = {
        totalResources: resourceKeys.length,
        completeResources: complete,
        incompleteResources: incomplete,
        errorResources: errors,
        incompleteKeys: details.filter(d => !d.isComplete && d.status !== 'error').map(d => d.resourceKey),
        details,
        completionPercentage: resourceKeys.length > 0 
          ? Math.round((complete / resourceKeys.length) * 100)
          : 100
      }
      
      const elapsed = Date.now() - startTime
      if (this.debug) {
        console.log(`[BG-DL] 📦 Cache Check complete in ${elapsed}ms:`, {
          total: report.totalResources,
          complete: report.completeResources,
          incomplete: report.incompleteResources,
          errors: report.errorResources,
          percentage: report.completionPercentage
        })
      }
      
      return report
    } catch (error) {
      console.error('[BG-DL] 📦 Cache Error checking resources:', error)
      throw error
    }
  }
  
  /**
   * Check completeness for a specific resource
   */
  async checkResource(resourceKey: string): Promise<ResourceCompletenessStatus> {
    try {
      // Check if resource metadata exists in catalog
      const metadata = await this.catalogManager.getResourceMetadata(resourceKey)
      if (!metadata) {
        return {
          resourceKey,
          isComplete: false,
          status: 'missing',
          error: 'Resource not found in catalog'
        }
      }
      
      // Check cache for main resource entry (completion marker)
      const cacheKey = `resource:${resourceKey}`
      const cacheEntry = await this.cacheAdapter.get(cacheKey)
      
      // Check completion metadata if marker exists
      if (cacheEntry) {
        const downloadComplete = cacheEntry.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]
        const downloadCompletedAt = cacheEntry.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETED_AT]
        const downloadError = cacheEntry.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_ERROR]
        const size = cacheEntry.metadata?.[CACHE_METADATA_KEYS.RESOURCE_SIZE]
        
        // If marked as complete
        if (downloadComplete === true) {
          return {
            resourceKey,
            isComplete: true,
            status: 'complete',
            lastDownloadedAt: downloadCompletedAt,
            size
          }
        }
        
        // If has error
        if (downloadError) {
          return {
            resourceKey,
            isComplete: false,
            status: 'error',
            error: downloadError
          }
        }
        
        // Check entry count vs expected (for partially downloaded)
        const entryCount = cacheEntry.metadata?.[CACHE_METADATA_KEYS.ENTRY_COUNT]
        const expectedCount = cacheEntry.metadata?.[CACHE_METADATA_KEYS.EXPECTED_ENTRY_COUNT]
        
        if (entryCount && expectedCount && entryCount < expectedCount) {
          return {
            resourceKey,
            isComplete: false,
            status: 'partial',
            size
          }
        }
      }
      
      // No completion marker - check if ingredients are actually cached
      // This handles resources downloaded before completion markers were implemented
      const ingredients = metadata.contentMetadata?.ingredients
      if (ingredients && ingredients.length > 0) {
        let cachedCount = 0
        const resourceType = metadata.type
        
        // Check each ingredient to see if it's cached
        for (const ingredient of ingredients) {
          const ingredientId = ingredient.identifier
          if (!ingredientId) continue
          
          // Construct cache key based on resource type
          let ingredientCacheKey: string
          if (resourceType === 'scripture') {
            ingredientCacheKey = `scripture:${resourceKey}:${ingredientId}`
          } else if (resourceType === 'notes') {
            ingredientCacheKey = `notes:${resourceKey}:${ingredientId}`
          } else if (resourceType === 'words-links') {
            ingredientCacheKey = `words-links:${resourceKey}:${ingredientId}`
          } else {
            // For other types (words, academy), skip ingredient checking
            continue
          }
          
          const ingredientCache = await this.cacheAdapter.get(ingredientCacheKey)
          if (ingredientCache && ingredientCache.content) {
            cachedCount++
          }
        }
        
        // If all ingredients are cached, mark as complete
        if (cachedCount === ingredients.length && ingredients.length > 0) {
          return {
            resourceKey,
            isComplete: true,
            status: 'complete'
          }
        }
        
        // Partially downloaded
        if (cachedCount > 0) {
          return {
            resourceKey,
            isComplete: false,
            status: 'partial'
          }
        }
      }
      
      // No cache entry and no ingredients cached
      return {
        resourceKey,
        isComplete: false,
        status: 'missing'
      }
      
    } catch (error) {
      console.error(`[BG-DL] 📦 Cache Error checking ${resourceKey}:`, error)
      return {
        resourceKey,
        isComplete: false,
        status: 'error',
        error: error instanceof Error ? error.message : String(error)
      }
    }
  }
  
  /**
   * Check completeness for specific language resources
   */
  async checkLanguage(languageCode: string): Promise<CompletenessReport> {
    if (this.debug) {
      console.log(`[BG-DL] 📦 Cache Checking resources for language: ${languageCode}`)
    }
    
    // Get all resources
    const allResources = await this.catalogManager.getAllResources()
    
    // Filter by language (resourceKey format: owner/language/...)
    const languageResources = allResources.filter(key => {
      const parts = key.split('/')
      return parts.length >= 2 && parts[1] === languageCode
    })
    
    if (this.debug) {
      console.log(`[BG-DL] 📦 Cache Found ${languageResources.length} resources for ${languageCode}`)
    }
    
    // Check each resource
    const details: ResourceCompletenessStatus[] = []
    for (const resourceKey of languageResources) {
      const status = await this.checkResource(resourceKey)
      details.push(status)
    }
    
    // Calculate stats
    const complete = details.filter(d => d.isComplete).length
    const incomplete = details.filter(d => !d.isComplete && d.status !== 'error').length
    const errors = details.filter(d => d.status === 'error').length
    
    return {
      totalResources: languageResources.length,
      completeResources: complete,
      incompleteResources: incomplete,
      errorResources: errors,
      incompleteKeys: details.filter(d => !d.isComplete && d.status !== 'error').map(d => d.resourceKey),
      details,
      completionPercentage: languageResources.length > 0
        ? Math.round((complete / languageResources.length) * 100)
        : 100
    }
  }
  
  /**
   * Mark a resource as fully downloaded and cached
   */
  async markComplete(
    resourceKey: string,
    metadata?: {
      size?: number
      entryCount?: number
      expectedEntryCount?: number
      downloadMethod?: 'zip' | 'individual'
    }
  ): Promise<void> {
    try {
      const cacheKey = `resource:${resourceKey}`
      const cacheEntry = await this.cacheAdapter.get(cacheKey)
      
      if (!cacheEntry) {
        // Create minimal cache entry if doesn't exist
        await this.cacheAdapter.set(cacheKey, {
          type: 'json',
          content: {},
          cachedAt: new Date().toISOString(),
          metadata: {
            [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]: true,
            [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETED_AT]: new Date().toISOString(),
            ...metadata
          }
        })
      } else {
        // Update existing entry
        await this.cacheAdapter.set(cacheKey, {
          ...cacheEntry,
          metadata: {
            ...cacheEntry.metadata,
            [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]: true,
            [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETED_AT]: new Date().toISOString(),
            ...metadata
          }
        })
      }
      
      if (this.debug) {
        console.log(`[BG-DL] 📦 Cache Marked ${resourceKey} as complete`)
      }
    } catch (error) {
      console.error(`[BG-DL] 📦 Cache Error marking ${resourceKey} complete:`, error)
      throw error
    }
  }
  
  /**
   * Mark a resource as having an error
   */
  async markError(resourceKey: string, error: string): Promise<void> {
    try {
      const cacheKey = `resource:${resourceKey}`
      const cacheEntry = await this.cacheAdapter.get(cacheKey)
      
      const errorMetadata = {
        [CACHE_METADATA_KEYS.DOWNLOAD_ERROR]: error,
        [CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]: false
      }
      
      if (!cacheEntry) {
        await this.cacheAdapter.set(cacheKey, {
          type: 'json',
          content: {},
          cachedAt: new Date().toISOString(),
          metadata: errorMetadata
        })
      } else {
        await this.cacheAdapter.set(cacheKey, {
          ...cacheEntry,
          metadata: {
            ...cacheEntry.metadata,
            ...errorMetadata
          }
        })
      }
      
      if (this.debug) {
        console.log(`[BG-DL] 📦 Cache Marked ${resourceKey} with error: ${error}`)
      }
    } catch (err) {
      console.error(`[BG-DL] 📦 Cache Error marking ${resourceKey} error:`, err)
    }
  }
  
  /**
   * Clear completion metadata for a resource (force re-download)
   */
  async clearCompletionStatus(resourceKey: string): Promise<void> {
    try {
      const cacheKey = `resource:${resourceKey}`
      const cacheEntry = await this.cacheAdapter.get(cacheKey)
      
      if (cacheEntry && cacheEntry.metadata) {
        delete cacheEntry.metadata[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]
        delete cacheEntry.metadata[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETED_AT]
        delete cacheEntry.metadata[CACHE_METADATA_KEYS.DOWNLOAD_ERROR]
        
        await this.cacheAdapter.set(cacheKey, cacheEntry)
        
        if (this.debug) {
          console.log(`[BG-DL] 📦 Cache Cleared completion status for ${resourceKey}`)
        }
      }
    } catch (error) {
      console.error(`[BG-DL] 📦 Cache Error clearing status for ${resourceKey}:`, error)
      throw error
    }
  }
}
