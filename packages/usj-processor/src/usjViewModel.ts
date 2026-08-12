/**
 * USJ-native scripture view model — runtime SoT for identity + alignments.
 *
 * Parse/cache SoT remains: UsjDocument + AlignmentMap (under scripture-usj:).
 * This view model is the derived runtime contract Viewer / Panels consume
 * (directly, or via thin projectToProcessedScripture projection).
 */

import type { AlignmentMap } from './usfmTools'
import {
  assignSurfaceOccurrences,
  remapVerseRefBookCode,
  semanticIdFor,
} from './identity'
import type { CachedUsjDocument } from './usjCacheTypes'
import { collectUsjWords, parseVerseSid } from './usjWalk'
import { USJ_PROCESSING_VERSION, USJ_TOOL_VERSIONS, type UsjToolVersions } from './versions'

/** One highlightable word derived from a USJ `\w` node. */
export interface UsjWordToken {
  /** `${verseRef}:${content}:${occurrence}` — highlight / underline match key */
  semanticId: string
  /** Inflected Unicode surface from `\w` */
  content: string
  /** Verse-wide 1-based occurrence (case-insensitive count) */
  occurrence: number
  totalOccurrences: number
  /** BookCode-normalized verse ref, e.g. `tit 1:1` */
  verseRef: string
  /**
   * OL semantic IDs this gateway token aligns to.
   * Empty for original-language resources (UGNT/UHB) or unaligned words.
   */
  alignedOriginalWordIds: string[]
}

export interface UsjVerseView {
  number: number
  reference: string
  text: string
  tokens: UsjWordToken[]
}

export interface UsjChapterView {
  number: number
  verses: UsjVerseView[]
}

/**
 * Runtime view of a book after USFM → USJ parse + AlignmentMap strip.
 * Does not embed the full USJ tree on every chapter — see `usj` / `alignmentMap`.
 */
export interface UsjScriptureViewModel {
  bookCode: string
  bookName: string
  processingVersion: string
  toolVersions: UsjToolVersions
  /** Raw USJ document (pre-strip; keeps `\w` for surface walks) */
  usj: CachedUsjDocument
  /** Alignment groups keyed by verse ref (from stripAlignments) */
  alignmentMap: AlignmentMap
  chapters: UsjChapterView[]
}

export interface BuildUsjViewModelParams {
  usj: CachedUsjDocument
  alignmentMap: AlignmentMap
  bookCode: string
  bookName: string
}

function groupsForVerse(
  alignmentMap: AlignmentMap,
  verseRef: string,
  bookCode: string
): AlignmentMap[string] {
  const direct = alignmentMap[verseRef]
  if (direct?.length) return direct

  // AlignmentMap keys usually use uppercase book from USJ sid
  const upper = remapVerseRefBookCode(verseRef, bookCode.toUpperCase())
  if (alignmentMap[upper]?.length) return alignmentMap[upper]

  const lower = remapVerseRefBookCode(verseRef, bookCode.toLowerCase())
  if (alignmentMap[lower]?.length) return alignmentMap[lower]

  // Last resort: case-insensitive key scan
  const target = verseRef.toLowerCase()
  for (const [k, groups] of Object.entries(alignmentMap)) {
    if (k.toLowerCase() === target && groups?.length) return groups
  }
  return []
}

/**
 * Attach alignedOriginalWordIds from AlignmentMap onto gateway tokens.
 * Same matching rules as legacy attachAlignmentSemanticIds (target word order + surface).
 */
export function attachAlignedOriginalWordIds(
  tokens: UsjWordToken[],
  verseRef: string,
  alignmentMap: AlignmentMap,
  bookCode: string
): void {
  const groups = groupsForVerse(alignmentMap, verseRef, bookCode)
  if (groups.length === 0) return

  const alignmentUsage = new Map<
    string,
    Array<{ group: (typeof groups)[0]; used: boolean }>
  >()

  for (const group of groups) {
    for (const target of group.targets) {
      const key = target.word.toLowerCase()
      if (!alignmentUsage.has(key)) alignmentUsage.set(key, [])
      alignmentUsage.get(key)!.push({ group, used: false })
    }
  }

  const wordOccurrences = new Map<string, number>()
  for (const token of tokens) {
    const tokenContent = token.content.toLowerCase()
    const currentOcc = (wordOccurrences.get(tokenContent) || 0) + 1
    wordOccurrences.set(tokenContent, currentOcc)

    const available = alignmentUsage.get(tokenContent) || []
    const matching = available.find((entry) => !entry.used)
    if (!matching) continue

    matching.used = true
    const { group } = matching
    const sourceSemanticIds = group.sources.map((source, idx) => {
      const actualText = source.content || ''
      const occurrence = source.occurrence || idx + 1
      // OL IDs use the same verseRef as the gateway token (bookCode-normalized)
      return semanticIdFor(verseRef, actualText, occurrence)
    })
    token.alignedOriginalWordIds = [...new Set(sourceSemanticIds)]
  }
}

function buildChapters(
  bookCode: string,
  usj: CachedUsjDocument,
  alignmentMap: AlignmentMap
): UsjChapterView[] {
  const words = collectUsjWords(usj)
  const byChapter = new Map<number, Map<number, string[]>>()
  const bookCodeLower = bookCode.toLowerCase()

  for (const w of words) {
    const parsed = parseVerseSid(w.verseSid)
    if (!parsed || parsed.bookCode.toLowerCase() !== bookCodeLower) continue
    if (!byChapter.has(parsed.chapter)) byChapter.set(parsed.chapter, new Map())
    const verseMap = byChapter.get(parsed.chapter)!
    if (!verseMap.has(parsed.verse)) verseMap.set(parsed.verse, [])
    verseMap.get(parsed.verse)!.push(w.content)
  }

  const chapters: UsjChapterView[] = []
  for (const chapterNum of [...byChapter.keys()].sort((a, b) => a - b)) {
    const verseMap = byChapter.get(chapterNum)!
    const verses: UsjVerseView[] = []
    for (const verseNum of [...verseMap.keys()].sort((a, b) => a - b)) {
      const surfaces = verseMap.get(verseNum)!
      const reference = `${bookCode} ${chapterNum}:${verseNum}`
      const occs = assignSurfaceOccurrences(surfaces)
      const tokens: UsjWordToken[] = occs.map((o) => ({
        semanticId: semanticIdFor(reference, o.content, o.occurrence),
        content: o.content,
        occurrence: o.occurrence,
        totalOccurrences: o.totalOccurrences,
        verseRef: reference,
        alignedOriginalWordIds: [],
      }))
      attachAlignedOriginalWordIds(tokens, reference, alignmentMap, bookCode)
      verses.push({
        number: verseNum,
        reference,
        text: surfaces.join(' '),
        tokens,
      })
    }
    chapters.push({ number: chapterNum, verses })
  }
  return chapters
}

/** Build the USJ-native runtime view model from parse SoT (USJ + AlignmentMap). */
export function buildUsjViewModel(params: BuildUsjViewModelParams): UsjScriptureViewModel {
  const { usj, alignmentMap, bookCode, bookName } = params
  return {
    bookCode,
    bookName,
    processingVersion: USJ_PROCESSING_VERSION,
    toolVersions: { ...USJ_TOOL_VERSIONS },
    usj,
    alignmentMap,
    chapters: buildChapters(bookCode, usj, alignmentMap),
  }
}

/** Flatten all word tokens (optional chapter filter). */
export function flattenUsjTokens(
  viewModel: UsjScriptureViewModel,
  chapterFilter: number | 'all' = 'all'
): UsjWordToken[] {
  const out: UsjWordToken[] = []
  for (const ch of viewModel.chapters) {
    if (chapterFilter !== 'all' && ch.number !== chapterFilter) continue
    for (const v of ch.verses) {
      out.push(...v.tokens)
    }
  }
  return out
}

export function collectViewModelSemanticIdSet(
  viewModel: UsjScriptureViewModel,
  chapterFilter: number | 'all' = 'all'
): Set<string> {
  const set = new Set<string>()
  for (const t of flattenUsjTokens(viewModel, chapterFilter)) {
    set.add(t.semanticId.toLowerCase())
  }
  return set
}
