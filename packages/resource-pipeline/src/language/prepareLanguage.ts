/**
 * Prepare a language from nothing, with network: find its resources as tc-study's Read page does, download each one
 * whole (plus UGNT and UHB), then build every derived row for the language and for the originals. What comes out is the
 * store tc-study itself would have after reading the whole language, ready for `@bt-synergy/language-pack`.
 *
 * The stores and the Door43 client come from the caller: IndexedDB in a browser, anything with the same interface in
 * Node. Nothing here touches a screen.
 */

import { CatalogManager } from '@bt-synergy/catalog-manager/core'
import { discoverLanguage, type LanguageDiscovery } from '../discover/discoverLanguage'
import type { CatalogSearchClient } from '../discover/readCatalogSearch'
import { createHeadlessResourceTypeRegistry } from '../discover/resourceTypeRegistry'
import { runDownload, type DownloadStores, type DownloadThreadMessage } from '../download/runDownload'
import { ORIGINAL_LANGUAGE_SPECS } from '../scripture/originalLanguageSpecs'
import {
  buildLanguageArtifacts,
  type BuildProgress,
  type BuildReport,
  type PipelineCache,
} from './buildLanguageArtifacts'

export type PrepareLanguageProgress =
  | { phase: 'discover' }
  | { phase: 'download'; message: DownloadThreadMessage }
  | { phase: 'build'; language: string; progress: BuildProgress }

export interface LanguagePreparation {
  language: string
  discovery: LanguageDiscovery
  /** Resources the download run reported complete. */
  downloaded: string[]
  /** One report for the language, and one per original language when they are included. */
  builds: BuildReport[]
}

export async function prepareLanguage(options: {
  language: string
  cacheAdapter: DownloadStores['cacheAdapter'] & PipelineCache
  catalogAdapter: DownloadStores['catalogAdapter']
  door43Client: CatalogSearchClient
  /** Also build the prepared views of UGNT and UHB (an original-language pack needs them). Default true. */
  includeOriginals?: boolean
  onProgress?: (progress: PrepareLanguageProgress) => void
  cancelled?: () => boolean
}): Promise<LanguagePreparation> {
  const { language, cacheAdapter, catalogAdapter, door43Client, onProgress } = options
  const cancelled = options.cancelled ?? (() => false)
  const includeOriginals = options.includeOriginals ?? true

  const catalogManager = new CatalogManager({
    catalogAdapter,
    cacheAdapter,
    door43Client,
    enableNetworkFallback: true,
    requireSecureConnection: false,
  } as never)
  const resourceTypeRegistry = createHeadlessResourceTypeRegistry(catalogManager)

  onProgress?.({ phase: 'discover' })
  const discovery = await discoverLanguage({ language, door43Client, catalogManager, resourceTypeRegistry })

  const downloaded: string[] = []
  const resourceKeys = [...discovery.resources.map((r) => r.resourceKey), ...discovery.originals]
  if (!cancelled() && resourceKeys.length > 0) {
    await runDownload({
      resourceKeys,
      skipExisting: true,
      runId: 1,
      post: (message) => {
        if (message.type === 'resource-complete') {
          downloaded.push((message.payload as { resourceKey: string }).resourceKey)
        }
        onProgress?.({ phase: 'download', message })
      },
      isCurrentRun: () => !cancelled(),
      cacheAdapter,
      catalogAdapter,
      door43Client,
    })
  }

  const languages = [language, ...(includeOriginals ? ORIGINAL_LANGUAGE_SPECS.map((o) => o.lang) : [])]
  const builds: BuildReport[] = []
  for (const lang of languages) {
    if (cancelled()) break
    builds.push(
      await buildLanguageArtifacts({
        language: lang,
        cache: cacheAdapter,
        catalog: catalogManager,
        onProgress: (progress) => onProgress?.({ phase: 'build', language: lang, progress }),
        cancelled,
      })
    )
  }

  return { language, discovery, downloaded, builds }
}
