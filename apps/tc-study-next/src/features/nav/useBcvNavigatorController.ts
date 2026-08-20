import type { TranslatorSection } from '@bt-synergy/scripture-loader'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useAvailableBooks,
  useCatalogManager,
  useNavigation,
  useNavigationMode,
  useNavigationScope,
} from '../../contexts'
import { useAppStore, useBookTitleSource } from '../../contexts/AppContext'
import { getDefaultSections } from '../../lib/data/default-sections'
import type { ParsedObsStory } from '../../lib/obs/parseObsMarkdown'
import { findObsCatalogKey, findSectionIndexForRef } from './bcvNavHelpers'
import {
  buildObsRangeApplyRef,
  buildSectionApplyRef,
  buildVerseApplyRef,
  chapterClickSelection,
  findLoadedResourceTitle,
  initVerseRangeFromRef,
  nextObsRangeClick,
  nextObsStoryHeaderSelection,
  nextVerseClickSelection,
  obsStoryIdsFromIngredients,
} from './bcvNavigatorActions'
import {
  buildVersesFromCounts,
  getVerseSelectionCount,
  groupVersesByChapter,
} from './verseSelectionUtils'
import { useBcvNavigatorCatalog } from './useBcvNavigatorCatalog'
import { useBcvNavigatorScroll } from './useBcvNavigatorScroll'
import { navigatorCommittedScope } from './bcvNavigatorModeSwitch'

export function useBcvNavigatorController(options: {
  onClose: () => void
  mode?: 'verse' | 'section'
  onNavigationScopeCommitted?: (scope: 'scripture' | 'obs') => void
}) {
  const { onClose, mode = 'verse', onNavigationScopeCommitted } = options
  const navigation = useNavigation()
  const navigationScope = useNavigationScope()
  const availableBooks = useAvailableBooks()
  const navigationMode = useNavigationMode()
  const loadedResources = useAppStore((s) => s.loadedResources)
  const catalogManager = useCatalogManager()
  const currentRef = navigation.currentReference
  const bookTitleSource = useBookTitleSource()

  const { languageCode: urlLanguageCode } = useParams<{ languageCode?: string }>()
  const currentLanguage = (urlLanguageCode ?? '').toLowerCase()

  const obsCatalogKey = useMemo(
    () => findObsCatalogKey(loadedResources, currentLanguage || undefined),
    [loadedResources, currentLanguage]
  )
  const hasObsLoaded = !!obsCatalogKey
  const obsResourceTitle = useMemo(
    () => findLoadedResourceTitle(loadedResources, obsCatalogKey),
    [loadedResources, obsCatalogKey]
  )

  const [pickerScope, setPickerScope] = useState<typeof navigationScope>(() => navigationScope)
  const [pickerObsMode, setPickerObsMode] = useState<'chapter' | 'verse'>(() =>
    navigationScope === 'obs' ? (navigationMode === 'chapter' ? 'chapter' : 'verse') : 'chapter'
  )

  const commitPickerToNavigation = useCallback((): 'scripture' | 'obs' | null => {
    const switched = navigatorCommittedScope({
      previousScope: navigation.navigationScope,
      pickerScope,
    })
    if (pickerScope === 'obs') {
      navigation.setNavigationScope('obs')
      navigation.setNavigationMode(pickerObsMode)
    } else {
      navigation.setNavigationScope('scripture')
    }
    return switched
  }, [navigation, pickerScope, pickerObsMode])

  const scripturePickerMode = mode || navigationMode

  const obsStoryIds = useMemo(() => {
    if (!obsCatalogKey) return obsStoryIdsFromIngredients(undefined)
    const res = Object.values(loadedResources).find(
      (r) => (r.resourceKey ?? r.key) === obsCatalogKey
    )
    return obsStoryIdsFromIngredients(res?.ingredients)
  }, [loadedResources, obsCatalogKey])

  const [step, setStep] = useState<1 | 2>(1)
  const [selectedBook, setSelectedBook] = useState<string>(() =>
    currentRef.book !== 'obs' ? currentRef.book : availableBooks[0]?.code ?? 'gen'
  )
  const [selectedObsStory, setSelectedObsStory] = useState<number | null>(() =>
    currentRef.book === 'obs' ? currentRef.chapter : null
  )

  const initRange = initVerseRangeFromRef(currentRef)
  const [startVerse, setStartVerse] = useState<string | null>(initRange.startVerse)
  const [endVerse, setEndVerse] = useState<string | null>(initRange.endVerse)
  const [sections, setSections] = useState<TranslatorSection[]>([])
  const [pickedSectionIdx, setPickedSectionIdx] = useState<number | null>(null)
  const [obsRangeStart, setObsRangeStart] = useState<{ story: number; frame: number } | null>(null)
  const [obsRangeEnd, setObsRangeEnd] = useState<{ story: number; frame: number } | null>(null)

  const currentSectionRef = useRef<HTMLButtonElement>(null)
  const startVerseRef = useRef<HTMLButtonElement>(null)
  const selectedBookRef = useRef<HTMLButtonElement>(null)
  const selectedObsStoryRef = useRef<HTMLButtonElement>(null)

  const { obsLoadingStories, setObsLoadingStories, navigatorRefreshTick } = useBcvNavigatorCatalog({
    pickerScope,
    pickerObsMode,
    scripturePickerMode,
    obsCatalogKey,
    obsStoryIds,
    selectedObsStory,
    step,
    currentRef,
    preferLanguage: currentLanguage || undefined,
    catalogManager,
    navigation,
  })

  useBcvNavigatorScroll({
    step,
    pickerScope,
    scripturePickerMode,
    selectedBook,
    startVerse,
    sectionsLength: sections.length,
    currentRef,
    currentSectionRef,
    startVerseRef,
    selectedBookRef,
    selectedObsStoryRef,
  })

  useEffect(() => {
    if (pickerScope !== 'scripture') return
    if (step === 2) return
    const b = currentRef.book !== 'obs' ? currentRef.book : availableBooks[0]?.code
    if (b) setSelectedBook(b)
  }, [pickerScope, currentRef.book, availableBooks, step])

  useEffect(() => {
    if (scripturePickerMode === 'section' && pickerScope === 'scripture' && selectedBook) {
      let cancelled = false
      getDefaultSections(selectedBook).then((defaultSections) => {
        if (!cancelled && defaultSections.length > 0) {
          setSections(defaultSections)
        } else if (!cancelled) {
          setSections([])
        }
      })
      return () => {
        cancelled = true
      }
    }
  }, [scripturePickerMode, selectedBook, pickerScope, navigatorRefreshTick])

  useEffect(() => {
    if (scripturePickerMode !== 'section' || step !== 2 || pickerScope !== 'scripture') return
    const hi = findSectionIndexForRef(selectedBook, currentRef, sections)
    setPickedSectionIdx(hi >= 0 ? hi : sections.length > 0 ? 0 : null)
  }, [scripturePickerMode, step, pickerScope, selectedBook, currentRef, sections])

  const bookInfo = navigation.getBookInfo(selectedBook)
  const verses = buildVersesFromCounts(bookInfo?.verses)
  const versesByChapter = groupVersesByChapter(verses)
  const chapters = Object.keys(versesByChapter)
    .map(Number)
    .sort((a, b) => a - b)

  const handleVerseClick = (verseKey: string) => {
    const next = nextVerseClickSelection(verseKey, startVerse, endVerse)
    setStartVerse(next.startVerse)
    setEndVerse(next.endVerse)
  }

  const handleChapterClick = (chapter: number) => {
    const next = chapterClickSelection(versesByChapter[chapter] || [])
    if (!next) return
    setStartVerse(next.startVerse)
    setEndVerse(next.endVerse)
  }

  const applySectionSelection = () => {
    if (pickedSectionIdx == null) return
    const section = sections[pickedSectionIdx]
    if (!section) return
    const switched = commitPickerToNavigation()
    navigation.setNavigationMode('section')
    navigation.setBookSections(selectedBook, sections)
    navigation.navigateToReference(buildSectionApplyRef(selectedBook, section))
    if (switched) onNavigationScopeCommitted?.(switched)
    onClose()
  }

  const handleApply = () => {
    if (!startVerse) return
    const switched = commitPickerToNavigation()
    navigation.setNavigationMode('verse')
    navigation.navigateToReference(buildVerseApplyRef(selectedBook, startVerse, endVerse))
    if (switched) onNavigationScopeCommitted?.(switched)
    onClose()
  }

  const handleObsStoryApply = () => {
    if (selectedObsStory == null) return
    const switched = commitPickerToNavigation()
    navigation.navigateToReference({ book: 'obs', chapter: selectedObsStory, verse: 1 })
    if (switched) onNavigationScopeCommitted?.(switched)
    onClose()
  }

  const handleObsRangeClick = (story: number, frame: number) => {
    const next = nextObsRangeClick(story, frame, obsRangeStart, obsRangeEnd)
    setObsRangeStart(next.start)
    setObsRangeEnd(next.end)
  }

  const handleObsRangeApply = () => {
    if (!obsRangeStart) return
    const switched = commitPickerToNavigation()
    navigation.navigateToReference(buildObsRangeApplyRef(obsRangeStart, obsRangeEnd))
    if (switched) onNavigationScopeCommitted?.(switched)
    onClose()
  }

  const loadStoryFrames = useCallback(
    (storyNum: number) => {
      if (!obsCatalogKey) return
      setObsLoadingStories((prev) => new Set([...prev, storyNum]))
      void catalogManager
        .loadContent(obsCatalogKey, String(storyNum))
        .then((content) => {
          const parsed = content as ParsedObsStory
          navigation.setObsStoryFrameCount(storyNum, parsed.frames.length)
        })
        .catch(console.error)
        .finally(() => {
          setObsLoadingStories((prev) => {
            const next = new Set(prev)
            next.delete(storyNum)
            return next
          })
        })
    },
    [obsCatalogKey, catalogManager, navigation, setObsLoadingStories]
  )

  const handleObsStoryHeaderClick = (storyNum: number, frameCount: number) => {
    if (frameCount === 0) {
      loadStoryFrames(storyNum)
      return
    }
    const next = nextObsStoryHeaderSelection(storyNum, frameCount, obsRangeStart, obsRangeEnd)
    setObsRangeStart(next.start)
    setObsRangeEnd(next.end)
  }

  return {
    hasObsLoaded,
    availableBooks,
    bookTitleSource,
    currentRef,
    navigation,
    pickerScope,
    setPickerScope,
    pickerObsMode,
    setPickerObsMode,
    scripturePickerMode,
    obsResourceTitle,
    obsStoryIds,
    step,
    setStep,
    selectedBook,
    setSelectedBook,
    selectedObsStory,
    setSelectedObsStory,
    startVerse,
    endVerse,
    sections,
    pickedSectionIdx,
    setPickedSectionIdx,
    obsRangeStart,
    obsRangeEnd,
    obsLoadingStories,
    chapters,
    versesByChapter,
    selectionCount: getVerseSelectionCount(verses, startVerse, endVerse),
    currentSectionRef,
    startVerseRef,
    selectedBookRef,
    selectedObsStoryRef,
    handleVerseClick,
    handleChapterClick,
    applySectionSelection,
    handleApply,
    handleObsStoryApply,
    handleObsRangeClick,
    handleObsRangeApply,
    handleObsStoryHeaderClick,
  }
}
