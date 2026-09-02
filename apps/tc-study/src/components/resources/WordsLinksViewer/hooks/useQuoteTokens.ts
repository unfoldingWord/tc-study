/**
 * useQuoteTokens Hook - STEP 2 of TSV Alignment Algorithm
 *
 * Builds quoteTokens for TWL links by matching origWords to original language tokens.
 * Sync build first (so align does not settle a miss while quotes are in flight),
 * then optional worker refresh for large batches.
 *
 * `quoteBuildReady` stays false until the sync pass for the *current* links+OL
 * key has completed — OL-loaded alone must not let align paint ol-fallback.
 */

import { useEffect, useRef, useState } from 'react'
import { useCurrentReference } from '../../../../contexts'
import {
  pinReferenceWhileScrolling,
  shouldEnqueueQuoteBuild,
} from '../../../../features/nav/chapterScrollActivity'
import { useChapterScrollActivity } from '../../../../features/nav/usePinnedHelpsReference'
import { isQuoteBuildReady } from '../../../../features/helps/resolveHelpsQuoteStatus'
import { buildQuoteTokens } from '../../../../features/helps/quoteTokens'
import { batchQuotesInWorker } from '../../../../workers/prepareClient'
import type { TranslationWordsLink } from '../types'
import { useOriginalLanguageContent } from './useOriginalLanguageContent'
import { useScriptureContentRevision } from './useScriptureTokens'

interface UseQuoteTokensOptions {
  resourceKey: string
  resourceId: string
  links: TranslationWordsLink[]
}

const WORKER_QUOTE_MIN_LINKS = 24

function chapterOfLink(link: TranslationWordsLink): number {
  const refParts = link.reference.split(':')
  return parseInt(refParts[0] || '1', 10)
}

function chapterInSpan(chapter: number, start: number, end: number): boolean {
  return chapter >= start && chapter <= end
}

function buildQuotesSync(
  links: TranslationWordsLink[],
  originalContent: NonNullable<ReturnType<typeof useOriginalLanguageContent>['originalContent']>,
  bookCode: string,
  startChapter: number,
  endChapter: number
): TranslationWordsLink[] {
  return links.map((link) => {
    if (link.quoteTokens && link.quoteTokens.length > 0) return link
    if (!chapterInSpan(chapterOfLink(link), startChapter, endChapter)) return link
    const quoteTokens = buildQuoteTokens({
      link,
      originalChapters: originalContent,
      bookCode,
    })
    return {
      ...link,
      quoteTokens: quoteTokens.length > 0 ? quoteTokens : undefined,
    }
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

export function useQuoteTokens({ resourceKey, resourceId, links }: UseQuoteTokensOptions) {
  const currentRef = useCurrentReference()
  const scrollActivity = useChapterScrollActivity()
  const helpsRef = pinReferenceWhileScrolling(currentRef, scrollActivity)
  const lastQuotesRef = useRef(links)
  const scriptureRevision = useScriptureContentRevision(resourceId)

  const {
    originalContent,
    loading: loadingOriginal,
    error: originalError,
  } = useOriginalLanguageContent({ resourceKey, resourceId, scriptureRevision })

  const [linksWithQuotes, setLinksWithQuotes] = useState<TranslationWordsLink[]>(() =>
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
  // Key mismatch ⇒ this render's links/OL have not finished quote-build yet.
  const quotesSettled = settledRequestKey === requestKey

  useEffect(() => {
    if (!shouldEnqueueQuoteBuild(scrollActivity.unsettled)) {
      setLinksWithQuotes(
        lastQuotesRef.current.length > 0 ? lastQuotesRef.current : links
      )
      setSettledRequestKey('')
      return
    }

    if (!originalContent || originalContent.length === 0 || links.length === 0) {
      setLinksWithQuotes(links)
      lastQuotesRef.current = links
      setSettledRequestKey('')
      return
    }

    const bookCode = helpsRef.book?.toUpperCase() || ''
    const gen = ++runGenRef.current

    const needsBuild = links.filter(
      (link) =>
        !(link.quoteTokens && link.quoteTokens.length > 0) &&
        chapterInSpan(chapterOfLink(link), startChapter, endChapter)
    )

    // Sync first so the next render's align sees quoteTokens + quoteBuildReady together.
    const syncNext =
      needsBuild.length === 0
        ? links.map((link) => link)
        : buildQuotesSync(links, originalContent, bookCode, startChapter, endChapter)

    if (gen === runGenRef.current) {
      lastQuotesRef.current = syncNext
      setLinksWithQuotes(syncNext)
      setSettledRequestKey(requestKey)
    }

    if (needsBuild.length === 0 || needsBuild.length < WORKER_QUOTE_MIN_LINKS) return

    void batchQuotesInWorker({
      bookCode,
      links: needsBuild,
      originalChapters: originalContent,
    })
      .then((results) => {
        if (gen !== runGenRef.current) return

        const byId = new Map<string, unknown[]>()
        for (const row of results) {
          const link = needsBuild[row.index]
          if (!link) continue
          const tokens = row.tokens as TranslationWordsLink['quoteTokens']
          if (tokens && tokens.length > 0) byId.set(link.id, tokens)
        }

        const next = links.map((link) => {
          if (link.quoteTokens && link.quoteTokens.length > 0) return link
          if (!chapterInSpan(chapterOfLink(link), startChapter, endChapter)) return link
          const tokens = byId.get(link.id) as TranslationWordsLink['quoteTokens']
          return tokens?.length ? { ...link, quoteTokens: tokens } : link
        })
        lastQuotesRef.current = next
        setLinksWithQuotes(next)
        setSettledRequestKey(requestKey)
      })
      .catch(() => {
        /* sync already applied */
      })
  }, [
    links,
    originalContent,
    helpsRef.book,
    startChapter,
    endChapter,
    scrollActivity.unsettled,
    requestKey,
  ])

  const quoteBuildReady = isQuoteBuildReady({
    loadingOriginal,
    originalContent,
    originalError,
    quotesSettled,
  })

  return {
    linksWithQuotes,
    loadingOriginal,
    originalError,
    hasOriginalContent: !!originalContent && originalContent.length > 0,
    quoteBuildReady,
  }
}
