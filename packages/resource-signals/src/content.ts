/**
 * Content Interaction Signals
 * 
 * Signals for user interactions with content (clicks, selections, etc.)
 */

import type { BaseSignal } from './index'

/**
 * Token Click Signal
 * When a word/token is clicked in scripture
 */
export interface TokenClickSignal extends BaseSignal {
  type: 'token-click'
  token: {
    id: string
    content: string
    semanticId: string      // Strong's number or lemma (e.g., 'H430', 'G3056')
    verseRef: string        // BCV reference
    position: number        // Position in verse
    transliteration?: string
    meaning?: string
    morphology?: string     // Grammatical info
  }
}

/**
 * Text Selection Signal
 * When text is selected/highlighted
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

