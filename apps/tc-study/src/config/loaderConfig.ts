/**
 * Shared Loader Configuration
 * 
 * This file defines which loaders should be registered in both:
 * - Main thread (for UI viewers)
 * - Background download worker (for offline downloads)
 * 
 * By centralizing this configuration, we ensure consistency and avoid
 * having to update loaders in multiple places when adding new resource types.
 */

export interface LoaderConfig {
  /** Unique identifier for the loader */
  id: string
  /** Display name */
  name: string
  /** Import path for the loader class */
  loaderImport: string
  /** Download priority (lower = higher priority) */
  downloadPriority: number
}

/**
 * Central registry of all loaders that should be available
 * in both the main thread and background worker
 */
export const LOADER_CONFIGS: LoaderConfig[] = [
  {
    id: 'scripture',
    name: 'Scripture',
    loaderImport: '@bt-synergy/scripture-loader',
    downloadPriority: 2,
  },
  {
    id: 'tn',
    name: 'Translation Notes',
    loaderImport: '@bt-synergy/translation-notes-loader',
    downloadPriority: 1, // Highest priority
  },
  {
    id: 'questions',
    name: 'Translation Questions',
    loaderImport: '@bt-synergy/translation-questions-loader',
    downloadPriority: 25,
  },
  {
    id: 'words-links',
    name: 'Translation Words Links',
    loaderImport: '@bt-synergy/translation-words-links-loader',
    downloadPriority: 10,
  },
  {
    id: 'words',
    name: 'Translation Words',
    loaderImport: '@bt-synergy/translation-words-loader',
    downloadPriority: 20,
  },
  {
    id: 'ta',
    name: 'Translation Academy',
    loaderImport: '@bt-synergy/translation-academy-loader',
    downloadPriority: 30,
  },
]

/**
 * Get download priority for a resource type
 */
export function getDownloadPriority(resourceType: string): number {
  const config = LOADER_CONFIGS.find(c => c.id === resourceType)
  return config?.downloadPriority ?? 50
}

/**
 * Get all loader IDs
 */
export function getAllLoaderIds(): string[] {
  return LOADER_CONFIGS.map(c => c.id)
}
