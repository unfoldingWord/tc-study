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
import { useCacheAdapter, useCurrentReference, useLoaderRegistry } from '../../../../contexts'
import { backgroundDownloadSession } from '../../../../features/download/backgroundDownloadSession'
import { enqueueOriginalLanguageDownload } from '../../../../features/download/ensureOriginalLanguageDownload'
import {
  loadOriginalLanguageChapters,
  resolveOriginalLanguageKey,
  type OriginalLanguageResource,
} from '../../../../features/helps/olLoadCache'
import { isOriginalLanguageQuoteBlocked } from '../../../../features/helps/resolveHelpsQuoteStatus'
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

function olSpanKey(book: string, chapter: number, endChapter: number): string {
  return `${book}:${chapter}:${endChapter}`
}

export function useOriginalLanguageContent({
  scriptureRevision = '',
}: UseOriginalLanguageContentOptions) {
  const currentRef = useCurrentReference()
  const loaderRegistry = useLoaderRegistry()
  const cacheAdapter = useCacheAdapter()
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
  const [loadedSpan, setLoadedSpan] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [retryTick, setRetryTick] = useState(0)
  const [olDownloadTick, setOlDownloadTick] = useState(0)
  const lastAttemptedRevisionRef = useRef<string | null>(null)
  const lastAttemptedDownloadTickRef = useRef<number | null>(null)
  const loadedSpanRef = useRef('')
  const enqueuedOlKeyRef = useRef('')
  const contentRef = useRef(originalContent)
  contentRef.current = originalContent

  const startChapter = helpsRef.chapter || 1
  const endChapter = helpsRef.endChapter || startChapter
  const nextSpan = olSpanKey(helpsRef.book || '', startChapter, endChapter)

  useEffect(() => {
    lastAttemptedRevisionRef.current = null
    lastAttemptedDownloadTickRef.current = null
    enqueuedOlKeyRef.current = ''
    loadedSpanRef.current = ''
    // Wrong-testament OL must not keep quote-build "ready" (UGNT ≠ UHB).
    setOriginalContent(null)
    setLoadedSpan('')
    setError(null)
  }, [helpsRef.book])

  useEffect(() => {
    if (
      !shouldRetryOriginalLanguageLoad({
        hasOriginalContent: !!(originalContent && originalContent.length > 0),
        scriptureRevision,
        lastAttemptedRevision: lastAttemptedRevisionRef.current,
        olDownloadTick,
        lastAttemptedDownloadTick: lastAttemptedDownloadTickRef.current,
      })
    ) {
      return
    }
    lastAttemptedRevisionRef.current = scriptureRevision
    lastAttemptedDownloadTickRef.current = olDownloadTick
    setRetryTick((n) => n + 1)
  }, [scriptureRevision, originalContent, olDownloadTick])

  useEffect(() => {
    const book = helpsRef.book || ''
    const olKey = resolveOriginalLanguageKey(book)?.resourceKey
    if (!olKey) return
    return backgroundDownloadSession.subscribe((s) => {
      if (s.error) {
        enqueuedOlKeyRef.current = ''
      }
      if (!s.completedResourceKeys.includes(olKey)) return
      if (contentRef.current && contentRef.current.length > 0) return
      setOlDownloadTick((n) => n + 1)
    })
  }, [helpsRef.book])

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
        setLoading(true)
        setError(null)

        const bookCode = helpsRef.book?.toUpperCase() || ''
        const resource = resolveOriginalLanguageKey(bookCode)
        if (!resource) {
          setLoading(false)
          return
        }

        if (cancelled) return
        setOriginalLanguageResources([resource])

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
          cache: cacheAdapter,
          allowDcs: true,
        })
        if (cancelled) return

        // `[]` = attempted empty (distinct from first-paint `null`)
        loadedSpanRef.current = nextSpan
        setLoadedSpan(nextSpan)
        setOriginalContent(optimized)

        if (optimized.length === 0) {
          if (enqueuedOlKeyRef.current !== resource.resourceKey) {
            enqueuedOlKeyRef.current = resource.resourceKey
            enqueueOriginalLanguageDownload(resource.resourceKey)
          }
        }
      } catch (err) {
        if (cancelled) return
        console.error('❌ [useOriginalLanguageContent] Failed to load original language content:', err)
        console.error('❌ [useOriginalLanguageContent] Error details:', {
          message: err instanceof Error ? err.message : String(err),
          stack: err instanceof Error ? err.stack : undefined,
        })
        loadedSpanRef.current = nextSpan
        setLoadedSpan(nextSpan)
        setOriginalContent([])
        setError(err instanceof Error ? err.message : 'Failed to load original language content')
        const olKey = resolveOriginalLanguageKey(helpsRef.book || '')?.resourceKey
        if (olKey && enqueuedOlKeyRef.current !== olKey) {
          enqueuedOlKeyRef.current = olKey
          enqueueOriginalLanguageDownload(olKey)
        }
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
    startChapter,
    endChapter,
    nextSpan,
    loaderRegistry,
    cacheAdapter,
    retryTick,
  ])

  const spanMatches = loadedSpan === nextSpan
  const spanContent = spanMatches ? originalContent : null

  return {
    originalLanguageResources,
    originalContent: spanContent,
    loading: loading || !spanMatches,
    error: spanMatches ? error : null,
    olBlocked: isOriginalLanguageQuoteBlocked({
      loadingOriginal: loading || !spanMatches,
      originalContent: spanContent,
      originalError: spanMatches ? error : null,
    }),
  }
}
