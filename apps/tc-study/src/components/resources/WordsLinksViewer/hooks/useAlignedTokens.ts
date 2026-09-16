/**
 * useAlignedTokens Hook - STEP 3 of TSV Alignment Algorithm
 *
 * Aligns OL quote tokens to target-language scripture tokens.
 * Cache-first: read helps-align rows and reconstruct against prepared:scripture
 * full tokens when available; live-align only misses. Target scripture identity
 * comes from the shared helps target key (panel selection / catalog) — not from
 * SCRIPTURE_TOKENS. Broadcast tokens remain an optional live-align fallback when
 * prepared full is absent and a ScriptureViewer is mounted.
 */

import { useEffect, useRef, useState } from 'react'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { useCacheAdapter, useCatalogManager, useCurrentReference } from '../../../../contexts'
import {
  batchAlignLinks,
  targetTokensAreAlignReady,
  type AlignLinkInput,
  type AlignLinkResult,
} from '../../../../features/helps/batchAlignLinks'
import {
  broadcastTokensCoverFullChapter,
  planAlignCacheHydrate,
  resolveLiveAlignTargetSource,
} from '../../../../features/helps/alignCacheHydratePlan'
import {
  alignRowHasDisplayText,
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
import { scriptureTokensContentStamp } from '../../../../features/scripture/scriptureTokensBookNav'
import { logHelpsAlignMisses } from '../../../../features/helps/helpsQuoteBuildDebug'
import {
  HELPS_CACHE_HYDRATE_BUDGET_MS,
  settleHelpsCacheContext,
  shouldSyncHelpsAlign,
} from '../../../../features/helps/helpsCacheContextBudget'
import { resourceContentStamp } from '../../../../features/helps/resourceContentStamp'
import { resolveOriginalLanguageKey } from '../../../../features/helps/olLoadCache'
import {
  pinReferenceWhileScrolling,
  shouldEnqueueQuoteBuild,
} from '../../../../features/nav/chapterScrollActivity'
import {
  reuseHelpsAlignRows,
  shouldSkipHelpsAlignRebuild,
  helpsAlignRowsStillPending,
  type HelpsTokenCacheRow,
} from '../../../../features/helps/helpsTokenReuse'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import { measureScripturePerfSync } from '../../../../features/perf/scripturePerf'
import { readPreparedUnit } from '../../../../features/prepare/prepareCache'
import { extractPreparedBroadcastTokens } from '../../../../features/scripture/extractPreparedBroadcastTokens'
import {
  ensurePreparedFullChapter,
} from '../../../../features/scripture/ensurePreparedFullChapter'
import {
  SCRIPTURE_PREPARE_VERSION,
  type ScriptureFullChapter,
} from '../../../../features/scripture/scripturePreparer'
import { getLastScriptureTokensSourceResourceId } from '../../../../features/helps/scriptureTokensStore'
import {
  resolveHelpsTargetScriptureKey,
  useHelpsTargetScriptureKey,
} from '../../../../features/helps/helpsTargetScripture'
import { RESOURCE_TYPE_IDS } from '../../../../resourceTypes/resourceTypeIds'
import {
  batchAlignInWorker,
  subscribePrepareReady,
} from '../../../../workers/prepareClient'
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
  /** Wrong-book tokens can share a count; content must still retrigger align. */
  tokenContentStamp: string
  /** prepared:full landed without SCRIPTURE_TOKENS (collapsed scripture). */
  preparedTick?: number
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
    args.tokenContentStamp,
    args.preparedTick ?? 0,
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
  /** Bumps when prepared:scripture full lands so align re-hydrates without SCRIPTURE_TOKENS. */
  const [preparedTick, setPreparedTick] = useState(0)
  const cacheAdapter = useCacheAdapter() as HelpsAlignCacheAdapter | null
  const catalogManager = useCatalogManager()

  const {
    tokens: targetTokens,
    reference: tokenReference,
    hasTokens,
    resourceMetadata,
    sourceResourceId,
  } = useScriptureTokens({ resourceId })

  // Shared SoT catalog key (panel selection) — not gated on SCRIPTURE_TOKENS.
  const sharedTargetKey = useHelpsTargetScriptureKey()
  const targetKey =
    resolveHelpsTargetScriptureKey({
      sharedKey: sharedTargetKey,
      broadcastKey: sourceResourceId,
      lastKnownKey: getLastScriptureTokensSourceResourceId(),
    }) ?? ''

  useEffect(() => {
    if (!targetKey || !helpsRef.book) return
    const bookCode = helpsRef.book.toLowerCase()
    const start = helpsRef.chapter || 1
    const end = helpsRef.endChapter || start
    return subscribePrepareReady((msg) => {
      if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
      if (msg.resourceKey !== targetKey) return
      if (msg.bookId.toLowerCase() !== bookCode) return
      if (msg.tier !== 'full' && msg.tier !== 'both') return
      if (msg.unit < start || msg.unit > end) return
      setPreparedTick((n) => n + 1)
    })
  }, [targetKey, helpsRef.book, helpsRef.chapter, helpsRef.endChapter])

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
                // Scroll gate: keep pending only while quotes are still building.
                alignmentPending: !quoteBuildReady,
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
      tokenContentStamp: scriptureTokensContentStamp(targetTokens),
      preparedTick,
    })
    if (fingerprint === fingerprintRef.current && lastAlignedRef.current.length > 0) {
      if (!helpsAlignRowsStillPending(lastAlignedRef.current)) {
        setLinksWithAlignedTokens(lastAlignedRef.current)
        return
      }
      // Same fingerprint but still pending — fall through and retry align.
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
      logHelpsAlignMisses({
        stage: 'align',
        resourceKey,
        bookCode,
        results: merged.map((row) => ({
          id: row.id,
          reference: row.reference,
          origWords: row.origWords,
          quoteTokens: row.quoteTokens,
          quoteStatus: row.quoteStatus,
          alignedTokens: row.alignedTokens,
          semanticIds: row.semanticIds,
          quoteReady: row.quoteReady,
        })),
        hasTargetTokens: hasTokens,
        quoteBuildReady,
        passageStartChapter: currentChapter,
        passageEndChapter: endChapter,
        tokenBook: tokenReference?.book ?? bookCode,
        tokenChapter,
        tokenEndChapter,
        tokenStartVerse,
        tokenEndVerse,
      })
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
      const tokensAlignReady =
        options.hasTokens && targetTokensAreAlignReady(tokens, textLanguage)
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
        hasTokens: tokensAlignReady,
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

      setLoadingAligned(true)

      const preferSync = shouldSyncHelpsAlign({
        linkCount: alignLinks.length,
        syncMaxLinks: HELPS_SYNC_MAX_LINKS,
        quoteBuildReady,
        linksHaveQuoteTokens: alignLinks.some((l) => (l.quoteTokens?.length ?? 0) > 0),
      })

      if (preferSync) {
        const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
          batchAlignLinks(args)
        )
        finish(syncResults)
        return
      }

      void batchAlignInWorker(args)
        .then((results) => {
          if (gen !== genRef.current) return
          finish(results)
        })
        .catch(() => {
          if (gen !== genRef.current) return
          const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
            batchAlignLinks(args)
          )
          finish(syncResults)
        })
    }

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
        // Hydrate budget (not soft 250ms): refresh must key warm helps-align rows
        // before falling through to warm.worker live-align (8s RPC risk).
        const ctx = await settleHelpsCacheContext(
          resolveAlignCacheContext({
            catalogManager,
            helpsKey: resourceKey,
            targetKey,
            bookCode,
          }),
          HELPS_CACHE_HYDRATE_BUDGET_MS
        )
        if (gen !== genRef.current) return
        if (!ctx) {
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

        // Always read helps-align IDB before deciding to live-align. Skipping the
        // cache when prepared:full was briefly missing forced a full rebuild.
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

        // Load prepared full for each chapter; fall back to whole-chapter broadcast.
        // Helps-side ensure so collapsed / unmounted ScriptureViewer still builds.
        const chapterTokens = new Map<number, OptimizedToken[]>()
        for (let ch = currentChapter; ch <= endChapter; ch++) {
          let full = await readPreparedUnit<ScriptureFullChapter>(
            cacheAdapter,
            'scripture',
            targetKey,
            bookCode,
            ch,
            'full',
            SCRIPTURE_PREPARE_VERSION
          )
          if (!full?.blocks?.length) {
            const ensured = await ensurePreparedFullChapter(
              cacheAdapter,
              targetKey,
              bookCode,
              ch
            )
            full = ensured.full
          }
          if (!full?.blocks?.length) continue
          chapterTokens.set(
            ch,
            extractPreparedBroadcastTokens(bookCode, ch, full, 1, 999) as OptimizedToken[]
          )
        }
        if (gen !== genRef.current) return

        const canUseBroadcast = broadcastTokensCoverFullChapter({
          hasTokens,
          passageStartChapter: currentChapter,
          passageEndChapter: endChapter,
          tokenChapter,
          tokenEndChapter,
          tokenStartVerse,
          tokenEndVerse,
        })
        if (canUseBroadcast && currentChapter === endChapter && !chapterTokens.has(currentChapter)) {
          chapterTokens.set(currentChapter, targetTokens)
        }

        let canReconstruct = true
        for (let ch = currentChapter; ch <= endChapter; ch++) {
          if (!chapterTokens.has(ch)) {
            canReconstruct = false
            break
          }
        }

        const preparedFlatPreview = canReconstruct
          ? Array.from(chapterTokens.values()).flat()
          : []
        const alignReadyTokens =
          (preparedFlatPreview.length > 0 &&
            targetTokensAreAlignReady(preparedFlatPreview, textLanguage)) ||
          (hasTokens && targetTokensAreAlignReady(targetTokens, textLanguage))

        // Retry helps-align m:0 once zaln-ready tokens exist — premature settles
        // must not permanently lock TN chips on ol-fallback.
        const { hits, misses } = subtractCachedAlignHits(links, cached, {
          retrySettledMisses: alignReadyTokens,
        })

        // Non-miss hits that carry stored display texts can paint ULT chips
        // before prepared / SCRIPTURE_TOKENS arrive (refresh path).
        let canPaintDisplay = hits.size > 0
        if (canPaintDisplay) {
          for (const row of hits.values()) {
            if (row.m === 0) continue // settled miss — no chip expected
            if (!alignRowHasDisplayText(row)) {
              canPaintDisplay = false
              break
            }
          }
        }

        const plan = planAlignCacheHydrate({
          canReconstruct,
          hitCount: hits.size,
          missCount: misses.length,
          // Prepared chapter tokens count as "have target" — do not wait on broadcast.
          hasAnyTargetTokens: hasTokens || chapterTokens.size > 0,
          canPaintDisplay,
        })

        if (plan === 'wait-for-tokens') {
          // Full IDB hit — keep chips pending until prepared/broadcast can reconstruct.
          apply(
            links.map((link, index) => ({
              index,
              id: link.id,
              alignedTokens: undefined,
              semanticIds: undefined,
              quoteStatus: resolveHelpsQuoteStatus({
                hasAlignedTokens: false,
                // Always pending while waiting for target tokens (never false
                // ol-fallback just because quote-build settled).
                alignmentPending: true,
                olQuote: link.origWords,
              }),
            }))
          )
          return
        }

        if (plan === 'live-align') {
          // Prefer prepared:full over broadcast — cold miss must not wait on
          // ScriptureViewer SCRIPTURE_TOKENS when prepare worker already wrote IDB.
          const preparedFlat = canReconstruct
            ? Array.from(chapterTokens.values()).flat()
            : null
          const liveSrc = resolveLiveAlignTargetSource({
            preparedFlat,
            broadcastTokens: targetTokens,
            hasBroadcastTokens: hasTokens,
            currentChapter,
            endChapter,
            tokenChapter,
            tokenEndChapter,
            tokenStartVerse,
            tokenEndVerse,
          })
          runLiveAlign(
            toAlignInputs(links),
            liveSrc.usePrepared && preparedFlat ? preparedFlat : targetTokens,
            {
              hasTokens: liveSrc.hasTokens,
              tokenChapter: liveSrc.tokenChapter,
              tokenEndChapter: liveSrc.tokenEndChapter,
              tokenStartVerse: liveSrc.tokenStartVerse,
              tokenEndVerse: liveSrc.tokenEndVerse,
              persistCanonical: preparedFlat,
            }
          )
          return
        }

        const results: AlignLinkResult[] = []

        for (let index = 0; index < links.length; index++) {
          const link = links[index]!
          const hit = hits.get(link.id)
          if (!hit) continue
          const ch = chapterOfLink(link)
          const vs = verseOfLink(link)
          const tokensForChapter =
            plan === 'paint-display' ? [] : (chapterTokens.get(ch) ?? [])
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
          // Display-text paint: show ULT chips immediately (no verse-span gate).
          if (plan === 'paint-display') {
            results.push({
              index,
              id: link.id,
              alignedTokens: reconstructed.alignedTokens,
              semanticIds: reconstructed.semanticIds,
              quoteStatus: reconstructed.quoteStatus,
            })
            continue
          }
          // Prepared:full reconstruct — whole-chapter tokens; do not wait on
          // SCRIPTURE_TOKENS broadcast or its verse-span hydrate.
          if (plan === 'reconstruct') {
            results.push({
              index,
              id: link.id,
              alignedTokens: reconstructed.alignedTokens,
              semanticIds: reconstructed.semanticIds,
              quoteStatus: reconstructed.quoteStatus,
            })
            continue
          }
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
                // Missing scripture tokens: stay pending (never false ol-fallback).
                // Out-of-span with tokens → settled miss.
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
                    alignmentPending: !quoteBuildReady,
                    olQuote: link.origWords,
                  }),
                }
              )
            })
          )
          return
        }

        // Live-align misses (including retried m:0) against prepared full when
        // present; otherwise broadcast. Never claim hasTokens with an empty array.
        const flatTokens: OptimizedToken[] = []
        for (let ch = currentChapter; ch <= endChapter; ch++) {
          flatTokens.push(...(chapterTokens.get(ch) ?? []))
        }
        const missLiveSrc = resolveLiveAlignTargetSource({
          preparedFlat: flatTokens.length > 0 ? flatTokens : null,
          broadcastTokens: targetTokens,
          hasBroadcastTokens: hasTokens,
          currentChapter,
          endChapter,
          tokenChapter,
          tokenEndChapter,
          tokenStartVerse,
          tokenEndVerse,
        })
        const missTokens =
          missLiveSrc.usePrepared && flatTokens.length > 0 ? flatTokens : targetTokens
        const missAlignReady =
          missLiveSrc.hasTokens && targetTokensAreAlignReady(missTokens, textLanguage)

        if (!missAlignReady) {
          // Paint cache hits; keep misses pending until zaln-ready tokens arrive.
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

        const missInputs = toAlignInputs(misses)
        const missArgs = {
          links: missInputs,
          targetTokens: missTokens,
          bookCode,
          currentChapter,
          endChapter,
          tokenBook: bookCode,
          tokenChapter: missLiveSrc.tokenChapter,
          tokenEndChapter: missLiveSrc.tokenEndChapter,
          tokenStartVerse: missLiveSrc.tokenStartVerse,
          tokenEndVerse: missLiveSrc.tokenEndVerse,
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
                  alignmentPending: !quoteBuildReady,
                  olQuote: link.origWords,
                }),
              }
            )
          })
          apply(ordered)
          // Persist only against prepared full positions (not broadcast-only).
          void persistAlignResults(
            missResults,
            missLiveSrc.usePrepared && flatTokens.length > 0 ? flatTokens : null
          )
        }

        setLoadingAligned(true)

        const preferSyncMisses = shouldSyncHelpsAlign({
          linkCount: missInputs.length,
          syncMaxLinks: HELPS_SYNC_MAX_LINKS,
          quoteBuildReady,
          linksHaveQuoteTokens: missInputs.some((l) => (l.quoteTokens?.length ?? 0) > 0),
        })

        if (preferSyncMisses) {
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
        return
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
    targetKey,
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
    preparedTick,
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
