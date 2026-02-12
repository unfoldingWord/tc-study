/**
 * Entry Viewer Registry
 * 
 * Manages registration and retrieval of entry-specific viewers for the Entry Modal.
 * Entry viewers are specialized components for displaying single entries in a modal context,
 * distinct from full panel resource viewers.
 */

import type { ComponentType } from 'react'

/**
 * Props that all Entry Viewers must accept
 */
export interface BaseEntryViewerProps {
  /** Full resource identifier (e.g., 'unfoldingWord/en_tw') */
  resourceKey: string
  /** Entry identifier within the resource (e.g., 'bible/kt/grace') */
  entryId: string
  /** Resource metadata (optional, may be loaded by viewer) */
  metadata?: any
  /** Handler for navigating to other entries */
  onEntryLinkClick?: (resourceId: string, entryId?: string) => void
  /** Callback when entry content is loaded (for floating button title display) */
  onContentLoaded?: (content: any) => void
}

/**
 * Entry Viewer Component Type
 */
export type EntryViewerComponent = ComponentType<BaseEntryViewerProps>

/**
 * Matcher function to determine if a viewer can handle a resource
 */
export type EntryViewerMatcher = (metadata: {
  type?: string
  subject?: string
  resourceId?: string
  owner?: string
  languageCode?: string
}) => boolean

/**
 * Entry Viewer Registration
 */
export interface EntryViewerRegistration {
  /** Unique identifier for this viewer */
  id: string
  /** Display name for debugging */
  name: string
  /** Viewer component */
  viewer: EntryViewerComponent
  /** Matcher function to determine if this viewer can handle a resource */
  matcher: EntryViewerMatcher
  /** Priority for matching (higher = checked first) */
  priority?: number
}

/**
 * Entry Viewer Registry
 * Manages entry-specific viewers for the Entry Modal system
 */
export class EntryViewerRegistry {
  private viewers: Map<string, EntryViewerRegistration> = new Map()

  /**
   * Register an entry viewer
   */
  register(registration: EntryViewerRegistration): void {
    if (this.viewers.has(registration.id)) {
      console.warn(`[EntryViewerRegistry] Viewer "${registration.id}" already registered. Overwriting.`)
    }
    
    this.viewers.set(registration.id, registration)
    console.log(`[EntryViewerRegistry] ✅ Registered entry viewer: ${registration.name} (${registration.id})`)
  }

  /**
   * Unregister an entry viewer
   */
  unregister(id: string): boolean {
    const removed = this.viewers.delete(id)
    if (removed) {
      console.log(`[EntryViewerRegistry] ❌ Unregistered entry viewer: ${id}`)
    }
    return removed
  }

  /**
   * Get an entry viewer for a resource based on metadata
   * Returns the first matching viewer with highest priority
   */
  getEntryViewer(metadata: {
    type?: string
    subject?: string
    resourceId?: string
    owner?: string
    languageCode?: string
  }): EntryViewerComponent | null {
    // Sort by priority (descending)
    const sortedViewers = Array.from(this.viewers.values()).sort(
      (a, b) => (b.priority || 0) - (a.priority || 0)
    )

    // Find first matching viewer
    for (const registration of sortedViewers) {
      try {
        if (registration.matcher(metadata)) {
          console.log(`[EntryViewerRegistry] ✅ Found entry viewer: ${registration.name} for`, metadata)
          return registration.viewer
        }
      } catch (error) {
        console.error(`[EntryViewerRegistry] Error in matcher for ${registration.id}:`, error)
      }
    }

    console.warn('[EntryViewerRegistry] ⚠️ No entry viewer found for', metadata)
    return null
  }

  /**
   * Get an entry viewer by ID
   */
  getEntryViewerById(id: string): EntryViewerComponent | null {
    const registration = this.viewers.get(id)
    return registration ? registration.viewer : null
  }

  /**
   * Get all registered entry viewers
   */
  getAllViewers(): EntryViewerRegistration[] {
    return Array.from(this.viewers.values())
  }

  /**
   * Check if a viewer is registered
   */
  hasViewer(id: string): boolean {
    return this.viewers.has(id)
  }

  /**
   * Clear all registered viewers
   */
  clear(): void {
    this.viewers.clear()
    console.log('[EntryViewerRegistry] 🗑️ Cleared all entry viewers')
  }
}

/**
 * Create a singleton instance
 */
export const entryViewerRegistry = new EntryViewerRegistry()

/**
 * Helper function to create a simple type-based matcher
 */
export function createTypeMatcher(type: string): EntryViewerMatcher {
  return (metadata) => metadata.type === type
}

/**
 * Helper function to create a subject-based matcher
 */
export function createSubjectMatcher(subject: string): EntryViewerMatcher {
  return (metadata) => metadata.subject === subject
}

/**
 * Helper function to create a custom matcher
 */
export function createCustomMatcher(
  predicate: (metadata: any) => boolean
): EntryViewerMatcher {
  return predicate
}
