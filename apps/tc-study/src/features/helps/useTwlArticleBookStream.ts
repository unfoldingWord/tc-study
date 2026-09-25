/**
 * Stream book-wide TWL article matches after first paint (see useBookFilterStream).
 */

import {
  filterTwlArticleFallbackChunk,
  twlArticleLinksForChapter,
} from './helpsDisplayFilters'
import { BOOK_FILTER_STREAM_CHAPTERS_PER_SLICE, useBookFilterStream } from './useBookFilterStream'

export const TWL_ARTICLE_STREAM_CHAPTERS_PER_SLICE = BOOK_FILTER_STREAM_CHAPTERS_PER_SLICE

export function useTwlArticleBookStream<
  T extends { id: string; reference: string; articlePath?: string; twLink?: string },
>(args: {
  enabled: boolean
  linksByChapter?: Record<string, T[]> | null
  fallbackLinks?: T[] | null
  articlePath: string
  focusChapter: number
}): { streamedLinks: T[]; streamPending: boolean } {
  const { streamedRows, streamPending } = useBookFilterStream<T>({
    enabled: args.enabled,
    byChapter: args.linksByChapter,
    fallback: args.fallbackLinks,
    filterKey: args.articlePath,
    focusChapter: args.focusChapter,
    matchRows: twlArticleLinksForChapter,
    filterFallbackChunk: filterTwlArticleFallbackChunk,
  })
  return { streamedLinks: streamedRows, streamPending }
}
