/**
 * useAlignedTokens Hook - STEP 3 of TSV Alignment Algorithm
 *
 * Aligns OL quote tokens to target-language scripture tokens.
 * Cache-first: read helps-align rows and reconstruct against prepared:scripture
 * full tokens when available; live-align only misses. Falls back to broadcast
 * SCRIPTURE_TOKENS when prepared full is absent.
 */

import { useEffect, useRef, useState } from 'react'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { useCacheAdapter, useCatalogManager, useCurrentReference } from '../../../../contexts'
import {
  batchAlignLinks,
  type AlignLinkInput,
  type AlignLinkResult,
} from '../../../../features/helps/batchAlignLinks'
import {
  mergeAndWriteCachedAlignments,
  readCachedAlignmentsForSpan,
  subtractCachedAlignHits,
  targetContentStamp,
  type CachedAlignments,
  type HelpsAlignCacheAdapter,
} from '../../../../features/helps/helpsAlignCache'
import { HELPS_SYNC_MAX_LINKS } from '../../../../features/helps/helpsWorkStaging'
import { olContentStamp } from '../../../../features/helps/helpsQuoteCache'
import {
  compactFromAlignResult,
  reconstructAlignFromPositions,
} from '../../../../features/helps/reconstructAlignFromPositions'
import { isOriginalLanguageCode } from '../../../../features/helps/resolveAlignedQuoteTokens'
import {
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from '../../../../features/helps/resolveHelpsQuoteStatus'
import { resourceContentStamp } from '../../../../features/helps/resourceContentStamp'
import { resolveOriginalLanguageKey } from '../../../../features/helps/olLoadCache'
import {
  pinReferenceWhileScrolling,
  shouldEnqueueQuoteBuild,
} from '../../../../features/nav/chapterScrollActivity'
import {
  reuseHelpsAlignRows,
  shouldSkipHelpsAlignRebuild,
  type HelpsTokenCacheRow,
} from '../../../../features/helps/helpsTokenReuse'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import { measureScripturePerfSync } from '../../../../features/perf/scripturePerf'
import { readPreparedUnit } from '../../../../features/prepare/prepareCache'
import { extractPreparedBroadcastTokens } from '../../../../features/scripture/extractPreparedBroadcastTokens'
import {
  SCRIPTURE_PREPARE_VERSION,
  type ScriptureFullChapter,
} from '../../../../features/scripture/scripturePreparer'
import { batchAlignInWorker } from '../../../../workers/prepareClient'
import { useScriptureTokens } from './useScriptureTokens'

/** Minimal link shape needed to attach aligned tokens (TN pseudo-links + full TWL rows). */
type LinkQuotesInput = {
  id: string
  reference: string
  origWords?: string
  quoteTokens?: OptimizedToken[]
  occurrence?: string
  quoteReady?: boolean
}

interface UseAlignedTokensOptions<TLink extends LinkQuotesInput> {
  resourceKey: string
  resourceId: string
  links: TLink[]
  quoteBuildReady?: boolean
}

type AlignedLink<TLink extends LinkQuotesInput> = TLink & {
  alignedTokens: AlignLinkResult['alignedTokens']
  semanticIds?: string[]
  quoteStatus: HelpsQuoteStatus
}

function mergeAlignResults<TLink extends LinkQuotesInput>(
  links: TLink[],
  results: AlignLinkResult[]
): AlignedLink<TLink>[] {
  const byId = new Map(results.map((r) => [r.id, r]))
  return links.map((link) => {
    const hit = byId.get(link.id)
    if (!hit) {
      return {
        ...link,
        alignedTokens: undefined,
        quoteStatus: resolveHelpsQuoteStatus({
          hasAlignedTokens: false,
          alignmentPending: true,
          olQuote: link.origWords,
        }),
      }
    }
    return {
      ...link,
      alignedTokens: hit.alignedTokens,
      semanticIds: hit.semanticIds,
      quoteStatus: hit.quoteStatus,
    }
  })
}

/** Strip to clone-safe fields for the prepare worker. */
function toAlignInputs(links: readonly LinkQuotesInput[]): AlignLinkInput[] {
  return links.map((link) => ({
    id: link.id,
    reference: link.reference,
    origWords: link.origWords,
    occurrence: link.occurrence,
    quoteReady: link.quoteReady,
    quoteTokens: link.quoteTokens?.map((t) => ({
      id: t.id,
      text: t.text,
      type: t.type,
      occurrence: t.occurrence,
      content: (t as { content?: string }).content ?? t.text,
    })) as OptimizedToken[] | undefined,
  }))
}

function chapterOfLink(link: LinkQuotesInput): number {
  return parseInt(link.reference.split(':')[0] || '1', 10)
}

function verseOfLink(link: LinkQuotesInput): number {
  return parseInt(link.reference.split(':')[1] || '1', 10)
}

function alignFingerprint(args: {
  book: string
  chapter: number
  endChapter: number
  hasTokens: boolean
  tokenCount: number
  tokenChapter: number
  tokenEndChapter: number
  tokenStartVerse: number
  tokenEndVerse: number
  quoteBuildReady: boolean
  linkIds: string
  sourceResourceId: string
}): string {
  return [
    args.book,
    args.chapter,
    args.endChapter,
    args.hasTokens ? 1 : 0,
    args.tokenCount,
    args.tokenChapter,
    args.tokenEndChapter,
    args.tokenStartVerse,
    args.tokenEndVerse,
    args.quoteBuildReady ? 1 : 0,
    args.sourceResourceId,
    args.linkIds,
  ].join('|')
}

async function resolveAlignCacheContext(args: {
  catalogManager: { getResourceMetadata: (key: string) => Promise<unknown> }
  helpsKey: string
  targetKey: string
  bookCode: string
}): Promise<{
  helpsStamp: string
  olKey: string
  olStamp: string
  targetStamp: string
} | null> {
  try {
    const ol = resolveOriginalLanguageKey(args.bookCode)
    if (!ol) return null
    const helpsMeta = (await args.catalogManager.getResourceMetadata(args.helpsKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    const olMeta = (await args.catalogManager.getResourceMetadata(ol.resourceKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    const targetMeta = (await args.catalogManager.getResourceMetadata(args.targetKey)) as
      | { version?: string; release?: { tag_name?: string; published_at?: string } }
      | null
    return {
      helpsStamp: resourceContentStamp(helpsMeta),
      olKey: ol.resourceKey,
      olStamp: olContentStamp(olMeta),
      targetStamp: targetContentStamp(targetMeta),
    }
  } catch {
    return null
  }
}

export function useAlignedTokens<TLink extends LinkQuotesInput>({
  resourceKey,
  resourceId,
  links,
  quoteBuildReady = true,
}: UseAlignedTokensOptions<TLink>) {
  const currentRef = useCurrentReference()
  const scrollActivity = useChapterScrollActivity()
  const helpsRef = pinReferenceWhileScrolling(currentRef, scrollActivity)
  const lastAlignedRef = useRef<AlignedLink<TLink>[]>([])
  const lastAlignedByIdRef = useRef<Map<string, HelpsTokenCacheRow>>(new Map())
  const lastAlignBookRef = useRef(helpsRef.book)
  if (lastAlignBookRef.current !== helpsRef.book) {
    lastAlignBookRef.current = helpsRef.book
    lastAlignedByIdRef.current = new Map()
  }
  for (const link of links) {
    const cached = link as TLink & HelpsTokenCacheRow
    if (
      (Array.isArray(cached.alignedTokens) && cached.alignedTokens.length > 0) ||
      (Array.isArray(cached.semanticIds) && cached.semanticIds.length > 0)
    ) {
      lastAlignedByIdRef.current.set(link.id, {
        quoteTokens: cached.quoteTokens,
        alignedTokens: cached.alignedTokens,
        semanticIds: cached.semanticIds,
        quoteStatus: cached.quoteStatus,
      })
    }
  }
  const genRef = useRef(0)
  const fingerprintRef = useRef('')
  const [linksWithAlignedTokens, setLinksWithAlignedTokens] = useState<AlignedLink<TLink>[]>(
    () => lastAlignedRef.current
  )
  const [loadingAligned, setLoadingAligned] = useState(false)
  const cacheAdapter = useCacheAdapter() as HelpsAlignCacheAdapter | null
  const catalogManager = useCatalogManager()

  const {
    tokens: targetTokens,
    reference: tokenReference,
    hasTokens,
    resourceMetadata,
    sourceResourceId,
  } = useScriptureTokens({ resourceId })

  useEffect(() => {
    if (!shouldEnqueueQuoteBuild(scrollActivity.unsettled)) {
      if (lastAlignedRef.current.length > 0) {
        setLinksWithAlignedTokens(lastAlignedRef.current)
      } else if (links.length > 0) {
        setLinksWithAlignedTokens(
          mergeAlignResults(
            links,
            links.map((link, index) => ({
              index,
              id: link.id,
              alignedTokens: undefined,
              semanticIds: undefined,
              quoteStatus: resolveHelpsQuoteStatus({
                hasAlignedTokens: false,
                alignmentPending: true,
                olQuote: link.origWords,
              }),
            }))
          )
        )
      }
      return
    }

    if (!links || links.length === 0) {
      if (lastAlignedRef.current.length > 0) {
        setLinksWithAlignedTokens(lastAlignedRef.current)
        return
      }
      lastAlignedRef.current = []
      fingerprintRef.current = ''
      setLinksWithAlignedTokens([])
      return
    }

    if (shouldSkipHelpsAlignRebuild({ links, lastById: lastAlignedByIdRef.current })) {
      const reused = reuseHelpsAlignRows(links, lastAlignedByIdRef.current) as AlignedLink<TLink>[]
      lastAlignedRef.current = reused
      for (const row of reused) {
        if (row.alignedTokens?.length || row.semanticIds?.length) {
          lastAlignedByIdRef.current.set(row.id, {
            quoteTokens: row.quoteTokens,
            alignedTokens: row.alignedTokens,
            semanticIds: row.semanticIds,
            quoteStatus: row.quoteStatus,
          })
        }
      }
      setLinksWithAlignedTokens(reused)
      setLoadingAligned(false)
      return
    }

    const bookCode = helpsRef.book?.toLowerCase() || ''
    const currentChapter = helpsRef.chapter || 1
    const endChapter = helpsRef.endChapter || currentChapter
    const textLanguage =
      [resourceMetadata?.language, resourceMetadata?.id].find((v) => isOriginalLanguageCode(v)) ||
      resourceMetadata?.language

    const tokenChapter = tokenReference?.chapter ?? 0
    const tokenEndChapter = tokenReference?.endChapter ?? tokenChapter
    const tokenStartVerse = tokenReference?.verse || 1
    const tokenEndVerse = tokenReference?.endVerse ?? 999
    const targetKey = sourceResourceId ?? ''

    const linkIds = links
      .map((l) => `${l.id}:${l.quoteTokens?.length ?? 0}:${l.quoteReady === false ? 0 : 1}`)
      .join(',')
    const fingerprint = alignFingerprint({
      book: bookCode,
      chapter: currentChapter,
      endChapter,
      hasTokens,
      tokenCount: targetTokens.length,
      tokenChapter,
      tokenEndChapter,
      tokenStartVerse,
      tokenEndVerse,
      quoteBuildReady,
      sourceResourceId: targetKey,
      linkIds,
    })
    if (fingerprint === fingerprintRef.current && lastAlignedRef.current.length > 0) {
      setLinksWithAlignedTokens(lastAlignedRef.current)
      return
    }

    const gen = ++genRef.current
    const apply = (results: AlignLinkResult[]) => {
      if (gen !== genRef.current) return
      const merged = mergeAlignResults(links, results)
      lastAlignedRef.current = merged
      for (const row of merged) {
        if (row.alignedTokens?.length || row.semanticIds?.length) {
          lastAlignedByIdRef.current.set(row.id, {
            quoteTokens: row.quoteTokens,
            alignedTokens: row.alignedTokens,
            semanticIds: row.semanticIds,
            quoteStatus: row.quoteStatus,
          })
        }
      }
      fingerprintRef.current = fingerprint
      setLinksWithAlignedTokens(merged)
      setLoadingAligned(false)
    }

    const persistAlignResults = async (
      results: AlignLinkResult[],
      canonicalTokens: OptimizedToken[] | null
    ) => {
      if (!cacheAdapter || !catalogManager || !targetKey || !bookCode) return
      // Only persist when we aligned against canonical full-chapter tokens.
      if (!canonicalTokens?.length) return
      try {
        const ctx = await resolveAlignCacheContext({
          catalogManager,
          helpsKey: resourceKey,
          targetKey,
          bookCode,
        })
        if (!ctx || gen !== genRef.current) return
        const built: CachedAlignments = {}
        for (const result of results) {
          const link = links.find((l) => l.id === result.id)
          if (!link) continue
          const ch = chapterOfLink(link)
          const vs = verseOfLink(link)
          built[result.id] = compactFromAlignResult({
            alignedTokens: result.alignedTokens,
            quoteTokens: link.quoteTokens,
            bookCode,
            chapter: ch,
            verse: vs,
            occurrence: link.occurrence,
          })
        }
        if (Object.keys(built).length === 0) return
        await mergeAndWriteCachedAlignments(
          cacheAdapter,
          {
            helpsKey: resourceKey,
            helpsStamp: ctx.helpsStamp,
            olKey: ctx.olKey,
            olStamp: ctx.olStamp,
            targetKey,
            targetStamp: ctx.targetStamp,
            book: bookCode,
          },
          built,
          (id) => {
            const link = links.find((l) => l.id === id)
            return link ? chapterOfLink(link) : 0
          }
        )
      } catch {
        /* non-fatal persist */
      }
    }

    const runLiveAlign = (
      alignLinks: AlignLinkInput[],
      tokens: OptimizedToken[],
      options: {
        hasTokens: boolean
        tokenChapter: number
        tokenEndChapter: number
        tokenStartVerse: number
        tokenEndVerse: number
        persistCanonical: OptimizedToken[] | null
      }
    ) => {
      const args = {
        links: alignLinks,
        targetTokens: tokens,
        bookCode,
        currentChapter,
        endChapter,
        tokenBook: tokenReference?.book ?? bookCode,
        tokenChapter: options.tokenChapter,
        tokenEndChapter: options.tokenEndChapter,
        tokenStartVerse: options.tokenStartVerse,
        tokenEndVerse: options.tokenEndVerse,
        hasTokens: options.hasTokens,
        quoteBuildReady,
        resourceKey,
        textLanguage,
      }

      const finish = (results: AlignLinkResult[]) => {
        apply(results)
        void persistAlignResults(results, options.persistCanonical)
      }

      if (alignLinks.length === 0) {
        apply([])
        return
      }

      if (alignLinks.length <= HELPS_SYNC_MAX_LINKS) {
        const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
          batchAlignLinks(args)
        )
        finish(syncResults)
        return
      }

      void batchAlignInWorker(args)
        .then((results) => finish(results))
        .catch(() => {
          if (gen !== genRef.current) return
          const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
            batchAlignLinks(args)
          )
          finish(syncResults)
        })
    }

    setLoadingAligned(true)

    const tryCacheFirst = async () => {
      // No scripture owner → same as today (pending / live with empty tokens).
      if (!targetKey || !cacheAdapter || !catalogManager || !bookCode) {
        runLiveAlign(toAlignInputs(links), targetTokens, {
          hasTokens,
          tokenChapter,
          tokenEndChapter,
          tokenStartVerse,
          tokenEndVerse,
          persistCanonical: null,
        })
        return
      }

      try {
        const ctx = await resolveAlignCacheContext({
          catalogManager,
          helpsKey: resourceKey,
          targetKey,
          bookCode,
        })
        if (!ctx || gen !== genRef.current) {
          runLiveAlign(toAlignInputs(links), targetTokens, {
            hasTokens,
            tokenChapter,
            tokenEndChapter,
            tokenStartVerse,
            tokenEndVerse,
            persistCanonical: null,
          })
          return
        }

        // Load prepared full for each chapter in the span; require all for reconstruct.
        const chapterTokens = new Map<number, OptimizedToken[]>()
        let allPrepared = true
        for (let ch = currentChapter; ch <= endChapter; ch++) {
          const full = await readPreparedUnit<ScriptureFullChapter>(
            cacheAdapter,
            'scripture',
            targetKey,
            bookCode,
            ch,
            'full',
            SCRIPTURE_PREPARE_VERSION
          )
          if (!full) {
            allPrepared = false
            break
          }
          chapterTokens.set(
            ch,
            extractPreparedBroadcastTokens(bookCode, ch, full, 1, 999) as OptimizedToken[]
          )
        }

        if (!allPrepared || gen !== genRef.current) {
          // Fall back to broadcast tokens; do not reconstruct against a subset.
          runLiveAlign(toAlignInputs(links), targetTokens, {
            hasTokens,
            tokenChapter,
            tokenEndChapter,
            tokenStartVerse,
            tokenEndVerse,
            persistCanonical: null,
          })
          return
        }

        const cached = await readCachedAlignmentsForSpan(cacheAdapter, {
          helpsKey: resourceKey,
          helpsStamp: ctx.helpsStamp,
          olKey: ctx.olKey,
          olStamp: ctx.olStamp,
          targetKey,
          targetStamp: ctx.targetStamp,
          book: bookCode,
          startChapter: currentChapter,
          endChapter,
        })
        if (gen !== genRef.current) return

        const { hits, misses } = subtractCachedAlignHits(links, cached)
        const results: AlignLinkResult[] = []

        for (let index = 0; index < links.length; index++) {
          const link = links[index]!
          const hit = hits.get(link.id)
          if (!hit) continue
          const ch = chapterOfLink(link)
          const vs = verseOfLink(link)
          const tokensForChapter = chapterTokens.get(ch) ?? []
          const reconstructed = reconstructAlignFromPositions({
            targetTokens: tokensForChapter,
            quoteTokens: link.quoteTokens,
            origWords: link.origWords,
            occurrence: link.occurrence,
            bookCode,
            chapter: ch,
            verse: vs,
            row: hit,
          })
          // Apply display gates: only within token verse span for edge chapters.
          const inTokenSpan =
            ch >= tokenChapter &&
            ch <= tokenEndChapter &&
            (ch > tokenChapter || vs >= tokenStartVerse) &&
            (ch < tokenEndChapter || vs <= tokenEndVerse)
          if (!inTokenSpan || !hasTokens) {
            results.push({
              index,
              id: link.id,
              alignedTokens: undefined,
              semanticIds: reconstructed.semanticIds,
              quoteStatus: resolveHelpsQuoteStatus({
                hasAlignedTokens: false,
                alignmentPending: !hasTokens,
                olQuote: link.origWords,
              }),
            })
            continue
          }
          results.push({
            index,
            id: link.id,
            alignedTokens: reconstructed.alignedTokens,
            semanticIds: reconstructed.semanticIds,
            quoteStatus: reconstructed.quoteStatus,
          })
        }

        if (misses.length === 0) {
          // Preserve order for all links.
          const byId = new Map(results.map((r) => [r.id, r]))
          apply(
            links.map((link, index) => {
              const hit = byId.get(link.id)
              return (
                hit ?? {
                  index,
                  id: link.id,
                  alignedTokens: undefined,
                  semanticIds: undefined,
                  quoteStatus: resolveHelpsQuoteStatus({
                    hasAlignedTokens: false,
                    alignmentPending: true,
                    olQuote: link.origWords,
                  }),
                }
              )
            })
          )
          return
        }

        // Live-align misses against canonical full-chapter tokens for their chapters.
        // Flatten tokens for the passage span (same chapter order as extract).
        const flatTokens: OptimizedToken[] = []
        for (let ch = currentChapter; ch <= endChapter; ch++) {
          flatTokens.push(...(chapterTokens.get(ch) ?? []))
        }

        const missInputs = toAlignInputs(misses)
        const missArgs = {
          links: missInputs,
          targetTokens: flatTokens,
          bookCode,
          currentChapter,
          endChapter,
          tokenBook: bookCode,
          tokenChapter: currentChapter,
          tokenEndChapter: endChapter,
          tokenStartVerse: 1,
          tokenEndVerse: 999,
          hasTokens: true,
          quoteBuildReady,
          resourceKey,
          textLanguage,
        }

        const mergeMisses = (missResults: AlignLinkResult[]) => {
          const byId = new Map<string, AlignLinkResult>()
          for (const r of results) byId.set(r.id, r)
          for (const r of missResults) byId.set(r.id, r)
          const ordered = links.map((link, index) => {
            const hit = byId.get(link.id)
            return (
              hit ?? {
                index,
                id: link.id,
                alignedTokens: undefined,
                semanticIds: undefined,
                quoteStatus: resolveHelpsQuoteStatus({
                  hasAlignedTokens: false,
                  alignmentPending: true,
                  olQuote: link.origWords,
                }),
              }
            )
          })
          apply(ordered)
          void persistAlignResults(missResults, flatTokens)
        }

        if (missInputs.length <= HELPS_SYNC_MAX_LINKS) {
          const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
            batchAlignLinks(missArgs)
          )
          mergeMisses(syncResults)
          return
        }

        void batchAlignInWorker(missArgs)
          .then((missResults) => {
            if (gen !== genRef.current) return
            mergeMisses(missResults)
          })
          .catch(() => {
            if (gen !== genRef.current) return
            const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
              batchAlignLinks(missArgs)
            )
            mergeMisses(syncResults)
          })
      } catch {
        if (gen !== genRef.current) return
        runLiveAlign(toAlignInputs(links), targetTokens, {
          hasTokens,
          tokenChapter,
          tokenEndChapter,
          tokenStartVerse,
          tokenEndVerse,
          persistCanonical: null,
        })
      }
    }

    void tryCacheFirst()
  }, [
    links,
    targetTokens,
    tokenReference,
    hasTokens,
    sourceResourceId,
    helpsRef.book,
    helpsRef.chapter,
    helpsRef.endChapter,
    scrollActivity.unsettled,
    resourceKey,
    resourceMetadata?.language,
    resourceMetadata?.id,
    quoteBuildReady,
    cacheAdapter,
    catalogManager,
  ])

  return {
    linksWithAlignedTokens:
      linksWithAlignedTokens.length > 0 || lastAlignedRef.current.length === 0
        ? linksWithAlignedTokens
        : lastAlignedRef.current,
    loading: loadingAligned,
    loadingAligned,
    alignedError: null as string | null,
    error: null,
    hasTargetContent: hasTokens,
  }
}
