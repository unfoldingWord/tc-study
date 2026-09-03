/**
 * Idle-warm helps-quote: cache rows for adjacent chapters once the current
 * chapter settles — so elastic edge reveal lands on already-built quotes.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import type { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { useEffect, useRef } from 'react'
import {
  useCacheAdapter,
  useCatalogManager,
  useLoaderRegistry,
} from '../../contexts'
import { scheduleIdle } from '../../utils/scheduleIdle'
import { batchQuotesInWorker } from '../../workers/prepareClient'
import {
  loadOriginalLanguageChapters,
  resolveOriginalLanguageKey,
} from './olLoadCache'
import {
  mergeAndWriteCachedQuoteTokens,
  olContentStamp,
  readCachedQuoteTokens,
  toCachedQuoteTokens,
  type CachedQuoteTokens,
  type HelpsQuoteCacheAdapter,
} from './helpsQuoteCache'
import { resourceContentStamp } from './resourceContentStamp'
import { useChapterScrollActivity } from '../nav/usePinnedHelpsReference'

function noteToPseudoLink(note: TranslationNote): TranslationWordsLink {
  return {
    id: note.id,
    reference: note.reference,
    tags: note.tags || '',
    occurrence: note.occurrence || '1',
    origWords: note.quote || '',
    twLink: '',
  }
}

async function resolveCacheCtx(
  catalogManager: { getResourceMetadata: (key: string) => Promise<unknown> },
  helpsKey: string,
  bookCode: string
): Promise<{ helpsStamp: string; olKey: string; olStamp: string } | null> {
  try {
    const ol = resolveOriginalLanguageKey(bookCode)
    if (!ol) return null
    const helpsMeta = (await catalogManager.getResourceMetadata(helpsKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    const olMeta = (await catalogManager.getResourceMetadata(ol.resourceKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    return {
      helpsStamp: resourceContentStamp(helpsMeta),
      olKey: ol.resourceKey,
      olStamp: olContentStamp(olMeta),
    }
  } catch {
    return null
  }
}

async function warmChapterQuotes(args: {
  cache: HelpsQuoteCacheAdapter
  catalogManager: { getResourceMetadata: (key: string) => Promise<unknown> }
  loader: ScriptureLoader
  helpsKey: string
  bookId: string
  chapter: number
  links: TranslationWordsLink[]
}): Promise<void> {
  const { cache, catalogManager, loader, helpsKey, bookId, chapter, links } = args
  if (!helpsKey || links.length === 0) return

  const bookCode = bookId.toUpperCase()
  const cacheCtx = await resolveCacheCtx(catalogManager, helpsKey, bookCode)
  if (!cacheCtx) return

  const existing = await readCachedQuoteTokens(cache, {
    helpsKey,
    helpsStamp: cacheCtx.helpsStamp,
    olKey: cacheCtx.olKey,
    olStamp: cacheCtx.olStamp,
    book: bookCode,
    chapter,
  })
  const needsBuild = links.filter(
    (l) => l.origWords?.trim() && !(existing && Object.prototype.hasOwnProperty.call(existing, l.id))
  )
  if (needsBuild.length === 0) return

  const ol = resolveOriginalLanguageKey(bookCode)
  if (!ol) return

  const originalChapters = await loadOriginalLanguageChapters({
    loader,
    olKey: ol.resourceKey,
    bookId,
    startChapter: chapter,
    endChapter: chapter,
  })
  if (!originalChapters.length) return

  const results = await batchQuotesInWorker({
    bookCode,
    links: needsBuild,
    originalChapters,
  })

  const built: CachedQuoteTokens = {}
  for (const row of results) {
    const link = needsBuild[row.index]
    if (!link) continue
    built[link.id] = toCachedQuoteTokens(row.tokens as Array<{ id?: number; text?: string; type?: string; occurrence?: number; content?: string }>)
  }
  if (Object.keys(built).length === 0) return

  await mergeAndWriteCachedQuoteTokens(
    cache,
    {
      helpsKey,
      helpsStamp: cacheCtx.helpsStamp,
      olKey: cacheCtx.olKey,
      olStamp: cacheCtx.olStamp,
      book: bookCode,
    },
    built,
    () => chapter
  )
}

export function useWarmAdjacentHelpsQuotes(args: {
  tnKey: string
  twlKey: string
  bookId: string
  chapter: number
  /** Upper bound for adjacent chapter (book last chapter). Omit to only skip chapter < 1. */
  lastChapter?: number
  notesByChapter?: Record<string, TranslationNote[]> | null
  linksByChapter?: Record<string, TranslationWordsLink[]> | null
}): void {
  const {
    tnKey,
    twlKey,
    bookId,
    chapter,
    lastChapter = 999,
    notesByChapter,
    linksByChapter,
  } = args
  const cache = useCacheAdapter() as HelpsQuoteCacheAdapter | null
  const catalogManager = useCatalogManager()
  const loaderRegistry = useLoaderRegistry()
  const scrollActivity = useChapterScrollActivity()
  const warmedRef = useRef<string>('')

  useEffect(() => {
    if (scrollActivity.unsettled) return
    if (!cache || !catalogManager || !loaderRegistry || !bookId || chapter < 1) return
    if (bookId.toLowerCase() === 'obs') return

    const warmKey = `${tnKey}|${twlKey}|${bookId}|${chapter}`
    if (warmedRef.current === warmKey) return

    const loader = loaderRegistry.getLoader('scripture') as ScriptureLoader | undefined
    if (!loader || typeof loader.loadViewModel !== 'function') return

    const neighbors = [chapter - 1, chapter + 1].filter(
      (c) => c >= 1 && c <= lastChapter && c !== chapter
    )
    if (neighbors.length === 0) return

    const cancel = scheduleIdle(() => {
      warmedRef.current = warmKey
      void (async () => {
        for (const ch of neighbors) {
          const notes = notesByChapter?.[String(ch)] ?? []
          const links = linksByChapter?.[String(ch)] ?? []
          const tnLinks = notes
            .filter((n) => n.quote?.trim())
            .map(noteToPseudoLink)
          try {
            if (tnKey && tnLinks.length) {
              await warmChapterQuotes({
                cache,
                catalogManager,
                loader,
                helpsKey: tnKey,
                bookId,
                chapter: ch,
                links: tnLinks,
              })
            }
            if (twlKey && links.length) {
              await warmChapterQuotes({
                cache,
                catalogManager,
                loader,
                helpsKey: twlKey,
                bookId,
                chapter: ch,
                links,
              })
            }
          } catch {
            /* non-fatal warm */
          }
        }
      })()
    }, 2000)

    return cancel
  }, [
    scrollActivity.unsettled,
    scrollActivity.settledChapter,
    cache,
    catalogManager,
    loaderRegistry,
    tnKey,
    twlKey,
    bookId,
    chapter,
    lastChapter,
    notesByChapter,
    linksByChapter,
  ])
}
