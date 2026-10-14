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
import { resolveOriginalLanguageKey } from '../helps/olLoadCache'
import { resolveLastChapter } from '../nav/bookChapterCounts'
import { resolveWarmStamps } from '@bt-synergy/resource-pipeline/warm/warmStamps'
import { useChapterScrollActivity } from '../nav/usePinnedHelpsReference'
import {
  warmScheduler,
  type WarmContextOwner,
  type VisibleWarmResource,
} from './warmScheduler'
import { languageFromKey } from './warmResourceClass'

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

      const bags = catalogManager
        ? await resolveWarmStamps({
            catalog: catalogManager,
            stampKeys,
            visibleResources,
            sourceResourceId,
          })
        : {
            helpsStampByKey: {},
            targetStampByKey: {},
            textLanguageByTarget: {},
            articleIdsByKey: {},
            olStampByKey: {},
          }

      if (cancelled) return
      stampsRef.current = { ...bags, downloadedKeys }
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
