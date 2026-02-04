/**
 * Studio Signals - Common inter-resource communication signals
 * 
 * These are the standard signals used for communication between
 * resources in the LinkedPanelsStudio. Developers can use these
 * or define custom signals for their resource types.
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'

// ===== NAVIGATION SIGNALS =====

/**
 * Verse Navigation Signal - Navigate to a specific verse
 * 
 * Typical Flow:
 * - Sender: Words Links Viewer (link click), Notes Viewer, etc.
 * - Receiver: Scripture Viewers
 */
export interface VerseNavigationSignal extends BaseSignal {
  type: 'verse-navigation'
  verse: {
    book: string
    chapter: number
    verse?: number
    endChapter?: number
    endVerse?: number
  }
}

/**
 * Book Navigation Signal - Navigate to a specific book/chapter
 * 
 * Typical Flow:
 * - Sender: TOC, Navigation UI
 * - Receiver: Scripture Viewers, Notes Viewers, etc.
 */
export interface BookNavigationSignal extends BaseSignal {
  type: 'book-navigation'
  location: {
    book: string
    chapter?: number
  }
}

// ===== CONTENT SELECTION SIGNALS =====

/**
 * Token Click Signal - When a word/token is clicked in scripture
 * 
 * Typical Flow:
 * - Sender: Scripture Viewers
 * - Receiver: Words Links Viewers, Original Language Viewers
 */
export interface TokenClickSignal extends BaseSignal {
  type: 'token-click'
  token: {
    id: string // uniqueId of the clicked token
    content: string // word content
    semanticId: string // Format: verseRef:content:occurrence (preserves Unicode)
    verseRef: string
    position: number
    strong?: string // Strong's number (optional)
    lemma?: string
    morph?: string
    alignedSemanticIds?: string[] // All semantic IDs this token aligns to
  }
}

/**
 * Text Selection Signal - When text is selected/highlighted
 * 
 * Typical Flow:
 * - Sender: Scripture Viewers, any text viewer
 * - Receiver: Notes Viewers, Translation Drafting tools
 */
export interface TextSelectionSignal extends BaseSignal {
  type: 'text-selection'
  selection: {
    text: string
    verseRef: string
    startOffset: number
    endOffset: number
    book: string
    chapter: number
    verse: number
  }
}

// ===== LINK & REFERENCE SIGNALS =====

/**
 * Entry Link Click Signal - When a resource entry link is clicked
 * 
 * Typical Flow:
 * - Sender: Words Links Viewer, Notes Viewer
 * - Receiver: Translation Words Viewer, Translation Academy Viewer
 */
export interface EntryLinkClickSignal extends BaseSignal {
  type: 'entry-link-click'
  link: {
    resourceType: string  // 'words', 'academy', etc.
    resourceId: string    // e.g., 'unfoldingWord/en_tw'
    entryId: string       // e.g., 'bible/kt/grace'
    text: string
  }
}

/**
 * Cross Reference Signal - When a cross-reference is activated
 * 
 * Typical Flow:
 * - Sender: Scripture Viewers, Notes Viewers
 * - Receiver: Scripture Viewers
 */
export interface CrossReferenceSignal extends BaseSignal {
  type: 'cross-reference'
  reference: {
    from: string          // Original verse ref
    to: string            // Target verse ref
    type: 'parallel' | 'quotation' | 'allusion' | 'explanation'
  }
}

// ===== CONTENT BROADCAST SIGNALS (STATE-BASED) =====

/**
 * Scripture Tokens Broadcast Signal - Broadcast current scripture tokens
 * 
 * This is a STATE message that persists until the scripture resource is unmounted
 * or navigation changes, allowing other resources to access token data even if
 * they mount after the broadcast was sent.
 * 
 * Typical Flow:
 * - Sender: Scripture Viewers (broadcasts on content load/navigation)
 * - Receiver: Words Links Viewers, Notes Viewers (via useCurrentState)
 */
export interface ScriptureTokensBroadcastSignal {
  type: 'scripture-tokens-broadcast'
  lifecycle: 'state'
  stateKey: 'current-scripture-tokens' // Fixed key for current scripture tokens
  
  /** The resource ID that is broadcasting the tokens */
  sourceResourceId: string
  
  /** Current navigation reference */
  reference: {
    book: string
    chapter: number
    verse: number
    endChapter?: number
    endVerse?: number
  }
  
  /** List of tokens from the filtered verse range */
  tokens: OptimizedToken[]
  
  /** Resource metadata for context */
  resourceMetadata: {
    id: string
    language: string
    languageDirection?: 'ltr' | 'rtl'
    type: string
  }
  
  /** Timestamp when the broadcast was sent */
  timestamp: number
}

// ===== CONTENT REQUEST SIGNALS (DEPRECATED - Use broadcast instead) =====

/**
 * Scripture Content Request Signal - Request scripture content from other panels
 * 
 * @deprecated Use ScriptureTokensBroadcastSignal with useCurrentState instead.
 * This request/response pattern is being phased out in favor of state broadcasting.
 * 
 * Typical Flow:
 * - Sender: Words Links Viewer, Notes Viewer (needs original language content)
 * - Receiver: Scripture Viewers (responds with content if available)
 */
export interface ScriptureContentRequestSignal extends BaseSignal {
  type: 'scripture-content-request'
  request: {
    book: string
    chapter: number
    verse?: number
    endVerse?: number
    language?: string // e.g., 'el-x-koine', 'hbo' for original language
    resourceType?: string // 'scripture' or specific type
  }
}

/**
 * Scripture Content Response Signal - Response to content request
 * 
 * @deprecated Use ScriptureTokensBroadcastSignal with useCurrentState instead.
 * This request/response pattern is being phased out in favor of state broadcasting.
 * 
 * Typical Flow:
 * - Sender: Scripture Viewers (in response to request)
 * - Receiver: Words Links Viewer, Notes Viewer
 */
export interface ScriptureContentResponseSignal extends BaseSignal {
  type: 'scripture-content-response'
  response: {
    requestId: string // Matches the request signal's timestamp or ID
    resourceId: string // Which panel is responding
    resourceKey: string
    book: string
    chapter: number
    content?: any // ProcessedScripture or OptimizedChapter[] format
    hasContent: boolean
    error?: string
  }
}

// ===== RESOURCE STATE SIGNALS =====

/**
 * Resource Loaded Signal - When a resource finishes loading content
 * 
 * Typical Flow:
 * - Sender: Any resource viewer
 * - Receiver: Navigation UI, Loading indicators
 */
export interface ResourceLoadedSignal extends BaseSignal {
  type: 'resource-loaded'
  resource: {
    resourceId: string
    resourceType: string
    currentLocation?: {
      book?: string
      chapter?: number
      verse?: number
    }
  }
}

/**
 * Resource Error Signal - When a resource encounters an error
 * 
 * Typical Flow:
 * - Sender: Any resource viewer
 * - Receiver: Error handlers, Toast notifications
 */
export interface ResourceErrorSignal extends BaseSignal {
  type: 'resource-error'
  error: {
    resourceId: string
    resourceType: string
    message: string
    code?: string
    recoverable: boolean
  }
}

// ===== CONTENT UPDATE SIGNALS =====

/**
 * Content Change Signal - When content is edited/updated
 * 
 * Typical Flow:
 * - Sender: Translation drafting tools, Notes Viewers
 * - Receiver: Auto-save handlers, Collaboration systems
 */
export interface ContentChangeSignal extends BaseSignal {
  type: 'content-change'
  change: {
    resourceId: string
    location: string      // verse ref, entry id, etc.
    content: string
    timestamp: number
  }
}

// ===== SYNC SIGNALS =====

/**
 * Scroll Sync Signal - Synchronize scrolling between resources
 * 
 * Typical Flow:
 * - Sender: Scripture Viewer (anchor)
 * - Receiver: Other Scripture Viewers, Notes Viewers
 */
export interface ScrollSyncSignal extends BaseSignal {
  type: 'scroll-sync'
  scroll: {
    verseRef: string
    percentage: number
    book: string
    chapter: number
    verse: number
  }
}

// ===== UNION TYPE =====

/**
 * All studio signals - Use this for multi-signal handlers
 */
export type StudioSignal =
  | VerseNavigationSignal
  | BookNavigationSignal
  | TokenClickSignal
  | TextSelectionSignal
  | EntryLinkClickSignal
  | CrossReferenceSignal
  | ScriptureTokensBroadcastSignal
  | ScriptureContentRequestSignal
  | ScriptureContentResponseSignal
  | ResourceLoadedSignal
  | ResourceErrorSignal
  | ContentChangeSignal
  | ScrollSyncSignal

// ===== SIGNAL METADATA REGISTRY =====

/**
 * Registry of signal metadata for documentation and discovery
 * Developers can query this to understand what signals are available
 */
export const STUDIO_SIGNAL_REGISTRY = {
  'verse-navigation': {
    description: 'Navigate to a specific verse in scripture',
    typicalSenders: ['words-links', 'notes', 'questions'],
    typicalReceivers: ['scripture'],
    example: {
      type: 'verse-navigation',
      verse: { book: 'JHN', chapter: 3, verse: 16 }
    }
  },
  'book-navigation': {
    description: 'Navigate to a book/chapter',
    typicalSenders: ['toc', 'navigation-ui'],
    typicalReceivers: ['scripture', 'notes', 'questions'],
    example: {
      type: 'book-navigation',
      location: { book: 'GEN', chapter: 1 }
    }
  },
  'token-click': {
    description: 'Word/token clicked in scripture',
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
  'entry-link-click': {
    description: 'Resource entry link clicked',
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
  'text-selection': {
    description: 'Text selected/highlighted',
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
  'scroll-sync': {
    description: 'Synchronize scrolling between panels',
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
  },
  'scripture-tokens-broadcast': {
    description: 'Broadcast current scripture tokens (state message)',
    typicalSenders: ['scripture'],
    typicalReceivers: ['words-links', 'notes'],
    example: {
      type: 'scripture-tokens-broadcast',
      lifecycle: 'state',
      stateKey: 'current-scripture-tokens',
      sourceResourceId: 'panel-1',
      reference: { book: 'JHN', chapter: 3, verse: 16 },
      tokens: [],
      resourceMetadata: { id: 'ult', language: 'en', type: 'scripture' },
      timestamp: Date.now()
    }
  },
  'scripture-content-request': {
    description: 'Request scripture content from active panels (DEPRECATED)',
    typicalSenders: ['words-links', 'notes'],
    typicalReceivers: ['scripture'],
    deprecated: true,
    example: {
      type: 'scripture-content-request',
      request: {
        book: 'JHN',
        chapter: 3,
        verse: 16,
        resourceType: 'scripture'
      }
    }
  },
  'scripture-content-response': {
    description: 'Response to scripture content request (DEPRECATED)',
    typicalSenders: ['scripture'],
    typicalReceivers: ['words-links', 'notes'],
    deprecated: true,
    example: {
      type: 'scripture-content-response',
      response: {
        requestId: '12345',
        resourceId: 'panel-1',
        resourceKey: 'unfoldingWord/en/ult',
        book: 'JHN',
        chapter: 3,
        hasContent: true,
        content: {}
      }
    }
  }
} as const
