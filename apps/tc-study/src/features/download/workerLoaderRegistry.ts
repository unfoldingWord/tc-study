/**
 * Worker loader registration driven by loaderConfig SoT
 * (`getWorkerDownloadConfigs()` — surfaces.workerDownload only).
 * Factory keys dedupe shared loader instances (e.g. notes + obs-notes).
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceLoader } from '@bt-synergy/catalog-manager'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { TranslationAcademyLoader } from '@bt-synergy/translation-academy-loader'
import { TranslationNotesLoader } from '@bt-synergy/translation-notes-loader'
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'
import { TranslationWordsLinksLoader } from '@bt-synergy/translation-words-links-loader'
import { TranslationWordsLoader } from '@bt-synergy/translation-words-loader'
import {
  getWorkerDownloadConfigs,
  type LoaderFactoryKey,
} from '../../config/loaderConfig'
import { ObsLoader } from '../../lib/loaders/ObsLoader'
import type { LoaderRegistry } from '../../lib/loaders/LoaderRegistry'

export interface WorkerLoaderDeps {
  cacheAdapter: unknown
  catalogAdapter: unknown
  door43Client: unknown
  debug?: boolean
}

/** Shared ctor shape across worker loaders (adapters typed loosely at the worker boundary). */
type LoaderConfig = {
  cacheAdapter: unknown
  catalogAdapter: unknown
  door43Client: unknown
  debug: boolean
}

type LoaderCtor = (deps: WorkerLoaderDeps) => ResourceLoader

function toLoaderConfig(deps: WorkerLoaderDeps): LoaderConfig {
  return {
    cacheAdapter: deps.cacheAdapter,
    catalogAdapter: deps.catalogAdapter,
    door43Client: deps.door43Client,
    debug: deps.debug ?? false,
  }
}

/** Worker-download factories only (no combined-helps — mainPlugin only). */
const LOADER_FACTORIES: Partial<Record<LoaderFactoryKey, LoaderCtor>> = {
  scripture: (deps) => new ScriptureLoader(toLoaderConfig(deps)),
  words: (deps) => new TranslationWordsLoader(toLoaderConfig(deps)),
  'words-links': (deps) => new TranslationWordsLinksLoader(toLoaderConfig(deps)),
  academy: (deps) => new TranslationAcademyLoader(toLoaderConfig(deps)),
  notes: (deps) => new TranslationNotesLoader(toLoaderConfig(deps)),
  questions: (deps) => new TranslationQuestionsLoader(toLoaderConfig(deps)),
  obs: (deps) => new ObsLoader(toLoaderConfig(deps)),
}

/**
 * Register every SoT workerDownload id on the worker LoaderRegistry
 * and each unique factory once on CatalogManager.
 */
export function registerWorkerLoaders(
  catalogManager: CatalogManager,
  loaderRegistry: LoaderRegistry,
  deps: WorkerLoaderDeps
): void {
  const instances = new Map<LoaderFactoryKey, ResourceLoader>()

  for (const cfg of getWorkerDownloadConfigs()) {
    let loader = instances.get(cfg.factoryKey)
    if (!loader) {
      const factory = LOADER_FACTORIES[cfg.factoryKey]
      if (!factory) {
        throw new Error(`No worker loader factory for key: ${cfg.factoryKey}`)
      }
      loader = factory(deps)
      instances.set(cfg.factoryKey, loader)
      catalogManager.registerResourceType(loader)
    }
    loaderRegistry.registerLoader(cfg.id, loader)
  }
}
