/**
 * Message types for tc-study inter-panel communication
 * Based on linked-panels spike learnings
 */

import { BaseMessageContent } from 'linked-panels'

/**
 * Token click event - sent when user clicks a token in scripture
 */
export interface TokenClickEvent extends BaseMessageContent {
  type: 'token-click'
  lifecycle: 'event'
  
  /** The clicked token */
  token: {
    id: string
    content: string
    semanticId: string
    verseRef: string
    position: number
    alignedOriginalWordIds?: string[]  // For cross-panel highlighting
    transliteration?: string
    meaning?: string
  }
  
  /** Source resource that detected the click */
  sourceResourceId: string
  
  /** Timestamp */
  timestamp: number
}

/**
 * Note selection event - sent when user clicks a note
 */
export interface NoteSelectionEvent extends BaseMessageContent {
  type: 'note-selection'
  lifecycle: 'event'
  
  /** Selected note info */
  note: {
    id: string
    reference: string
    quote: string
    occurrence: number
  } | null
  
  /** Source resource */
  sourceResourceId: string
  
  /** Timestamp */
  timestamp: number
}

/**
 * Token group for multi-color highlighting
 */
export interface TokenGroup {
  noteId: string
  noteText: string
  quote: string
  tokenIds: string[]
  colorIndex: number
}

/**
 * Highlighted tokens state - persistent state of which tokens to highlight
 */
export interface HighlightedTokensState extends BaseMessageContent {
  type: 'highlighted-tokens'
  lifecycle: 'state'
  stateKey: 'current-highlighted-tokens'
  
  /** Token IDs to highlight (simple mode) */
  tokenIds: string[]
  
  /** Currently selected token */
  selectedTokenId: string | null
  
  /** Color index for single-color highlighting */
  colorIndex?: number
  
  /** Token groups for multi-color highlighting */
  tokenGroups?: TokenGroup[]
  
  /** Source resource */
  sourceResourceId: string
  
  /** Timestamp */
  timestamp: number
}

/**
 * Verse reference filter event - sent when user clicks verse number
 */
export interface VerseReferenceFilterEvent extends BaseMessageContent {
  type: 'verse-filter'
  lifecycle: 'event'
  
  /** Verse reference to filter by */
  verseRef: {
    book: string
    chapter: number
    verse: number
  }
  
  /** Source resource */
  sourceResourceId: string
  
  /** Timestamp */
  timestamp: number
}

/**
 * Link click event - sent when user clicks a link to open in modal
 */
export interface LinkClickEvent extends BaseMessageContent {
  type: 'link-click'
  lifecycle: 'event'
  
  /** Link information */
  link: {
    url: string
    text: string
    resourceType?: string
    resourceId?: string
  }
  
  /** Source resource */
  sourceResourceId: string
  
  /** Timestamp */
  timestamp: number
}

/**
 * Scroll sync command - sent to sync scroll positions
 */
export interface ScrollSyncCommand extends BaseMessageContent {
  type: 'scroll-sync'
  lifecycle: 'command'
  
  /** Verse reference to scroll to */
  verseRef: string
  
  /** Scroll behavior */
  behavior?: 'auto' | 'smooth' | 'instant'
  
  /** TTL for command expiry */
  ttl: number
  
  /** Source resource */
  sourceResourceId: string
  
  /** Timestamp */
  timestamp: number
}

/**
 * All message types registry
 */
export interface TcStudyMessageTypes {
  'token-click': TokenClickEvent
  'note-selection': NoteSelectionEvent
  'highlighted-tokens': HighlightedTokensState
  'verse-filter': VerseReferenceFilterEvent
  'link-click': LinkClickEvent
  'scroll-sync': ScrollSyncCommand
}
