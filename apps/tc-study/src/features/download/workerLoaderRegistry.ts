/**
 * Worker loader registration driven by loaderConfig SoT
 * (`getWorkerDownloadConfigs()` — surfaces.workerDownload only).
 * Factory keys dedupe shared loader instances (e.g. notes + obs-notes).
 *
 * Preparation: for factory keys whose SoT row has surfaces.prepare, wire
 * onContentCached → prepareBookWithPreparer (generic, no resource-type literals).
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
  getWorkerPrepareConfigs,
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

type ContentCachedArgs = {
  resourceKey: string
  bookId: string
  /** Scripture-only: pass as preparer source to skip readSource. */
  viewModel?: import('@bt-synergy/scripture-loader').UsjScriptureViewModel
}

type LoaderConfig = {
  cacheAdapter: unknown
  catalogAdapter: unknown
  door43Client: unknown
  debug: boolean
  enableMemoryCache?: boolean
  onContentCached?: (args: ContentCachedArgs) => void | Promise<void>
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

/** Factory keys that should run preparation after content is cached. */
function prepareFactoryKeys(): Set<LoaderFactoryKey> {
  return new Set(getWorkerPrepareConfigs().map((c) => c.factoryKey))
}

function prepareTypeIdForFactory(factoryKey: LoaderFactoryKey): string | null {
  const row = getWorkerPrepareConfigs().find((c) => c.factoryKey === factoryKey)
  return row?.id ?? null
}

async function persistPreparedOnContentCached(args: {
  typeId: string
  cacheAdapter: WorkerLoaderDeps['cacheAdapter']
  resourceKey: string
  bookId: string
  /** When provided (scripture), skip readSource. */
  source?: unknown
}): Promise<void> {
  // Side-effect import registers preparers in the worker bundle.
  await import('../prepare/registerPreparers')
  const { prepareBookWithPreparer } = await import('../prepare/runPrepare')
  await prepareBookWithPreparer({
    typeId: args.typeId,
    resourceKey: args.resourceKey,
    bookId: args.bookId,
    cacheAdapter: args.cacheAdapter as {
      get: (key: string) => Promise<unknown>
      set: (key: string, entry: unknown) => Promise<void>
    },
    source: args.source,
  })
}

function withPrepareHook(
  deps: WorkerLoaderDeps,
  factoryKey: LoaderFactoryKey,
  base: LoaderConfig
): LoaderConfig {
  if (!prepareFactoryKeys().has(factoryKey)) return base
  const typeId = prepareTypeIdForFactory(factoryKey)
  if (!typeId) return base
  return {
    ...base,
    onContentCached: (args) =>
      persistPreparedOnContentCached({
        typeId,
        cacheAdapter: deps.cacheAdapter,
        resourceKey: args.resourceKey,
        bookId: args.bookId,
        source:
          args.viewModel != null
            ? {
                resourceKey: args.resourceKey,
                bookId: args.bookId,
                viewModel: args.viewModel,
              }
            : undefined,
      }),
  }
}

/** Worker-download factories only (compositions are not worker loaders). */
const LOADER_FACTORIES: Partial<Record<LoaderFactoryKey, LoaderCtor>> = {
  scripture: (deps) =>
    new ScriptureLoader({
      ...withPrepareHook(deps, 'scripture', {
        ...toLoaderConfig(deps),
        enableMemoryCache: true,
      }),
    }),
  words: (deps) =>
    new TranslationWordsLoader(withPrepareHook(deps, 'words', toLoaderConfig(deps))),
  'words-links': (deps) =>
    new TranslationWordsLinksLoader(
      withPrepareHook(deps, 'words-links', toLoaderConfig(deps))
    ),
  academy: (deps) =>
    new TranslationAcademyLoader(withPrepareHook(deps, 'academy', toLoaderConfig(deps))),
  notes: (deps) =>
    new TranslationNotesLoader(withPrepareHook(deps, 'notes', toLoaderConfig(deps))),
  questions: (deps) =>
    new TranslationQuestionsLoader(
      withPrepareHook(deps, 'questions', toLoaderConfig(deps))
    ),
  obs: (deps) => new ObsLoader(withPrepareHook(deps, 'obs', toLoaderConfig(deps))),
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
