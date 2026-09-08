/**
 * Feeds warmScheduler from the visible Read panels.
 */

import { useEffect, useState } from 'react'
import {
  useAvailableBooks,
  useCacheAdapter,
  useCatalogManager,
  useCurrentReference,
} from '../../contexts'
import { backgroundDownloadSession } from '../download/backgroundDownloadSession'
import { olContentStamp } from '../helps/helpsQuoteCache'
import { resolveOriginalLanguageKey } from '../helps/olLoadCache'
import { resourceContentStamp } from '../helps/resourceContentStamp'
import { targetContentStamp } from '../helps/helpsAlignCache'
import { resolveLastChapter } from '../nav/bookChapterCounts'
import { useChapterScrollActivity } from '../nav/usePinnedHelpsReference'
import {
  warmScheduler,
  type WarmContextOwner,
  type VisibleWarmResource,
} from './warmScheduler'

const HELPS_CATALOG_IDS = new Set([
  'tn', 'twl', 'tq', 'tw', 'ta', 'tn-obs', 'twl-obs', 'tq-obs', 'obs',
])

function languageFromKey(key: string): string {
  return key.split('/')[1]?.split('_')[0]?.toLowerCase() ?? ''
}

function catalogIdFromKey(key: string): string {
  return key.split('/')[2]?.split('#')[0] ?? ''
}

type StampMeta = {
  version?: string
  language?: string
  release?: { tag_name?: string; published_at?: string }
}

export function useWarmLanes(args: {
  visibleResources: VisibleWarmResource[]
  sourceResourceId: string | null
  textLanguageCode: string
  helpsLanguageCode: string
  lastChapter?: number
  downloadedKeys?: string[]
  /** When true, mark lane 1 as drained so lane 2 can start. */
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
    lane1Ready = true,
    owner = 'default',
  } = args
  const currentRef = useCurrentReference()
  const availableBooks = useAvailableBooks()
  const scrollActivity = useChapterScrollActivity()
  const catalogManager = useCatalogManager()
  const cacheAdapter = useCacheAdapter()
  const [downloadTick, setDownloadTick] = useState(0)

  const bookId = (currentRef.book || '').toLowerCase()
  const tocChapters = availableBooks.find((b) => b.code.toLowerCase() === bookId)?.chapters
  const lastChapter = resolveLastChapter({
    bookId,
    explicit: lastChapterArg,
    tocChapters,
  })

  useEffect(() => {
    let wasBusy = backgroundDownloadSession.isBusy()
    return backgroundDownloadSession.subscribe((s) => {
      if (wasBusy && !s.isDownloading) setDownloadTick((n) => n + 1)
      wasBusy = s.isDownloading
    })
  }, [])

  useEffect(() => {
    if (lane1Ready) warmScheduler.notifyLane1Drained(owner)
    else warmScheduler.notifyLane1Busy(owner)
  }, [lane1Ready, owner])

  useEffect(() => {
    let cancelled = false
    if (!bookId) return

    void (async () => {
      const helpsStampByKey: Record<string, string> = {}
      const targetStampByKey: Record<string, string> = {}
      const textLanguageByTarget: Record<string, string> = {}

      let downloadedKeys = downloadedKeysArg ?? []
      if (!downloadedKeysArg && catalogManager) {
        try {
          downloadedKeys = await catalogManager.getAllResourceKeys()
        } catch {
          downloadedKeys = []
        }
      }
      if (cancelled) return

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
              const id = catalogIdFromKey(key)
              const visible = visibleResources.find((r) => r.resourceKey === key)
              if (visible?.role === 'helps' || id === 'tn' || id === 'twl') {
                helpsStampByKey[key] = resourceContentStamp(meta)
              }
              if (
                visible?.role === 'scripture' ||
                key === sourceResourceId ||
                !HELPS_CATALOG_IDS.has(id)
              ) {
                targetStampByKey[key] = targetContentStamp(meta)
                if (meta?.language) textLanguageByTarget[key] = meta.language
              }
            } catch {
              /* ignore */
            }
          })
        )
      }

      const ol = resolveOriginalLanguageKey(bookId)
      let olStamp = 'nostamp'
      if (ol && catalogManager) {
        try {
          const olMeta = (await catalogManager.getResourceMetadata(ol.resourceKey)) as
            | { version?: string; release?: { tag_name?: string; published_at?: string } }
            | null
          olStamp = olContentStamp(olMeta)
        } catch {
          /* ignore */
        }
      }

      if (cancelled) return
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
          stamps: {
            helpsStampByKey,
            olKey: ol?.resourceKey,
            olStamp,
            targetStampByKey,
            textLanguageByTarget,
          },
          downloadedKeys,
          downloadGeneration: downloadTick,
          cacheAdapter: cacheAdapter as never,
        },
        owner
      )
    })()

    return () => {
      cancelled = true
    }
  }, [
    bookId,
    currentRef.chapter,
    lastChapter,
    visibleResources,
    sourceResourceId,
    textLanguageCode,
    helpsLanguageCode,
    scrollActivity.unsettled,
    downloadedKeysArg,
    catalogManager,
    cacheAdapter,
    owner,
    downloadTick,
  ])

  useEffect(() => {
    return () => {
      warmScheduler.clearVisibleContext(owner)
    }
  }, [owner])
}
