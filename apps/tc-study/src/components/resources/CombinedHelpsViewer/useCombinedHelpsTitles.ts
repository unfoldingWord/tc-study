/**
 * CombinedHelps TA/TW title + preview hooks and idle preload.
 */

import { useEntryTitles } from '../TranslationNotesViewer/hooks/useEntryTitles'
import { useTAMetadataForTitles } from '../TranslationNotesViewer/hooks/useTAMetadataForTitles'
import { useTATitles } from '../TranslationNotesViewer/hooks/useTATitles'
import { useTWPreviews, useTWTitles } from '../WordsLinksViewer/hooks'
import type { LinkWithAlignments, NoteWithAlignments } from './useCombinedHelpsMerge'
import { useCombinedHelpsTitlePreload } from './useCombinedHelpsTitlePreload'

export function useCombinedHelpsTitles(args: {
  tnKey: string
  twlKey: string
  resourceKey: string
  displayNotes: NoteWithAlignments[]
  displayLinks: LinkWithAlignments[]
}) {
  const { tnKey, twlKey, resourceKey, displayNotes, displayLinks } = args
  const { loadingTitles, fetchTATitle, getTATitle } = useTATitles(tnKey || resourceKey)
  const taMetadata = useTAMetadataForTitles(tnKey || resourceKey)
  const { fetchEntryTitle, getEntryTitle, invalidateTitles } = useEntryTitles(tnKey || resourceKey, taMetadata)
  const { twTitles, loadingTitles: twLoadingTitles, fetchTWTitle, getTWTitle } = useTWTitles(twlKey || resourceKey)
  const {
    twPreviews,
    loadingPreviews: twLoadingPreviews,
    fetchTWPreview,
    getTWPreview,
    isTWPreviewPending,
  } = useTWPreviews(twlKey || resourceKey)

  useCombinedHelpsTitlePreload({
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
  })

  return {
    loadingTitles,
    twLoadingTitles,
    getTATitle,
    getEntryTitle,
    getTWTitle,
    getTWPreview,
    isTWPreviewPending,
  }
}
