/**
 * Studio EVENT (and deprecated request/response) signal contracts.
 * STATE contracts live in `studioStateSignals` → `@bt-synergy/resource-panels`.
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'

// ===== NAVIGATION =====

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

export interface BookNavigationSignal extends BaseSignal {
  type: 'book-navigation'
  location: {
    book: string
    chapter?: number
  }
}

// ===== CONTENT SELECTION =====

export interface TokenClickSignal extends BaseSignal {
  type: 'token-click'
  /**
   * Clicked token payload, or `null` to clear the active highlight / helps token filter
   * (toggle-off when the user clicks the already-selected token).
   */
  token: {
    id: string
    content: string
    semanticId: string
    verseRef: string
    position: number
    strong?: string
    lemma?: string
    morph?: string
    alignedSemanticIds?: string[]
    /** True when the clicked token is covered by a loaded TN/TWL quote. */
    hasHelpsCoverage?: boolean
  } | null
}

export interface VerseFilterSignal extends BaseSignal {
  type: 'verse-filter'
  /** Verse/chapter filter, or `null` to clear a prior scripture-driven verse filter. */
  filter: {
    chapter: number
    verse?: number
  } | null
}

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

// ===== LINK & REFERENCE =====

export interface EntryLinkClickSignal extends BaseSignal {
  type: 'entry-link-click'
  link: {
    resourceType: string
    resourceId: string
    entryId: string
    text: string
  }
}

export interface CrossReferenceSignal extends BaseSignal {
  type: 'cross-reference'
  reference: {
    from: string
    to: string
    type: 'parallel' | 'quotation' | 'allusion' | 'explanation'
  }
}

// ===== OBS FRAME HIGHLIGHT (EVENT) =====

export interface ObsFrameHighlightSignal {
  type: 'obs-frame-highlight'
  lifecycle: 'event'
  sourceResourceId: string
  highlight: {
    storyNumber: number
    frameNumber: number
    quote?: string
    occurrence?: number
    rowId?: string
    kind?: 'tn' | 'twl'
    wordIndex?: number
    overlappingSourceIds?: string[]
  } | null
  timestamp: number
}

// ===== DEPRECATED CONTENT REQUEST/RESPONSE =====

/** @deprecated Prefer ScriptureTokensBroadcastSignal + useResourceState. */
export interface ScriptureContentRequestSignal extends BaseSignal {
  type: 'scripture-content-request'
  request: {
    book: string
    chapter: number
    verse?: number
    endVerse?: number
    language?: string
    resourceType?: string
  }
}

/** @deprecated Prefer ScriptureTokensBroadcastSignal + useResourceState. */
export interface ScriptureContentResponseSignal extends BaseSignal {
  type: 'scripture-content-response'
  response: {
    requestId: string
    resourceId: string
    resourceKey: string
    book: string
    chapter: number
    content?: unknown
    hasContent: boolean
    error?: string
  }
}

// ===== RESOURCE / CONTENT / SYNC =====

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

export interface ContentChangeSignal extends BaseSignal {
  type: 'content-change'
  change: {
    resourceId: string
    location: string
    content: string
    timestamp: number
  }
}

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
