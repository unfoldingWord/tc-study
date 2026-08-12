/**
 * Helps DTO: OptimizedScripture derived from UsjScriptureViewModel.
 *
 * Ownership: QuoteMatcher / Helps chapters live here (OptimizedToken family).
 * Runtime identity SoT: UsjScriptureViewModel / UsjWordToken via USJProcessor.
 */

import {
  USJProcessor,
  type TranslatorSection,
  type UsjScriptureViewModel,
} from '@bt-synergy/usj-processor'
import type { OptimizedChapter } from '../../types/optimized-tokens'
import { viewModelToOptimizedChapters } from './usj-projection'

export type {
  OptimizedToken,
  OptimizedVerse,
  OptimizedParagraph,
  OptimizedChapter,
} from '../../types/optimized-tokens'

export type { TranslatorSection }

/** Helps / adapter DTO — chapters are QuoteMatcher-compatible OptimizedChapter[]. */
export interface OptimizedScripture {
  meta: {
    book: string
    bookCode: string
    language?: string
    type: 'untokenized' | 'original' | 'aligned'
    totalChapters: number
    totalVerses: number
    totalParagraphs: number
    hasAlignments: boolean
    processingDate: string
    version: string
  }
  chapters: OptimizedChapter[]
  translatorSections?: TranslatorSection[]
}

function detectDocumentType(
  viewModel: UsjScriptureViewModel
): 'untokenized' | 'original' | 'aligned' {
  if (Object.keys(viewModel.alignmentMap).length > 0) return 'aligned'
  const hasTokens = viewModel.chapters.some((ch) =>
    ch.verses.some((v) => v.tokens.length > 0)
  )
  return hasTokens ? 'original' : 'untokenized'
}

/** Project a view model into the Helps OptimizedScripture envelope. */
export function viewModelToOptimizedScripture(
  viewModel: UsjScriptureViewModel,
  bookCode: string,
  bookName: string,
  language?: string
): OptimizedScripture {
  const chapters = viewModelToOptimizedChapters(viewModel)
  const documentType = detectDocumentType(viewModel)
  const totalVerses = chapters.reduce((sum, ch) => sum + ch.verseCount, 0)
  const totalParagraphs = chapters.reduce((sum, ch) => sum + ch.paragraphCount, 0)

  return {
    meta: {
      book: bookName,
      bookCode,
      language,
      type: documentType,
      totalChapters: chapters.length,
      totalVerses,
      totalParagraphs,
      hasAlignments: documentType === 'aligned',
      processingDate: new Date().toISOString(),
      version: viewModel.processingVersion || 'usj',
    },
    chapters,
  }
}

/** Convenience: USFM → USJProcessor → OptimizedScripture (Helps DTO). */
export async function processUsfmToOptimizedScripture(
  usfmContent: string,
  bookCode: string,
  bookName: string,
  language?: string
): Promise<OptimizedScripture> {
  const { viewModel } = await new USJProcessor().processUSFM(usfmContent, bookCode, bookName, {
    language,
    includeWordTokens: true,
    includeAlignments: true,
  })
  return viewModelToOptimizedScripture(viewModel, bookCode, bookName, language)
}
