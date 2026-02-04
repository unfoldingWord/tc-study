/**
 * Translation Academy Loader Types
 */

export interface TranslationAcademyLoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  debug?: boolean
}

export interface TranslationAcademyArticle {
  id: string
  title: string
  content: string
  question?: string
  relatedArticles?: string[]
}

export interface ProcessedTranslationAcademy {
  articles: TranslationAcademyArticle[]
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

export interface TranslationAcademyDownloadProgress {
  resourceKey: string
  totalEntries: number
  downloadedEntries: number
  currentEntry: string
  percentage: number
}
