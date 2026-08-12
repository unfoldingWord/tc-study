/**
 * USJ processor — parse SoT is UsjDocument + AlignmentMap.
 *
 * Pipeline:
 *   USFM → @usfm-tools/parser.toJSON() → stripAlignments → UsjScriptureViewModel
 *   → (optional) projectToProcessedScripture for transitional UI
 *
 * Word surfaces come from USJ `char`/`w` nodes (not tokenizeGatewayUsj).
 */

import type { ProcessedScripture, USFMProcessingOptions } from '@bt-synergy/usfm-processor'

import { projectToProcessedScripture } from './projectToProcessedScripture'
import type { CachedUsjDocument, UsjScriptureCacheContent } from './usjCacheTypes'
import { buildUsjViewModel, type UsjScriptureViewModel } from './usjViewModel'
import {
  USFMParser,
  splitUsjByChapter,
  stripAlignments,
  type AlignmentMap,
} from './usfmTools'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS } from './versions'

export interface USJProcessResult {
  /** Primary runtime view model (identity + alignments derived from USJ SoT) */
  viewModel: UsjScriptureViewModel
  /**
   * Temporary projection for TokenRenderer / CombinedHelps.
   * Prefer `viewModel` for new code. Sunset when UI migrates.
   */
  scripture: ProcessedScripture
  /** Raw USJ from parser.toJSON() (pre-strip; alignments still present in tree) */
  usj: CachedUsjDocument
  /** Alignment map from stripAlignments (empty for unaligned OL) */
  alignmentMap: AlignmentMap
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
   * Parse USFM via USJ → view model (+ temporary ProcessedScripture projection).
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
    return this.fromUsjAndAlignments(usj, alignmentMap, bookCode, bookName, options)
  }

  /**
   * Build view model + projection from cached / in-memory USJ + AlignmentMap (no re-parse).
   */
  fromUsjAndAlignments(
    usj: CachedUsjDocument,
    alignmentMap: AlignmentMap,
    bookCode: string,
    bookName: string,
    options: USFMProcessingOptions = {}
  ): USJProcessResult {
    const includeAlignments = options.includeAlignments !== false
    const includeWordTokens = options.includeWordTokens !== false

    const viewModel = buildUsjViewModel({
      usj,
      alignmentMap: includeAlignments ? alignmentMap : {},
      bookCode,
      bookName,
    })

    if (!includeWordTokens) {
      viewModel.chapters = []
    }

    const scripture = projectToProcessedScripture(viewModel)
    if (options.includeAlignments === false) {
      scripture.alignments = undefined
      scripture.metadata.hasAlignments = false
    }

    return { viewModel, scripture, usj, alignmentMap }
  }

  /**
   * @deprecated Prefer fromUsjAndAlignments(...).viewModel / .scripture
   * Project cached USJ + AlignmentMap → ProcessedScripture only.
   */
  adaptFromUsj(
    usj: CachedUsjDocument,
    alignmentMap: AlignmentMap,
    bookCode: string,
    bookName: string,
    options: USFMProcessingOptions = {}
  ): ProcessedScripture {
    return this.fromUsjAndAlignments(usj, alignmentMap, bookCode, bookName, options).scripture
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
   * Rebuild full process result from a reassembled USJ cache entry.
   */
  fromUsjCacheContent(
    cached: UsjScriptureCacheContent,
    bookCode: string,
    bookName?: string,
    options?: USFMProcessingOptions
  ): ProcessedScripture {
    return this.fromUsjCacheContentFull(cached, bookCode, bookName, options).scripture
  }

  /** Full result (view model + projection) from USJ cache SoT. */
  fromUsjCacheContentFull(
    cached: UsjScriptureCacheContent,
    bookCode: string,
    bookName?: string,
    options?: USFMProcessingOptions
  ): USJProcessResult {
    if (!isUsjCacheVersionCompatible(cached.metadata)) {
      throw new Error(
        `USJ cache version mismatch: got ${cached.metadata?.version}/${JSON.stringify(cached.metadata?.toolVersions)}, expected ${USJ_PROCESSING_VERSION}/${JSON.stringify(USJ_TOOL_VERSIONS)}`
      )
    }

    const usj =
      cached.usj ??
      (cached.chapters ? rebuildUsjFromChapters(cached.chapters, '3.0') : null)
    if (!usj) {
      throw new Error('USJ cache entry missing usj document and chapters')
    }
    const alignmentMap = cached.alignmentMap ?? {}
    return this.fromUsjAndAlignments(
      usj,
      alignmentMap,
      bookCode,
      bookName ?? cached.book ?? bookCode,
      options
    )
  }
}
