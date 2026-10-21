/**
 * Prepared TN/TWL chapter rows + adjacent-quote warm (viewer shell stays thin).
 */

import type { ProcessedNotes, ProcessedWordsLinks, TranslationNote } from '@bt-synergy/resource-parsers'
import { useMemo } from 'react'
import {
  usePreparedNotesChapter,
  usePreparedWordsLinksChapter,
} from '../../../features/helps/usePreparedHelpsChapter'
import { useWarmAdjacentHelpsQuotes } from '../../../features/helps/useWarmAdjacentHelpsQuotes'

export function useCombinedHelpsPrepare(args: {
  tnNotes: TranslationNote[] | null | undefined
  notesByChapter: Record<string, TranslationNote[]> | null | undefined
  twlContent: ProcessedWordsLinks | null | undefined
  tnKey: string
  twlKey: string
  bookId: string
  startChapter: number
  endChapter: number
}) {
  const { tnNotes, notesByChapter, twlContent, tnKey, twlKey, bookId, startChapter, endChapter } = args

  const processedNotesForHeal = useMemo((): ProcessedNotes | null => {
    if (!tnNotes?.length && (!notesByChapter || Object.keys(notesByChapter).length === 0)) {
      return null
    }
    return {
      bookCode: bookId,
      bookName: bookId,
      notes: tnNotes ?? [],
      notesByChapter: notesByChapter ?? {},
      metadata: {
        bookCode: bookId,
        bookName: bookId,
        processingDate: '',
        totalNotes: tnNotes?.length ?? 0,
        chaptersWithNotes: Object.keys(notesByChapter ?? {})
          .map((k) => parseInt(k, 10))
          .filter((n) => Number.isFinite(n)),
        statistics: {
          totalNotes: tnNotes?.length ?? 0,
          notesPerChapter: {},
        },
      },
    }
  }, [tnNotes, notesByChapter, bookId])

  const { preparedNotes, status: notesPrepareStatus } = usePreparedNotesChapter({
    resourceKey: tnKey,
    bookId,
    startChapter,
    endChapter,
    processedNotes: processedNotesForHeal,
  })

  const { preparedLinks, status: linksPrepareStatus } = usePreparedWordsLinksChapter({
    resourceKey: twlKey,
    bookId,
    startChapter,
    endChapter,
    processedLinks: twlContent,
  })

  useWarmAdjacentHelpsQuotes({
    tnKey,
    twlKey,
    bookId,
    chapter: startChapter,
    notesByChapter,
    linksByChapter: twlContent?.linksByChapter,
  })

  return { preparedNotes, notesPrepareStatus, preparedLinks, linksPrepareStatus }
}
