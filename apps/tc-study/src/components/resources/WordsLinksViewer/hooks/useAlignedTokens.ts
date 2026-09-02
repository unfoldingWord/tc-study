/**
 * useAlignedTokens Hook - STEP 3 of TSV Alignment Algorithm
 *
 * Aligns OL quote tokens to target-language scripture tokens.
 * Sync `batchAlignLinks` first (correctness), then optional worker refresh.
 * Uses a generation counter so rapid dep churn cannot cancel the last good apply.
 */

import { useEffect, useRef, useState } from 'react'
import type { OptimizedToken } from '@bt-synergy/resource-parsers'
import { useCurrentReference } from '../../../../contexts'
import {
  batchAlignLinks,
  type AlignLinkInput,
  type AlignLinkResult,
} from '../../../../features/helps/batchAlignLinks'
import { isOriginalLanguageCode } from '../../../../features/helps/resolveAlignedQuoteTokens'
import {
  resolveHelpsQuoteStatus,
  type HelpsQuoteStatus,
} from '../../../../features/helps/resolveHelpsQuoteStatus'
import {
  pinReferenceWhileScrolling,
  shouldEnqueueQuoteBuild,
} from '../../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import { measureScripturePerfSync } from '../../../../features/perf/scripturePerf'
import { batchAlignInWorker } from '../../../../workers/prepareClient'
import { useScriptureTokens } from './useScriptureTokens'

/** Minimal link shape needed to attach aligned tokens (TN pseudo-links + full TWL rows). */
type LinkQuotesInput = {
  id: string
  reference: string
  origWords?: string
  quoteTokens?: OptimizedToken[]
  occurrence?: string
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

const WORKER_ALIGN_MIN_LINKS = 24

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
    quoteTokens: link.quoteTokens?.map((t) => ({
      id: t.id,
      text: t.text,
      type: t.type,
      occurrence: t.occurrence,
      content: (t as { content?: string }).content ?? t.text,
    })) as OptimizedToken[] | undefined,
  }))
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
    args.linkIds,
  ].join('|')
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
  const genRef = useRef(0)
  const fingerprintRef = useRef('')
  const [linksWithAlignedTokens, setLinksWithAlignedTokens] = useState<AlignedLink<TLink>[]>(
    () => lastAlignedRef.current
  )
  const [loadingAligned, setLoadingAligned] = useState(false)

  const { tokens: targetTokens, reference: tokenReference, hasTokens, resourceMetadata } =
    useScriptureTokens({ resourceId })

  useEffect(() => {
    if (!shouldEnqueueQuoteBuild(scrollActivity.unsettled)) {
      if (lastAlignedRef.current.length > 0) {
        setLinksWithAlignedTokens(lastAlignedRef.current)
      } else if (links.length > 0) {
        // Keep cards in pending — never leave quoteStatus undefined (ol-fallback flash).
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
      lastAlignedRef.current = []
      fingerprintRef.current = ''
      setLinksWithAlignedTokens([])
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

    const linkIds = links.map((l) => `${l.id}:${l.quoteTokens?.length ?? 0}`).join(',')
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
      linkIds,
    })
    if (fingerprint === fingerprintRef.current && lastAlignedRef.current.length > 0) {
      setLinksWithAlignedTokens(lastAlignedRef.current)
      return
    }

    const args = {
      links: toAlignInputs(links),
      targetTokens,
      bookCode,
      currentChapter,
      endChapter,
      tokenBook: tokenReference?.book ?? '',
      tokenChapter,
      tokenEndChapter,
      tokenStartVerse,
      tokenEndVerse,
      hasTokens,
      quoteBuildReady,
      resourceKey,
      textLanguage,
    }

    const gen = ++genRef.current
    const apply = (results: AlignLinkResult[]) => {
      if (gen !== genRef.current) return
      const merged = mergeAlignResults(links, results)
      lastAlignedRef.current = merged
      fingerprintRef.current = fingerprint
      setLinksWithAlignedTokens(merged)
      setLoadingAligned(false)
    }

    // Sync first so quote chips / underlines never stay pending behind a cancelled worker.
    setLoadingAligned(true)
    const syncResults = measureScripturePerfSync('align-tokens', bookCode, () =>
      batchAlignLinks(args)
    )
    apply(syncResults)

    if (links.length < WORKER_ALIGN_MIN_LINKS) return

    void batchAlignInWorker(args)
      .then((results) => apply(results))
      .catch(() => {
        /* sync already applied */
      })
  }, [
    links,
    targetTokens,
    tokenReference,
    hasTokens,
    helpsRef.book,
    helpsRef.chapter,
    helpsRef.endChapter,
    scrollActivity.unsettled,
    resourceKey,
    resourceMetadata?.language,
    resourceMetadata?.id,
    quoteBuildReady,
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
