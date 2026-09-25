/**
 * Per-book / per-chapter scripture layout cache.
 *
 * Prefer per-chapter builds (`buildUsjLayoutBlocksForChapter`) so opening
 * Psalms 1 does not walk chapters 2–150 on the main thread.
 */

import {
  buildUsjLayoutBlocks,
  buildUsjLayoutBlocksForChapter,
  collectVerseBlockSequence,
  type UsjLayoutBlock,
  type UsjScriptureViewModel,
  type UsjVerseBlockItem,
} from '@bt-synergy/scripture-loader'
import { measureScripturePerfSync } from '../../../../features/perf/scripturePerf'
import { scheduleIdle } from '../../../../utils/scheduleIdle'
import type { DisplayUsjVerse } from '../types'
import { extractBookParagraphs } from './chapterParagraphs'

export interface ChapterLayoutCacheStats {
  bookBuilds: number
  chapterBuilds: number
  chapterSequenceComputes: number
  displayVerseComputes: number
  paragraphBuilds: number
}

interface BookLayoutEntry {
  /** Full-book blocks when built; otherwise sparse. */
  blocks: UsjLayoutBlock[] | null
  blocksByChapter: Map<number, UsjLayoutBlock[]>
  sequencesByChapter: Map<number, UsjVerseBlockItem[]>
  fullBook: boolean
}

const bookCache = new WeakMap<UsjScriptureViewModel, BookLayoutEntry>()
const displayVerseCache = new WeakMap<UsjScriptureViewModel, Map<number, DisplayUsjVerse[]>>()
const paragraphCache = new WeakMap<UsjScriptureViewModel, Map<number, string[]>>()
const layoutHeights = new Map<string, number>()

const emptyStats = (): ChapterLayoutCacheStats => ({
  bookBuilds: 0,
  chapterBuilds: 0,
  chapterSequenceComputes: 0,
  displayVerseComputes: 0,
  paragraphBuilds: 0,
})

let stats = emptyStats()

export function getChapterLayoutCacheStats(): ChapterLayoutCacheStats {
  return { ...stats }
}

export function resetChapterLayoutCacheStats(): void {
  stats = emptyStats()
}

function lastChapterNumber(viewModel: UsjScriptureViewModel): number {
  let last = 0
  for (const chapter of viewModel.chapters) {
    if (chapter.number > last) last = chapter.number
  }
  return last
}

function getOrCreateBookEntry(viewModel: UsjScriptureViewModel): BookLayoutEntry {
  const existing = bookCache.get(viewModel)
  if (existing) return existing
  const entry: BookLayoutEntry = {
    blocks: null,
    blocksByChapter: new Map(),
    sequencesByChapter: new Map(),
    fullBook: false,
  }
  bookCache.set(viewModel, entry)
  return entry
}

function ensureChapterBlocks(
  viewModel: UsjScriptureViewModel,
  chapter: number
): UsjLayoutBlock[] {
  const entry = getOrCreateBookEntry(viewModel)
  const cached = entry.blocksByChapter.get(chapter)
  if (cached) return cached

  stats.chapterBuilds += 1
  const blocks = measureScripturePerfSync('layout-build', String(chapter), () =>
    buildUsjLayoutBlocksForChapter(viewModel.usj, viewModel, chapter)
  )
  entry.blocksByChapter.set(chapter, blocks)
  return blocks
}

/** Full-book layout blocks (avoid on interactive paths — prefer getChapterLayoutBlocks). */
export function getBookLayoutBlocks(viewModel: UsjScriptureViewModel): UsjLayoutBlock[] {
  const entry = getOrCreateBookEntry(viewModel)
  if (entry.fullBook && entry.blocks) return entry.blocks

  stats.bookBuilds += 1
  const blocks = measureScripturePerfSync('layout-build', 'full', () =>
    buildUsjLayoutBlocks(viewModel.usj, viewModel)
  )
  const blocksByChapter = new Map<number, UsjLayoutBlock[]>()
  for (const block of blocks) {
    let list = blocksByChapter.get(block.chapterNumber)
    if (!list) {
      list = []
      blocksByChapter.set(block.chapterNumber, list)
    }
    list.push(block)
  }
  entry.blocks = blocks
  entry.blocksByChapter = blocksByChapter
  entry.sequencesByChapter = new Map()
  entry.fullBook = true
  return blocks
}

/** Chapter slice — builds only that chapter when missing. */
export function getChapterLayoutBlocks(
  viewModel: UsjScriptureViewModel,
  chapter: number
): UsjLayoutBlock[] {
  return ensureChapterBlocks(viewModel, chapter)
}

const EMPTY_BLOCKS: UsjLayoutBlock[] = []
const EMPTY_VERSES: DisplayUsjVerse[] = []
const EMPTY_SEQUENCE: UsjVerseBlockItem[] = []
const EMPTY_PARAGRAPHS: string[] = []

export function getChapterParagraphs(
  viewModel: UsjScriptureViewModel,
  chapter: number
): string[] {
  let byChapter = paragraphCache.get(viewModel)
  if (!byChapter) {
    stats.paragraphBuilds += 1
    byChapter = extractBookParagraphs(viewModel.usj)
    paragraphCache.set(viewModel, byChapter)
  }
  return byChapter.get(chapter) ?? EMPTY_PARAGRAPHS
}

/** Seed paragraph strings from download-time prep so read path is a cache hit. */
export function seedChapterParagraphs(
  viewModel: UsjScriptureViewModel,
  paragraphsByChapter: Record<string, string[]>
): void {
  const byChapter = new Map<number, string[]>()
  for (const [key, paras] of Object.entries(paragraphsByChapter)) {
    const chapter = Number(key)
    if (!Number.isFinite(chapter) || chapter < 1) continue
    byChapter.set(chapter, paras)
  }
  if (byChapter.size === 0) return
  paragraphCache.set(viewModel, byChapter)
}

export function getChapterDisplayVerses(
  viewModel: UsjScriptureViewModel,
  chapter: number
): DisplayUsjVerse[] {
  let perChapter = displayVerseCache.get(viewModel)
  if (!perChapter) {
    perChapter = new Map()
    displayVerseCache.set(viewModel, perChapter)
  }
  const cached = perChapter.get(chapter)
  if (cached) return cached

  stats.displayVerseComputes += 1
  const chapterView = viewModel.chapters.find((item) => item.number === chapter)
  if (!chapterView) {
    perChapter.set(chapter, EMPTY_VERSES)
    return EMPTY_VERSES
  }
  const verses: DisplayUsjVerse[] = chapterView.verses.map((verse) => ({
    ...verse,
    chapterNumber: chapter,
  }))
  perChapter.set(chapter, verses)
  return verses
}

/**
 * Verse-block sequence for one chapter. `collectVerseDisplayInline` walks that
 * chapter's blocks once per verse — cache so stitching N does not redo N-1.
 */
export function getChapterVerseBlockItems(
  viewModel: UsjScriptureViewModel,
  chapter: number
): UsjVerseBlockItem[] {
  const entry = getOrCreateBookEntry(viewModel)
  const cached = entry.sequencesByChapter.get(chapter)
  if (cached) return cached

  stats.chapterSequenceComputes += 1
  const blocks = ensureChapterBlocks(viewModel, chapter)
  const verses = getChapterDisplayVerses(viewModel, chapter).map((verse) => ({
    chapter,
    verse: verse.number,
  }))
  if (verses.length === 0 && blocks.length === 0) {
    entry.sequencesByChapter.set(chapter, EMPTY_SEQUENCE)
    return EMPTY_SEQUENCE
  }
  const sequence = measureScripturePerfSync('chapter-sequence', String(chapter), () =>
    collectVerseBlockSequence(blocks, verses)
  )
  entry.sequencesByChapter.set(chapter, sequence)
  return sequence
}

function layoutHeightKey(book: string, chapter: number): string {
  return `${book.toLowerCase()}:${chapter}`
}

export function rememberChapterLayoutHeight(book: string, chapter: number, heightPx: number): void {
  if (!book || !Number.isFinite(chapter) || chapter < 1) return
  if (!Number.isFinite(heightPx) || heightPx <= 8) return
  layoutHeights.set(layoutHeightKey(book, chapter), Math.round(heightPx))
}

export function getCachedChapterLayoutHeight(book: string, chapter: number): number | null {
  if (!book || !Number.isFinite(chapter)) return null
  return layoutHeights.get(layoutHeightKey(book, chapter)) ?? null
}

export function resetChapterLayoutHeights(): void {
  layoutHeights.clear()
}

/** Idle-warm specific chapters (placeholders) without mounting token trees. */
export function prefetchChapterLayouts(
  viewModel: UsjScriptureViewModel,
  chapters: readonly number[]
): void {
  if (chapters.length === 0) return
  scheduleIdle(() => {
    for (const chapter of chapters) {
      getChapterVerseBlockItems(viewModel, chapter)
    }
  }, 400)
}

/** Idle-warm paragraph strings only — no layout token trees. */
export function prefetchChapterParagraphs(
  viewModel: UsjScriptureViewModel,
  chapters: readonly number[]
): void {
  if (chapters.length === 0) return
  scheduleIdle(() => {
    for (const chapter of chapters) {
      getChapterParagraphs(viewModel, chapter)
    }
  }, 400)
}

/** Warm the next/prev chapter off the stitch/paint path. */
export function prefetchAdjacentChapterLayouts(
  viewModel: UsjScriptureViewModel,
  mounted: readonly number[]
): void {
  if (mounted.length === 0) return
  const last = lastChapterNumber(viewModel)
  const lo = Math.min(...mounted)
  const hi = Math.max(...mounted)
  const neighbors = [lo - 1, hi + 1].filter((chapter) => chapter >= 1 && chapter <= last)
  prefetchChapterLayouts(viewModel, neighbors)
}

/** Idle-prefetch paragraph strings for chapters next to the painted window. */
export function prefetchAdjacentChapterParagraphs(
  viewModel: UsjScriptureViewModel,
  mounted: readonly number[]
): void {
  if (mounted.length === 0) return
  const last = lastChapterNumber(viewModel)
  const lo = Math.min(...mounted)
  const hi = Math.max(...mounted)
  const neighbors = [lo - 1, hi + 1].filter((chapter) => chapter >= 1 && chapter <= last)
  prefetchChapterParagraphs(viewModel, neighbors)
}

// silence unused when EMPTY_BLOCKS only referenced historically
void EMPTY_BLOCKS
