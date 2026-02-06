/**
 * Type definitions for tc-study contexts
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

// Re-export passage set types from the package
export type { BCVReference, PassageSet } from '@bt-synergy/passage-sets'

// Re-export ResourceMetadata as the single source of truth
export type { ResourceMetadata } from '@bt-synergy/resource-catalog'

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
 * App-specific resource wrapper
 * 
 * Extends ResourceMetadata (the single source of truth) with ONLY app-specific state.
 * All metadata fields come from ResourceMetadata - NO DUPLICATION!
 */
export interface ResourceInfo extends ResourceMetadata {
  // App/UI-specific state ONLY (not in catalog)
  toc?: ResourceTOC           // Runtime TOC from loaders
  
  // Convenience aliases for common access patterns
  // These are NOT stored separately - they reference the base ResourceMetadata fields
  id: string                  // Alias for resourceKey
  key: string                 // Alias for resourceKey  
  category: string            // Computed from type
}
