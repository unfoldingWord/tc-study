/**
 * Same extract/USJ path as the download worker, runnable on this thread
 * when the worker isolate never posts (embedded browsers, failed module
 * graph). Must stay prepare-free.
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { IndexedDBCatalogAdapter } from '@bt-synergy/catalog-adapter-indexeddb'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { runDownload, type DownloadThreadMessage } from '@bt-synergy/resource-pipeline/download/runDownload'

export type { DownloadThreadMessage }

export async function runBackgroundDownloadOnThisThread(args: {
  resourceKeys: string[]
  skipExisting: boolean
  totalIngredients?: number
  runId: number
  post: (message: DownloadThreadMessage) => void
  isCurrentRun: () => boolean
}): Promise<void> {
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
  await runDownload({ ...args, cacheAdapter, catalogAdapter, door43Client })
}
