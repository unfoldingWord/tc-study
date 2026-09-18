/**
 * Stream off-focus-chapter support-ref matches after first paint.
 * Walks one chapter (or a fallback chunk) per idle slice — never flattens
 * the whole book on the main thread.
 */

import { startTransition, useEffect, useRef, useState } from 'react'
import { scheduleIdle } from '../../utils/scheduleIdle'
import { bookFilterContentReady } from './bookFilterQuoteWarm'
import {
  chapterMapNoteCount,
  filterSupportRefFallbackChunk,
  planSupportRefStreamChapters,
  streamRowsForChapter,
  SUPPORT_REF_STREAM_FALLBACK_CHUNK,
  supportRefNotesForChapter,
} from './helpsDisplayFilters'

export const SUPPORT_REF_STREAM_CHAPTERS_PER_SLICE = 3

export function useSupportRefBookStream<
  T extends { id: string; reference: string; supportReference?: string },
>(args: {
  enabled: boolean
  notesByChapter?: Record<string, T[]> | null
  fallbackNotes?: T[] | null
  supportReference: string
  focusChapter: number
}): { streamedNotes: T[]; streamPending: boolean } {
  const { enabled, notesByChapter, fallbackNotes, supportReference, focusChapter } = args
  const [streamedNotes, setStreamedNotes] = useState<T[]>([])
  const [streamPending, setStreamPending] = useState(false)
  const notesByChapterRef = useRef(notesByChapter)
  notesByChapterRef.current = notesByChapter
  const fallbackNotesRef = useRef(fallbackNotes)
  fallbackNotesRef.current = fallbackNotes
  const contentReady = bookFilterContentReady(notesByChapter, fallbackNotes)

  useEffect(() => {
    if (!enabled || !supportReference || !contentReady) {
      setStreamedNotes([])
      setStreamPending(false)
      return
    }

    let cancelled = false
    const seen = new Set<string>()
    // Only clear/restart when the filter identity changes — chapter jumps must
    // not wipe already-streamed off-focus rows (leaves cards stuck pending).
    setStreamedNotes([])
    setStreamPending(true)
    const focusAtStart = focusChapter

    const flush = (batch: T[]) => {
      if (cancelled || batch.length === 0) return
      for (const note of batch) seen.add(note.id)
      startTransition(() => {
        setStreamedNotes((prev) => (prev.length === 0 ? batch : prev.concat(batch)))
      })
    }

    const cancelIdle = scheduleIdle(() => {
      void (async () => {
        const chapters = planSupportRefStreamChapters(
          notesByChapterRef.current,
          focusAtStart,
          fallbackNotesRef.current
        )
        let slice: T[] = []
        let chaptersInSlice = 0
        const yieldSlice = () =>
          new Promise<void>((resolve) => {
            scheduleIdle(() => resolve(), 50)
          })

        for (const chapter of chapters) {
          if (cancelled) return
          const matches = supportRefNotesForChapter(
            streamRowsForChapter(notesByChapterRef.current, fallbackNotesRef.current, chapter),
            supportReference
          )
          if (matches.length) slice.push(...matches)
          chaptersInSlice += 1
          if (
            chaptersInSlice >= SUPPORT_REF_STREAM_CHAPTERS_PER_SLICE ||
            slice.length >= SUPPORT_REF_STREAM_FALLBACK_CHUNK
          ) {
            flush(slice)
            slice = []
            chaptersInSlice = 0
            await yieldSlice()
          }
        }
        if (slice.length) flush(slice)

        const fallback = fallbackNotesRef.current ?? []
        const mapCount = chapterMapNoteCount(notesByChapterRef.current)
        if (!cancelled && fallback.length > mapCount) {
          for (let i = 0; i < fallback.length; i += SUPPORT_REF_STREAM_FALLBACK_CHUNK) {
            if (cancelled) return
            const extra = filterSupportRefFallbackChunk(
              fallback.slice(i, i + SUPPORT_REF_STREAM_FALLBACK_CHUNK),
              supportReference,
              focusAtStart,
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
  }, [enabled, supportReference, contentReady])

  return { streamedNotes, streamPending }
}
