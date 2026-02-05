/**
 * Background Download Worker
 * 
 * Runs resource downloads in a Web Worker to avoid blocking the main thread.
 * 
 * Architecture:
 * - Receives download commands from main thread
 * - Initializes all required services (catalog, loaders, etc.)
 * - Runs BackgroundDownloadManager in worker context
 * - Reports progress back to main thread
 * 
 * Messages:
 * - IN: { type: 'start', payload: { resourceKeys: string[], skipExisting: boolean } }
 * - IN: { type: 'stop' }
 * - OUT: { type: 'progress', payload: DownloadProgress }
 * - OUT: { type: 'complete', payload: DownloadProgress }
 * - OUT: { type: 'error', payload: { message: string } }
 * - OUT: { type: 'queue-updated', payload: { queue: string[] } }
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { CatalogManager } from '@bt-synergy/catalog-manager'
import { Door43ApiClient } from '@bt-synergy/door43-api'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { TranslationAcademyLoader } from '@bt-synergy/translation-academy-loader'
import { TranslationNotesLoader } from '@bt-synergy/translation-notes-loader'
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'
import { TranslationWordsLinksLoader } from '@bt-synergy/translation-words-links-loader'
import { TranslationWordsLoader } from '@bt-synergy/translation-words-loader'
import { getDownloadPriority } from '../config/loaderConfig'
import { IndexedDBCatalogAdapter } from '../lib/adapters/IndexedDBCatalogAdapter'
import { LoaderRegistry } from '../lib/loaders/LoaderRegistry'
import { BackgroundDownloadManager } from '../lib/services/BackgroundDownloadManager'
import { ResourceCompletenessChecker } from '../lib/services/ResourceCompletenessChecker'

// NOTE: We don't import ResourceTypeRegistry or resource type definitions here
// because they include React components (viewers) which try to access window/document
// in HMR code. Workers don't need viewers - only loaders!

// ============================================================================
// WORKER CONTEXT CHECK
// ============================================================================

// Ensure we're running in a worker context
if (typeof WorkerGlobalScope === 'undefined' || !(self instanceof WorkerGlobalScope)) {
  console.error('[BG-DL] ⚙️ Worker ERROR: This file should only run in a Web Worker context!')
}

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

let downloadManager: BackgroundDownloadManager | null = null
let catalogManager: CatalogManager | null = null
let completenessChecker: ResourceCompletenessChecker | null = null
let isInitialized = false

/**
 * Initialize all services required for downloading
 */
async function initialize() {
  if (isInitialized) {
    return
  }

  try {
    console.log('[BG-DL] ⚙️ Worker Initializing services...')

    // 1. Create storage adapters (both use IndexedDB for worker compatibility)
    const cacheAdapter = new IndexedDBCacheAdapter({
      dbName: 'tc-study-cache',
      storeName: 'cache-entries',
      version: 1
    })

    // Use IndexedDB for catalog in worker (localStorage not available in workers)
    const catalogAdapter = new IndexedDBCatalogAdapter({
      dbName: 'tc-study-catalog',
      storeName: 'catalog-entries',
      version: 1
    })

    // 2. Create Door43 API client
    const door43Client = new Door43ApiClient({
      baseUrl: 'https://git.door43.org',
      debug: false // Reduce logging in worker
    })

    // 3. Create CatalogManager
    catalogManager = new CatalogManager({
      catalogAdapter,
      cacheAdapter,
      door43Client,
      enableNetworkFallback: true,
      requireSecureConnection: false
    })

    // 3.5. Create ResourceCompletenessChecker
    completenessChecker = new ResourceCompletenessChecker({
      catalogManager,
      cacheAdapter,
      debug: false
    })

    // 4. Create LoaderRegistry and register loaders directly
    const loaderRegistry = new LoaderRegistry({
      debug: false // Disable verbose loader registration logs
    })

    // 5. Manually register loaders (avoid importing resource types with React components)
    // Register loaders with BOTH CatalogManager (for discovery) and LoaderRegistry (for downloads)
    // 
    // ⚠️ IMPORTANT: When adding a new loader, also update:
    //   - src/config/loaderConfig.ts (source of truth for loader IDs and priorities)
    //   - src/components/ResourceTypeInitializer.tsx (main thread registration)
    // 
    // TODO: Consider dynamic loader registration to eliminate this duplication
    const scriptureLoader = new ScriptureLoader({
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false
    })
    catalogManager.registerResourceType(scriptureLoader)
    loaderRegistry.registerLoader('scripture', scriptureLoader)
    
    const translationWordsLoader = new TranslationWordsLoader({
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false
    })
    catalogManager.registerResourceType(translationWordsLoader)
    loaderRegistry.registerLoader('words', translationWordsLoader)
    
    const translationWordsLinksLoader = new TranslationWordsLinksLoader({
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false
    })
    catalogManager.registerResourceType(translationWordsLinksLoader)
    loaderRegistry.registerLoader('words-links', translationWordsLinksLoader)
    
    const translationAcademyLoader = new TranslationAcademyLoader({
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false
    })
    catalogManager.registerResourceType(translationAcademyLoader)
    loaderRegistry.registerLoader('ta', translationAcademyLoader)
    
    const translationNotesLoader = new TranslationNotesLoader({
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false
    })
    catalogManager.registerResourceType(translationNotesLoader)
    loaderRegistry.registerLoader('tn', translationNotesLoader)
    
    const translationQuestionsLoader = new TranslationQuestionsLoader({
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false
    })
    catalogManager.registerResourceType(translationQuestionsLoader)
    loaderRegistry.registerLoader('questions', translationQuestionsLoader)

    // 6. Create a minimal resource type registry for priority lookups
    // (BackgroundDownloadManager needs this for priority ordering)
    // Uses shared LOADER_CONFIGS to ensure consistency with main thread
    const resourceTypeRegistry = {
      get: (type: string) => {
        return {
          downloadPriority: getDownloadPriority(type)
        }
      }
    }

    // 7. Create BackgroundDownloadManager with intelligent method selection
    downloadManager = new BackgroundDownloadManager(
      loaderRegistry,
      catalogManager,
      resourceTypeRegistry as any,
      {
        debug: false,
        downloadMethod: 'zip', // Default to zip, will be auto-selected per resource
        skipExisting: true,
      }
    )

    // Set up progress callback
    downloadManager.onProgress((progress) => {
      // Send progress updates to main thread
      postMessage({
        type: 'progress',
        payload: progress
      })
    })

    isInitialized = true
    console.log('[BG-DL] ⚙️ Worker Initialization complete')
  } catch (error) {
    console.error('[BG-DL] ⚙️ Worker Initialization failed:', error)
    postMessage({
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : String(error)
      }
    })
    throw error
  }
}

// ============================================================================
// MESSAGE HANDLING
// ============================================================================

/**
 * Handle messages from main thread
 */
self.onmessage = async (event: MessageEvent) => {
  const { type, payload } = event.data

  try {
    switch (type) {
      case 'start': {
        // Initialize if not already done
        if (!isInitialized) {
          await initialize()
        }

        if (!downloadManager || !catalogManager) {
          throw new Error('Services not initialized')
        }

        const { resourceKeys, skipExisting, totalIngredients } = payload

        console.log('[BG-DL] ⚙️ Worker Starting downloads:', {
          resources: resourceKeys.length,
          totalIngredients: totalIngredients || 'calculating...'
        })

        // Update download manager config
        downloadManager['config'].skipExisting = skipExisting

        // If specific resource keys provided, download only those
        // Otherwise, download all resources in catalog
        if (resourceKeys && resourceKeys.length > 0) {
          // Download specific resources with priority order (pass pre-calculated total)
          await downloadSpecificResources(resourceKeys, skipExisting, totalIngredients)
        } else {
          // Download all resources from catalog
          await downloadManager.downloadAllResources()
        }

        // Send completion message
        const finalProgress = downloadManager.getProgress()
        postMessage({
          type: 'complete',
          payload: finalProgress
        })

        break
      }

      case 'stop': {
        console.log('[BG-DL] ⚙️ Worker Stopping downloads')
        
        if (downloadManager) {
          await downloadManager.cancelDownloads()
        }

        postMessage({
          type: 'complete',
          payload: downloadManager?.getProgress() || null
        })

        break
      }

      default:
        console.warn('[BG-DL] ⚙️ Worker Unknown message type:', type)
    }
  } catch (error) {
    console.error('[BG-DL] ⚙️ Worker Error handling message:', error)
    postMessage({
      type: 'error',
      payload: {
        message: error instanceof Error ? error.message : String(error)
      }
    })
  }
}

/**
 * Download specific resources with priority order
 * @param resourceKeys - List of resources to download
 * @param skipExisting - Skip already cached resources
 * @param providedTotalIngredients - Pre-calculated total ingredients (from main thread)
 */
async function downloadSpecificResources(
  resourceKeys: string[],
  skipExisting: boolean,
  providedTotalIngredients?: number
) {
  if (!downloadManager || !catalogManager) {
    throw new Error('Services not initialized')
  }

  // Get metadata for all resources and count total ingredients
  const resourcesWithPriority: Array<{
    resourceKey: string
    priority: number
    metadata: any
    ingredientsCount: number
  }> = []

  // Use provided total if available, otherwise calculate it
  let totalIngredients = providedTotalIngredients || 0
  let needsCalculation = !providedTotalIngredients

  for (const resourceKey of resourceKeys) {
    try {
      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      if (!metadata) {
        console.warn(`[BG-DL] ⚙️ Worker Metadata not found for ${resourceKey}`)
        continue
      }

      // Get resource type to determine priority
      const resourceType = downloadManager['resourceTypeRegistry'].get(metadata.type)
      const priority = resourceType?.downloadPriority ?? 50

      // Count ingredients (books/entries) for this resource
      const ingredients = metadata.contentMetadata?.ingredients || []
      const ingredientsCount = ingredients.length || 1 // Default to 1 if no ingredients

      // Only calculate if not provided from main thread
      if (needsCalculation) {
        totalIngredients += ingredientsCount
      }

      resourcesWithPriority.push({
        resourceKey,
        priority,
        metadata,
        ingredientsCount
      })
    } catch (error) {
      console.error(`[BG-DL] ⚙️ Worker Failed to get metadata for ${resourceKey}:`, error)
    }
  }

  // Sort by priority (lower = higher priority = downloads first)
  resourcesWithPriority.sort((a, b) => a.priority - b.priority)

  const ingredientsSource = providedTotalIngredients ? 'pre-calculated' : 'calculated in worker'
  console.log(`[BG-DL] ⚙️ Worker Starting ${resourcesWithPriority.length} resources (${totalIngredients} total ingredients, ${ingredientsSource})`)

  // Track ingredient-level progress
  let completedIngredients = 0
  let failedIngredients = 0

  // Initialize tasks in BackgroundDownloadManager for progress tracking
  for (const { resourceKey, priority } of resourcesWithPriority) {
    downloadManager['tasks'].set(resourceKey, {
      resourceKey,
      priority,
      status: 'pending',
      progress: 0
    })
  }

  // Notify main thread of queue order with ingredient count
  postMessage({
    type: 'queue-updated',
    payload: {
      queue: resourcesWithPriority.map(r => r.resourceKey),
      totalResources: resourcesWithPriority.length,
      totalIngredients: totalIngredients
    }
  })

  // Download resources one at a time (sequential)
  // Benefits: simpler progress tracking, better for slow connections, no race conditions
  let completedResourceCount = 0
  let failedResourceCount = 0
  
  // Process resources sequentially in priority order
  for (const { resourceKey, metadata, ingredientsCount } of resourcesWithPriority) {
    try {
      // Determine download method: use zip if zipball_url is available
      const method = metadata.release?.zipball_url ? 'zip' : 'individual'
      
      console.log(`[BG-DL] ⚙️ Worker Downloading ${resourceKey} (${ingredientsCount} ingredients) using ${method} method`)

      // Create a custom progress callback for ingredient-level updates
      const onProgress = (progress: any) => {
        // Calculate how many ingredients completed for THIS resource so far
        let currentResourceIngredientsCompleted = 0
        if (progress.loaded !== undefined && progress.total !== undefined && progress.total > 0) {
          // Use actual loaded/total counts, not percentage
          currentResourceIngredientsCompleted = Math.floor((progress.loaded / progress.total) * ingredientsCount)
        }

        // Overall progress = all previously completed + current resource's partial progress
        const currentTotalCompleted = completedIngredients + currentResourceIngredientsCompleted
        
        // Calculate overall percentage based on TOTAL ingredients across ALL resources
        const overallProgress = totalIngredients > 0 
          ? Math.round((currentTotalCompleted / totalIngredients) * 100)
          : 0

        // Extract current ingredient name from progress callback
        // All loaders use 'message' field with formats like:
        // - "Processed Matthew", "Skipped ruth (already cached)"
        // - "Extracting faith", "Downloading grace"
        let currentIngredient: string | null = null
        if (progress.message) {
          // Extract just the ingredient name (after the verb)
          const match = progress.message.match(/(?:Processed|Skipped|Extracting|Downloading)\s+([^\s(]+)/)
          if (match && match[1]) {
            currentIngredient = match[1]
          } else {
            // Fallback: use the whole message if parsing fails
            currentIngredient = progress.message
          }
        }

        const progressPayload = {
          currentResource: resourceKey,
          currentResourceProgress: 0, // Not used - we only show overall progress
          totalResources: resourcesWithPriority.length,
          completedResources: completedResourceCount,
          failedResources: failedResourceCount,
          overallProgress: overallProgress, // This is the main progress: 0-100% across ALL resources
          totalIngredients: totalIngredients,
          completedIngredients: currentTotalCompleted, // Running total of all ingredients
          failedIngredients: failedIngredients,
          currentIngredient: currentIngredient, // Current item being processed
          tasks: []
        }
        
        postMessage({
          type: 'progress',
          payload: progressPayload
        })
      }

      // Get the loader for this resource
      const loader = downloadManager['loaderRegistry'].getLoaderForResource(metadata)
      
      if (!loader || !loader.downloadResource) {
        throw new Error(`No loader available for ${resourceKey}`)
      }

      // Mark as downloading
      const task = downloadManager['tasks'].get(resourceKey)
      if (task) {
        task.status = 'downloading'
      }

      // Download the resource
      await loader.downloadResource(
        resourceKey,
        {
          method: method as any,
          skipExisting
        },
        onProgress
      )

      // ✅ IMPORTANT: Update counts BEFORE marking as completed
      completedIngredients += ingredientsCount
      completedResourceCount++
      
      // Mark as completed in task tracker (do this LAST)
      if (task) {
        task.status = 'completed'
        task.progress = 100
      }

      
      // ✅ Mark as complete in cache (so it won't be re-downloaded)
      if (completenessChecker) {
        await completenessChecker.markComplete(resourceKey, {
          downloadMethod: method as any
        })
      }
      
      console.log(`[BG-DL] ⚙️ Worker ✅ Downloaded ${resourceKey} (${ingredientsCount} ingredients)`)
      
    } catch (error) {
      console.error(`[BG-DL] ⚙️ Worker Failed to download ${resourceKey}:`, error)
      
      // ❌ IMPORTANT: Update counts BEFORE marking as failed
      failedIngredients += ingredientsCount
      failedResourceCount++
      
      // Mark as failed in task tracker
      const task = downloadManager['tasks'].get(resourceKey)
      if (task) {
        task.status = 'failed'
        task.error = error instanceof Error ? error.message : String(error)
      }
      
      // ❌ Mark error in cache
      if (completenessChecker) {
        await completenessChecker.markError(
          resourceKey, 
          error instanceof Error ? error.message : String(error)
        )
      }
      
      // Continue with next resource even if this one failed
    }
  }
  
  // Send final completion message
  postMessage({
    type: 'complete',
    payload: {
      currentResource: null,
      currentResourceProgress: 0,
      totalResources: resourcesWithPriority.length,
      completedResources: completedResourceCount,
      failedResources: failedResourceCount,
      overallProgress: 100,
      totalIngredients: totalIngredients,
      completedIngredients: completedIngredients,
      failedIngredients: failedIngredients,
      tasks: []
    }
  })
  
  console.log(`[BG-DL] ⚙️ Worker All downloads complete: ${completedResourceCount}/${resourcesWithPriority.length} resources, ${completedIngredients}/${totalIngredients} ingredients`)
}

// ============================================================================
// ERROR HANDLING
// ============================================================================

self.onerror = (error) => {
  console.error('[BG-DL] ⚙️ Worker Unhandled error:', error)
  postMessage({
    type: 'error',
    payload: {
      message: error.message || String(error)
    }
  })
}

self.onunhandledrejection = (event) => {
  console.error('[BG-DL] ⚙️ Worker Unhandled promise rejection:', event.reason)
  postMessage({
    type: 'error',
    payload: {
      message: event.reason?.message || String(event.reason)
    }
  })
}

console.log('[BG-DL] ⚙️ Worker Background Download Worker loaded and ready')
