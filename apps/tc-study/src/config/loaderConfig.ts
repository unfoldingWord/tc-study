/**
 * Loader registration + download-priority Source of Truth (SoT)
 *
 * THIS FILE IS THE SINGLE SOURCE OF TRUTH for:
 * - Which resource types register as main-thread plugins (`surfaces.mainPlugin`)
 * - Which resource types register loaders in the background download worker
 *   (`surfaces.workerDownload`)
 * - `downloadPriority` values consumed by plugins, worker, AdminPanel, and
 *   BackgroundDownloadManager via `getDownloadPriority(id)`
 *
 * Do not hardcode loader id string literals in the worker — iterate
 * `getWorkerDownloadConfigs()` / `registerWorkerLoaders`.
 * Do not hardcode conflicting `downloadPriority` in resource type plugins —
 * call `getDownloadPriority(RESOURCE_TYPE_IDS.*)`.
 */

import { RESOURCE_TYPE_IDS, type ResourceTypeId } from '../resourceTypes/resourceTypeIds'

/** Factory key: one class instance may back multiple LOADER_CONFIGS ids. */
export type LoaderFactoryKey =
  | 'scripture'
  | 'words'
  | 'words-links'
  | 'academy'
  | 'notes'
  | 'questions'
  | 'obs'
  | 'combined-helps'

export interface LoaderSurfaces {
  /** Registered via ResourceTypeInitializer / RESOURCE_TYPE_PLUGIN_EXPORTS */
  mainPlugin: boolean
  /** Registered on the worker LoaderRegistry for background download */
  workerDownload: boolean
}

export interface LoaderConfig {
  /** Canonical ResourceTypeId from RESOURCE_TYPE_IDS */
  id: ResourceTypeId
  /** Display name */
  name: string
  /** Import path for the loader class (documentation / tooling) */
  loaderImport: string
  /** Download priority (lower = higher priority). SoT for all surfaces. */
  downloadPriority: number
  /**
   * Shared factory key for worker instantiation.
   * Required when `surfaces.workerDownload` is true; composites use
   * `'combined-helps'` with workerDownload false.
   */
  factoryKey: LoaderFactoryKey
  /** Where this entry is registered */
  surfaces: LoaderSurfaces
}

/**
 * Declarative loader-registration table (main plugins + worker download).
 *
 * Priority notes (chosen once to kill drift):
 * - obs-notes: 11 (was 3 in plugin / 11 in worker — keep worker band next to
 *   obs-words-links at 12)
 * - obs-questions: 26 (was 27 in plugin / 26 in worker — keep after questions=25)
 * - combined-helps / obs-combined-helps: mainPlugin only (no worker download)
 */
export const LOADER_CONFIGS: LoaderConfig[] = [
  {
    id: RESOURCE_TYPE_IDS.SCRIPTURE,
    name: 'Scripture',
    loaderImport: '@bt-synergy/scripture-loader',
    downloadPriority: 2,
    factoryKey: 'scripture',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
    name: 'Translation Notes',
    loaderImport: '@bt-synergy/translation-notes-loader',
    downloadPriority: 1,
    factoryKey: 'notes',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
    name: 'Translation Questions',
    loaderImport: '@bt-synergy/translation-questions-loader',
    downloadPriority: 25,
    factoryKey: 'questions',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
    name: 'Translation Words Links',
    loaderImport: '@bt-synergy/translation-words-links-loader',
    downloadPriority: 10,
    factoryKey: 'words-links',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
    name: 'OBS Translation Words Links',
    loaderImport: '@bt-synergy/translation-words-links-loader',
    downloadPriority: 12,
    factoryKey: 'words-links',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
    name: 'Translation Words',
    loaderImport: '@bt-synergy/translation-words-loader',
    downloadPriority: 20,
    factoryKey: 'words',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
    name: 'Translation Academy',
    loaderImport: '@bt-synergy/translation-academy-loader',
    downloadPriority: 30,
    factoryKey: 'academy',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.OBS,
    name: 'Open Bible Stories',
    loaderImport: 'src/lib/loaders/ObsLoader',
    downloadPriority: 5,
    factoryKey: 'obs',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.OBS_NOTES,
    name: 'OBS Translation Notes',
    loaderImport: '@bt-synergy/translation-notes-loader',
    downloadPriority: 11,
    factoryKey: 'notes',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.OBS_QUESTIONS,
    name: 'OBS Translation Questions',
    loaderImport: '@bt-synergy/translation-questions-loader',
    downloadPriority: 26,
    factoryKey: 'questions',
    surfaces: { mainPlugin: true, workerDownload: true },
  },
  {
    id: RESOURCE_TYPE_IDS.COMBINED_HELPS,
    name: 'Helps',
    loaderImport: 'src/lib/loaders/CombinedHelpsLoader',
    downloadPriority: 99,
    factoryKey: 'combined-helps',
    surfaces: { mainPlugin: true, workerDownload: false },
  },
  {
    id: RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS,
    name: 'OBS Helps',
    loaderImport: 'src/lib/loaders/CombinedHelpsLoader',
    downloadPriority: 99,
    factoryKey: 'combined-helps',
    surfaces: { mainPlugin: true, workerDownload: false },
  },
]

/** Entries registered on the background download worker. */
export function getWorkerDownloadConfigs(): LoaderConfig[] {
  return LOADER_CONFIGS.filter((c) => c.surfaces.workerDownload)
}

/** Entries that must have a main-thread resource type plugin. */
export function getMainPluginConfigs(): LoaderConfig[] {
  return LOADER_CONFIGS.filter((c) => c.surfaces.mainPlugin)
}

/**
 * Get download priority for a resource type (SoT lookup).
 * Unknown types fall back to 50.
 */
export function getDownloadPriority(resourceType: string): number {
  const config = LOADER_CONFIGS.find((c) => c.id === resourceType)
  return config?.downloadPriority ?? 50
}

/** All loader ids in the SoT table (main + worker). */
export function getAllLoaderIds(): string[] {
  return LOADER_CONFIGS.map((c) => c.id)
}
