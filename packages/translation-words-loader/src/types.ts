/**
 * Translation Words Loader Types
 */

export interface TranslationWordsLoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  debug?: boolean
}

export interface TranslationWord {
  id: string
  term: string
  definition: string
  content: string
}

export interface ProcessedTranslationWords {
  words: TranslationWord[]
  metadata: {
    language: string
    version: string
  }
}

export interface EntryInfo {
  id: string
  title: string
  category: string
  path: string
}

export interface TranslationWordsDownloadProgress {
  resourceKey: string
  totalEntries: number
  downloadedEntries: number
  currentEntry: string
  percentage: number
}



