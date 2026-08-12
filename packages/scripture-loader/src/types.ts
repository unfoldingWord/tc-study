/**
 * Scripture-specific type definitions
 */

/**
 * Book information
 */
export interface BookInfo {
  code: string // 3-letter book code (e.g., 'gen', 'mat')
  name: string // Display name (e.g., 'Genesis', 'Matthew')
  testament: 'OT' | 'NT'
  chapters: number
  verses: number[] // Verses per chapter
}

/**
 * Scripture Table of Contents
 */
export interface ScriptureTOC {
  resourceKey: string
  books: BookInfo[]
  totalBooks: number
  totalChapters: number
}

/**
 * Parsed chapter content
 */
export interface ChapterData {
  number: number
  verses: VerseData[]
}

/**
 * Parsed verse data
 */
export interface VerseData {
  number: number
  content: string
  tokens?: TokenData[]
}

/**
 * Token data for word-level interaction
 */
export interface TokenData {
  id: string
  content: string
  verseNumber: number
  position: number
}

/**
 * Book content
 */
export interface BookContent {
  bookId: string
  chapters: ChapterData[]
  rawUsfm?: string
}

/**
 * Scripture loader configuration
 */
export interface ScriptureLoaderConfig {
  /** Cache adapter for content storage (downloaded files) */
  cacheAdapter: any // CacheAdapter from catalog-manager
  
  /** Catalog adapter for metadata storage (resource info with ingredients) */
  catalogAdapter?: any // CatalogAdapter from catalog-manager
  
  /** Door43 client for online fetching */
  door43Client: any // Door43Client
  
  /** Enable in-memory cache */
  enableMemoryCache?: boolean
  
  /** Memory cache size limit (MB) */
  memoryCacheSize?: number
  
  /** Enable debug logging */
  debug?: boolean

  /**
   * Feature flag: use @bt-synergy/usj-processor (USFM→USJ→ProcessedScripture).
   * Default false = legacy @bt-synergy/usfm-processor (byte-stable).
   * When omitted, also reads USE_USJ_PIPELINE / VITE_USE_USJ_PIPELINE env.
   * When on (P2): writes/reads `scripture-usj:…` SoT; dual-reads legacy `scripture:…`.
   */
  useUsjPipeline?: boolean
}

/**
 * Download progress for scripture resources
 */
export interface ScriptureDownloadProgress {
  resourceKey: string
  totalBooks: number
  downloadedBooks: number
  currentBook: string
  percentage: number
}
