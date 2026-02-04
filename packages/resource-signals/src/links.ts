/**
 * Link & Reference Signals
 * 
 * Signals for resource links and cross-references
 */

import type { BaseSignal } from './index'

/**
 * Entry Link Click Signal
 * When a resource entry link is clicked (e.g., Translation Words, Academy)
 */
export interface EntryLinkClickSignal extends BaseSignal {
  type: 'entry-link-click'
  link: {
    resourceType: string    // 'words', 'academy', etc.
    resourceId: string      // e.g., 'unfoldingWord/en_tw'
    entryId: string         // e.g., 'bible/kt/grace'
    text: string            // Display text
  }
}

/**
 * Cross Reference Signal
 * When a cross-reference is activated
 */
export interface CrossReferenceSignal extends BaseSignal {
  type: 'cross-reference'
  reference: {
    from: string            // Original verse ref
    to: string              // Target verse ref
    type: 'parallel' | 'quotation' | 'allusion' | 'explanation'
  }
}

