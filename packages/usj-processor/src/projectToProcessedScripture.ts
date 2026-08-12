/**
 * Thin projection: UsjScriptureViewModel → ProcessedScripture.
 *
 * TODO(sunset): Viewer / CombinedHelps should migrate to UsjScriptureViewModel
 * (or UsjWordToken[]) directly. This projection exists only so TokenRenderer and
 * QuoteMatcher keep working during the replace train without a UI rewrite.
 */

import type {
  ProcessedChapter,
  ProcessedScripture,
  ProcessedVerse,
  WordAlignment,
  WordToken,
} from '@bt-synergy/usfm-processor'

import { remapVerseRefBookCode } from './identity'
import type { AlignmentMap } from './usfmTools'
import type { UsjScriptureViewModel, UsjWordToken } from './usjViewModel'

function tokenToWordToken(t: UsjWordToken, position: number): WordToken {
  const key = t.content.toLowerCase()
  return {
    uniqueId: `${t.verseRef}-${key.replace(/[^a-z0-9\u0370-\u03ff]/gi, '_')}-${t.occurrence}`,
    content: t.content,
    occurrence: t.occurrence,
    totalOccurrences: t.totalOccurrences,
    verseRef: t.verseRef,
    position: { start: position, end: position + t.content.length },
    type: 'word',
    isHighlightable: true,
    alignedOriginalWordIds:
      t.alignedOriginalWordIds.length > 0 ? [...t.alignedOriginalWordIds] : undefined,
  }
}

function alignmentMapToWordAlignments(
  map: AlignmentMap,
  bookCode: string
): WordAlignment[] {
  const out: WordAlignment[] = []
  for (const [verseRef, groups] of Object.entries(map)) {
    const normalizedRef = remapVerseRefBookCode(verseRef, bookCode)
    for (const group of groups) {
      out.push({
        verseRef: normalizedRef,
        sourceWords: group.sources.map((s) => s.content),
        targetWords: group.targets.map((t) => t.word),
        alignmentData: group.sources.map((s) => ({
          strong: s.strong || '',
          lemma: s.lemma || '',
          morph: s.morph || '',
          occurrence: String(s.occurrence ?? 1),
          occurrences: String(s.occurrences ?? 1),
          content: s.content,
        })) as WordAlignment['alignmentData'],
      })
    }
  }
  return out
}

/**
 * Project USJ view model → ProcessedScripture for transitional UI consumers.
 * Prefer reading `viewModel` / `viewModel.chapters[].verses[].tokens` when possible.
 */
export function projectToProcessedScripture(
  viewModel: UsjScriptureViewModel
): ProcessedScripture {
  const chapters: ProcessedChapter[] = viewModel.chapters.map((ch) => {
    const verses: ProcessedVerse[] = ch.verses.map((v) => {
      let position = 0
      const wordTokens = v.tokens.map((t) => {
        const wt = tokenToWordToken(t, position)
        position += t.content.length + 1
        return wt
      })
      return {
        number: v.number,
        text: v.text,
        reference: v.reference,
        wordTokens,
      }
    })
    return {
      number: ch.number,
      verseCount: verses.length,
      paragraphCount: 0,
      verses,
      paragraphs: [],
    }
  })

  const wordAlignments = alignmentMapToWordAlignments(
    viewModel.alignmentMap,
    viewModel.bookCode
  )

  const totalVerses = chapters.reduce((sum, ch) => sum + ch.verseCount, 0)
  const totalWordTokens = chapters.reduce(
    (sum, ch) =>
      sum + ch.verses.reduce((vSum, v) => vSum + (v.wordTokens?.length || 0), 0),
    0
  )

  const chapterVerseMap: Record<number, number> = {}
  for (const ch of chapters) {
    chapterVerseMap[ch.number] = ch.verseCount
  }

  return {
    book: viewModel.bookName,
    bookCode: viewModel.bookCode,
    metadata: {
      bookCode: viewModel.bookCode,
      bookName: viewModel.bookName,
      processingDate: new Date().toISOString(),
      processingDuration: 0,
      version: viewModel.processingVersion,
      hasAlignments: wordAlignments.length > 0,
      hasSections: false,
      hasWordTokens: totalWordTokens > 0,
      totalChapters: chapters.length,
      totalVerses,
      totalParagraphs: 0,
      chapterVerseMap,
      statistics: {
        totalChapters: chapters.length,
        totalVerses,
        totalParagraphs: 0,
        totalSections: 0,
        totalAlignments: wordAlignments.length,
        totalWordTokens,
      },
    },
    chapters,
    alignments: wordAlignments.length > 0 ? wordAlignments : undefined,
  }
}
