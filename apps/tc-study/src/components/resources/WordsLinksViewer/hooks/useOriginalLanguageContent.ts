/**
 * useOriginalLanguageContent Hook
 *
 * Loads original-language scripture (UGNT/UHB) as OptimizedChapter[] for QuoteMatcher.
 * Primary path: ScriptureLoader.loadViewModel → viewModelToOptimizedChapters.
 * Concurrent TN/TWL mounts share one load via olLoadCache.
 */

import type { OptimizedChapter } from '@bt-synergy/resource-parsers'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { useEffect, useRef, useState } from 'react'
import { useCurrentReference, useLoaderRegistry } from '../../../../contexts'
import {
  loadOriginalLanguageChapters,
  resolveOriginalLanguageKey,
  type OriginalLanguageResource,
} from '../../../../features/helps/olLoadCache'
import { shouldRetryOriginalLanguageLoad } from '../../../../features/helps/scriptureReadyUnderlineRebind'
import {
  pinReferenceWhileScrolling,
  shouldHydrateHelpsForChapter,
} from '../../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'

interface UseOriginalLanguageContentOptions {
  resourceKey: string // TWL resource key (e.g., "unfoldingWord/en/twl")
  resourceId: string // TWL viewer resource ID (not used but kept for API consistency)
  /** Scripture content revision — retry UGNT/UHB load when USJ arrives after a miss. */
  scriptureRevision?: string
}

export { resolveOriginalLanguageKey } from '../../../../features/helps/olLoadCache'

export function useOriginalLanguageContent({
  scriptureRevision = '',
}: UseOriginalLanguageContentOptions) {
  const currentRef = useCurrentReference()
  const loaderRegistry = useLoaderRegistry()
  const scrollActivity = useChapterScrollActivity()
  const helpsRef = pinReferenceWhileScrolling(currentRef, scrollActivity)
  const allowChapterHydrate = shouldHydrateHelpsForChapter({
    unsettled: scrollActivity.unsettled,
    requestedChapter: helpsRef.chapter,
    settledChapter: scrollActivity.settledChapter,
  })

  const [originalLanguageResources, setOriginalLanguageResources] = useState<
    OriginalLanguageResource[]
  >([])
  const [originalContent, setOriginalContent] = useState<OptimizedChapter[] | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const lastAttemptedRevisionRef = useRef<string | null>(null)
  const loadedSpanRef = useRef('')
  const contentRef = useRef(originalContent)
  contentRef.current = originalContent

  useEffect(() => {
    lastAttemptedRevisionRef.current = null
  }, [helpsRef.book, helpsRef.chapter, helpsRef.endChapter])

  useEffect(() => {
    if (
      !shouldRetryOriginalLanguageLoad({
        hasOriginalContent: !!(originalContent && originalContent.length > 0),
        scriptureRevision,
        lastAttemptedRevision: lastAttemptedRevisionRef.current,
      })
    ) {
      return
    }
    lastAttemptedRevisionRef.current = scriptureRevision
    setRetryTick((n) => n + 1)
  }, [scriptureRevision, originalContent])

  useEffect(() => {
    if (!allowChapterHydrate) return
    if (!helpsRef.book || !helpsRef.chapter || !loaderRegistry) {
      return
    }

    // OBS is not a biblical book — it has no Hebrew/Greek original language
    if (helpsRef.book.toLowerCase() === 'obs') {
      setLoading(false)
      setOriginalContent(null)
      return
    }

    let cancelled = false

    const loadOriginalContent = async () => {
      try {
        const hasStale = (contentRef.current?.length ?? 0) > 0
        if (!hasStale) setLoading(true)
        setError(null)

        const bookCode = helpsRef.book?.toUpperCase() || ''
        const resource = resolveOriginalLanguageKey(bookCode)
        if (!resource) {
          setLoading(false)
          return
        }

        if (cancelled) return
        setOriginalLanguageResources([resource])

        const startChapter = helpsRef.chapter
        const endChapter = helpsRef.endChapter || startChapter

        const loader = loaderRegistry.getLoader('scripture') as ScriptureLoader | undefined
        if (!loader || typeof loader.loadViewModel !== 'function') {
          throw new Error('Scripture loader with loadViewModel not found')
        }

        const optimized = await loadOriginalLanguageChapters({
          loader,
          olKey: resource.resourceKey,
          bookId: helpsRef.book,
          startChapter,
          endChapter,
        })
        if (cancelled) return

        // `[]` = attempted empty (distinct from first-paint `null`)
        loadedSpanRef.current = `${helpsRef.book}:${helpsRef.chapter}:${helpsRef.endChapter || helpsRef.chapter}`
        setOriginalContent(optimized)
      } catch (err) {
        if (cancelled) return
        console.error('❌ [useOriginalLanguageContent] Failed to load original language content:', err)
        console.error('❌ [useOriginalLanguageContent] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        setError(err instanceof Error ? err.message : 'Failed to load original language content')
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void loadOriginalContent()

    return () => {
      cancelled = true
    }
  }, [
    allowChapterHydrate,
    helpsRef.book,
    helpsRef.chapter,
    helpsRef.endChapter,
    loaderRegistry,
    retryTick,
  ])

  return {
    originalLanguageResources,
    originalContent,
    loading,
    error,
  }
}
