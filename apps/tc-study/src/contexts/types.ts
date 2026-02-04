/**
 * Type definitions for tc-study contexts
 */

// Re-export passage set types from the package
export type { BCVReference, PassageSet } from '@bt-synergy/passage-sets'

/**
 * Book information from scripture resource TOC
 */
export interface BookInfo {
  code: string
  name: string
  testament?: 'OT' | 'NT'
  chapters?: number
  verses?: number[] // Verses per chapter
}

/**
 * Navigation Mode
 */
export type NavigationMode = 'verse' | 'section' | 'passage-set'

/**
 * Resource TOC (Table of Contents) that resources can expose
 */
export interface ResourceTOC {
  books: BookInfo[]
  resourceId: string
  resourceType: string
}

/**
 * Resource metadata that components need
 */
export interface ResourceInfo {
  id: string
  key: string
  title: string
  type: string
  category: string
  toc?: ResourceTOC
  
  // Additional metadata for resource management
  language?: string
  languageCode?: string
  languageName?: string // Human-readable language name (e.g., "English", "español, Latinoamérica")
  owner?: string
  server?: string
  subject?: string
  format?: string
  location?: string
  resourceId?: string
  ingredients?: any[] // Full ingredient objects from Door43
  version?: string
  contentStructure?: 'book' | 'entry' // How content is organized
  metadata?: any // Full ResourceMetadata object for viewers that need it (e.g., TranslationWordsViewer)
  release?: any // Release object from Door43 API (contains tag_name, published_at, etc.)
  
  // Extended metadata for resource information display
  description?: string
  readme?: string
  license?: string
}
