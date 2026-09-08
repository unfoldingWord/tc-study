/**
 * useQuoteTokens Hook - STEP 2 of TSV Alignment Algorithm
 *
 * Builds quoteTokens for TWL links by matching origWords to original language tokens.
 * Worker-first for larger batches: priority rows (from current verse) first, then
 * deferred rows on idle. Sync only for tiny batches or when the worker is unavailable.
 *
 * Persistent chapter-scoped quote cache (IndexedDB) is checked before worker/sync
 * passes; hits skip rebuild. Per-link `quoteReady` lets align start after pass 1.
 */

import { useEffect, useRef, useState } from 'react'
import { useCacheAdapter, useCatalogManager, useCurrentReference } from '../../../../contexts'
import {
  pinReferenceWhileScrolling,
  shouldEnqueueQuoteBuild,
} from '../../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import {
  shouldKeepStaleHelpsRows,
  staleQuotesAreUnderlineReady,
} from '../../../../features/helps/helpsListLoading'
import {
  reuseHelpsQuoteRows,
  shouldSkipHelpsQuoteRebuild,
  type HelpsTokenCacheRow,
} from '../../../../features/helps/helpsTokenReuse'
import { isQuoteBuildReady } from '../../../../features/helps/resolveHelpsQuoteStatus'
import { buildQuoteTokens } from '../../../../features/helps/quoteTokens'
import {
  HELPS_SYNC_MAX_LINKS,
  partitionHelpsWork,
} from '../../../../features/helps/helpsWorkStaging'
import {
  mergeAndWriteCachedQuoteTokens,
  olContentStamp,
  readCachedQuoteTokensForSpan,
  subtractCachedQuoteHits,
  toCachedQuoteTokens,
  type CachedQuoteToken,
  type CachedQuoteTokens,
  type HelpsQuoteCacheAdapter,
} from '../../../../features/helps/helpsQuoteCache'
import { resourceContentStamp } from '../../../../features/helps/resourceContentStamp'
import { scheduleIdle } from '../../../../utils/scheduleIdle'
import { batchQuotesInWorker } from '../../../../workers/prepareClient'
import type { TranslationWordsLink } from '../types'
import { useOriginalLanguageContent } from './useOriginalLanguageContent'
import { useScriptureContentRevision } from './useScriptureTokens'

interface UseQuoteTokensOptions {
  resourceKey: string
  resourceId: string
  links: TranslationWordsLink[]
}

export type LinkWithQuoteReady = TranslationWordsLink & { quoteReady?: boolean }

const NT_BOOKS = new Set([
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
])

function originalLanguageKeyForBook(bookCode: string): string {
  return NT_BOOKS.has(bookCode.toUpperCase())
    ? 'unfoldingWord/el-x-koine/ugnt'
    : 'unfoldingWord/hbo/uhb'
}

function chapterOfLink(link: TranslationWordsLink): number {
  const refParts = link.reference.split(':')
  return parseInt(refParts[0] || '1', 10)
}

function chapterInSpan(chapter: number, start: number, end: number): boolean {
  return chapter >= start && chapter <= end
}

function cachedToQuoteTokens(
  tokens: CachedQuoteToken[]
): TranslationWordsLink['quoteTokens'] {
  if (!tokens.length) return undefined
  return tokens as TranslationWordsLink['quoteTokens']
}

function buildQuotesSync(
  links: TranslationWordsLink[],
  originalContent: NonNullable<ReturnType<typeof useOriginalLanguageContent>['originalContent']>,
  bookCode: string,
  startChapter: number,
  endChapter: number
): LinkWithQuoteReady[] {
  return links.map((link) => {
    if (link.quoteTokens && link.quoteTokens.length > 0) {
      return { ...link, quoteReady: true }
    }
    if (!chapterInSpan(chapterOfLink(link), startChapter, endChapter)) return link
    const quoteTokens = buildQuoteTokens({
      link,
      originalChapters: originalContent,
      bookCode,
    })
    return {
      ...link,
      quoteTokens: quoteTokens.length > 0 ? quoteTokens : undefined,
      quoteReady: true,
    }
  })
}

function mergeQuotePass(args: {
  links: TranslationWordsLink[]
  byId: Map<string, TranslationWordsLink['quoteTokens']>
  readyIds: ReadonlySet<string>
  deferredIds: ReadonlySet<string>
  startChapter: number
  endChapter: number
}): LinkWithQuoteReady[] {
  const { links, byId, readyIds, deferredIds, startChapter, endChapter } = args
  return links.map((link) => {
    if (link.quoteTokens && link.quoteTokens.length > 0) {
      return { ...link, quoteReady: true }
    }
    if (!chapterInSpan(chapterOfLink(link), startChapter, endChapter)) return link
    if (byId.has(link.id)) {
      const tokens = byId.get(link.id)
      return {
        ...link,
        quoteTokens: tokens && tokens.length > 0 ? tokens : undefined,
        quoteReady: true,
      }
    }
    if (readyIds.has(link.id)) {
      return { ...link, quoteReady: true }
    }
    if (deferredIds.has(link.id)) {
      return { ...link, quoteReady: false }
    }
    return { ...link, quoteReady: true }
  })
}

function quoteRequestKey(
  book: string,
  startChapter: number,
  endChapter: number,
  links: TranslationWordsLink[],
  originalContent: ReturnType<typeof useOriginalLanguageContent>['originalContent']
): string {
  const linkPart = links.map((l) => l.id).join(',')
  const olPart =
    originalContent == null ? 'null' : originalContent.length === 0 ? 'empty' : String(originalContent.length)
  return `${book}|${startChapter}|${endChapter}|${linkPart}|${olPart}`
}

function builtMapToCached(byId: Map<string, TranslationWordsLink['quoteTokens']>): CachedQuoteTokens {
  const out: CachedQuoteTokens = {}
  for (const [id, tokens] of byId) {
    out[id] = toCachedQuoteTokens(tokens)
  }
  return out
}

async function buildQuotesViaWorkerOrSync(args: {
  bookCode: string
  links: TranslationWordsLink[]
  originalContent: NonNullable<ReturnType<typeof useOriginalLanguageContent>['originalContent']>
  startChapter: number
  endChapter: number
}): Promise<Map<string, TranslationWordsLink['quoteTokens']>> {
  const { bookCode, links, originalContent, startChapter, endChapter } = args
  const byId = new Map<string, TranslationWordsLink['quoteTokens']>()
  if (links.length === 0) return byId

  try {
    const results = await batchQuotesInWorker({
      bookCode,
      links,
      originalChapters: originalContent,
    })
    for (const row of results) {
      const link = links[row.index]
      if (!link) continue
      const tokens = row.tokens as TranslationWordsLink['quoteTokens']
      if (tokens && tokens.length > 0) byId.set(link.id, tokens)
      else byId.set(link.id, undefined)
    }
    return byId
  } catch {
    const sync = buildQuotesSync(links, originalContent, bookCode, startChapter, endChapter)
    for (const link of sync) {
      if (!chapterInSpan(chapterOfLink(link), startChapter, endChapter)) continue
      byId.set(link.id, link.quoteTokens)
    }
    return byId
  }
}

async function resolveQuoteCacheContext(args: {
  catalogManager: { getResourceMetadata: (key: string) => Promise<unknown> }
  helpsKey: string
  bookCode: string
}): Promise<{
  helpsStamp: string
  olKey: string
  olStamp: string
} | null> {
  try {
    const helpsMeta = (await args.catalogManager.getResourceMetadata(args.helpsKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    const olKey = originalLanguageKeyForBook(args.bookCode)
    const olMeta = (await args.catalogManager.getResourceMetadata(olKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    return {
      helpsStamp: resourceContentStamp(helpsMeta),
      olKey,
      olStamp: olContentStamp(olMeta),
    }
  } catch {
    return null
  }
}

export function useQuoteTokens({ resourceKey, resourceId, links }: UseQuoteTokensOptions) {
  const currentRef = useCurrentReference()
  const scrollActivity = useChapterScrollActivity()
  const helpsRef = pinReferenceWhileScrolling(currentRef, scrollActivity)
  const lastQuotesRef = useRef<LinkWithQuoteReady[]>(links)
  const lastQuotesByIdRef = useRef<Map<string, HelpsTokenCacheRow>>(new Map())
  const lastQuoteBookRef = useRef(helpsRef.book)
  if (lastQuoteBookRef.current !== helpsRef.book) {
    lastQuoteBookRef.current = helpsRef.book
    lastQuotesByIdRef.current = new Map()
  }
  for (const link of links) {
    if (link.quoteTokens && link.quoteTokens.length > 0) {
      lastQuotesByIdRef.current.set(link.id, {
        quoteTokens: link.quoteTokens,
        alignedTokens: (link as HelpsTokenCacheRow).alignedTokens,
        semanticIds: (link as HelpsTokenCacheRow).semanticIds,
        quoteStatus: (link as HelpsTokenCacheRow).quoteStatus,
      })
    }
  }
  const scriptureRevision = useScriptureContentRevision(resourceId)
  const cacheAdapter = useCacheAdapter() as HelpsQuoteCacheAdapter | null
  const catalogManager = useCatalogManager()

  const {
    originalContent,
    loading: loadingOriginal,
    error: originalError,
  } = useOriginalLanguageContent({ resourceKey, resourceId, scriptureRevision })

  const [linksWithQuotes, setLinksWithQuotes] = useState<LinkWithQuoteReady[]>(() =>
    lastQuotesRef.current.length > 0 ? lastQuotesRef.current : links
  )
  const [settledRequestKey, setSettledRequestKey] = useState('')
  const runGenRef = useRef(0)

  const startChapter = helpsRef.chapter || 1
  const endChapter = helpsRef.endChapter || startChapter
  const requestKey = quoteRequestKey(
    helpsRef.book || '',
    startChapter,
    endChapter,
    links,
    originalContent
  )
  const quotesSettled = settledRequestKey === requestKey
  const skipQuoteRebuild = shouldSkipHelpsQuoteRebuild({
    links,
    lastById: lastQuotesByIdRef.current,
  })

  useEffect(() => {
    const bookCode = helpsRef.book?.toUpperCase() || ''
    const gen = ++runGenRef.current
    const lifecycle = {
      cancelled: false,
      cancelIdle: undefined as (() => void) | undefined,
    }

    const rememberQuotes = (next: LinkWithQuoteReady[]) => {
      lastQuotesRef.current = next
      for (const row of next) {
        if (row.quoteTokens && row.quoteTokens.length > 0) {
          lastQuotesByIdRef.current.set(row.id, {
            quoteTokens: row.quoteTokens,
            alignedTokens: (row as HelpsTokenCacheRow).alignedTokens,
            semanticIds: (row as HelpsTokenCacheRow).semanticIds,
            quoteStatus: (row as HelpsTokenCacheRow).quoteStatus,
          })
        }
      }
    }

    const apply = (next: LinkWithQuoteReady[], settle: boolean) => {
      if (gen !== runGenRef.current) return
      rememberQuotes(next)
      setLinksWithQuotes(next)
      if (settle) setSettledRequestKey(requestKey)
    }

    if (shouldSkipHelpsQuoteRebuild({ links, lastById: lastQuotesByIdRef.current })) {
      apply(reuseHelpsQuoteRows(links, lastQuotesByIdRef.current), true)
      return () => {
        lifecycle.cancelled = true
      }
    }

    /** Read-only cache hydrate — paints underlines before settle / OL reload. */
    const hydrateFromCache = async (settleOnFullHit: boolean) => {
      if (!cacheAdapter || !catalogManager || !bookCode || links.length === 0) return false

      // Always keyed by current links; pull tokens from lastQuotes when ids match.
      const baseLinks: LinkWithQuoteReady[] = links.map((incoming) => {
        const prev = lastQuotesRef.current.find((r) => r.id === incoming.id)
        if (incoming.quoteTokens?.length) return { ...incoming, quoteReady: true }
        if (prev?.quoteTokens?.length) {
          return { ...incoming, quoteTokens: prev.quoteTokens, quoteReady: true }
        }
        return {
          ...incoming,
          quoteTokens: prev?.quoteTokens,
          quoteReady: prev?.quoteReady,
        }
      })

      const stillNeed = baseLinks.filter(
        (link) =>
          !(link.quoteTokens && link.quoteTokens.length > 0) &&
          chapterInSpan(chapterOfLink(link), startChapter, endChapter)
      )
      if (stillNeed.length === 0 && staleQuotesAreUnderlineReady(baseLinks)) {
        apply(
          baseLinks.map((l) => (l.quoteTokens?.length ? { ...l, quoteReady: true } : l)),
          settleOnFullHit
        )
        return true
      }
      if (stillNeed.length === 0) return false

      try {
        const cacheCtx = await resolveQuoteCacheContext({
          catalogManager,
          helpsKey: resourceKey,
          bookCode,
        })
        if (!cacheCtx || lifecycle.cancelled || gen !== runGenRef.current) return false
        const cached = await readCachedQuoteTokensForSpan(cacheAdapter, {
          helpsKey: resourceKey,
          helpsStamp: cacheCtx.helpsStamp,
          olKey: cacheCtx.olKey,
          olStamp: cacheCtx.olStamp,
          book: bookCode,
          startChapter,
          endChapter,
        })
        if (lifecycle.cancelled || gen !== runGenRef.current) return false
        const { hits, misses } = subtractCachedQuoteHits(stillNeed, cached)
        if (hits.size === 0) return false
        const hitById = new Map<string, TranslationWordsLink['quoteTokens']>()
        for (const [id, tokens] of hits) {
          hitById.set(id, cachedToQuoteTokens(tokens))
        }
        const merged = mergeQuotePass({
          links: baseLinks,
          byId: hitById,
          readyIds: new Set(hitById.keys()),
          deferredIds: new Set(misses.map((l) => l.id)),
          startChapter,
          endChapter,
        })
        const fullHit = misses.length === 0
        apply(merged, settleOnFullHit && fullHit)
        return fullHit
      } catch {
        return false
      }
    }

    // While scrolling: keep last quotes ready and hydrate from cache (no worker).
    if (!shouldEnqueueQuoteBuild(scrollActivity.unsettled)) {
      const kept =
        lastQuotesRef.current.length > 0 ? lastQuotesRef.current : links
      setLinksWithQuotes(kept)
      if (!staleQuotesAreUnderlineReady(kept)) {
        setSettledRequestKey('')
      }
      void hydrateFromCache(false)
      return () => {
        lifecycle.cancelled = true
      }
    }

    if (!originalContent || originalContent.length === 0 || links.length === 0) {
      if (
        shouldKeepStaleHelpsRows({
          staleCount: lastQuotesRef.current.length,
          incomingCount: links.length,
          originalContentMissing: !originalContent || originalContent.length === 0,
        })
      ) {
        setLinksWithQuotes(lastQuotesRef.current)
        if (staleQuotesAreUnderlineReady(lastQuotesRef.current)) {
          setSettledRequestKey(requestKey)
        }
        void hydrateFromCache(true)
        return () => {
          lifecycle.cancelled = true
        }
      }
      setLinksWithQuotes(links)
      lastQuotesRef.current = links
      setSettledRequestKey('')
      void hydrateFromCache(true)
      return () => {
        lifecycle.cancelled = true
      }
    }

    const needsBuild = links.filter(
      (link) =>
        !(link.quoteTokens && link.quoteTokens.length > 0) &&
        chapterInSpan(chapterOfLink(link), startChapter, endChapter)
    )

    // Nothing to build — settle immediately (already have quoteTokens or out of span).
    if (needsBuild.length === 0) {
      apply(
        links.map((link) =>
          link.quoteTokens && link.quoteTokens.length > 0
            ? { ...link, quoteReady: true as const }
            : link
        ),
        true
      )
      return () => {
        lifecycle.cancelled = true
      }
    }

    const persistBuilt = async (
      byId: Map<string, TranslationWordsLink['quoteTokens']>,
      ctx: { helpsStamp: string; olKey: string; olStamp: string }
    ) => {
      if (!cacheAdapter || byId.size === 0) return
      try {
        const linkChapter = new Map(links.map((l) => [l.id, chapterOfLink(l)]))
        await mergeAndWriteCachedQuoteTokens(
          cacheAdapter,
          {
            helpsKey: resourceKey,
            helpsStamp: ctx.helpsStamp,
            olKey: ctx.olKey,
            olStamp: ctx.olStamp,
            book: bookCode,
          },
          builtMapToCached(byId),
          (id) => linkChapter.get(id) ?? 1
        )
      } catch {
        /* non-fatal */
      }
    }

    void (async () => {
      const cacheCtx =
        cacheAdapter && catalogManager
          ? await resolveQuoteCacheContext({
              catalogManager,
              helpsKey: resourceKey,
              bookCode,
            })
          : null

      let remaining = needsBuild
      const hitById = new Map<string, TranslationWordsLink['quoteTokens']>()

      if (cacheAdapter && cacheCtx) {
        try {
          const cached = await readCachedQuoteTokensForSpan(cacheAdapter, {
            helpsKey: resourceKey,
            helpsStamp: cacheCtx.helpsStamp,
            olKey: cacheCtx.olKey,
            olStamp: cacheCtx.olStamp,
            book: bookCode,
            startChapter,
            endChapter,
          })
          const { hits, misses } = subtractCachedQuoteHits(needsBuild, cached)
          for (const [id, tokens] of hits) {
            hitById.set(id, cachedToQuoteTokens(tokens))
          }
          remaining = misses
        } catch {
          /* rebuild */
        }
      }

      if (lifecycle.cancelled || gen !== runGenRef.current) return

      // Full cache hit.
      if (remaining.length === 0) {
        apply(
          mergeQuotePass({
            links,
            byId: hitById,
            readyIds: new Set(hitById.keys()),
            deferredIds: new Set(),
            startChapter,
            endChapter,
          }),
          true
        )
        return
      }

      // Paint cache hits immediately; finish misses via worker/sync.
      if (hitById.size > 0) {
        apply(
          mergeQuotePass({
            links,
            byId: hitById,
            readyIds: new Set(hitById.keys()),
            deferredIds: new Set(remaining.map((l) => l.id)),
            startChapter,
            endChapter,
          }),
          false
        )
      }

      // Tiny remaining batches: sync is cheaper than a worker round-trip.
      if (remaining.length <= HELPS_SYNC_MAX_LINKS) {
        const syncBuilt = await buildQuotesViaWorkerOrSync({
          bookCode,
          links: remaining,
          originalContent,
          startChapter,
          endChapter,
        })
        if (lifecycle.cancelled || gen !== runGenRef.current) return
        const byId = new Map([...hitById, ...syncBuilt])
        apply(
          mergeQuotePass({
            links,
            byId,
            readyIds: new Set(byId.keys()),
            deferredIds: new Set(),
            startChapter,
            endChapter,
          }),
          true
        )
        if (cacheCtx) await persistBuilt(syncBuilt, cacheCtx)
        return
      }

      const startVerse = helpsRef.verse || 1
      const { priority, deferred } = partitionHelpsWork(remaining, { startVerse })
      const deferredIds = new Set(deferred.map((l) => l.id))

      const priorityById = await buildQuotesViaWorkerOrSync({
        bookCode,
        links: priority,
        originalContent,
        startChapter,
        endChapter,
      })
      if (lifecycle.cancelled || gen !== runGenRef.current) return

      const pass1ById = new Map([...hitById, ...priorityById])
      apply(
        mergeQuotePass({
          links,
          byId: pass1ById,
          readyIds: new Set(pass1ById.keys()),
          deferredIds,
          startChapter,
          endChapter,
        }),
        true
      )
      if (cacheCtx) await persistBuilt(priorityById, cacheCtx)

      if (deferred.length === 0 || lifecycle.cancelled || gen !== runGenRef.current) return

      lifecycle.cancelIdle = scheduleIdle(() => {
        if (lifecycle.cancelled || gen !== runGenRef.current) return
        void (async () => {
          const deferredById = await buildQuotesViaWorkerOrSync({
            bookCode,
            links: deferred,
            originalContent,
            startChapter,
            endChapter,
          })
          if (lifecycle.cancelled || gen !== runGenRef.current) return

          const allById = new Map([...pass1ById, ...deferredById])
          apply(
            mergeQuotePass({
              links,
              byId: allById,
              readyIds: new Set(allById.keys()),
              deferredIds: new Set(),
              startChapter,
              endChapter,
            }),
            true
          )
          if (cacheCtx) await persistBuilt(deferredById, cacheCtx)
        })()
      })
    })()

    return () => {
      lifecycle.cancelled = true
      lifecycle.cancelIdle?.()
    }
  }, [
    links,
    originalContent,
    helpsRef.book,
    helpsRef.verse,
    startChapter,
    endChapter,
    scrollActivity.unsettled,
    requestKey,
    resourceKey,
    cacheAdapter,
    catalogManager,
  ])

  const quoteBuildReady =
    skipQuoteRebuild ||
    isQuoteBuildReady({
      loadingOriginal,
      originalContent,
      originalError,
      quotesSettled,
    }) ||
    (quotesSettled && staleQuotesAreUnderlineReady(linksWithQuotes))

  return {
    linksWithQuotes,
    loadingOriginal,
    originalError,
    hasOriginalContent: !!originalContent && originalContent.length > 0,
    quoteBuildReady,
  }
}
