/**
 * Translation Notes Loader Types
 */

export interface TranslationNotesLoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  debug?: boolean
}

export interface TranslationNotesDownloadProgress {
  resourceKey: string
  totalBooks: number
  downloadedBooks: number
  currentBook: string
  percentage: number
}
