/**
 * USJ → ProcessedScripture adapter.
 *
 * Pipeline: USFM → @usfm-tools/parser.toJSON() → stripAlignments → WordTokens
 * Word surfaces come from USJ `char`/`w` nodes (not tokenizeGatewayUsj).
 */

import type {
  ProcessedChapter,
  ProcessedScripture,
  ProcessedVerse,
  USFMProcessingOptions,
  WordAlignment,
  WordToken,
} from '@bt-synergy/usfm-processor'

import { attachAlignmentSemanticIds } from './attachAlignmentSemanticIds'
import type { CachedUsjDocument, UsjScriptureCacheContent } from './usjCacheTypes'
import {
  USFMParser,
  splitUsjByChapter,
  stripAlignments,
  type AlignmentMap,
} from './usfmTools'
import { collectUsjWords, parseVerseSid } from './usjWalk'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from './versions'

export interface USJProcessResult {
  scripture: ProcessedScripture
  /** Raw USJ from parser.toJSON() (pre-strip document; alignments still present) */
  usj: CachedUsjDocument
  /** Alignment map from stripAlignments (empty for unaligned OL) */
  alignmentMap: AlignmentMap
}

/**
 * Remap USJ verse refs (typically uppercase book from sid) to the caller bookCode
 * so verse.reference and alignment.verseRef match (required by attachAlignmentSemanticIds).
 */
function remapVerseRefBookCode(verseRef: string, bookCode: string): string {
  const m = verseRef.match(/^(\S+)\s+(\d+:\d+)$/)
  if (!m) return verseRef
  if (m[1].toLowerCase() !== bookCode.toLowerCase()) return verseRef
  return `${bookCode} ${m[2]}`
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
          // Extra field used by attachAlignmentSemanticIds (inflected surface)
          content: s.content,
        })) as WordAlignment['alignmentData'],
      })
    }
  }
  return out
}

function buildWordTokens(surfaces: string[], verseRef: string): WordToken[] {
  const totals = new Map<string, number>()
  for (const s of surfaces) {
    const key = s.toLowerCase()
    totals.set(key, (totals.get(key) || 0) + 1)
  }

  const seen = new Map<string, number>()
  let position = 0
  return surfaces.map((content) => {
    const key = content.toLowerCase()
    const occurrence = (seen.get(key) || 0) + 1
    seen.set(key, occurrence)
    const token: WordToken = {
      uniqueId: `${verseRef}-${key.replace(/[^a-z0-9\u0370-\u03ff]/gi, '_')}-${occurrence}`,
      content,
      occurrence,
      totalOccurrences: totals.get(key) || 1,
      verseRef,
      position: { start: position, end: position + content.length },
      type: 'word',
      isHighlightable: true,
    }
    position += content.length + 1
    return token
  })
}

function wordsToChapters(
  bookCode: string,
  words: ReturnType<typeof collectUsjWords>
): ProcessedChapter[] {
  const byChapter = new Map<number, Map<number, string[]>>()
  const bookCodeLower = bookCode.toLowerCase()

  for (const w of words) {
    const parsed = parseVerseSid(w.verseSid)
    // USJ sid book codes are typically uppercase (TIT); Door43 ingredients often lowercase (tit)
    if (!parsed || parsed.bookCode.toLowerCase() !== bookCodeLower) continue
    if (!byChapter.has(parsed.chapter)) byChapter.set(parsed.chapter, new Map())
    const verseMap = byChapter.get(parsed.chapter)!
    if (!verseMap.has(parsed.verse)) verseMap.set(parsed.verse, [])
    verseMap.get(parsed.verse)!.push(w.content)
  }

  const chapters: ProcessedChapter[] = []
  for (const chapterNum of [...byChapter.keys()].sort((a, b) => a - b)) {
    const verseMap = byChapter.get(chapterNum)!
    const verses: ProcessedVerse[] = []
    for (const verseNum of [...verseMap.keys()].sort((a, b) => a - b)) {
      const surfaces = verseMap.get(verseNum)!
      const reference = `${bookCode} ${chapterNum}:${verseNum}`
      verses.push({
        number: verseNum,
        text: surfaces.join(' '),
        reference,
        wordTokens: buildWordTokens(surfaces, reference),
      })
    }
    chapters.push({
      number: chapterNum,
      verseCount: verses.length,
      paragraphCount: 0,
      verses,
      paragraphs: [],
    })
  }
  return chapters
}

function rebuildUsjFromChapters(
  chapters: Array<{ number: number; content: unknown[] }>,
  version = '3.0'
): CachedUsjDocument {
  const content: unknown[] = []
  for (const ch of [...chapters].sort((a, b) => a.number - b.number)) {
    content.push(...(ch.content ?? []))
  }
  return { type: 'USJ', version, content }
}

export function isUsjCacheVersionCompatible(
  metadata: { version?: string; toolVersions?: { parser?: string; usjCore?: string } } | undefined
): boolean {
  if (!metadata || metadata.version !== USJ_PROCESSING_VERSION) return false
  const tools = metadata.toolVersions
  if (!tools) return false
  return tools.parser === USJ_TOOL_VERSIONS.parser && tools.usjCore === USJ_TOOL_VERSIONS.usjCore
}

export class USJProcessor {
  /**
   * Parse USFM via USJ and project to ProcessedScripture (+ attach alignedOriginalWordIds).
   */
  async processUSFM(
    usfmText: string,
    bookCode: string,
    bookName: string,
    options: USFMProcessingOptions = {}
  ): Promise<USJProcessResult> {
    const parser = new USFMParser()
    parser.parse(usfmText)
    // Keep raw USJ for WordToken walk (`char`/`w` nodes). stripAlignments may unwrap
    // `\w` on a clone — tokens must not use the stripped editable document.
    const usj = parser.toJSON() as CachedUsjDocument
    const { alignments: alignmentMap } = stripAlignments(
      JSON.parse(JSON.stringify(usj)) as CachedUsjDocument
    )
    // Persist raw USJ + AlignmentMap (map alone is not enough for `\w` surfaces)
    const scripture = this.adaptFromUsj(usj, alignmentMap, bookCode, bookName, options)
    return { scripture, usj, alignmentMap }
  }

  /**
   * Project cached USJ + AlignmentMap → ProcessedScripture (no USFM re-parse).
   */
  adaptFromUsj(
    usj: CachedUsjDocument,
    alignmentMap: AlignmentMap,
    bookCode: string,
    bookName: string,
    options: USFMProcessingOptions = {},
    startedAt = Date.now()
  ): ProcessedScripture {
    const includeAlignments = options.includeAlignments !== false
    const includeWordTokens = options.includeWordTokens !== false

    const wordAlignments = includeAlignments
      ? alignmentMapToWordAlignments(alignmentMap, bookCode)
      : []

    const chapters = includeWordTokens
      ? wordsToChapters(bookCode, collectUsjWords(usj))
      : []

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

    const scripture: ProcessedScripture = {
      book: bookName,
      bookCode,
      metadata: {
        bookCode,
        bookName,
        processingDate: new Date().toISOString(),
        processingDuration: Date.now() - startedAt,
        version: USJ_PROCESSING_VERSION,
        hasAlignments: wordAlignments.length > 0,
        hasSections: false,
        hasWordTokens: includeWordTokens && totalWordTokens > 0,
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
          totalWordTokens: includeWordTokens ? totalWordTokens : undefined,
        },
      },
      chapters,
      alignments: wordAlignments.length > 0 ? wordAlignments : undefined,
    }

    if (includeWordTokens && wordAlignments.length > 0) {
      attachAlignmentSemanticIds(
        scripture,
        scripture.chapters.flatMap((c) => c.verses)
      )
    }

    return scripture
  }

  /**
   * Build a cacheable USJ SoT payload (with chapter slices for IndexedDB chunking).
   */
  toUsjCacheContent(
    result: USJProcessResult,
    bookCode: string,
    bookName: string
  ): UsjScriptureCacheContent {
    const slices = splitUsjByChapter(result.usj)
    const chapters = slices
      .filter((s) => s.chapter > 0)
      .map((s) => ({ number: s.chapter, content: s.nodes }))

    return {
      book: bookName,
      bookCode,
      metadata: {
        version: USJ_PROCESSING_VERSION,
        toolVersions: { ...USJ_TOOL_VERSIONS },
        processingDate: new Date().toISOString(),
        bookCode,
        bookName,
      },
      usj: result.usj,
      alignmentMap: result.alignmentMap,
      chapters: chapters.length > 0 ? chapters : undefined,
    }
  }

  /**
   * Rebuild ProcessedScripture from a reassembled USJ cache entry.
   */
  fromUsjCacheContent(
    cached: UsjScriptureCacheContent,
    bookCode: string,
    bookName?: string,
    options?: USFMProcessingOptions
  ): ProcessedScripture {
    if (!isUsjCacheVersionCompatible(cached.metadata)) {
      throw new Error(
        `USJ cache version mismatch: got ${cached.metadata?.version}/${JSON.stringify(cached.metadata?.toolVersions)}, expected ${USJ_PROCESSING_VERSION}/${JSON.stringify(USJ_TOOL_VERSIONS)}`
      )
    }

    const usj =
      cached.usj ??
      (cached.chapters
        ? rebuildUsjFromChapters(cached.chapters, '3.0')
        : null)
    if (!usj) {
      throw new Error('USJ cache entry missing usj document and chapters')
    }
    const alignmentMap = cached.alignmentMap ?? {}
    return this.adaptFromUsj(
      usj,
      alignmentMap,
      bookCode,
      bookName ?? cached.book ?? bookCode,
      options
    )
  }
}
