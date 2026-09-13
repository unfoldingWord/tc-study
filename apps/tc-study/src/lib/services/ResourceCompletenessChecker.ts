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
import {
  hasScripturePayload,
  isCachedScriptureBookComplete,
  isScriptureBookComplete as isScriptureBookCompleteShared,
  scriptureChapterNumbers as scriptureChapterNumbersShared,
} from '@bt-synergy/scripture-loader'

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

/** Ingredient cache key prefix by catalog resource type. */
export function ingredientCacheKeyFor(
  resourceType: string,
  resourceKey: string,
  ingredientId: string
): string | null {
  switch (resourceType) {
    case 'scripture':
      return `scripture-usj:${resourceKey}:${ingredientId.toLowerCase()}`
    case 'notes':
      return `tn:${resourceKey}:${ingredientId}`
    case 'words-links':
      return `twl:${resourceKey}:${ingredientId}`
    case 'questions':
      return `tq:${resourceKey}:${ingredientId}`
    default:
      return null
  }
}

function unwrapCachePayload(entry: unknown): Record<string, unknown> | null {
  if (!entry || typeof entry !== 'object') return null
  const e = entry as Record<string, unknown>
  const payload =
    e.content && typeof e.content === 'object' && !Array.isArray(e.content)
      ? (e.content as Record<string, unknown>)
      : e
  return payload
}

/** Thin book index written next to chapter keys — not a downloaded book blob. */
export const scriptureChapterNumbers = scriptureChapterNumbersShared

/** Macrotask yield so UI-thread completeness does not hold IDB against worker setMany. */
export function yieldBetweenCompletenessBooks(): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, 0)
  })
}

/**
 * True when a book is fully cached: USJ/chapters blob, or a thin index whose
 * first and last chapter keys have real payloads. Same rule as ScriptureLoader skip.
 */
export const isScriptureBookComplete = isScriptureBookCompleteShared

/**
 * True when a cached ingredient entry has usable payload (not just a stub).
 * Handles both CacheEntry wrappers ({ content }) and loader-native shapes (notes/links/…).
 * Thin `{ chapterNumbers }` indexes are not payload — they only list chapter keys.
 */
export function hasIngredientPayload(
  entry: unknown,
  resourceType: string
): boolean {
  const payload = unwrapCachePayload(entry)
  if (!payload) return false

  switch (resourceType) {
    case 'scripture':
      return hasScripturePayload(entry)
    case 'notes':
      return (
        payload.notes != null ||
        (typeof payload.notesByChapter === 'object' &&
          payload.notesByChapter != null &&
          Object.keys(payload.notesByChapter as object).length > 0)
      )
    case 'words-links':
      return (
        payload.links != null ||
        (typeof payload.linksByChapter === 'object' &&
          payload.linksByChapter != null &&
          Object.keys(payload.linksByChapter as object).length > 0)
      )
    case 'questions':
      return (
        payload.questions != null ||
        (typeof payload.questionsByChapter === 'object' &&
          payload.questionsByChapter != null &&
          Object.keys(payload.questionsByChapter as object).length > 0)
      )
    default:
      return Object.keys(payload).length > 0
  }
}

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



    try {
      // Get all resources from catalog
      const resourceKeys = await this.catalogManager.getAllResourceKeys()



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

      const _elapsed = Date.now() - startTime


      return report
    } catch (error) {
      console.error('[BG-DL] 📦 Cache Error checking resources:', error)
      throw error
    }
  }

  /**
   * Count how many catalog ingredients are present in cache with usable payload.
   * Returns null when the resource type has no per-ingredient keys to verify.
   */
  private async countCachedIngredients(
    resourceKey: string,
    resourceType: string,
    ingredients: Array<{ identifier?: string }>,
    failFast = false
  ): Promise<{ cachedCount: number; checkableCount: number } | null> {
    let cachedCount = 0
    let checkableCount = 0

    for (let i = 0; i < ingredients.length; i++) {
      const ingredient = ingredients[i]
      const ingredientId = ingredient.identifier
      if (!ingredientId) continue

      const ingredientCacheKey = ingredientCacheKeyFor(resourceType, resourceKey, ingredientId)
      if (!ingredientCacheKey) continue

      checkableCount++
      if (resourceType === 'scripture') {
        if (await isCachedScriptureBookComplete(this.cacheAdapter, resourceKey, ingredientId)) {
          cachedCount++
        } else if (failFast) {
          return { cachedCount, checkableCount }
        }
      } else {
        const ingredientCache = await this.cacheAdapter.get(ingredientCacheKey)
        if (hasIngredientPayload(ingredientCache, resourceType)) {
          cachedCount++
        } else if (failFast) {
          return { cachedCount, checkableCount }
        }
      }
      if (!failFast && i + 1 < ingredients.length) {
        await yieldBetweenCompletenessBooks()
      }
    }

    if (checkableCount === 0) return null
    return { cachedCount, checkableCount }
  }

  /**
   * Check completeness for a specific resource
   */
  async checkResource(
    resourceKey: string,
    options?: { failFast?: boolean }
  ): Promise<ResourceCompletenessStatus> {
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

      const ingredients = metadata.contentMetadata?.ingredients
      const resourceType = metadata.type
      const ingredientStats =
        ingredients && ingredients.length > 0
          ? await this.countCachedIngredients(
              resourceKey,
              resourceType,
              ingredients,
              options?.failFast === true
            )
          : null

      // Check completion metadata if marker exists
      if (cacheEntry) {
        const downloadComplete = cacheEntry.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE]
        const downloadCompletedAt = cacheEntry.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETED_AT]
        const downloadError = cacheEntry.metadata?.[CACHE_METADATA_KEYS.DOWNLOAD_ERROR]
        const size = cacheEntry.metadata?.[CACHE_METADATA_KEYS.RESOURCE_SIZE]

        // If has error
        if (downloadError) {
          return {
            resourceKey,
            isComplete: false,
            status: 'error',
            error: downloadError
          }
        }

        // Marker alone is not enough — verify ingredient / chapter payloads when possible
        if (downloadComplete === true) {
          if (ingredientStats && ingredientStats.cachedCount < ingredientStats.checkableCount) {
            return {
              resourceKey,
              isComplete: false,
              status: ingredientStats.cachedCount > 0 ? 'partial' : 'missing',
              lastDownloadedAt: downloadCompletedAt,
              size
            }
          }
          return {
            resourceKey,
            isComplete: true,
            status: 'complete',
            lastDownloadedAt: downloadCompletedAt,
            size
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

      // No completion marker (or inconclusive) — check ingredients directly
      if (ingredientStats) {
        if (
          ingredientStats.cachedCount === ingredientStats.checkableCount &&
          ingredientStats.checkableCount > 0
        ) {
          return {
            resourceKey,
            isComplete: true,
            status: 'complete'
          }
        }

        if (ingredientStats.cachedCount > 0) {
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


    // Get all resources
    const allResources = await this.catalogManager.getAllResourceKeys()

    // Filter by language (resourceKey format: owner/language/...)
    const languageResources = allResources.filter(key => {
      const parts = key.split('/')
      return parts.length >= 2 && parts[1] === languageCode
    })



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
  /**
   * Persist the complete marker only when a fresh checkResource agrees.
   * Loader return-without-throw is not enough (partial extract / skipExisting).
   */
  async markCompleteIfVerified(
    resourceKey: string,
    metadata?: {
      size?: number
      entryCount?: number
      expectedEntryCount?: number
      downloadMethod?: 'zip' | 'individual'
    }
  ): Promise<boolean> {
    const status = await this.checkResource(resourceKey)
    if (!status.isComplete) return false
    await this.markComplete(resourceKey, metadata)
    return true
  }

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


      }
    } catch (error) {
      console.error(`[BG-DL] 📦 Cache Error clearing status for ${resourceKey}:`, error)
      throw error
    }
  }
}
