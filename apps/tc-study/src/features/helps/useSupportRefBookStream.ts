/**
 * Stream book-wide support-ref matches after first paint (see useBookFilterStream).
 */

import {
  filterSupportRefFallbackChunk,
  supportRefNotesForChapter,
} from './helpsDisplayFilters'
import { BOOK_FILTER_STREAM_CHAPTERS_PER_SLICE, useBookFilterStream } from './useBookFilterStream'

export const SUPPORT_REF_STREAM_CHAPTERS_PER_SLICE = BOOK_FILTER_STREAM_CHAPTERS_PER_SLICE

export function useSupportRefBookStream<
  T extends { id: string; reference: string; supportReference?: string },
>(args: {
  enabled: boolean
  notesByChapter?: Record<string, T[]> | null
  fallbackNotes?: T[] | null
  supportReference: string
  focusChapter: number
}): { streamedNotes: T[]; streamPending: boolean } {
  const { streamedRows, streamPending } = useBookFilterStream<T>({
    enabled: args.enabled,
    byChapter: args.notesByChapter,
    fallback: args.fallbackNotes,
    filterKey: args.supportReference,
    focusChapter: args.focusChapter,
    matchRows: supportRefNotesForChapter,
    filterFallbackChunk: filterSupportRefFallbackChunk,
  })
  return { streamedNotes: streamedRows, streamPending }
}
