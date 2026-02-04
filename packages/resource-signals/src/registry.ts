/**
 * Signal Registry
 * 
 * Metadata about all available signals for discovery and documentation.
 * Platform-agnostic - works on web and mobile.
 */

import type {
  VerseNavigationSignal,
  BookNavigationSignal,
  TokenClickSignal,
  TextSelectionSignal,
  EntryLinkClickSignal,
  CrossReferenceSignal,
  ResourceLoadedSignal,
  ResourceErrorSignal,
  ContentChangeSignal,
  ScrollSyncSignal
} from '.'

/**
 * Union of all standard signals
 */
export type StandardSignal =
  | VerseNavigationSignal
  | BookNavigationSignal
  | TokenClickSignal
  | TextSelectionSignal
  | EntryLinkClickSignal
  | CrossReferenceSignal
  | ResourceLoadedSignal
  | ResourceErrorSignal
  | ContentChangeSignal
  | ScrollSyncSignal

/**
 * Signal metadata for discovery
 */
export interface SignalMetadata {
  description: string
  category: 'navigation' | 'content' | 'links' | 'lifecycle' | 'sync'
  typicalSenders: string[]
  typicalReceivers: string[]
  example: any
}

/**
 * Registry of all standard signals
 * Query this to discover available signals
 * 
 * @example
 * ```typescript
 * import { SIGNAL_REGISTRY } from '@bt-synergy/resource-signals'
 * 
 * // List all signals
 * const signalTypes = Object.keys(SIGNAL_REGISTRY)
 * 
 * // Get signal info
 * const info = SIGNAL_REGISTRY['verse-navigation']
 * console.log(info.description)
 * console.log(info.typicalSenders)
 * ```
 */
export const SIGNAL_REGISTRY: Record<string, SignalMetadata> = {
  'verse-navigation': {
    description: 'Navigate to a specific verse in scripture',
    category: 'navigation',
    typicalSenders: ['words-links', 'notes', 'questions'],
    typicalReceivers: ['scripture'],
    example: {
      type: 'verse-navigation',
      verse: { book: 'JHN', chapter: 3, verse: 16 }
    }
  },
  
  'book-navigation': {
    description: 'Navigate to a book or chapter',
    category: 'navigation',
    typicalSenders: ['toc', 'navigation-ui'],
    typicalReceivers: ['scripture', 'notes', 'questions'],
    example: {
      type: 'book-navigation',
      location: { book: 'GEN', chapter: 1 }
    }
  },
  
  'token-click': {
    description: 'Word/token clicked in scripture',
    category: 'content',
    typicalSenders: ['scripture'],
    typicalReceivers: ['words-links', 'original-language'],
    example: {
      type: 'token-click',
      token: {
        id: 'token-1',
        content: 'λόγος',
        semanticId: 'G3056',
        verseRef: 'JHN 1:1',
        position: 1
      }
    }
  },
  
  'text-selection': {
    description: 'Text selected/highlighted',
    category: 'content',
    typicalSenders: ['scripture', 'any-text-viewer'],
    typicalReceivers: ['notes', 'translation-draft'],
    example: {
      type: 'text-selection',
      selection: {
        text: 'In the beginning',
        verseRef: 'GEN 1:1',
        startOffset: 0,
        endOffset: 16,
        book: 'GEN',
        chapter: 1,
        verse: 1
      }
    }
  },
  
  'entry-link-click': {
    description: 'Resource entry link clicked',
    category: 'links',
    typicalSenders: ['words-links', 'notes'],
    typicalReceivers: ['words', 'academy'],
    example: {
      type: 'entry-link-click',
      link: {
        resourceType: 'words',
        resourceId: 'unfoldingWord/en_tw',
        entryId: 'bible/kt/grace',
        text: 'grace'
      }
    }
  },
  
  'cross-reference': {
    description: 'Cross-reference activated',
    category: 'links',
    typicalSenders: ['scripture', 'notes'],
    typicalReceivers: ['scripture'],
    example: {
      type: 'cross-reference',
      reference: {
        from: 'JHN 3:16',
        to: 'ROM 5:8',
        type: 'parallel'
      }
    }
  },
  
  'resource-loaded': {
    description: 'Resource finished loading',
    category: 'lifecycle',
    typicalSenders: ['any-resource'],
    typicalReceivers: ['navigation-ui', 'loading-indicators'],
    example: {
      type: 'resource-loaded',
      resource: {
        resourceId: 'en_ult',
        resourceType: 'scripture',
        currentLocation: { book: 'GEN', chapter: 1 }
      }
    }
  },
  
  'resource-error': {
    description: 'Resource encountered an error',
    category: 'lifecycle',
    typicalSenders: ['any-resource'],
    typicalReceivers: ['error-handlers', 'toast-notifications'],
    example: {
      type: 'resource-error',
      error: {
        resourceId: 'en_ult',
        resourceType: 'scripture',
        message: 'Failed to load chapter',
        recoverable: true
      }
    }
  },
  
  'content-change': {
    description: 'Content was edited/updated',
    category: 'lifecycle',
    typicalSenders: ['translation-draft', 'notes'],
    typicalReceivers: ['auto-save', 'collaboration'],
    example: {
      type: 'content-change',
      change: {
        resourceId: 'my-translation',
        location: 'GEN 1:1',
        content: 'In the beginning...',
        timestamp: Date.now()
      }
    }
  },
  
  'scroll-sync': {
    description: 'Synchronize scrolling between panels',
    category: 'sync',
    typicalSenders: ['scripture-anchor'],
    typicalReceivers: ['scripture', 'notes'],
    example: {
      type: 'scroll-sync',
      scroll: {
        verseRef: 'JHN 3:16',
        percentage: 0.5,
        book: 'JHN',
        chapter: 3,
        verse: 16
      }
    }
  }
}

/**
 * Get signal metadata by type
 */
export function getSignalMetadata(signalType: string): SignalMetadata | undefined {
  return SIGNAL_REGISTRY[signalType]
}

/**
 * Get all signals by category
 */
export function getSignalsByCategory(category: SignalMetadata['category']): string[] {
  return Object.entries(SIGNAL_REGISTRY)
    .filter(([_, meta]) => meta.category === category)
    .map(([type]) => type)
}

/**
 * Search signals by sender or receiver type
 */
export function findSignals(params: {
  sender?: string
  receiver?: string
}): string[] {
  return Object.entries(SIGNAL_REGISTRY)
    .filter(([_, meta]) => {
      if (params.sender && !meta.typicalSenders.includes(params.sender)) return false
      if (params.receiver && !meta.typicalReceivers.includes(params.receiver)) return false
      return true
    })
    .map(([type]) => type)
}
