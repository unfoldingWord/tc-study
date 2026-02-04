/**
 * WordsLinksViewer Types
 * 
 * Type definitions for Translation Words Links viewer components
 */

import type { ProcessedWordsLinks, TranslationWordsLink } from '@bt-synergy/resource-parsers'

export type { ProcessedWordsLinks, TranslationWordsLink }

export interface WordsLinksViewerProps {
  resourceId: string
  resourceKey: string
  wordsLinksContent?: ProcessedWordsLinks
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
}

export interface TWLinkInfo {
  category: string
  term: string
}

export interface TokenFilter {
  semanticId: string
  content: string
  alignedSemanticIds?: string[]  // For target language tokens, these are the original language semantic IDs
  timestamp: number
}
