/**
 * Preload TA / entry / TW titles and TW first-paragraph previews for CombinedHelps rows.
 * Runs on idle with a concurrency cap so chapter changes do not fan out on the critical path.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useEffect, useState } from 'react'
import { parseTWLink } from '../../../features/helps/quoteTokens'
import { markScripturePerfEnd, markScripturePerfStart } from '../../../features/perf/scripturePerf'
import type { LinkWithAlignments, NoteWithAlignments } from './useCombinedHelpsMerge'

export interface UseCombinedHelpsTitlePreloadParams {
  displayNotes: NoteWithAlignments[]
  displayLinks: LinkWithAlignments[]
  fetchTATitle: (note: TranslationNote) => void
  fetchEntryTitle: (rcLink: string) => void
  invalidateTitles: () => void
  twTitles: Map<string, string>
  twLoadingTitles: Set<string>
  fetchTWTitle: (link: TranslationWordsLink) => void
  twPreviews: Map<string, string>
  twLoadingPreviews: Set<string>
  fetchTWPreview: (link: TranslationWordsLink) => void
}

const TITLE_PRELOAD_CONCURRENCY = 4

function scheduleIdle(run: () => void): () => void {
  if (typeof requestIdleCallback === 'function') {
    const id = requestIdleCallback(() => run(), { timeout: 1200 })
    return () => cancelIdleCallback(id)
  }
  const t = window.setTimeout(run, 32)
  return () => window.clearTimeout(t)
}

export function useCombinedHelpsTitlePreload({
  displayNotes,
  displayLinks,
  fetchTATitle,
  fetchEntryTitle,
  invalidateTitles,
  twTitles,
  twLoadingTitles,
  fetchTWTitle,
  twPreviews,
  twLoadingPreviews,
  fetchTWPreview,
}: UseCombinedHelpsTitlePreloadParams) {
  const [entryTitleRefreshTrigger, setEntryTitleRefreshTrigger] = useState(0)

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateTitles()
        setEntryTitleRefreshTrigger((t) => t + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [invalidateTitles])

  useEffect(() => {
    let cancelled = false
    let inFlight = 0
    const queue: Array<() => void> = []

    const pump = () => {
      while (!cancelled && inFlight < TITLE_PRELOAD_CONCURRENCY && queue.length > 0) {
        const job = queue.shift()!
        inFlight += 1
        try {
          job()
        } finally {
          inFlight -= 1
        }
      }
    }

    const cancelIdle = scheduleIdle(() => {
      if (cancelled) return
      markScripturePerfStart('title-preload', String(displayNotes.length + displayLinks.length))
      try {
        for (const note of displayNotes) {
          if (note.supportReference?.startsWith('rc://')) {
            queue.push(() => fetchTATitle(note))
          }
          if (note.note) {
            const matches = note.note.match(/rc:\/\/[^\s\])\n]+/g)
            matches?.forEach((rcLink) => {
              queue.push(() => fetchEntryTitle(rcLink))
            })
          }
        }
        for (const link of displayLinks) {
          const twInfo = parseTWLink(link.twLink)
          const cacheKey = `${twInfo.category}/${twInfo.term}`
          if (!twTitles.has(cacheKey) && !twLoadingTitles.has(cacheKey)) {
            queue.push(() => fetchTWTitle(link))
          }
          if (!twPreviews.has(cacheKey) && !twLoadingPreviews.has(cacheKey)) {
            queue.push(() => fetchTWPreview(link))
          }
        }
        pump()
      } finally {
        markScripturePerfEnd('title-preload', String(displayNotes.length + displayLinks.length))
      }
    })

    return () => {
      cancelled = true
      cancelIdle()
      queue.length = 0
    }
  }, [
    displayNotes,
    displayLinks,
    fetchTATitle,
    fetchEntryTitle,
    fetchTWTitle,
    fetchTWPreview,
    twTitles,
    twLoadingTitles,
    twPreviews,
    twLoadingPreviews,
    entryTitleRefreshTrigger,
  ])
}
