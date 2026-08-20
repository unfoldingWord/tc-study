import type {
  UsjLayoutInline,
  UsjScriptureViewModel,
  UsjVerseView,
  UsjWordToken,
} from '@bt-synergy/scripture-loader'
import type { BookInfo } from '../../../contexts/types-only'
import type { ResourceInfo } from '../../../contexts/types'

export interface ScriptureViewerProps {
  resourceId: string
  resourceKey: string
  resource: ResourceInfo
  server?: string
  owner?: string
  language?: string
  resourceType?: string
  isAnchor?: boolean
}

export interface ScriptureViewerState {
  viewModel: UsjScriptureViewModel | null
  availableBooks: BookInfo[]
  isLoading: boolean
  error: string | null
}

export interface OriginalLanguageToken {
  semanticId: string
  alignedSemanticIds?: string[]
  /** Folded once when the click is set. Paint uses these, not NFD. */
  foldedSemanticId?: string
  foldedAlignedIdSet?: Set<string>
  content: string
  verseRef: string
  strong?: string
  lemma?: string
  morph?: string
}

export type DisplayUsjVerse = UsjVerseView & { chapterNumber: number }

export interface VerseDisplayProps {
  verse: DisplayUsjVerse
  chapterNumber: number
  /** Tokens + USJ punctuation text for this verse (verse-block display). */
  displayInline?: UsjLayoutInline[]
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  isOriginalLanguage: boolean
}

export interface TokenDisplayProps {
  token: UsjWordToken
  index: number
  isHighlighted: boolean
  isSelected: boolean
  isUnderlined?: boolean
  onTokenClick: (token: UsjWordToken) => void
  isOriginalLanguage: boolean
}
