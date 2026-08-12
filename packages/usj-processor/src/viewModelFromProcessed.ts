/**
 * Synthesize UsjScriptureViewModel from transitional ProcessedScripture.
 * Used for legacy scripture: cache hits and USE_USJ_PIPELINE=0 rollback.
 * Empty usj/alignmentMap — not a true USJ SoT round-trip.
 */

import type { ProcessedScripture, ProcessedVerse } from '@bt-synergy/usfm-processor'

import { semanticIdFor } from './identity'
import type { UsjScriptureViewModel, UsjVerseView, UsjWordToken } from './usjViewModel'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from './versions'

export function usjTokensFromProcessedVerse(verse: ProcessedVerse): UsjWordToken[] {
  const tokens: UsjWordToken[] = []
  for (const t of verse.wordTokens || []) {
    if (t.type !== 'word') continue
    const verseRef = t.verseRef || verse.reference
    const occurrence = t.occurrence || 1
    const content = t.content || ''
    tokens.push({
      semanticId: semanticIdFor(verseRef, content, occurrence),
      content,
      occurrence,
      totalOccurrences: t.totalOccurrences || 1,
      verseRef,
      alignedOriginalWordIds: Array.isArray(t.alignedOriginalWordIds)
        ? t.alignedOriginalWordIds.map(String).filter(Boolean)
        : [],
    })
  }
  return tokens
}

export function viewModelFromProcessedScripture(
  scripture: ProcessedScripture
): UsjScriptureViewModel {
  return {
    bookCode: scripture.bookCode,
    bookName: scripture.book,
    processingVersion: scripture.metadata?.version || USJ_PROCESSING_VERSION,
    toolVersions: { ...USJ_TOOL_VERSIONS },
    usj: { type: 'USJ', version: '3.0', content: [] },
    alignmentMap: {},
    chapters: scripture.chapters.map((ch) => ({
      number: ch.number,
      verses: ch.verses.map(
        (v): UsjVerseView => ({
          number: v.number,
          reference: v.reference,
          text: v.text,
          tokens: usjTokensFromProcessedVerse(v),
        })
      ),
    })),
  }
}
