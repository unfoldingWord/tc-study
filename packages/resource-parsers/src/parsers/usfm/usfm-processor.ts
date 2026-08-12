/**
 * Transitional OptimizedScripture facade for resource-parsers.
 *
 * Public name stays `USFMProcessor` / `usfm-processor.ts` to avoid import churn in
 * resource-adapters / package-builder. Internally this is a thin wrapper over
 * `@bt-synergy/usj-processor` (`USJProcessor`). Parse SoT is UsjDocument +
 * AlignmentMap. Prefer UsjScriptureViewModel + viewModelToOptimizedChapters
 * (also re-exported by scripture-loader) for new Helps / QuoteMatcher code.
 * There is no `@bt-synergy/usfm-processor` package and no usfm-js dependency.
 */

import {
  USJProcessor,
  type ProcessingResult,
  type TranslatorSection,
  type USFMProcessingOptions,
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

export type { ProcessingResult, TranslatorSection, USFMProcessingOptions }

/**
 * Optimized scripture format (Helps / legacy adapter DTO).
 */
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

function viewModelToOptimizedScripture(
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

/**
 * Legacy-named facade over `USJProcessor` (kept for Stable OptimizedScripture callers).
 */
export class USFMProcessor {
  private readonly usj = new USJProcessor()

  /**
   * Process USFM → ProcessingResult (ProcessedScripture projection from USJ).
   */
  async processUSFM(
    usfmContent: string,
    bookCode: string,
    bookName: string,
    options: USFMProcessingOptions = {}
  ): Promise<ProcessingResult> {
    const { scripture } = await this.usj.processUSFM(
      usfmContent,
      bookCode,
      bookName,
      options
    )
    return {
      structuredText: scripture,
      translatorSections: scripture.translatorSections ?? [],
      alignments: scripture.alignments ?? [],
      metadata: scripture.metadata,
    }
  }

  /**
   * Process USFM → OptimizedScripture for QuoteMatcher-compatible chapters.
   */
  async processUSFMOptimized(
    usfmContent: string,
    bookCode: string,
    bookName: string,
    language?: string
  ): Promise<OptimizedScripture> {
    const { viewModel } = await this.usj.processUSFM(usfmContent, bookCode, bookName, {
      language,
      includeWordTokens: true,
      includeAlignments: true,
    })
    return viewModelToOptimizedScripture(viewModel, bookCode, bookName, language)
  }
}

export const usfmProcessor = new USFMProcessor()
