import {
  ScriptureLoader,
  type UsjScriptureViewModel,
} from '@bt-synergy/scripture-loader'
import { useEffect, useMemo, useState } from 'react'
import {
  useCatalogManager,
  useCurrentReference,
  useLoaderRegistry,
  useNavigation,
} from '../../../../contexts'
import type { BookInfo } from '../../../../contexts/types-only'
import { defaultSectionsService } from '../../../../lib/services/default-sections'
import { extractVerseCountsFromContent } from '../../../../lib/versification'
import { RESOURCE_TYPE_IDS } from '../../../../resourceTypes/resourceTypeIds'
import type { DisplayUsjVerse } from '../types'
import { loadUsjScripture } from '../utils/loadUsjViewModel'

function chapterVerseMapFromViewModel(
  viewModel: UsjScriptureViewModel
): Record<string, number> {
  const map: Record<string, number> = {}
  for (const ch of viewModel.chapters) {
    map[String(ch.number)] = ch.verses.length
  }
  return map
}

export function useContent(
  resourceKey: string,
  availableBooks: BookInfo[],
  _language?: string
) {
  const catalogManager = useCatalogManager()
  const loaderRegistry = useLoaderRegistry()
  const currentRef = useCurrentReference()
  const navigation = useNavigation()
  const [viewModel, setViewModel] = useState<UsjScriptureViewModel | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const availableBookCodesStr = availableBooks.map((b) => b.code.toLowerCase()).sort().join(',')

  useEffect(() => {
    let cancelled = false
    const bookCode = currentRef.book
    const availableBookCodes = new Set(availableBookCodesStr.split(',').filter(Boolean))

    if (availableBookCodes.size === 0) return

    if (!availableBookCodes.has(bookCode.toLowerCase())) {
      setIsLoading(false)
      setError('BOOK_NOT_AVAILABLE')
      setViewModel(null)
      return
    }

    const loadBookContent = async () => {
      setIsLoading(true)
      setError(null)

      try {
        const loader = loaderRegistry.getLoader(RESOURCE_TYPE_IDS.SCRIPTURE) as
          | ScriptureLoader
          | undefined

        const { viewModel: vm, scripture } = await loadUsjScripture(
          loader,
          catalogManager,
          resourceKey,
          bookCode
        )
        if (cancelled) return

        navigation.updateBookVerseCount(
          bookCode,
          extractVerseCountsFromContent(chapterVerseMapFromViewModel(vm))
        )

        const sections =
          scripture.translatorSections && scripture.translatorSections.length > 0
            ? scripture.translatorSections
            : await defaultSectionsService.getDefaultSections(bookCode)

        if (sections.length > 0) {
          navigation.setBookSections(bookCode, sections)
        }

        setViewModel(vm)
      } catch (err) {
        if (cancelled) return
        console.error('❌ Error loading UsjScriptureViewModel:', err)
        setError(err instanceof Error ? err.message : 'Unknown error')
        setViewModel(null)
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    loadBookContent()
    return () => {
      cancelled = true
    }
  }, [currentRef.book, resourceKey, catalogManager, loaderRegistry, availableBookCodesStr])

  const relevantChapters = useMemo(() => {
    if (!viewModel) return []
    const startChapter = currentRef.chapter
    const endChapter = currentRef.endChapter || startChapter
    return viewModel.chapters.filter(
      (ch) => ch.number >= startChapter && ch.number <= endChapter
    )
  }, [viewModel, currentRef.chapter, currentRef.endChapter])

  const currentChapter = useMemo(
    () => (relevantChapters.length > 0 ? relevantChapters[0] : null),
    [relevantChapters]
  )

  const displayVerses = useMemo((): DisplayUsjVerse[] => {
    if (relevantChapters.length === 0) return []

    const startChapter = currentRef.chapter
    const endChapter = currentRef.endChapter || startChapter
    const startVerse = currentRef.verse
    const endVerse =
      currentRef.endVerse || (startChapter === endChapter ? startVerse : undefined)

    const verses: DisplayUsjVerse[] = []
    for (const chapter of relevantChapters) {
      let chapterStartVerse = 1
      let chapterEndVerse = 999
      if (chapter.number === startChapter) chapterStartVerse = startVerse
      if (chapter.number === endChapter && endVerse !== undefined) chapterEndVerse = endVerse

      for (const v of chapter.verses) {
        if (v.number >= chapterStartVerse && v.number <= chapterEndVerse) {
          verses.push({ ...v, chapterNumber: chapter.number })
        }
      }
    }
    return verses
  }, [relevantChapters, currentRef])

  return {
    viewModel,
    isLoading,
    error,
    currentChapter,
    displayVerses,
  }
}
