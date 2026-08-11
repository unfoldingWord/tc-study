/**
 * Preload TA / entry / TW titles and TW first-paragraph previews for CombinedHelps rows.
 */

import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { useEffect, useState } from 'react'
import { parseTWLink } from '../../../features/helps/quoteTokens'
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
    if (!displayNotes.length) return
    displayNotes.forEach((note) => {
      if (note.supportReference?.startsWith('rc://')) fetchTATitle(note)
    })
  }, [displayNotes, fetchTATitle])

  useEffect(() => {
    if (!displayNotes.length) return
    displayNotes.forEach((note) => {
      if (!note.note) return
      const matches = note.note.match(/rc:\/\/[^\s\])\n]+/g)
      matches?.forEach((rcLink) => fetchEntryTitle(rcLink))
    })
  }, [displayNotes, fetchEntryTitle, entryTitleRefreshTrigger])

  useEffect(() => {
    if (!displayLinks.length) return
    displayLinks.forEach((link) => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!twTitles.has(cacheKey) && !twLoadingTitles.has(cacheKey)) fetchTWTitle(link)
    })
  }, [displayLinks, twTitles, twLoadingTitles, fetchTWTitle])

  useEffect(() => {
    if (!displayLinks.length) return
    displayLinks.forEach((link) => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!twPreviews.has(cacheKey) && !twLoadingPreviews.has(cacheKey)) fetchTWPreview(link)
    })
  }, [displayLinks, twPreviews, twLoadingPreviews, fetchTWPreview])
}
