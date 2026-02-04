/**
 * ScriptureViewer Types
 */

import type { ProcessedScripture, ProcessedVerse, WordToken } from '@bt-synergy/usfm-processor'
import type { BookInfo } from '../../../contexts/types-only'

export interface ScriptureViewerProps {
  resourceId: string
  resourceKey: string
  server?: string
  owner?: string
  language?: string
  resourceType?: string
  isAnchor?: boolean
}

export interface ScriptureViewerState {
  loadedContent: ProcessedScripture | null
  availableBooks: BookInfo[]
  isLoading: boolean
  error: string | null
}

/**
 * Original language token structure for cross-panel highlighting
 * Matches the mobile app's pattern
 */
export interface OriginalLanguageToken {
  semanticId: string // Format: verseRef:content:occurrence (preserves Unicode)
  alignedSemanticIds?: string[] // Other semantic IDs this token aligns to
  content: string // The actual word content
  verseRef: string // Verse reference
  strong?: string // Strong's number (optional)
  lemma?: string
  morph?: string
}

export interface VerseDisplayProps {
  verse: ProcessedVerse
  highlightTarget: OriginalLanguageToken | null // Mobile app pattern
  onTokenClick: (token: WordToken) => void
  isOriginalLanguage: boolean
}

export interface TokenDisplayProps {
  token: WordToken
  index: number
  isHighlighted: boolean
  isSelected: boolean
  onTokenClick: (token: WordToken) => void
  isOriginalLanguage: boolean
}


