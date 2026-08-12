/**
 * Mobile scripture processor — transitional USJ-backed facade.
 *
 * Public name stays `USFMProcessor` / `usfm-processor.ts` so Door43ScriptureAdapter,
 * USFMRenderer, and mobile type imports do not churn. Internally parse/process
 * via `@bt-synergy/usj-processor` (`USJProcessor`), then project into the
 * OptimizedScripture DTO. No usfm-js; no `@bt-synergy/usfm-processor` package.
 */

import {
  USJProcessor,
  type ProcessedChapter as UsjProcessedChapter,
  type ProcessedScripture as UsjProcessedScripture,
  type ProcessedVerse as UsjProcessedVerse,
  type TranslatorSection as UsjTranslatorSection,
  type UsjScriptureViewModel,
  type UsjWordToken,
  type WordToken as UsjWordTokenDto,
} from '@bt-synergy/usj-processor'
import { generateSemanticId } from '../utils/semantic-id-generator'
import { defaultSectionsService } from './default-sections'

// ============================================================================
// Public DTOs (stable for mobile UI / adapters)
// ============================================================================

export interface TranslatorSection {
  start: {
    chapter: number
    verse: number
    reference: { chapter: string; verse: string }
  }
  end: {
    chapter: number
    verse: number
    reference: { chapter: string; verse: string }
  }
}

export interface WordAlignment {
  verseRef: string
  sourceWords: string[]
  targetWords: string[]
  alignmentData: {
    strong: string
    lemma: string
    morph: string
    occurrence: string
    occurrences: string
    content?: string
  }[]
}

export interface WordToken {
  uniqueId: string
  content: string
  occurrence: number
  totalOccurrences: number
  verseRef: string
  position: { start: number; end: number }
  type: 'word' | 'text' | 'punctuation'
  isHighlightable: boolean
  alignmentId?: string
  alignmentGroupId?: string
  alignedOriginalWordIds?: string[]
  alignment?: {
    strong: string
    lemma: string
    morph: string
    sourceContent: string
    sourceWordId?: string
    alignmentGroupId?: string
  }
}

export interface AlignmentGroup {
  id: string
  verseRef: string
  sourceWords: string[]
  targetTokens: WordToken[]
  alignmentData: {
    strong: string
    lemma: string
    morph: string
    occurrence: string
    occurrences: string
  }[]
  isContiguous: boolean
}

export interface ProcessedVerse {
  number: number
  text: string
  reference: string
  paragraphId?: string
  hasSectionMarker?: boolean
  sectionMarkers?: number
  alignments?: WordAlignment[]
  wordTokens?: WordToken[]
  alignmentGroups?: AlignmentGroup[]
  isSpan?: boolean
  spanStart?: number
  spanEnd?: number
  originalVerseString?: string
}

export interface ProcessedParagraph {
  id: string
  type: 'paragraph' | 'quote'
  style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
  indentLevel: number
  startVerse: number
  endVerse: number
  verseCount: number
  verseNumbers: number[]
  combinedText: string
  verses: ProcessedVerse[]
}

export interface ProcessedChapter {
  number: number
  verseCount: number
  paragraphCount: number
  verses: ProcessedVerse[]
  paragraphs: ProcessedParagraph[]
}

export interface ProcessedScripture {
  book: string
  bookCode: string
  metadata: {
    bookCode: string
    bookName: string
    processingDate: string
    processingDuration: number
    version: string
    hasAlignments: boolean
    hasSections: boolean
    hasWordTokens?: boolean
    totalChapters: number
    totalVerses: number
    totalParagraphs: number
    chapterVerseMap?: Record<number, number>
    statistics: {
      totalChapters: number
      totalVerses: number
      totalParagraphs: number
      totalSections: number
      totalAlignments: number
      totalWordTokens?: number
    }
  }
  chapters: ProcessedChapter[]
  translatorSections?: TranslatorSection[]
  alignments?: WordAlignment[]
}

export interface ProcessingResult {
  structuredText: ProcessedScripture
  translatorSections: TranslatorSection[]
  alignments: WordAlignment[]
  metadata: ProcessedScripture['metadata']
}

export interface OptimizedToken {
  id: number
  text: string
  type: 'word' | 'punctuation' | 'number' | 'whitespace' | 'paragraph-marker'
  align?: number[]
  strong?: string
  lemma?: string
  morph?: string
  paragraphSegment?: {
    id: number
    style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
    type: 'paragraph' | 'quote'
    indentLevel: number
  }
  paragraphMarker?: {
    style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
    type: 'paragraph' | 'quote'
    indentLevel: number
    isNewParagraph: boolean
  }
}

export interface OptimizedVerse {
  number: number
  text: string
  paragraphId?: number
  tokens: OptimizedToken[]
  isSpan?: boolean
  spanStart?: number
  spanEnd?: number
  originalVerseString?: string
}

export interface OptimizedParagraph {
  id: number
  type: 'paragraph' | 'quote'
  style: 'p' | 'q' | 'q1' | 'q2' | 'm' | 'mi' | 'pc' | 'pr' | 'cls'
  indentLevel: number
  startVerse: number
  endVerse: number
  verseNumbers: number[]
}

export interface OptimizedChapter {
  number: number
  verseCount: number
  paragraphCount: number
  verses: OptimizedVerse[]
}

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

// ============================================================================
// Helpers
// ============================================================================

const SEMANTIC_ID_RE = /^(\S+\s+\d+:\d+):(.+):(\d+)$/

function parseSemanticId(semanticId: string): {
  verseRef: string
  content: string
  occurrence: number
} | null {
  const m = semanticId.match(SEMANTIC_ID_RE)
  if (!m) return null
  return {
    verseRef: m[1],
    content: m[2],
    occurrence: parseInt(m[3], 10),
  }
}

function numericIdFromSemanticId(semanticId: string): number {
  const parsed = parseSemanticId(semanticId)
  if (!parsed) {
    return Math.abs(
      [...semanticId].reduce((h, c) => ((h << 5) - h + c.charCodeAt(0)) | 0, 0)
    ) % 1000000
  }
  return generateSemanticId(parsed.content, parsed.verseRef, parsed.occurrence)
}

function classifyTokenType(text: string): OptimizedToken['type'] {
  if (/^\d+$/.test(text)) return 'number'
  if (/^[^\w\u0370-\u03ff\u0400-\u04ff\u0590-\u05ff]+$/i.test(text)) return 'punctuation'
  return 'word'
}

function detectDocumentType(
  viewModel: UsjScriptureViewModel
): 'untokenized' | 'original' | 'aligned' {
  if (Object.keys(viewModel.alignmentMap).length > 0) return 'aligned'
  const hasWordTokens = viewModel.chapters.some((ch) =>
    ch.verses.some((v) => v.tokens.length > 0)
  )
  return hasWordTokens ? 'original' : 'untokenized'
}

type UsjWordMeta = { strong?: string; lemma?: string; morph?: string }

function collectUsjWordMeta(
  usj: { content?: unknown[] },
  bookCode: string
): Map<string, UsjWordMeta> {
  const meta = new Map<string, UsjWordMeta>()
  const ctx = { verseSid: '' }
  const occByVerseWord = new Map<string, number>()

  const walk = (nodes: unknown[]) => {
    for (const n of nodes) {
      if (typeof n !== 'object' || n === null) continue
      const node = n as Record<string, unknown>
      if (node.type === 'verse' && typeof node.sid === 'string') {
        ctx.verseSid = node.sid
      }
      if (node.type === 'char' && node.marker === 'w' && ctx.verseSid) {
        const content =
          typeof node.content === 'string'
            ? node.content
            : Array.isArray(node.content)
              ? node.content
                  .map((c) =>
                    typeof c === 'string'
                      ? c
                      : typeof c === 'object' &&
                          c &&
                          'content' in c &&
                          typeof (c as { content: unknown }).content === 'string'
                        ? (c as { content: string }).content
                        : ''
                  )
                  .join('')
              : ''
        const verseRef = ctx.verseSid.replace(
          /^(\S+)/,
          (_, book) =>
            book.toLowerCase() === bookCode.toLowerCase() ? bookCode : book
        )
        const keyBase = `${verseRef}:${content.toLowerCase()}`
        const occ = (occByVerseWord.get(keyBase) || 0) + 1
        occByVerseWord.set(keyBase, occ)
        meta.set(`${verseRef}:${content}:${occ}`, {
          strong: typeof node.strong === 'string' ? node.strong : undefined,
          lemma: typeof node.lemma === 'string' ? node.lemma : undefined,
          morph:
            typeof node.morph === 'string'
              ? node.morph
              : typeof node['x-morph'] === 'string'
                ? (node['x-morph'] as string)
                : undefined,
        })
      }
      if (Array.isArray(node.content)) walk(node.content)
    }
  }

  walk(usj.content ?? [])
  return meta
}

function usjTokenToOptimized(
  token: UsjWordToken,
  documentType: 'untokenized' | 'original' | 'aligned',
  sequentialId: number,
  wordMeta: Map<string, UsjWordMeta>
): OptimizedToken {
  const meta =
    wordMeta.get(`${token.verseRef}:${token.content}:${token.occurrence}`) ||
    wordMeta.get(
      `${token.verseRef}:${token.content.toLowerCase()}:${token.occurrence}`
    )

  if (documentType === 'aligned') {
    const align =
      token.alignedOriginalWordIds.length > 0
        ? token.alignedOriginalWordIds.map(numericIdFromSemanticId)
        : undefined
    return {
      id: sequentialId,
      text: token.content,
      type: classifyTokenType(token.content),
      align,
      strong: meta?.strong,
      lemma: meta?.lemma,
      morph: meta?.morph,
    }
  }

  return {
    id: generateSemanticId(token.content, token.verseRef, token.occurrence),
    text: token.content,
    type: classifyTokenType(token.content),
    strong: meta?.strong || '',
    lemma: meta?.lemma || '',
    morph: meta?.morph || '',
  }
}

function tokenizeUntokenizedVerse(
  text: string,
  verseRef: string
): OptimizedToken[] {
  const tokens: OptimizedToken[] = [
    {
      id: 10000,
      text: '',
      type: 'paragraph-marker',
      paragraphMarker: {
        style: 'p',
        type: 'paragraph',
        indentLevel: 0,
        isNewParagraph: true,
      },
    },
  ]
  const parts = text.split(/(\s+|[^\w\s])/u)
  for (const part of parts) {
    if (!part || /^\s+$/.test(part)) continue
    const occurrence =
      tokens.filter((t) => t.text === part && t.type === 'word').length + 1
    tokens.push({
      id: generateSemanticId(part, verseRef, occurrence),
      text: part,
      type: classifyTokenType(part),
    })
  }
  return tokens
}

function viewModelToOptimizedScripture(
  viewModel: UsjScriptureViewModel,
  language?: string
): OptimizedScripture {
  const documentType = detectDocumentType(viewModel)
  const wordMeta = collectUsjWordMeta(viewModel.usj, viewModel.bookCode)
  const chapters: OptimizedChapter[] = []
  let totalVerses = 0
  let sequentialId = 1

  for (const chapter of viewModel.chapters) {
    const verses: OptimizedVerse[] = chapter.verses.map((verse) => {
      let tokens: OptimizedToken[]
      if (documentType === 'untokenized' || verse.tokens.length === 0) {
        tokens = tokenizeUntokenizedVerse(verse.text || '', verse.reference)
      } else {
        // Default paragraph so USFMRenderer has a segment boundary
        tokens = [
          {
            id: 10000 + chapter.number * 1000 + verse.number,
            text: '',
            type: 'paragraph-marker',
            paragraphMarker: {
              style: 'p',
              type: 'paragraph',
              indentLevel: 0,
              isNewParagraph: verse.number === 1,
            },
          },
        ]
        for (const t of verse.tokens) {
          tokens.push(
            usjTokenToOptimized(t, documentType, sequentialId++, wordMeta)
          )
        }
      }
      return {
        number: verse.number,
        text: (verse.text || '').trim(),
        tokens,
      }
    })

    chapters.push({
      number: chapter.number,
      verseCount: verses.length,
      paragraphCount: verses.length > 0 ? 1 : 0,
      verses,
    })
    totalVerses += verses.length
  }

  return {
    meta: {
      book: viewModel.bookName,
      bookCode: viewModel.bookCode,
      language,
      type: documentType,
      totalChapters: chapters.length,
      totalVerses,
      totalParagraphs: chapters.reduce((s, c) => s + c.paragraphCount, 0),
      hasAlignments: documentType === 'aligned',
      processingDate: new Date().toISOString(),
      version: `usj-${viewModel.processingVersion}`,
    },
    chapters,
  }
}

function mapTranslatorSections(
  sections: UsjTranslatorSection[] | undefined
): TranslatorSection[] {
  if (!sections?.length) return []
  return sections.map((s) => ({
    start: {
      chapter: s.start.chapter,
      verse: s.start.verse,
      reference: { ...s.start.reference },
    },
    end: {
      chapter: s.end.chapter,
      verse: s.end.verse,
      reference: { ...s.end.reference },
    },
  }))
}

function mapWordToken(t: UsjWordTokenDto): WordToken {
  return {
    uniqueId: t.uniqueId,
    content: t.content,
    occurrence: t.occurrence,
    totalOccurrences: t.totalOccurrences,
    verseRef: t.verseRef,
    position: { ...t.position },
    type: t.type,
    isHighlightable: t.isHighlightable,
    alignmentId: t.alignmentId,
    alignmentGroupId: t.alignmentGroupId,
    alignedOriginalWordIds: t.alignedOriginalWordIds,
    alignment: t.alignment
      ? {
          strong: t.alignment.strong,
          lemma: t.alignment.lemma,
          morph: t.alignment.morph,
          sourceContent: t.alignment.content,
        }
      : undefined,
  }
}

function mapProcessedVerse(v: UsjProcessedVerse): ProcessedVerse {
  return {
    number: v.number,
    text: v.text,
    reference: v.reference,
    paragraphId: v.paragraphId,
    hasSectionMarker: v.hasSectionMarker,
    sectionMarkers: v.sectionMarkers,
    alignments: v.alignments as WordAlignment[] | undefined,
    wordTokens: v.wordTokens?.map(mapWordToken),
    isSpan: v.isSpan,
    spanStart: v.spanStart,
    spanEnd: v.spanEnd,
    originalVerseString: v.originalVerseString,
  }
}

function mapProcessedChapter(ch: UsjProcessedChapter): ProcessedChapter {
  return {
    number: ch.number,
    verseCount: ch.verseCount,
    paragraphCount: ch.paragraphCount,
    verses: ch.verses.map(mapProcessedVerse),
    paragraphs: ch.paragraphs.map((p) => ({
      id: p.id,
      type: p.type,
      style: p.style,
      indentLevel: p.indentLevel,
      startVerse: p.startVerse,
      endVerse: p.endVerse,
      verseCount: p.verseCount,
      verseNumbers: [...p.verseNumbers],
      combinedText: p.combinedText,
      verses: p.verses.map(mapProcessedVerse),
    })),
  }
}

function mapProcessedScripture(
  scripture: UsjProcessedScripture,
  translatorSections: TranslatorSection[]
): ProcessedScripture {
  return {
    book: scripture.book,
    bookCode: scripture.bookCode,
    metadata: {
      ...scripture.metadata,
      hasSections: translatorSections.length > 0,
      statistics: {
        ...scripture.metadata.statistics,
        totalSections: translatorSections.length,
      },
    },
    chapters: scripture.chapters.map(mapProcessedChapter),
    translatorSections,
    alignments: scripture.alignments as WordAlignment[] | undefined,
  }
}

function resolveTranslatorSections(
  bookCode: string,
  fromUsj: TranslatorSection[]
): TranslatorSection[] {
  if (fromUsj.length > 0) return fromUsj
  try {
    return (defaultSectionsService.getDefaultSections(bookCode) as TranslatorSection[]) || []
  } catch (error) {
    console.warn(`⚠️ Failed to load default sections for ${bookCode}:`, error)
    return []
  }
}

// ============================================================================
// Processor
// ============================================================================

/** Legacy-named facade over `USJProcessor` (stable mobile OptimizedScripture API). */
export class USFMProcessor {
  private readonly usj = new USJProcessor()

  /**
   * Process USFM → ProcessedScripture (transitional DTO from USJ projection).
   */
  async processUSFM(
    usfmContent: string,
    bookCode: string,
    bookName: string
  ): Promise<ProcessingResult> {
    const { scripture } = await this.usj.processUSFM(usfmContent, bookCode, bookName)
    const translatorSections = resolveTranslatorSections(
      bookCode,
      mapTranslatorSections(scripture.translatorSections)
    )
    const structuredText = mapProcessedScripture(scripture, translatorSections)
    return {
      structuredText,
      translatorSections,
      alignments: (scripture.alignments || []) as WordAlignment[],
      metadata: structuredText.metadata,
    }
  }

  /**
   * Process USFM → OptimizedScripture for mobile viewers / Door43 adapters.
   */
  async processUSFMOptimized(
    usfmContent: string,
    bookCode: string,
    bookName: string,
    language?: string
  ): Promise<OptimizedScripture> {
    const { viewModel, scripture } = await this.usj.processUSFM(
      usfmContent,
      bookCode,
      bookName
    )
    const optimized = viewModelToOptimizedScripture(viewModel, language)
    optimized.translatorSections = resolveTranslatorSections(
      bookCode,
      mapTranslatorSections(scripture.translatorSections)
    )
    return optimized
  }
}

export const usfmProcessor = new USFMProcessor()
