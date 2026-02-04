/**
 * Translation Words Links Loader Types
 */

export interface TranslationWordsLinksLoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  debug?: boolean
}

export interface TranslationWordsLinksDownloadProgress {
  resourceKey: string
  totalBooks: number
  downloadedBooks: number
  currentBook: string
  percentage: number
}
