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
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { CatalogManager } from '@bt-synergy/catalog-manager'
import { Door43ApiClient } from '@bt-synergy/door43-api'
import { getDownloadPriority } from '../config/loaderConfig'
import { advanceResourceIngredientProgress } from '../features/download/backgroundDownloadRun'
import { registerWorkerLoaders } from '../features/download/workerLoaderRegistry'
import { LoaderRegistry } from '../lib/loaders/LoaderRegistry'
import { BackgroundDownloadManager } from '../lib/services/BackgroundDownloadManager'
import { ResourceCompletenessChecker } from '../lib/services/ResourceCompletenessChecker'

// NOTE: We don't import ResourceTypeRegistry or resource type definitions here
// because they include React components (viewers) which try to access window/document
// in HMR code. Workers don't need viewers - only loaders!

// ============================================================================
// WORKER CONTEXT CHECK
// ============================================================================

// Ensure we're running in a worker context (avoid WebWorker lib vs DOM conflict in app tsc)
const WorkerScope = (globalThis as typeof globalThis & {
  WorkerGlobalScope?: new () => object
}).WorkerGlobalScope
if (typeof WorkerScope === 'undefined' || !(self instanceof WorkerScope)) {
  console.error('[BG-DL] ⚙️ Worker ERROR: This file should only run in a Web Worker context!')
}

// ============================================================================
// WORKER INITIALIZATION
// ============================================================================

let downloadManager: BackgroundDownloadManager | null = null
let catalogManager: CatalogManager | null = null
let completenessChecker: ResourceCompletenessChecker | null = null
let isInitialized = false
/** Active run id from the main thread; bumped/replaced on start/stop to drop stale work. */
let activeRunId = 0

/**
 * Initialize all services required for downloading
 */
async function initialize() {
  if (isInitialized) {
    return
  }

  try {

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

    // 4. Create LoaderRegistry and register workerDownload loaders from SoT
    const loaderRegistry = new LoaderRegistry({
      debug: false // Disable verbose loader registration logs
    })

    // 5. Register every surfaces.workerDownload id (no hardcoded id literals)
    // When adding a loader: update loaderConfig.ts (+ plugin if mainPlugin)
    registerWorkerLoaders(catalogManager, loaderRegistry, {
      cacheAdapter,
      catalogAdapter,
      door43Client,
      debug: false,
    })

    // 6. Minimal resource type registry for priority lookups — SoT via getDownloadPriority
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
      resourceTypeRegistry,
      {
        debug: false,
        downloadMethod: 'zip', // Default to zip, will be auto-selected per resource
        skipExisting: true,
      }
    )

    // Set up progress callback (download-all path); fence with activeRunId
    downloadManager.onProgress((progress) => {
      const runId = activeRunId
      if (runId <= 0) return
      postMessage({
        type: 'progress',
        runId,
        payload: progress,
      })
    })

    isInitialized = true
  } catch (error) {
    console.error('[BG-DL] ⚙️ Worker Initialization failed:', error)
    postMessage({
      type: 'error',
      runId: activeRunId,
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
        const runId = typeof payload?.runId === 'number' ? payload.runId : 0
        activeRunId = runId

        // Initialize if not already done
        if (!isInitialized) {
          await initialize()
        }

        // Superseded during init (language switch stop)
        if (runId !== activeRunId) return

        if (!downloadManager || !catalogManager) {
          throw new Error('Services not initialized')
        }

        const { resourceKeys, skipExisting, totalIngredients } = payload

        // Update download manager config
        downloadManager['config'].skipExisting = skipExisting

        // If specific resource keys provided, download only those
        // Otherwise, download all resources in catalog
        if (resourceKeys && resourceKeys.length > 0) {
          await downloadSpecificResources(
            resourceKeys,
            skipExisting,
            totalIngredients,
            runId
          )
        } else {
          await downloadManager.downloadAllResources()
          if (runId !== activeRunId) return
          postMessage({
            type: 'complete',
            runId,
            payload: downloadManager.getProgress(),
          })
        }

        break
      }

      case 'stop': {
        const runId = typeof payload?.runId === 'number' ? payload.runId : activeRunId + 1
        activeRunId = runId

        if (downloadManager) {
          await downloadManager.cancelDownloads()
        }

        postMessage({
          type: 'complete',
          runId,
          payload: null,
        })

        break
      }

      default:
        console.warn('[BG-DL] ⚙️ Worker Unknown message type:', type)
    }
  } catch (error) {
    console.error('[BG-DL] ⚙️ Worker Error handling message:', error)
    const runId = activeRunId
    postMessage({
      type: 'error',
      runId,
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
 * @param runId - Main-thread run id; abort when activeRunId changes
 */
async function downloadSpecificResources(
  resourceKeys: string[],
  skipExisting: boolean,
  providedTotalIngredients: number | undefined,
  runId: number
) {
  if (!downloadManager || !catalogManager) {
    throw new Error('Services not initialized')
  }
  if (runId !== activeRunId) return

  // Get metadata for all resources and count total ingredients
  const resourcesWithPriority: Array<{
    resourceKey: string
    priority: number
    metadata: import('@bt-synergy/resource-catalog').ResourceMetadata
    ingredientsCount: number
  }> = []

  // Use provided total if available, otherwise calculate it
  let totalIngredients = providedTotalIngredients || 0
  const needsCalculation = !providedTotalIngredients

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

  const _ingredientsSource = providedTotalIngredients ? 'pre-calculated' : 'calculated in worker'

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

  if (runId !== activeRunId) return

  // Notify main thread of queue order with ingredient count
  postMessage({
    type: 'queue-updated',
    runId,
    payload: {
      queue: resourcesWithPriority.map(r => r.resourceKey),
      totalResources: resourcesWithPriority.length,
      totalIngredients: totalIngredients
    }
  })

  // Seed progress so UI is not stuck at 0/N during long pre-download setup
  postMessage({
    type: 'progress',
    runId,
    payload: {
      currentResource: resourcesWithPriority[0]?.resourceKey ?? null,
      currentResourceProgress: 0,
      totalResources: resourcesWithPriority.length,
      completedResources: 0,
      failedResources: 0,
      overallProgress: 0,
      totalIngredients,
      completedIngredients: 0,
      failedIngredients: 0,
      currentIngredient: null,
      tasks: [],
    },
  })

  // Download resources one at a time (sequential)
  // Benefits: simpler progress tracking, better for slow connections, no race conditions
  let completedResourceCount = 0
  let failedResourceCount = 0

  const postIngredientProgress = (partial: {
    currentResource: string | null
    currentIngredient?: string | null
    completedIngredients: number
    failedIngredients: number
    completedResources: number
    failedResources: number
    overallProgress: number
  }) => {
    if (runId !== activeRunId) return
    postMessage({
      type: 'progress',
      runId,
      payload: {
        currentResource: partial.currentResource,
        currentResourceProgress: 0,
        totalResources: resourcesWithPriority.length,
        completedResources: partial.completedResources,
        failedResources: partial.failedResources,
        overallProgress: partial.overallProgress,
        totalIngredients,
        completedIngredients: partial.completedIngredients,
        failedIngredients: partial.failedIngredients,
        currentIngredient: partial.currentIngredient ?? null,
        tasks: [],
      },
    })
  }

  // Process resources sequentially in priority order
  for (const { resourceKey, metadata, ingredientsCount } of resourcesWithPriority) {
    if (runId !== activeRunId) return

    try {
      // Determine download method: use zip if zipball_url is available
      const method = metadata.release?.zipball_url ? 'zip' : 'individual'

      // Peak progress within this resource so zip-byte soft % does not regress when extraction starts
      let currentResourcePeakCompleted = 0

      // Announce resource start immediately (zip fetch can take minutes before loader callbacks)
      postIngredientProgress({
        currentResource: resourceKey,
        currentIngredient: null,
        completedIngredients,
        failedIngredients,
        completedResources: completedResourceCount,
        failedResources: failedResourceCount,
        overallProgress:
          totalIngredients > 0
            ? Math.round((completedIngredients / totalIngredients) * 100)
            : 0,
      })

      // Create a custom progress callback for ingredient-level updates
      const onProgress = (progress: {
        loaded?: number
        total?: number
        percentage?: number
        message?: string
      }) => {
        if (runId !== activeRunId) return

        // Calculate how many ingredients completed for THIS resource so far
        currentResourcePeakCompleted = advanceResourceIngredientProgress(
          ingredientsCount,
          currentResourcePeakCompleted,
          progress
        )

        // Overall progress = all previously completed + current resource's partial progress
        const currentTotalCompleted = completedIngredients + currentResourcePeakCompleted

        // Calculate overall percentage based on TOTAL ingredients across ALL resources
        const overallProgress = totalIngredients > 0
          ? Math.round((currentTotalCompleted / totalIngredients) * 100)
          : 0

        // Extract current ingredient name from progress callback
        // All loaders use 'message' field with formats like:
        // - "Processed Matthew", "Skipped ruth (already cached)"
        // - "Extracting faith", "Downloading grace", "Downloading zip"
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

        postIngredientProgress({
          currentResource: resourceKey,
          currentIngredient,
          completedIngredients: currentTotalCompleted,
          failedIngredients,
          completedResources: completedResourceCount,
          failedResources: failedResourceCount,
          overallProgress,
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
          method,
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

      postIngredientProgress({
        currentResource: resourceKey,
        currentIngredient: null,
        completedIngredients,
        failedIngredients,
        completedResources: completedResourceCount,
        failedResources: failedResourceCount,
        overallProgress:
          totalIngredients > 0
            ? Math.round((completedIngredients / totalIngredients) * 100)
            : 0,
      })

      // ✅ Mark as complete in cache (so it won't be re-downloaded)
      if (completenessChecker) {
        await completenessChecker.markComplete(resourceKey, {
          downloadMethod: method
        })
      }


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

      postIngredientProgress({
        currentResource: resourceKey,
        currentIngredient: null,
        completedIngredients,
        failedIngredients,
        completedResources: completedResourceCount,
        failedResources: failedResourceCount,
        overallProgress:
          totalIngredients > 0
            ? Math.round(((completedIngredients + failedIngredients) / totalIngredients) * 100)
            : 0,
      })

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

  if (runId !== activeRunId) return

  // Send final completion message
  postMessage({
    type: 'complete',
    runId,
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

}

// ============================================================================
// ERROR HANDLING
// ============================================================================

self.onerror = (event: string | Event) => {
  console.error('[BG-DL] ⚙️ Worker Unhandled error:', event)
  const message =
    typeof event === 'string'
      ? event
      : event instanceof ErrorEvent
        ? event.message
        : String(event)
  postMessage({
    type: 'error',
    runId: activeRunId,
    payload: { message },
  })
}

self.onunhandledrejection = (event: PromiseRejectionEvent) => {
  console.error('[BG-DL] ⚙️ Worker Unhandled promise rejection:', event.reason)
  postMessage({
    type: 'error',
    runId: activeRunId,
    payload: {
      message: event.reason?.message || String(event.reason)
    }
  })
}

