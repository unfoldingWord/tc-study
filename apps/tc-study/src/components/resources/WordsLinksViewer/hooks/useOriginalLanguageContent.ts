/**
 * useOriginalLanguageContent Hook
 *
 * Loads original-language scripture (UGNT/UHB) as OptimizedChapter[] for QuoteMatcher.
 * Primary path: ScriptureLoader.loadViewModel → viewModelToOptimizedChapters.
 */

import type { OptimizedChapter } from '@bt-synergy/resource-parsers'
import {
  ScriptureLoader,
  viewModelChapterToOptimized,
} from '@bt-synergy/scripture-loader'
import { useEffect, useRef, useState } from 'react'
import { useCurrentReference, useLoaderRegistry } from '../../../../contexts'
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

interface OriginalLanguageResource {
  resourceKey: string
  language: string
  bookCode: string
}

export function useOriginalLanguageContent({
  resourceKey,
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
        setLoading(true)
        setError(null)
        setOriginalContent(null)

        const bookCode = helpsRef.book?.toUpperCase() || ''

        const ntBooks = [
          'MAT',
          'MRK',
          'LUK',
          'JHN',
          'ACT',
          'ROM',
          '1CO',
          '2CO',
          'GAL',
          'EPH',
          'PHP',
          'COL',
          '1TH',
          '2TH',
          '1TI',
          '2TI',
          'TIT',
          'PHM',
          'HEB',
          'JAS',
          '1PE',
          '2PE',
          '1JN',
          '2JN',
          '3JN',
          'JUD',
          'REV',
        ]
        const isNT = ntBooks.includes(bookCode)

        const resources: OriginalLanguageResource[] = []

        // Always try the painted OL key. Catalog metadata is a hint only —
        // UHB is often in the workspace/loader cache before catalog get() lands.
        if (isNT) {
          const greekResourceKey = 'unfoldingWord/el-x-koine/ugnt'
          resources.push({
            resourceKey: greekResourceKey,
            language: 'el-x-koine',
            bookCode,
          })
        } else {
          const hebrewResourceKey = 'unfoldingWord/hbo/uhb'
          resources.push({
            resourceKey: hebrewResourceKey,
            language: 'hbo',
            bookCode,
          })
        }

        if (cancelled) return
        setOriginalLanguageResources(resources)

        if (resources.length === 0) {
          setLoading(false)
          return
        }

        const resource = resources[0]
        const startChapter = helpsRef.chapter
        const endChapter = helpsRef.endChapter || startChapter

        const loader = loaderRegistry.getLoader('scripture') as ScriptureLoader | undefined
        if (!loader || typeof loader.loadViewModel !== 'function') {
          throw new Error('Scripture loader with loadViewModel not found')
        }

        const viewModel = await loader.loadViewModel(resource.resourceKey, helpsRef.book)
        if (cancelled) return

        const optimized: OptimizedChapter[] = []
        for (let chapter = startChapter; chapter <= endChapter; chapter++) {
          const row = viewModelChapterToOptimized(viewModel, chapter)
          if (row) optimized.push(row)
        }

        if (optimized.length === 0) {
          // `[]` = attempted empty (distinct from first-paint `null`)
          setOriginalContent([])
          setLoading(false)
          return
        }

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

    loadOriginalContent()

    return () => {
      cancelled = true
    }
  }, [
    allowChapterHydrate,
    helpsRef.book,
    helpsRef.chapter,
    helpsRef.endChapter,
    loaderRegistry,
    resourceKey,
    retryTick,
  ])

  return {
    originalLanguageResources,
    originalContent,
    loading,
    error,
  }
}
