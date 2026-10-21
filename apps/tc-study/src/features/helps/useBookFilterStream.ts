/**
 * Stream book-wide filter matches (support-ref / TWL article) after first paint.
 * Off-focus chapters first, then the start focus chapter so it survives
 * cross-chapter jumps. Walks one chapter (or a fallback chunk) per idle slice —
 * never flattens the whole book on the main thread.
 *
 * Restarts when the filter changes (clear) or when book content grows (keep
 * streamed rows, add the rest) — a partial chapter map at filter time must not
 * leave the list stuck on the chapters it had then.
 */

import { startTransition, useEffect, useRef, useState } from 'react'
import { scheduleIdle } from '../../utils/scheduleIdle'
import {
  bookFilterChapterMatches,
  bookFilterStreamSeed,
  bookFilterStreamSpanKey,
  chapterMapNoteCount,
  mergeFocusChapterBookMatches,
  planBookFilterStreamChapters,
  SUPPORT_REF_STREAM_FALLBACK_CHUNK,
} from './helpsDisplayFilters'

export const BOOK_FILTER_STREAM_CHAPTERS_PER_SLICE = 3

export function useBookFilterStream<T extends { id: string; reference: string }>(args: {
  enabled: boolean
  byChapter?: Record<string, T[]> | null
  fallback?: T[] | null
  /** Filter identity (support reference / article path). Empty = off. */
  filterKey: string
  focusChapter: number
  matchRows: (rows: readonly T[], filterKey: string) => T[]
  filterFallbackChunk: (
    chunk: readonly T[],
    filterKey: string,
    skipChapter: number,
    seenIds: ReadonlySet<string>
  ) => T[]
}): { streamedRows: T[]; streamPending: boolean } {
  const { enabled, byChapter, fallback, filterKey, focusChapter } = args
  const [streamedRows, setStreamedRows] = useState<T[]>([])
  const [streamPending, setStreamPending] = useState(false)
  const byChapterRef = useRef(byChapter)
  byChapterRef.current = byChapter
  const fallbackRef = useRef(fallback)
  fallbackRef.current = fallback
  const matchRowsRef = useRef(args.matchRows)
  matchRowsRef.current = args.matchRows
  const filterFallbackChunkRef = useRef(args.filterFallbackChunk)
  filterFallbackChunkRef.current = args.filterFallbackChunk
  const streamedRef = useRef<T[]>([])
  streamedRef.current = streamedRows
  const streamedFilterKeyRef = useRef<string | null>(null)
  const spanKey = bookFilterStreamSpanKey(byChapter, fallback)

  useEffect(() => {
    if (!enabled || !filterKey || !spanKey) {
      streamedFilterKeyRef.current = null
      setStreamedRows([])
      setStreamPending(false)
      return
    }

    let cancelled = false
    // Chapter jumps do not restart (focus is read once); content growth keeps rows.
    const seed = bookFilterStreamSeed(streamedFilterKeyRef.current, filterKey, streamedRef.current)
    streamedFilterKeyRef.current = filterKey
    const seen = new Set(seed.map((row) => row.id))
    if (seed.length === 0) setStreamedRows([])
    setStreamPending(true)
    const focusAtStart = focusChapter

    const flush = (batch: T[]) => {
      if (cancelled || batch.length === 0) return
      for (const row of batch) seen.add(row.id)
      startTransition(() => {
        // A cancelled run's queued batch can land after a content-growth restart.
        setStreamedRows((prev) => mergeFocusChapterBookMatches(prev, batch))
      })
    }

    const cancelIdle = scheduleIdle(() => {
      void (async () => {
        const chapters = planBookFilterStreamChapters(
          byChapterRef.current,
          focusAtStart,
          fallbackRef.current
        )
        const match = (rows: readonly T[]) => matchRowsRef.current(rows, filterKey)
        let slice: T[] = []
        let chaptersInSlice = 0
        const yieldSlice = () =>
          new Promise<void>((resolve) => {
            scheduleIdle(() => resolve(), 50)
          })

        for (const chapter of chapters) {
          if (cancelled) return
          const matches = bookFilterChapterMatches(
            byChapterRef.current,
            fallbackRef.current,
            chapter,
            match,
            seen
          )
          if (matches.length) {
            for (const row of matches) seen.add(row.id)
            slice.push(...matches)
          }
          chaptersInSlice += 1
          if (
            chaptersInSlice >= BOOK_FILTER_STREAM_CHAPTERS_PER_SLICE ||
            slice.length >= SUPPORT_REF_STREAM_FALLBACK_CHUNK
          ) {
            flush(slice)
            slice = []
            chaptersInSlice = 0
            await yieldSlice()
          }
        }
        if (slice.length) flush(slice)

        const rest = fallbackRef.current ?? []
        const mapCount = chapterMapNoteCount(byChapterRef.current)
        if (!cancelled && rest.length > mapCount) {
          for (let i = 0; i < rest.length; i += SUPPORT_REF_STREAM_FALLBACK_CHUNK) {
            if (cancelled) return
            // Focus chapter is part of the plan now — dedupe by id, skip nothing.
            const extra = filterFallbackChunkRef.current(
              rest.slice(i, i + SUPPORT_REF_STREAM_FALLBACK_CHUNK),
              filterKey,
              0,
              seen
            )
            flush(extra)
            await yieldSlice()
          }
        }

        if (!cancelled) setStreamPending(false)
      })()
    }, 80)

    return () => {
      cancelled = true
      cancelIdle()
    }
  }, [enabled, filterKey, spanKey])

  return { streamedRows, streamPending }
}
