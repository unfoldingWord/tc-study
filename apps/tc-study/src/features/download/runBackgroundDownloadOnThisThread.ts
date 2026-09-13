/**
 * Same extract/USJ path as the download worker, runnable on this thread
 * when the worker isolate never posts (embedded browsers, failed module
 * graph). Must stay prepare-free.
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { getDownloadPriority } from '../../config/loaderConfig'
import { LoaderRegistry } from '../../lib/loaders/LoaderRegistry'
import { BackgroundDownloadManager } from '../../lib/services/BackgroundDownloadManager'
import { ResourceCompletenessChecker } from '../../lib/services/ResourceCompletenessChecker'
import { registerWorkerLoaders } from './workerLoaderRegistry'
import {
  STARTING_PROGRESS_PERCENT,
  computeInFlightOverallProgress,
  fallbackIngredientCount,
  mapLoaderProgressToResource,
  RESOURCE_DOWNLOAD_TIMEOUT_MS,
  resolveRunIngredientTotal,
  shouldSkipCompleteResourceDownload,
  skippedCompleteResourceProgress,
  withResourceDownloadTimeout,
} from './backgroundDownloadRun'

export type DownloadThreadMessage = {
  type: 'progress' | 'complete' | 'error' | 'resource-complete' | 'queue-updated'
  runId: number
  payload: unknown
}

export async function runBackgroundDownloadOnThisThread(args: {
  resourceKeys: string[]
  skipExisting: boolean
  totalIngredients?: number
  runId: number
  post: (message: DownloadThreadMessage) => void
  isCurrentRun: () => boolean
}): Promise<void> {
  const { resourceKeys, skipExisting, totalIngredients: providedTotal, runId, post, isCurrentRun } =
    args

  const cacheAdapter = new IndexedDBCacheAdapter({
    dbName: 'tc-study-cache',
    storeName: 'cache-entries',
    version: 1,
  })
  const catalogAdapter = new IndexedDBCatalogAdapter({
    dbName: 'tc-study-catalog',
    storeName: 'catalog-entries',
    version: 1,
  })
  const door43Client = getDoor43ApiClient({
    baseUrl: 'https://git.door43.org',
    debug: false,
  })
  const catalogManager = new CatalogManager({
    catalogAdapter,
    cacheAdapter,
    door43Client,
    enableNetworkFallback: true,
    requireSecureConnection: false,
  })
  const completenessChecker = new ResourceCompletenessChecker({
    catalogManager,
    cacheAdapter,
    debug: false,
  })
  const loaderRegistry = new LoaderRegistry({ debug: false })
  registerWorkerLoaders(catalogManager, loaderRegistry, {
    cacheAdapter,
    catalogAdapter,
    door43Client,
    debug: false,
  })
  const downloadManager = new BackgroundDownloadManager(
    loaderRegistry,
    catalogManager,
    {
      get: (type: string) => ({ downloadPriority: getDownloadPriority(type) }),
    },
    { debug: false, downloadMethod: 'zip', skipExisting }
  )

  const resources: Array<{
    resourceKey: string
    metadata: import('@bt-synergy/resource-catalog').ResourceMetadata
    ingredientsCount: number
  }> = []
  const discoveredCounts: number[] = []

  for (const resourceKey of resourceKeys) {
    if (!isCurrentRun()) return
    const metadata = await withResourceDownloadTimeout(
      catalogManager.getResourceMetadata(resourceKey),
      RESOURCE_DOWNLOAD_TIMEOUT_MS,
      resourceKey
    )
    if (!metadata) continue
    const ingredients = metadata.contentMetadata?.ingredients || []
    const ingredientsCount = fallbackIngredientCount(resourceKey, ingredients.length)
    discoveredCounts.push(ingredientsCount)
    resources.push({ resourceKey, metadata, ingredientsCount })
  }

  const totalIngredients = resolveRunIngredientTotal({
    providedTotal: providedTotal,
    discoveredCounts,
  })

  post({
    type: 'queue-updated',
    runId,
    payload: {
      queue: resources.map((r) => r.resourceKey),
      totalResources: resources.length,
      totalIngredients,
    },
  })

  let completedIngredients = 0
  let failedIngredients = 0
  let completedResourceCount = 0
  let failedResourceCount = 0

  const postProgress = (partial: {
    currentResource: string | null
    currentIngredient?: string | null
    completedIngredients: number
    failedIngredients: number
    completedResources: number
    failedResources: number
    overallProgress: number
  }) => {
    if (!isCurrentRun()) return
    post({
      type: 'progress',
      runId,
      payload: {
        currentResource: partial.currentResource,
        currentResourceProgress: 0,
        totalResources: resources.length,
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

  for (const { resourceKey, metadata, ingredientsCount } of resources) {
    if (!isCurrentRun()) return
    const method = metadata.release?.zipball_url ? 'zip' : 'individual'
    let currentResourcePeakCompleted = 0
    postProgress({
      currentResource: resourceKey,
      completedIngredients,
      failedIngredients,
      completedResources: completedResourceCount,
      failedResources: failedResourceCount,
      overallProgress: computeInFlightOverallProgress({
        completedIngredients,
        totalIngredients,
        currentResourceIngredients: ingredientsCount,
        currentResourcePercent: STARTING_PROGRESS_PERCENT,
      }),
    })
    try {
      if (skipExisting) {
        const status = await completenessChecker.checkResource(resourceKey)
        if (shouldSkipCompleteResourceDownload(skipExisting, status.isComplete)) {
          const skipped = skippedCompleteResourceProgress(ingredientsCount, resourceKey)
          currentResourcePeakCompleted = ingredientsCount
          postProgress({
            currentResource: resourceKey,
            currentIngredient: skipped.message ?? resourceKey,
            completedIngredients: completedIngredients + ingredientsCount,
            failedIngredients,
            completedResources: completedResourceCount,
            failedResources: failedResourceCount,
            overallProgress: computeInFlightOverallProgress({
              completedIngredients,
              totalIngredients,
              currentResourceIngredients: ingredientsCount,
              currentResourcePercent: 100,
            }),
          })
          completedIngredients += ingredientsCount
          completedResourceCount += 1
          if (isCurrentRun()) {
            post({ type: 'resource-complete', runId, payload: { resourceKey } })
          }
          postProgress({
            currentResource: resourceKey,
            completedIngredients,
            failedIngredients,
            completedResources: completedResourceCount,
            failedResources: failedResourceCount,
            overallProgress:
              totalIngredients > 0
                ? Math.round(
                    ((completedIngredients + failedIngredients) / totalIngredients) * 100
                  )
                : 0,
          })
          continue
        }
      }
      const loader = downloadManager['loaderRegistry'].getLoaderForResource(metadata)
      if (!loader || !loader.downloadResource) {
        throw new Error(`No loader available for ${resourceKey}`)
      }
      await loader.downloadResource(
        resourceKey,
        { method, skipExisting },
        (progress) => {
          if (!isCurrentRun()) return
          const mapped = mapLoaderProgressToResource({
            ingredientsCount,
            peakCompleted: currentResourcePeakCompleted,
            progress,
          })
          currentResourcePeakCompleted = mapped.writtenInResource
          let currentIngredient: string | null = null
          if (progress.message) {
            const match = progress.message.match(
              /(?:Processed|Skipped|Extracting|Downloading)\s+([^\s(]+)/
            )
            currentIngredient = match?.[1] ?? progress.message
          }
          postProgress({
            currentResource: resourceKey,
            currentIngredient,
            completedIngredients: completedIngredients + currentResourcePeakCompleted,
            failedIngredients,
            completedResources: completedResourceCount,
            failedResources: failedResourceCount,
            overallProgress: computeInFlightOverallProgress({
              completedIngredients,
              totalIngredients,
              currentResourceIngredients: ingredientsCount,
              currentResourcePercent: mapped.currentResourcePercent,
            }),
          })
        }
      )
      completedIngredients += ingredientsCount
      completedResourceCount += 1
      await completenessChecker.markCompleteIfVerified(resourceKey, { downloadMethod: method })
      if (isCurrentRun()) {
        post({ type: 'resource-complete', runId, payload: { resourceKey } })
      }
    } catch (error) {
      failedIngredients += ingredientsCount
      failedResourceCount += 1
      await completenessChecker.markError(
        resourceKey,
        error instanceof Error ? error.message : String(error)
      )
    }
    postProgress({
      currentResource: resourceKey,
      completedIngredients,
      failedIngredients,
      completedResources: completedResourceCount,
      failedResources: failedResourceCount,
      overallProgress:
        totalIngredients > 0
          ? Math.round(
              ((completedIngredients + failedIngredients) / totalIngredients) * 100
            )
          : 0,
    })
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
  }

  if (!isCurrentRun()) return
  post({
    type: 'complete',
    runId,
    payload: {
      currentResource: null,
      currentResourceProgress: 0,
      totalResources: resources.length,
      completedResources: completedResourceCount,
      failedResources: failedResourceCount,
      overallProgress: 100,
      totalIngredients,
      completedIngredients,
      failedIngredients,
      tasks: [],
    },
  })
}
