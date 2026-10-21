/**
 * Feeds warmScheduler from the visible Read panels.
 */

import { useEffect, useRef, useState } from 'react'
import {
  useAvailableBooks,
  useCacheAdapter,
  useCatalogManager,
  useCurrentReference,
} from '../../contexts'
import { isOriginalLanguageDownloadTarget } from '../download/downloadBatchOrder'
import { backgroundDownloadSession } from '../download/backgroundDownloadSession'
import { olContentStamp } from '../helps/helpsQuoteCache'
import { resolveOriginalLanguageKey } from '../helps/olLoadCache'
import { UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY } from '../read/originalLanguageForBook'
import { resourceContentStamp } from '../helps/resourceContentStamp'
import { targetContentStamp } from '../helps/helpsAlignCache'
import { resolveLastChapter } from '../nav/bookChapterCounts'
import { useChapterScrollActivity } from '../nav/usePinnedHelpsReference'
import {
  warmScheduler,
  type WarmContextOwner,
  type VisibleWarmResource,
} from './warmScheduler'
import { classifyWarmResource, languageFromKey } from './warmResourceClass'

type StampMeta = {
  version?: string
  language?: string
  release?: { tag_name?: string; published_at?: string }
  contentMetadata?: { ingredients?: Array<{ identifier?: string }> }
}

export function useWarmLanes(args: {
  visibleResources: VisibleWarmResource[]
  sourceResourceId: string | null
  textLanguageCode: string
  helpsLanguageCode: string
  lastChapter?: number
  downloadedKeys?: string[]
  /** When true, mark lane 1 as drained so lane 2 can start. Default busy. */
  lane1Ready?: boolean
  /** Merge key so CombinedHelps + Scripture can both feed the singleton. */
  owner?: WarmContextOwner
}): void {
  const {
    visibleResources,
    sourceResourceId,
    textLanguageCode,
    helpsLanguageCode,
    lastChapter: lastChapterArg,
    downloadedKeys: downloadedKeysArg,
    lane1Ready = false, // busy until the owner reports current-chapter ready
    owner = 'default',
  } = args
  const currentRef = useCurrentReference()
  const availableBooks = useAvailableBooks()
  const scrollActivity = useChapterScrollActivity()
  const catalogManager = useCatalogManager()
  const cacheAdapter = useCacheAdapter()
  const [downloadTick, setDownloadTick] = useState(0)
  const [handoffKeys, setHandoffKeys] = useState<string[]>([])
  const stampsRef = useRef<{
    helpsStampByKey: Record<string, string>
    targetStampByKey: Record<string, string>
    textLanguageByTarget: Record<string, string>
    articleIdsByKey: Record<string, string[]>
    olStampByKey: Record<string, string>
    downloadedKeys: string[]
  } | null>(null)
  const [stampsTick, setStampsTick] = useState(0)

  const bookId = (currentRef.book || '').toLowerCase()
  const tocChapters = availableBooks.find((b) => b.code.toLowerCase() === bookId)?.chapters
  const lastChapter = resolveLastChapter({
    bookId,
    explicit: lastChapterArg,
    tocChapters,
  })

  useEffect(() => {
    let wasBusy = backgroundDownloadSession.isBusy()
    let lastCompleted = backgroundDownloadSession.getStats().completedResourceKeys.length
    return backgroundDownloadSession.subscribe((s) => {
      const completed = s.completedResourceKeys
      if (completed.length > lastCompleted) {
        lastCompleted = completed.length
        setHandoffKeys(completed)
        setDownloadTick((n) => n + 1)
      }
      if (wasBusy && !s.isDownloading) setDownloadTick((n) => n + 1)
      wasBusy = s.isDownloading
    })
  }, [])

  useEffect(() => {
    if (lane1Ready) warmScheduler.notifyLane1Drained(owner)
    else warmScheduler.notifyLane1Busy(owner)
  }, [lane1Ready, owner])

  const visibleKeySig = visibleResources.map((r) => r.resourceKey).join(',')
  const handoffSig = handoffKeys.join(',')

  // Catalog stamps are expensive — resolve when keys/langs change, not on
  // every chapter tick or scroll-unsettled flip.
  useEffect(() => {
    let cancelled = false
    if (!bookId) return

    void (async () => {
      const helpsStampByKey: Record<string, string> = {}
      const targetStampByKey: Record<string, string> = {}
      const textLanguageByTarget: Record<string, string> = {}
      const articleIdsByKey: Record<string, string[]> = {}

      let downloadedKeys = downloadedKeysArg ?? []
      if (!downloadedKeysArg && catalogManager && !backgroundDownloadSession.isBusy()) {
        try {
          downloadedKeys = await catalogManager.getAllResourceKeys()
        } catch {
          downloadedKeys = []
        }
      }
      if (cancelled) return
      downloadedKeys = [...new Set([...downloadedKeys, ...handoffKeys])]

      const langs = new Set(
        [textLanguageCode, helpsLanguageCode].map((l) => l.toLowerCase()).filter(Boolean)
      )
      const stampKeys = new Set<string>([
        ...visibleResources.map((r) => r.resourceKey),
        ...(sourceResourceId ? [sourceResourceId] : []),
        ...downloadedKeys.filter((k) => !langs.size || langs.has(languageFromKey(k))),
      ])

      if (catalogManager) {
        await Promise.all(
          [...stampKeys].map(async (key) => {
            try {
              const meta = (await catalogManager.getResourceMetadata(key)) as StampMeta | null
              const classified = classifyWarmResource(key)
              const visible = visibleResources.find((r) => r.resourceKey === key)
              if (visible?.role === 'helps' || classified.stampBag === 'helps') {
                helpsStampByKey[key] = resourceContentStamp(meta)
              }
              if (
                visible?.role === 'scripture' ||
                key === sourceResourceId ||
                classified.stampBag === 'target'
              ) {
                targetStampByKey[key] = targetContentStamp(meta)
                if (meta?.language) textLanguageByTarget[key] = meta.language
              }
              if (classified.isArticle) {
                const ids = (meta?.contentMetadata?.ingredients ?? [])
                  .map((ing) => ing.identifier)
                  .filter((id): id is string => Boolean(id))
                if (ids.length) articleIdsByKey[key] = ids
              }
            } catch {
              /* ignore */
            }
          })
        )
      }

      const olStampByKey: Record<string, string> = {}
      if (catalogManager) {
        await Promise.all(
          [UGNT_RESOURCE_KEY, UHB_RESOURCE_KEY].map(async (olKey) => {
            try {
              const olMeta = (await catalogManager.getResourceMetadata(olKey)) as
                | { version?: string; release?: { tag_name?: string; published_at?: string } }
                | null
              olStampByKey[olKey] = olContentStamp(olMeta)
            } catch {
              olStampByKey[olKey] = 'nostamp'
            }
          })
        )
      }

      if (cancelled) return
      stampsRef.current = {
        helpsStampByKey,
        targetStampByKey,
        textLanguageByTarget,
        articleIdsByKey,
        olStampByKey,
        downloadedKeys,
      }
      setStampsTick((n) => n + 1)
    })()

    return () => {
      cancelled = true
    }
  }, [
    bookId,
    visibleKeySig,
    sourceResourceId,
    textLanguageCode,
    helpsLanguageCode,
    downloadedKeysArg,
    catalogManager,
    downloadTick,
    handoffSig,
  ])

  useEffect(() => {
    if (!bookId) return
    const stamps = stampsRef.current
    const ol = resolveOriginalLanguageKey(bookId)
    const olStampByKey = stamps?.olStampByKey ?? {}
    const olStamp =
      (ol?.resourceKey ? olStampByKey[ol.resourceKey] : undefined) ?? 'nostamp'
    warmScheduler.setVisibleContext(
      {
        bookId,
        chapter: currentRef.chapter || 1,
        lastChapter,
        visibleResources,
        sourceResourceId,
        textLanguageCode,
        helpsLanguageCode,
        scrollUnsettled: scrollActivity.unsettled,
        stamps: stamps
          ? {
              helpsStampByKey: stamps.helpsStampByKey,
              olKey: ol?.resourceKey,
              olStamp,
              olStampByKey,
              targetStampByKey: stamps.targetStampByKey,
              textLanguageByTarget: stamps.textLanguageByTarget,
            }
          : undefined,
        downloadedKeys: stamps?.downloadedKeys,
        articleIdsByKey: stamps?.articleIdsByKey,
        downloadGeneration: downloadTick,
        readyOlKeys: handoffKeys.filter((k) =>
          isOriginalLanguageDownloadTarget({ resourceKey: k })
        ),
        cacheAdapter: cacheAdapter as never,
      },
      owner
    )
  }, [
    bookId,
    currentRef.chapter,
    lastChapter,
    visibleResources,
    sourceResourceId,
    textLanguageCode,
    helpsLanguageCode,
    scrollActivity.unsettled,
    cacheAdapter,
    owner,
    downloadTick,
    handoffKeys,
    stampsTick,
  ])

  useEffect(() => {
    return () => {
      warmScheduler.clearVisibleContext(owner)
    }
  }, [owner])
}
