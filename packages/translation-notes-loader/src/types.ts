/**
 * Translation Notes Loader Types
 */

export interface TranslationNotesLoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  debug?: boolean
  /**
   * Called after a book’s TN payload is written to `tn:{resourceKey}:{bookId}`.
   * Used by worker prepare surface (readSource from cache).
   */
  onContentCached?: (args: {
    resourceKey: string
    bookId: string
  }) => void | Promise<void>
}

export interface TranslationNotesDownloadProgress {
  resourceKey: string
  totalBooks: number
  downloadedBooks: number
  currentBook: string
  percentage: number
}
