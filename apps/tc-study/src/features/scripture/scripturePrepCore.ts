/**
 * Pure prep helpers shared by the scripture prep worker and download path.
 * No React / DOM imports.
 */

import {
  buildUsjLayoutBlocks,
  collectVerseBlockSequence,
  type UsjLayoutBlock,
  type UsjScriptureViewModel,
} from '@bt-synergy/scripture-loader'
import type { OptimizedChapter, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { buildQuoteTokens } from '../helps/quoteTokens/buildQuoteTokens'
import { attachFoldedMatchKeysToViewModel } from '../../components/resources/ScriptureViewer/utils/wordIdentity'

export function prepareViewModel(viewModel: UsjScriptureViewModel): UsjScriptureViewModel {
  return attachFoldedMatchKeysToViewModel(viewModel)
}

export function buildLayoutForBook(viewModel: UsjScriptureViewModel): {
  blocks: UsjLayoutBlock[]
  blocksByChapter: Record<string, UsjLayoutBlock[]>
} {
  const blocks = buildUsjLayoutBlocks(viewModel.usj, viewModel)
  const blocksByChapter: Record<string, UsjLayoutBlock[]> = {}
  for (const block of blocks) {
    const key = String(block.chapterNumber)
    if (!blocksByChapter[key]) blocksByChapter[key] = []
    blocksByChapter[key]!.push(block)
  }
  return { blocks, blocksByChapter }
}

export function chapterSequencePayload(
  viewModel: UsjScriptureViewModel,
  chapter: number
): ReturnType<typeof collectVerseBlockSequence> {
  const { blocksByChapter } = buildLayoutForBook(viewModel)
  const blocks = blocksByChapter[String(chapter)] ?? []
  const chapterView = viewModel.chapters.find((c) => c.number === chapter)
  const verses = (chapterView?.verses ?? []).map((v) => ({
    chapter,
    verse: v.number,
  }))
  return collectVerseBlockSequence(blocks, verses)
}

export function batchBuildQuoteTokens(args: {
  links: TranslationWordsLink[]
  originalChapters: OptimizedChapter[]
  bookCode: string
}): Array<{ index: number; tokens: ReturnType<typeof buildQuoteTokens> }> {
  return args.links.map((link, index) => ({
    index,
    tokens: buildQuoteTokens({
      link,
      originalChapters: args.originalChapters,
      bookCode: args.bookCode,
    }),
  }))
}
