/**
 * Spike-local copy of tc-study attachAlignmentSemanticIds.
 * Kept here so the package does not depend on apps/tc-study.
 * Format: verseRef:content:occurrence (Unicode surface, not lemma).
 */

import type { ProcessedScripture, ProcessedVerse } from '@bt-synergy/usfm-processor'

function generateSemanticId(verseRef: string, content: string, occurrence: number): string {
  return `${verseRef}:${content}:${occurrence}`
}

export function attachAlignmentSemanticIds(
  scripture: ProcessedScripture,
  verses: ProcessedVerse[]
): void {
  if (!scripture.alignments || scripture.alignments.length === 0) {
    return
  }

  const alignmentsByVerse = new Map<string, NonNullable<ProcessedScripture['alignments']>>()

  for (const alignment of scripture.alignments) {
    const verseRef = alignment.verseRef
    if (!alignmentsByVerse.has(verseRef)) {
      alignmentsByVerse.set(verseRef, [])
    }
    alignmentsByVerse.get(verseRef)!.push(alignment)
  }

  for (const verse of verses) {
    if (!verse.wordTokens) continue

    const verseAlignments = alignmentsByVerse.get(verse.reference) || []
    if (verseAlignments.length === 0) continue

    const alignmentUsage = new Map<
      string,
      Array<{ alignment: (typeof verseAlignments)[0]; used: boolean }>
    >()

    for (const alignment of verseAlignments) {
      for (const targetWord of alignment.targetWords) {
        const key = targetWord.toLowerCase()
        if (!alignmentUsage.has(key)) {
          alignmentUsage.set(key, [])
        }
        alignmentUsage.set(key, [
          ...alignmentUsage.get(key)!,
          { alignment, used: false },
        ])
      }
    }

    const wordOccurrences = new Map<string, number>()

    for (const token of verse.wordTokens) {
      if (token.type !== 'word') continue

      const tokenContent = token.content.toLowerCase()
      const currentOcc = (wordOccurrences.get(tokenContent) || 0) + 1
      wordOccurrences.set(tokenContent, currentOcc)

      const availableAlignments = alignmentUsage.get(tokenContent) || []
      const matchingEntry = availableAlignments.find((entry) => !entry.used)

      if (matchingEntry) {
        matchingEntry.used = true

        const alignment = matchingEntry.alignment
        const sourceWords = alignment.sourceWords || []

        const sourceSemanticIds = sourceWords.map((word, idx) => {
          const actualText =
            (alignment.alignmentData[idx] as { content?: string } | undefined)?.content || word
          const occurrence = alignment.alignmentData[idx]?.occurrence
            ? parseInt(alignment.alignmentData[idx].occurrence, 10)
            : idx + 1

          return generateSemanticId(alignment.verseRef, actualText, occurrence)
        })

        token.alignedOriginalWordIds = [...new Set(sourceSemanticIds)]
      }
    }
  }
}
