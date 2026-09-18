/**
 * Stream off-focus-chapter TWL article matches after first paint.
 * Walks one chapter (or a fallback chunk) per idle slice — never flattens
 * the whole book on the main thread.
 */

import { startTransition, useEffect, useRef, useState } from 'react'
import { scheduleIdle } from '../../utils/scheduleIdle'
import { bookFilterContentReady } from './bookFilterQuoteWarm'
import {
  chapterMapNoteCount,
  filterTwlArticleFallbackChunk,
  planSupportRefStreamChapters,
  streamRowsForChapter,
  SUPPORT_REF_STREAM_FALLBACK_CHUNK,
  twlArticleLinksForChapter,
} from './helpsDisplayFilters'

export const TWL_ARTICLE_STREAM_CHAPTERS_PER_SLICE = 3

export function useTwlArticleBookStream<
  T extends { id: string; reference: string; articlePath?: string; twLink?: string },
>(args: {
  enabled: boolean
  linksByChapter?: Record<string, T[]> | null
  fallbackLinks?: T[] | null
  articlePath: string
  focusChapter: number
}): { streamedLinks: T[]; streamPending: boolean } {
  const { enabled, linksByChapter, fallbackLinks, articlePath, focusChapter } = args
  const [streamedLinks, setStreamedLinks] = useState<T[]>([])
  const [streamPending, setStreamPending] = useState(false)
  const linksByChapterRef = useRef(linksByChapter)
  linksByChapterRef.current = linksByChapter
  const fallbackLinksRef = useRef(fallbackLinks)
  fallbackLinksRef.current = fallbackLinks
  const contentReady = bookFilterContentReady(linksByChapter, fallbackLinks)

  useEffect(() => {
    if (!enabled || !articlePath || !contentReady) {
      setStreamedLinks([])
      setStreamPending(false)
      return
    }

    let cancelled = false
    const seen = new Set<string>()
    // Only clear/restart when the article filter identity changes — chapter
    // jumps must not wipe already-streamed off-focus rows.
    setStreamedLinks([])
    setStreamPending(true)
    const focusAtStart = focusChapter

    const flush = (batch: T[]) => {
      if (cancelled || batch.length === 0) return
      for (const link of batch) seen.add(link.id)
      startTransition(() => {
        setStreamedLinks((prev) => (prev.length === 0 ? batch : prev.concat(batch)))
      })
    }

    const cancelIdle = scheduleIdle(() => {
      void (async () => {
        const chapters = planSupportRefStreamChapters(
          linksByChapterRef.current,
          focusAtStart,
          fallbackLinksRef.current
        )
        let slice: T[] = []
        let chaptersInSlice = 0
        const yieldSlice = () =>
          new Promise<void>((resolve) => {
            scheduleIdle(() => resolve(), 50)
          })

        for (const chapter of chapters) {
          if (cancelled) return
          const matches = twlArticleLinksForChapter(
            streamRowsForChapter(linksByChapterRef.current, fallbackLinksRef.current, chapter),
            articlePath
          )
          if (matches.length) slice.push(...matches)
          chaptersInSlice += 1
          if (
            chaptersInSlice >= TWL_ARTICLE_STREAM_CHAPTERS_PER_SLICE ||
            slice.length >= SUPPORT_REF_STREAM_FALLBACK_CHUNK
          ) {
            flush(slice)
            slice = []
            chaptersInSlice = 0
            await yieldSlice()
          }
        }
        if (slice.length) flush(slice)

        const fallback = fallbackLinksRef.current ?? []
        const mapCount = chapterMapNoteCount(linksByChapterRef.current)
        if (!cancelled && fallback.length > mapCount) {
          for (let i = 0; i < fallback.length; i += SUPPORT_REF_STREAM_FALLBACK_CHUNK) {
            if (cancelled) return
            const extra = filterTwlArticleFallbackChunk(
              fallback.slice(i, i + SUPPORT_REF_STREAM_FALLBACK_CHUNK),
              articlePath,
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
  }, [enabled, articlePath, contentReady])

  return { streamedLinks, streamPending }
}
