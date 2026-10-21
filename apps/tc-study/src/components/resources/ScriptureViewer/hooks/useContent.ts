import {
  ScriptureLoader,
  type UsjScriptureViewModel,
} from '@bt-synergy/scripture-loader'
import { useEffect, useMemo, useState } from 'react'
import {
  useCacheAdapter,
  useCatalogManager,
  useCurrentReference,
  useLoaderRegistry,
  useNavigation,
} from '../../../../contexts'
import { useAppStore } from '../../../../contexts/AppContext'
import type { BookInfo } from '../../../../contexts/types-only'
import { defaultSectionsService } from '../../../../lib/services/default-sections'
import { mergeVerseCountsFromChapterMap } from '../../../../lib/versification'
import { RESOURCE_TYPE_IDS } from '../../../../resourceTypes/resourceTypeIds'
import { readPreparedNav } from '../../../../features/prepare/prepareCache'
import {
  markScripturePerfEnd,
  markScripturePerfStart,
} from '../../../../features/perf/scripturePerf'
import {
  buildNavRecord,
  SCRIPTURE_PREPARE_VERSION,
  type ScriptureNavRecord,
} from '../../../../features/scripture/scripturePreparer'
import { peekPreparedChapter } from '../../../../features/scripture/preparedChapterCache'
import { resolveLastChapter } from '../../../../features/nav/bookChapterCounts'
import { useWarmLanes } from '../../../../features/warm/useWarmLanes'
import { scriptureLane1Ready } from '../../../../features/warm/warmLanePolicy'
import { scheduleIdle } from '../../../../utils/scheduleIdle'
import { enqueueScriptureBookPriority } from '../../../../workers/prepareClient'
import type { DisplayUsjVerse } from '../types'
import { loadUsjViewModel } from '../utils/loadUsjViewModel'
import { resolveLane1ScriptureViewModel } from '../../../../features/sot/resolveLane1SoT'
import {
  getChapterLayoutBlocks,
  getChapterVerseBlockItems,
} from '../utils/chapterLayoutCache'
import { attachFoldedMatchKeysToChapter } from '../utils/wordIdentity'
import { lastChapterFromViewModel } from './useChapterInfiniteScroll'
import {
  applyScriptureContentLoadFailure,
  scriptureContentLoadKey,
  scriptureMetadataRevision,
} from './scriptureContentLoad'

const METADATA_POLL_MS = 250
const HARD_MISS_POLLS = 12

function chapterVerseMap<T extends { number: number }>(
  chapters: readonly T[],
  verseCount: (chapter: T) => number
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const ch of chapters) {
    map[String(ch.number)] = verseCount(ch)
  }
  return map
}

/** Open chapter first; the rest of the book is not enqueued from here. */
function enqueueBookPriority(
  resourceKey: string,
  bookId: string,
  openChapter: number,
  lastChapter: number
): void {
  void enqueueScriptureBookPriority({
    resourceKey,
    bookId,
    openChapter,
    lastChapter,
    typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
    includeRest: false,
  }).catch(() => undefined)
}

function warmCurrentChapter(vm: UsjScriptureViewModel, chapter: number): void {
  scheduleIdle(() => {
    attachFoldedMatchKeysToChapter(vm, chapter)
    getChapterLayoutBlocks(vm, chapter)
    getChapterVerseBlockItems(vm, chapter)
  }, 800)
}

export function useContent(
  resourceKey: string,
  availableBooks: BookInfo[],
  _language?: string
) {
  const loaderRegistry = useLoaderRegistry()
  const catalogManager = useCatalogManager()
  const cacheAdapter = useCacheAdapter()
  const currentRef = useCurrentReference()
  const navigation = useNavigation()
  const storeRevision = useAppStore((s) =>
    scriptureMetadataRevision(s.loadedResources, resourceKey)
  )
  const [loaded, setLoaded] = useState<{
    key: string
    viewModel: UsjScriptureViewModel | null
    nav: ScriptureNavRecord | null
  }>({ key: '', viewModel: null, nav: null })
  const [isLoadingRaw, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [catalogReadyKey, setCatalogReadyKey] = useState<string | null>(null)
  const [hardMissKey, setHardMissKey] = useState<string | null>(null)

  const catalogReady = catalogReadyKey === resourceKey || !!storeRevision
  const allowHardMiss = hardMissKey === resourceKey
  const metadataRevision = storeRevision || (catalogReady ? 'catalog' : '')
  const loadKey = scriptureContentLoadKey(resourceKey, currentRef.book, metadataRevision)

  const availableBookCodesStr = availableBooks.map((b) => b.code.toLowerCase()).sort().join(',')

  useEffect(() => {
    if (storeRevision) {
      setCatalogReadyKey(resourceKey)
      return
    }
    let cancelled = false
    let attempts = 0
    const poll = async () => {
      try {
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (!cancelled && metadata) setCatalogReadyKey(resourceKey)
      } catch {
        /* ignore */
      }
      attempts += 1
      if (!cancelled && attempts >= HARD_MISS_POLLS) setHardMissKey(resourceKey)
    }
    void poll()
    const id = window.setInterval(() => {
      void poll()
    }, METADATA_POLL_MS)
    return () => {
      cancelled = true
      window.clearInterval(id)
    }
  }, [resourceKey, catalogManager, storeRevision])

  useEffect(() => {
    let cancelled = false
    const bookCode = currentRef.book
    const openChapter = currentRef.chapter || 1
    const availableBookCodes = new Set(availableBookCodesStr.split(',').filter(Boolean))

    if (availableBookCodes.size === 0) return

    if (!availableBookCodes.has(bookCode.toLowerCase())) {
      setIsLoading(false)
      setError('BOOK_NOT_AVAILABLE')
      setLoaded({ key: loadKey, viewModel: null, nav: null })
      return
    }

    setLoaded({ key: loadKey, viewModel: null, nav: null })
    setIsLoading(true)
    setError(null)

    const applyBookCounts = async (chapterVerses: Record<string, number>) => {
      navigation.updateBookVerseCount(
        bookCode,
        mergeVerseCountsFromChapterMap(
          bookCode,
          chapterVerses,
          navigation.getBookInfo(bookCode)?.verses
        )
      )
      const sections = await defaultSectionsService.getDefaultSections(bookCode)
      if (sections.length > 0) navigation.setBookSections(bookCode, sections)
    }

    const loadViewModel = async (reason: 'nav-miss' | 'deferred') => {
      const loader = loaderRegistry.getLoader(RESOURCE_TYPE_IDS.SCRIPTURE) as
        | ScriptureLoader
        | undefined
      const perfLabel = reason === 'deferred' ? 'book-load-vm' : 'book-load'
      // Outer effect already started `book-load` for the nav-miss path.
      if (reason === 'deferred') markScripturePerfStart(perfLabel, bookCode)
      try {
        const rawVm = (await resolveLane1ScriptureViewModel({
          resourceKey,
          book: bookCode,
          chapter: openChapter,
          cache: cacheAdapter,
          loader,
          loadViewModel: loadUsjViewModel,
        })) as UsjScriptureViewModel
        if (cancelled) return null
        await applyBookCounts(chapterVerseMap(rawVm.chapters, (ch) => ch.verses.length))
        if (cancelled) return null
        setLoaded((prev) =>
          prev.key === loadKey
            ? { key: loadKey, viewModel: rawVm, nav: prev.nav ?? buildNavRecord(rawVm) }
            : prev
        )
        setIsLoading(false)
        warmCurrentChapter(rawVm, openChapter)
        const lastChapter = Math.max(lastChapterFromViewModel(rawVm.chapters), 1)
        enqueueBookPriority(resourceKey, bookCode, openChapter, lastChapter)
        return rawVm
      } catch (err) {
        if (cancelled) return null
        throw err
      } finally {
        markScripturePerfEnd(perfLabel, bookCode)
      }
    }

    const loadBookContent = async () => {
      markScripturePerfStart('book-load', bookCode)
      try {
        const nav = await readPreparedNav<ScriptureNavRecord>(
          cacheAdapter,
          RESOURCE_TYPE_IDS.SCRIPTURE,
          resourceKey,
          bookCode,
          SCRIPTURE_PREPARE_VERSION
        )
        if (cancelled) return

        if (nav && nav.chapters.length > 0) {
          await applyBookCounts(chapterVerseMap(nav.chapters, (ch) => ch.verseCount))
          if (cancelled) return

          setLoaded({ key: loadKey, viewModel: null, nav })
          setIsLoading(false)
          markScripturePerfEnd('book-load', bookCode)

          enqueueBookPriority(resourceKey, bookCode, openChapter, lastChapterFromViewModel(nav.chapters))

          // Defer whole-book viewModel so nav + light chrome can paint first.
          // On failure, promote to an immediate retry and surface real error —
          // never leave viewModel:null behind valid nav (that paints light-only
          // forever with no hover/tokens/underlines).
          const deferVm = () => {
            void loadViewModel('deferred').catch((err) => {
              if (cancelled) return
              console.warn('Deferred UsjScriptureViewModel load failed; retrying immediately:', err)
              void loadViewModel('nav-miss').catch((retryErr) => {
                if (cancelled) return
                const failure = applyScriptureContentLoadFailure(retryErr, allowHardMiss)
                if (failure.retryWhenMetadataArrives) {
                  setError(null)
                  setIsLoading(true)
                  return
                }
                console.error('❌ UsjScriptureViewModel load failed after nav paint:', retryErr)
                setError(failure.error)
                setIsLoading(false)
              })
            })
          }
          scheduleIdle(deferVm, 2500)
          return
        }

        // Nav miss — load viewModel immediately (also enqueues prepare).
        await loadViewModel('nav-miss')
      } catch (err) {
        if (cancelled) return
        const failure = applyScriptureContentLoadFailure(err, allowHardMiss)
        if (failure.retryWhenMetadataArrives) {
          setError(null)
          setLoaded({ key: loadKey, viewModel: null, nav: null })
          setIsLoading(true)
          markScripturePerfEnd('book-load', bookCode)
          return
        }
        console.error('❌ Error loading scripture content:', err)
        setError(failure.error)
        setLoaded({ key: loadKey, viewModel: null, nav: null })
        setIsLoading(false)
        markScripturePerfEnd('book-load', bookCode)
      }
    }

    loadBookContent()
    return () => {
      cancelled = true
    }
  }, [loadKey, loaderRegistry, availableBookCodesStr, allowHardMiss, cacheAdapter])

  const viewModel = loaded.key === loadKey ? loaded.viewModel : null
  const nav = loaded.key === loadKey ? loaded.nav : null
  const isLoading = loaded.key !== loadKey || isLoadingRaw

  const lastChapterForWarm = useMemo(() => {
    const bookId = currentRef.book || ''
    const tocChapters = availableBooks.find(
      (b) => b.code.toLowerCase() === bookId.toLowerCase()
    )?.chapters
    const explicit =
      lastChapterFromViewModel(nav?.chapters) ||
      (viewModel ? Math.max(lastChapterFromViewModel(viewModel.chapters), 1) : 0) ||
      undefined
    return resolveLastChapter({ bookId, explicit, tocChapters })
  }, [nav, viewModel, currentRef.book, availableBooks])

  const warmVisibleResources = useMemo(
    () => [
      {
        typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
        resourceKey,
        role: 'scripture' as const,
      },
    ],
    [resourceKey]
  )

  const openChapter = currentRef.chapter || 1
  const openChapterInViewModel = Boolean(
    viewModel?.chapters.some(
      (c) => c.number === openChapter && (c.verses?.length ?? 0) > 0
    )
  )
  const openChapterPreparedFull = Boolean(
    currentRef.book &&
      peekPreparedChapter(resourceKey, currentRef.book, openChapter)?.full
  )

  useWarmLanes({
    owner: 'scripture',
    visibleResources: warmVisibleResources,
    sourceResourceId: resourceKey,
    textLanguageCode:
      _language || resourceKey.split('/')[1]?.split('_')[0] || '',
    helpsLanguageCode: '',
    lastChapter: lastChapterForWarm || undefined,
    lane1Ready: scriptureLane1Ready({
      isLoading,
      hasViewModel: Boolean(viewModel),
      openChapterReady: openChapterInViewModel || openChapterPreparedFull,
    }),
  })

  // Re-prioritize prepare jobs when the open chapter changes within the same book.
  useEffect(() => {
    const bookCode = currentRef.book
    const openChapter = currentRef.chapter || 1
    if (!bookCode || loaded.key !== loadKey) return
    if (lastChapterForWarm < 1) return
    enqueueBookPriority(resourceKey, bookCode, openChapter, lastChapterForWarm)
  }, [
    currentRef.chapter,
    currentRef.book,
    resourceKey,
    loaded.key,
    loadKey,
    lastChapterForWarm,
  ])

  const relevantChapters = useMemo(() => {
    if (!viewModel) return []
    const startChapter = currentRef.chapter
    const endChapter = currentRef.endChapter || startChapter
    return viewModel.chapters.filter(
      (ch) => ch.number >= startChapter && ch.number <= endChapter
    )
  }, [viewModel, currentRef.chapter, currentRef.endChapter])

  const currentChapter = useMemo(
    () => (relevantChapters.length > 0 ? relevantChapters[0] : null),
    [relevantChapters]
  )

  const displayVerses = useMemo((): DisplayUsjVerse[] => {
    if (relevantChapters.length === 0) return []

    const startChapter = currentRef.chapter
    const endChapter = currentRef.endChapter || startChapter
    const startVerse = currentRef.verse
    const endVerse =
      currentRef.endVerse || (startChapter === endChapter ? startVerse : undefined)

    const verses: DisplayUsjVerse[] = []
    for (const chapter of relevantChapters) {
      let chapterStartVerse = 1
      let chapterEndVerse = 999
      if (chapter.number === startChapter) chapterStartVerse = startVerse
      if (chapter.number === endChapter && endVerse !== undefined) chapterEndVerse = endVerse

      for (const v of chapter.verses) {
        if (v.number >= chapterStartVerse && v.number <= chapterEndVerse) {
          verses.push({ ...v, chapterNumber: chapter.number })
        }
      }
    }
    return verses
  }, [relevantChapters, currentRef])

  return {
    viewModel,
    nav,
    isLoading,
    error,
    currentChapter,
    displayVerses,
  }
}
