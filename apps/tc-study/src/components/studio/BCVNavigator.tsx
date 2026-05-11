/**
 * BCVNavigator - Book-Chapter-Verse, Section, or Open Bible Stories selection modal
 *
 * Scripture: (1) pick book → (2) verses or preset sections
 * OBS: (1) pick story → (2) pick frame
 */

import type { TranslatorSection } from '@bt-synergy/usfm-processor'
import { AlertCircle, ArrowLeft, BookMarked, BookOpen, Check, Hash, Library, List, X } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useParams } from 'react-router-dom'
import {
  useAvailableBooks,
  useCatalogManager,
  useNavigation,
  useNavigationMode,
  useNavigationScope,
  type BCVReference,
  type BookInfo,
} from '../../contexts'
import { useAppStore, useBookTitleSource } from '../../contexts/AppContext'
import type { ResourceInfo } from '../../contexts/types'
import { getStandardBookOrderIndex, getStandardVerseCount } from '../../lib/versification'
import { COMBINED_HELPS_IDS } from '../resources/CombinedHelpsViewer/constants'
import type { ParsedObsStory } from '../../lib/obs/parseObsMarkdown'
import { getDefaultSections } from '../../lib/data/default-sections'
import { getBookTitle, getBookTitleStatic } from '../../utils/bookNames'
import { isOriginalLanguageResource } from '../../utils/resourceHelpers'

interface BCVNavigatorProps {
  onClose: () => void
  mode?: 'verse' | 'section'
}

/** Section index for `ref` within `sections` (same rules as NavigationContext.setBookSections). */
function findSectionIndexForRef(
  bookCode: string,
  ref: BCVReference,
  sections: TranslatorSection[]
): number {
  if (ref.book !== bookCode || ref.book === 'obs' || sections.length === 0) return -1
  return sections.findIndex((section) => {
    const refChapter = ref.chapter
    const refVerse = ref.verse
    if (refChapter < section.start.chapter) return false
    if (refChapter > section.end.chapter) return false
    if (refChapter === section.start.chapter && refChapter === section.end.chapter) {
      return refVerse >= section.start.verse && refVerse <= section.end.verse
    }
    if (refChapter === section.start.chapter) {
      return refVerse >= section.start.verse
    }
    if (refChapter === section.end.chapter) {
      return refVerse <= section.end.verse
    }
    return true
  })
}

function findObsCatalogKey(
  loadedResources: Record<
    string,
    { resourceKey?: string; key?: string; subject?: string; type?: unknown; language?: string; languageCode?: string }
  >,
  preferLanguage?: string
): string | null {
  let fallback: string | null = null
  const preferLang = preferLanguage?.toLowerCase()
  for (const r of Object.values(loadedResources)) {
    if (!r) continue
    const rk = r.resourceKey ?? r.key
    if (!rk || COMBINED_HELPS_IDS.has(rk)) continue

    const typeStr = String(r.type ?? '').toLowerCase().trim()
    if (typeStr === 'obs' || /open bible stories/i.test(r.subject ?? '')) {
      if (preferLang) {
        const rLang = (r.language ?? r.languageCode ?? '').toLowerCase()
        if (rLang === preferLang) return rk
      }
      if (!fallback) fallback = rk
    }
  }
  return fallback
}

/** Return all target-language scripture resources from the loaded-resources map.
 *  Original language resources (Greek/Hebrew) are excluded so their untranslated
 *  ingredient titles don't pollute the book name lookup. */
function getScriptureResources(loaded: Record<string, ResourceInfo | undefined>): ResourceInfo[] {
  return Object.values(loaded).filter(
    (r): r is ResourceInfo => {
      if (!r) return false
      const isScripture =
        String(r.category).toLowerCase() === 'scripture' ||
        String(r.type).toLowerCase() === 'scripture'
      if (!isScripture) return false
      const lang = (r.language ?? r.languageCode ?? '').toLowerCase()
      const subject = r.subject ?? ''
      return !isOriginalLanguageResource(lang, subject)
    }
  )
}

/** Build navigation book list from scripture resource ingredients (same rules as ScriptureViewer useTOC). */
function buildBookInfosFromIngredients(ingredients: Array<{ identifier?: string; title?: string }>): BookInfo[] {
  const bookCodes = new Set<string>()
  for (const ing of ingredients) {
    const identifier = ing.identifier
    if (!identifier) continue
    const normalizedId = identifier.toLowerCase()
    if (normalizedId.length >= 2 && normalizedId.length <= 4) {
      bookCodes.add(normalizedId)
    }
  }
  return Array.from(bookCodes)
    .map((code) => {
      const bookIngredients = ingredients.filter((ing) => ing.identifier?.toLowerCase() === code)
      const chapters = bookIngredients.length || 1
      const verses = getStandardVerseCount(code)
      const name = bookIngredients[0]?.title || code.toUpperCase()
      const primaryOrder = getStandardBookOrderIndex(code)
      return {
        code,
        name,
        chapters: verses?.length || chapters,
        verses,
        primaryOrder,
      }
    })
    .sort((a, b) => {
      if (a.primaryOrder !== b.primaryOrder) return a.primaryOrder - b.primaryOrder
      return a.code.localeCompare(b.code)
    })
    .map(({ primaryOrder: _p, ...book }) => book)
}

export function BCVNavigator({ onClose, mode = 'verse' }: BCVNavigatorProps) {
  const navigation = useNavigation()
  const navigationScope = useNavigationScope()
  const availableBooks = useAvailableBooks()
  const navigationMode = useNavigationMode()
  const loadedResources = useAppStore((s) => s.loadedResources)
  const bookTitleSource = useBookTitleSource()
  const catalogManager = useCatalogManager()
  const currentRef = navigation.currentReference

  const { languageCode: urlLanguageCode } = useParams<{ languageCode?: string }>()
  const currentLanguage = (urlLanguageCode ?? '').toLowerCase()

  const obsCatalogKey = useMemo(
    () => findObsCatalogKey(loadedResources, currentLanguage || undefined),
    [loadedResources, currentLanguage]
  )
  const hasObsLoaded = !!obsCatalogKey

  const obsResourceTitle = useMemo(() => {
    if (!obsCatalogKey) return null
    const res = Object.values(loadedResources).find(
      (r) => (r as ResourceInfo | undefined)?.resourceKey === obsCatalogKey ||
              (r as ResourceInfo | undefined)?.key === obsCatalogKey
    ) as ResourceInfo | undefined
    return res?.title ?? null
  }, [loadedResources, obsCatalogKey])

  /** Local modal scope — do not call setNavigationScope until Apply (avoids mutating global ref / URL while browsing). */
  const [pickerScope, setPickerScope] = useState<typeof navigationScope>(() => navigationScope)
  /** OBS-only: story grid (chapter) vs frame/range picker (verse). Independent of global mode while modal is open. */
  const [pickerObsMode, setPickerObsMode] = useState<'chapter' | 'verse'>(() =>
    navigationScope === 'obs' ? (navigationMode === 'chapter' ? 'chapter' : 'verse') : 'chapter'
  )

  const commitPickerToNavigation = useCallback(() => {
    if (pickerScope === 'obs') {
      navigation.setNavigationScope('obs')
      navigation.setNavigationMode(pickerObsMode)
    } else {
      navigation.setNavigationScope('scripture')
    }
  }, [navigation, pickerScope, pickerObsMode])

  const scripturePickerMode = mode || navigationMode

  const obsStoryIds = useMemo(() => {
    if (!obsCatalogKey) {
      return Array.from({ length: 50 }, (_, i) => i + 1)
    }
    const res = Object.values(loadedResources).find(
      (r) => (r.resourceKey ?? r.key) === obsCatalogKey
    )
    const ing = res?.ingredients
    if (!ing?.length) {
      return Array.from({ length: 50 }, (_, i) => i + 1)
    }
    const nums = ing
      .map((i) => parseInt(i.identifier, 10))
      .filter((n) => !Number.isNaN(n) && n > 0)
    if (nums.length === 0) {
      return Array.from({ length: 50 }, (_, i) => i + 1)
    }
    return [...new Set(nums)].sort((a, b) => a - b)
  }, [loadedResources, obsCatalogKey])

  const [step, setStep] = useState<1 | 2>(1)
  const [selectedBook, setSelectedBook] = useState<string>(() =>
    currentRef.book !== 'obs' ? currentRef.book : availableBooks[0]?.code ?? 'gen'
  )
  const [selectedObsStory, setSelectedObsStory] = useState<number | null>(() =>
    currentRef.book === 'obs' ? currentRef.chapter : null
  )

  const initStartVerse =
    currentRef.book !== 'obs' && currentRef.chapter && currentRef.verse
      ? `${currentRef.chapter}:${currentRef.verse}`
      : null
  const initEndVerse =
    currentRef.book !== 'obs' && currentRef.endChapter && currentRef.endVerse
      ? `${currentRef.endChapter}:${currentRef.endVerse}`
      : currentRef.book !== 'obs' && currentRef.endVerse && !currentRef.endChapter
        ? `${currentRef.chapter}:${currentRef.endVerse}`
        : null

  const [startVerse, setStartVerse] = useState<string | null>(initStartVerse)
  const [endVerse, setEndVerse] = useState<string | null>(initEndVerse)
  const [sections, setSections] = useState<TranslatorSection[]>([])
  /** Section picker: index in `sections` to apply (no global nav until Apply). */
  const [pickedSectionIdx, setPickedSectionIdx] = useState<number | null>(null)

  const [obsFrameCountLocal, setObsFrameCountLocal] = useState(0)
  const [obsFramesLoading, setObsFramesLoading] = useState(false)
  const [obsLoadError, setObsLoadError] = useState<string | null>(null)

  // OBS range selection — start fresh (no pre-init from currentRef to avoid confusion)
  const [obsRangeStart, setObsRangeStart] = useState<{ story: number; frame: number } | null>(null)
  const [obsRangeEnd, setObsRangeEnd] = useState<{ story: number; frame: number } | null>(null)
  // Stories being lazy-loaded for the combined range view
  const [obsLoadingStories, setObsLoadingStories] = useState<Set<number>>(new Set())
  /** Bumps when modal scope/mode changes so grids re-request catalog + frame data. */
  const [navigatorRefreshTick, setNavigatorRefreshTick] = useState(0)

  const currentSectionRef = useRef<HTMLButtonElement>(null)
  const startVerseRef = useRef<HTMLButtonElement>(null)
  const selectedBookRef = useRef<HTMLButtonElement>(null)
  const selectedObsStoryRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (pickerScope !== 'scripture') return
    // Don't reset once the user has already picked a book and moved to step 2
    if (step === 2) return
    const b =
      currentRef.book !== 'obs' ? currentRef.book : availableBooks[0]?.code
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

  useEffect(() => {
    if (scripturePickerMode === 'section' && currentSectionRef.current && step === 2 && pickerScope === 'scripture') {
      setTimeout(() => {
        currentSectionRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [scripturePickerMode, step, sections, pickerScope])

  useEffect(() => {
    if (
      scripturePickerMode !== 'section' &&
      pickerScope === 'scripture' &&
      startVerseRef.current &&
      step === 2 &&
      startVerse
    ) {
      setTimeout(() => {
        startVerseRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [scripturePickerMode, step, startVerse, pickerScope])

  useEffect(() => {
    if (step === 1 && selectedBookRef.current && selectedBook && pickerScope === 'scripture') {
      setTimeout(() => {
        selectedBookRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [step, selectedBook, pickerScope])

  useEffect(() => {
    if (step === 1 && selectedObsStoryRef.current && pickerScope === 'obs' && currentRef.book === 'obs') {
      setTimeout(() => {
        selectedObsStoryRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        })
      }, 100)
    }
  }, [step, pickerScope, currentRef.book, currentRef.chapter])

  // Stable ref to navigation actions — keeps effects out of the
  // store-update → navigation ref change → re-run loop.
  const navigationActionsRef = useRef(navigation)
  useEffect(() => {
    navigationActionsRef.current = navigation
  })

  // Track the last book-code signature we sent to setAvailableBooks.
  // Prevents redundant calls when loadedResources changes for other reasons
  // (e.g. verifiedIngredients/TOC writes) but the derived books list is the same.
  const lastBookKeysSig = useRef<string>('')

  useEffect(() => {
    setNavigatorRefreshTick((t) => t + 1)
  }, [pickerScope, pickerObsMode, scripturePickerMode])

  // Scripture: refresh book/chapter grid from the union of ALL loaded scripture resources.
  // This ensures the Bible tab is populated even when no scripture viewer has been opened
  // (e.g. the app booted directly into OBS mode).
  // Prefers `verifiedIngredients` (confirmed present at the published ref) when available,
  // so books absent from the release tag are not shown to the user.
  useEffect(() => {
    if (pickerScope !== 'scripture') return
    const scriptureResources = getScriptureResources(loadedResources)
    if (!scriptureResources.length) return

    // Put bookTitleSource first so its ingredient titles win when deduping by book code.
    const preferredKey = bookTitleSource?.key ?? bookTitleSource?.id
    const ordered = preferredKey
      ? [
          ...scriptureResources.filter((r) => (r.key ?? r.id) === preferredKey),
          ...scriptureResources.filter((r) => (r.key ?? r.id) !== preferredKey),
        ]
      : scriptureResources

    let cancelled = false
    void (async () => {
      try {
        const lists = await Promise.all(
          ordered.map(async (r) => {
            // Use verifiedIngredients if already populated (authoritative)
            if (r.verifiedIngredients && r.verifiedIngredients.length > 0) {
              return r.verifiedIngredients
            }
            // Fall back to catalog metadata fetch
            const k = r.key ?? r.id
            try {
              const metadata = await catalogManager.getResourceMetadata(k)
              return metadata?.contentMetadata?.ingredients ?? []
            } catch (e) {
              console.warn('[BCVNavigator] metadata fetch failed for', k, e)
              return []
            }
          })
        )
        if (cancelled) return
        const allIngredients = lists.flat()
        if (!allIngredients.length) return
        const books = buildBookInfosFromIngredients(allIngredients)
        if (!books.length) return
        // Skip if the derived list is identical to what we already sent.
        const sig = books.map((b) => b.code).join(',')
        if (sig === lastBookKeysSig.current) return
        lastBookKeysSig.current = sig
        // Use the stable ref so calling setAvailableBooks does NOT re-trigger this
        // effect (the navigation context object changes on every store write).
        navigationActionsRef.current.setAvailableBooks(books)
      } catch (e) {
        console.warn('[BCVNavigator] Scripture catalog refresh failed:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pickerScope, scripturePickerMode, navigatorRefreshTick, bookTitleSource, loadedResources, catalogManager])

  // OBS: refresh story list (ingredients) from catalog when switching to OBS or Story/Frame.
  useEffect(() => {
    if (pickerScope !== 'obs' || !obsCatalogKey) return
    let cancelled = false
    void (async () => {
      try {
        const metadata = await catalogManager.getResourceMetadata(obsCatalogKey)
        if (cancelled || !metadata?.contentMetadata?.ingredients?.length) return
        const ing = metadata.contentMetadata.ingredients
        useAppStore.setState((state) => {
          for (const id of Object.keys(state.loadedResources)) {
            const r = state.loadedResources[id]
            if (!r) continue
            const k = r.key ?? id
            if (k !== obsCatalogKey) continue
            r.ingredients = ing as typeof r.ingredients
            break
          }
        })
      } catch (e) {
        console.warn('[BCVNavigator] OBS catalog refresh failed:', e)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [pickerScope, pickerObsMode, navigatorRefreshTick, obsCatalogKey, catalogManager])

  useEffect(() => {
    if (step !== 2 || pickerScope !== 'obs' || !selectedObsStory || !obsCatalogKey) {
      return
    }
    let cancelled = false
    setObsFramesLoading(true)
    setObsLoadError(null)
    void catalogManager
      .loadContent(obsCatalogKey, String(selectedObsStory))
      .then((content) => {
        if (cancelled) return
        const parsed = content as ParsedObsStory
        navigationActionsRef.current.setObsStoryFrameCount(selectedObsStory, parsed.frames.length)
        setObsFrameCountLocal(parsed.frames.length)
      })
      .catch((e) => {
        if (cancelled) return
        setObsLoadError(e instanceof Error ? e.message : String(e))
        const cached = navigationActionsRef.current.obsFrameCountByStory[String(selectedObsStory)]
        setObsFrameCountLocal(cached ?? 0)
      })
      .finally(() => {
        if (!cancelled) setObsFramesLoading(false)
      })
    return () => {
      cancelled = true
    }
  // `navigation` excluded: calling setObsStoryFrameCount mutates the store, which
  // changes the navigation object reference (Immer), which would re-trigger this effect
  // in an infinite loop. Actions are accessed via stable navigationActionsRef instead.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step, pickerScope, selectedObsStory, obsCatalogKey, catalogManager, navigatorRefreshTick])

  // OBS frame mode: load ±5 stories around the current ref whenever scope/mode/refresh changes.
  // Re-requests on each switch (navigatorRefreshTick) so frame grids repopulate after toggling Bible/OBS or Story/Frame.
  useEffect(() => {
    if (pickerScope !== 'obs' || pickerObsMode !== 'verse' || !obsCatalogKey) return

    const currentStory = currentRef.book === 'obs' ? currentRef.chapter : 1
    const neighbors = obsStoryIds.filter((s) => Math.abs(s - currentStory) <= 5)
    neighbors.forEach((storyNum) => {
      setObsLoadingStories((prev) => new Set([...prev, storyNum]))
      void catalogManager
        .loadContent(obsCatalogKey, String(storyNum))
        .then((content) => {
          const parsed = content as ParsedObsStory
          navigationActionsRef.current.setObsStoryFrameCount(storyNum, parsed.frames.length)
        })
        .catch(() => {})
        .finally(() => {
          setObsLoadingStories((prev) => {
            const next = new Set(prev)
            next.delete(storyNum)
            return next
          })
        })
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pickerScope,
    pickerObsMode,
    obsCatalogKey,
    obsStoryIds,
    currentRef.book,
    currentRef.chapter,
    navigatorRefreshTick,
    catalogManager,
  ])

  const bookInfo = navigation.getBookInfo(selectedBook)

  const verses: Array<{ chapter: number; verse: number; key: string }> = []
  if (bookInfo?.verses) {
    bookInfo.verses.forEach((verseCount, chapterIndex) => {
      const chapter = chapterIndex + 1
      for (let verse = 1; verse <= verseCount; verse++) {
        verses.push({
          chapter,
          verse,
          key: `${chapter}:${verse}`,
        })
      }
    })
  }

  const versesByChapter = verses.reduce(
    (acc, v) => {
      if (!acc[v.chapter]) acc[v.chapter] = []
      acc[v.chapter].push(v)
      return acc
    },
    {} as Record<number, typeof verses>
  )

  const chapters = Object.keys(versesByChapter)
    .map(Number)
    .sort((a, b) => a - b)

  const isVerseSelected = (verseKey: string): boolean => {
    if (!startVerse) return false
    if (!endVerse) return verseKey === startVerse

    const [startC, startV] = startVerse.split(':').map(Number)
    const [endC, endV] = endVerse.split(':').map(Number)
    const [currentC, currentV] = verseKey.split(':').map(Number)

    const actualStart =
      startC < endC || (startC === endC && startV <= endV) ? { c: startC, v: startV } : { c: endC, v: endV }
    const actualEnd =
      startC < endC || (startC === endC && startV <= endV) ? { c: endC, v: endV } : { c: startC, v: startV }

    if (currentC < actualStart.c || currentC > actualEnd.c) return false
    if (currentC === actualStart.c && currentV < actualStart.v) return false
    if (currentC === actualEnd.c && currentV > actualEnd.v) return false
    return true
  }

  const isStartVerse = (verseKey: string): boolean => verseKey === startVerse
  const isEndVerse = (verseKey: string): boolean => verseKey === endVerse

  const getSelectionCount = (): number => {
    if (!startVerse) return 0
    if (!endVerse) return 1

    let count = 0
    verses.forEach((v) => {
      if (isVerseSelected(v.key)) count++
    })
    return count
  }

  const getObsSelectionCount = (): number => {
    if (!obsRangeStart) return 0
    if (!obsRangeEnd) return 1
    const [s, e] = sortObsRange(obsRangeStart, obsRangeEnd)
    let count = 0
    for (let story = s.story; story <= e.story; story++) {
      const frameCount = navigation.obsFrameCountByStory[String(story)] ?? 0
      const startFrame = story === s.story ? s.frame : 1
      const endFrame = story === e.story ? e.frame : frameCount
      if (endFrame >= startFrame) count += endFrame - startFrame + 1
    }
    return count
  }

  const handleVerseClick = (verseKey: string) => {
    if (!startVerse) {
      setStartVerse(verseKey)
      setEndVerse(null)
    } else if (verseKey === startVerse && !endVerse) {
      setStartVerse(null)
      setEndVerse(null)
    } else if (isVerseSelected(verseKey)) {
      setStartVerse(verseKey)
      setEndVerse(null)
    } else {
      setEndVerse(verseKey)
    }
  }

  const handleChapterClick = (chapter: number) => {
    const chapterVerses = versesByChapter[chapter] || []
    if (chapterVerses.length === 0) return

    const firstVerse = chapterVerses[0].key
    const lastVerse = chapterVerses[chapterVerses.length - 1].key

    setStartVerse(firstVerse)
    setEndVerse(lastVerse)
  }

  const applySectionSelection = () => {
    if (pickedSectionIdx == null) return
    const section = sections[pickedSectionIdx]
    if (!section) return
    const newRef: BCVReference = {
      book: selectedBook,
      chapter: section.start.chapter,
      verse: section.start.verse,
      endChapter: section.end.chapter !== section.start.chapter ? section.end.chapter : undefined,
      endVerse: section.end.verse,
    }

    commitPickerToNavigation()
    navigation.setNavigationMode('section')
    navigation.setBookSections(selectedBook, sections)
    navigation.navigateToReference(newRef)
    onClose()
  }

  const handleApply = () => {
    if (!startVerse) return

    const [startC, startV] = startVerse.split(':').map(Number)

    const newRef: BCVReference = {
      book: selectedBook,
      chapter: startC,
      verse: startV,
    }

    if (endVerse) {
      const [endC, endV] = endVerse.split(':').map(Number)
      newRef.endChapter = endC
      newRef.endVerse = endV
    }

    commitPickerToNavigation()
    navigation.setNavigationMode('verse')
    navigation.navigateToReference(newRef)
    onClose()
  }

  const handleObsStoryApply = () => {
    if (selectedObsStory == null) return
    commitPickerToNavigation()
    navigation.navigateToReference({ book: 'obs', chapter: selectedObsStory, verse: 1 })
    onClose()
  }

  // ── OBS Range (verse mode) helpers — mirrors scripture startVerse/endVerse logic ──

  const obsPos = (story: number, frame: number) => story * 10000 + frame

  const sortObsRange = (
    a: { story: number; frame: number },
    b: { story: number; frame: number },
  ): [{ story: number; frame: number }, { story: number; frame: number }] =>
    obsPos(a.story, a.frame) <= obsPos(b.story, b.frame) ? [a, b] : [b, a]

  const isObsFrameSelected = (story: number, frame: number): boolean => {
    if (!obsRangeStart) return false
    if (!obsRangeEnd) return obsRangeStart.story === story && obsRangeStart.frame === frame
    const [s, e] = sortObsRange(obsRangeStart, obsRangeEnd)
    const pos = obsPos(story, frame)
    return pos >= obsPos(s.story, s.frame) && pos <= obsPos(e.story, e.frame)
  }

  // Mirrors handleVerseClick: set start or end, never navigates directly
  const handleObsRangeClick = (story: number, frame: number) => {
    if (!obsRangeStart) {
      setObsRangeStart({ story, frame })
      setObsRangeEnd(null)
    } else if (obsRangeStart.story === story && obsRangeStart.frame === frame && !obsRangeEnd) {
      // Clicking start again deselects (like scripture)
      setObsRangeStart(null)
    } else if (isObsFrameSelected(story, frame)) {
      // Clicking within range → reset to this as new start
      setObsRangeStart({ story, frame })
      setObsRangeEnd(null)
    } else {
      setObsRangeEnd({ story, frame })
    }
  }

  // Mirrors handleApply for scripture
  const handleObsRangeApply = () => {
    if (!obsRangeStart) return
    const end = obsRangeEnd ?? obsRangeStart
    const [s, e] = sortObsRange(obsRangeStart, end)
    commitPickerToNavigation()
    navigation.navigateToReference({
      book: 'obs',
      chapter: s.story,
      verse: s.frame,
      endChapter: e.story !== s.story ? e.story : undefined,
      endVerse: e.frame !== s.frame || e.story !== s.story ? e.frame : undefined,
    })
    onClose()
  }

  // Load story frame count on demand for the combined range view
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
    [obsCatalogKey, catalogManager, navigation],
  )

  // Show error only when there is truly nothing to navigate (no scripture books AND no OBS)
  const missingNavigator = !hasObsLoaded && availableBooks.length === 0

  if (missingNavigator) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />

        <div
          className="relative flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden m-4"
          onClick={(e) => e.stopPropagation()}
          role="dialog"
          aria-modal="true"
        >
          <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
            <AlertCircle className="w-5 h-5 text-amber-500" />
            <button
              onClick={onClose}
              className="p-1 hover:bg-gray-100 rounded transition-colors"
              title="Close"
              aria-label="Close"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 flex flex-col items-center justify-center min-h-0 gap-3 p-6 text-center text-gray-600 text-sm">
            <AlertCircle className="w-16 h-16 text-gray-300" />
            <p>Add a Bible translation (for book navigation) or load Open Bible Stories to use story navigation.</p>
          </div>
        </div>
      </div>
    )
  }

  const headerIcon =
    step === 1 ? (
      pickerScope === 'obs' ? (
        <BookMarked className="w-5 h-5 text-blue-600" />
      ) : (
        <BookOpen className="w-5 h-5 text-blue-600" />
      )
    ) : pickerScope === 'obs' ? (
      <BookMarked className="w-5 h-5 text-blue-600" />
    ) : scripturePickerMode === 'section' ? (
      <List className="w-5 h-5 text-blue-600" />
    ) : (
      <Hash className="w-5 h-5 text-blue-600" />
    )

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />

      <div
        className="relative flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">{headerIcon}</div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {step === 1 && (
          <div className="flex border-b border-gray-200 bg-gray-50 px-3 py-2 gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => {
                setPickerScope('scripture')
                setStep(1)
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                pickerScope === 'scripture'
                  ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
            >
              <BookOpen className="w-4 h-4 shrink-0" />
            </button>
            <button
              type="button"
              disabled={!hasObsLoaded}
              onClick={() => {
                const fromScripture = pickerScope === 'scripture'
                setPickerScope('obs')
                if (fromScripture) {
                  setPickerObsMode('chapter')
                }
                setStep(1)
                setSelectedObsStory(currentRef.book === 'obs' ? currentRef.chapter : null)
              }}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center gap-1.5 ${
                pickerScope === 'obs'
                  ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-100'
              } disabled:opacity-40 disabled:cursor-not-allowed`}
            >
              <BookMarked className="w-4 h-4 shrink-0" />
              {obsResourceTitle ?? 'Open Bible Stories'}
            </button>
          </div>
        )}

        {step === 1 && pickerScope === 'obs' && (
          <div className="flex border-b border-gray-200 bg-gray-50 px-3 py-2 gap-2 flex-shrink-0">
            <button
              type="button"
              onClick={() => setPickerObsMode('chapter')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center ${
                pickerObsMode === 'chapter'
                  ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Story"
              aria-label="Story"
            >
              <Library className="w-4 h-4 shrink-0" />
            </button>
            <button
              type="button"
              onClick={() => setPickerObsMode('verse')}
              className={`flex-1 rounded-lg py-2 text-sm font-medium transition-colors flex items-center justify-center ${
                pickerObsMode === 'verse'
                  ? 'bg-white text-blue-700 shadow-sm border border-gray-200'
                  : 'text-gray-600 hover:bg-gray-100'
              }`}
              title="Frame"
              aria-label="Frame"
            >
              <BookMarked className="w-4 h-4 shrink-0" />
            </button>
          </div>
        )}

        <div className="flex-1 flex flex-col min-h-0">
          {step === 1 && pickerScope === 'scripture' && (
            <div className="flex-1 overflow-auto p-4">
              {availableBooks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-500 text-sm">
                  No Bible books found in any loaded scripture resource.
                </div>
              ) : (
                <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                  {availableBooks.map((book) => {
                    const isSelected = selectedBook === book.code
                    const resolvedName = getBookTitle(bookTitleSource, book.code)
                    // Fall back to static English name when the resource has no localized title
                    const fullBookName =
                      resolvedName !== book.code.toUpperCase()
                        ? resolvedName
                        : (getBookTitleStatic(book.code) || book.name || book.code.toUpperCase())
                    return (
                      <button
                        key={book.code}
                        ref={isSelected ? selectedBookRef : null}
                        onClick={() => {
                          setSelectedBook(book.code)
                          setStep(2)
                        }}
                        className={`
                        p-3 rounded-lg border transition-all text-left hover:shadow-sm
                        ${
                          isSelected
                            ? 'border-blue-500 bg-blue-50 shadow-sm'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50'
                        }
                      `}
                      >
                        <div className="font-semibold text-gray-900">{fullBookName}</div>
                        <div className="text-[10px] text-gray-400 uppercase tracking-wide mt-1">
                          {book.code}
                        </div>
                      </button>
                    )
                  })}
                </div>
              )}
            </div>
          )}

          {/* OBS — Story mode: pick a story, then confirm (does not change global nav until Apply) */}
          {step === 1 && pickerScope === 'obs' && pickerObsMode === 'chapter' && (
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-5 sm:grid-cols-6 md:grid-cols-8 gap-2">
                {obsStoryIds.map((storyNum) => {
                  const isViewerRef = currentRef.book === 'obs' && currentRef.chapter === storyNum
                  const isChosen = selectedObsStory === storyNum
                  const isHighlighted = isChosen || (selectedObsStory == null && isViewerRef)
                  return (
                    <button
                      key={storyNum}
                      ref={isHighlighted ? selectedObsStoryRef : null}
                      type="button"
                      onClick={() => setSelectedObsStory(storyNum)}
                      className={`
                        p-2 rounded-lg border text-sm font-medium transition-all
                        ${
                          isHighlighted
                            ? 'border-blue-500 bg-blue-50 text-blue-900'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-gray-50 text-gray-800'
                        }
                      `}
                    >
                      {storyNum}
                    </button>
                  )
                })}
              </div>
            </div>
          )}

          {/* OBS — Frame/Range mode: combined stories+frames view (mirrors scripture chapter+verse picker) */}
          {pickerScope === 'obs' && pickerObsMode === 'verse' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <BookMarked className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex items-center gap-2 text-sm text-gray-600">
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    {getObsSelectionCount()}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="space-y-6">
                  {obsStoryIds.map((storyNum) => {
                    const frameCount = navigation.obsFrameCountByStory[String(storyNum)] ?? 0
                    const isLoading = obsLoadingStories.has(storyNum)
                    const isCurrentStory = currentRef.book === 'obs' && currentRef.chapter === storyNum

                    return (
                      <div key={storyNum}>
                        {/* Story header — mirrors chapter button in scripture picker */}
                        <button
                          type="button"
                          ref={isCurrentStory ? selectedObsStoryRef : null}
                          onClick={() => {
                            if (frameCount === 0) {
                              loadStoryFrames(storyNum)
                              return
                            }
                            // Select entire story (mirrors handleChapterClick)
                            const start = { story: storyNum, frame: 1 }
                            const end = { story: storyNum, frame: frameCount }
                            if (!obsRangeStart) {
                              setObsRangeStart(start)
                              setObsRangeEnd(end)
                            } else if (isObsFrameSelected(storyNum, 1) && isObsFrameSelected(storyNum, frameCount)) {
                              setObsRangeStart(start)
                              setObsRangeEnd(null)
                            } else {
                              setObsRangeEnd(end)
                            }
                          }}
                          className="mb-3 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 text-sm transition-colors"
                          title={`Story ${storyNum}`}
                          aria-label={`Story ${storyNum}`}
                        >
                          {storyNum}
                        </button>

                        {isLoading && (
                          <span className="text-xs text-gray-400 ml-2">Loading…</span>
                        )}

                        {!isLoading && frameCount === 0 && (
                          <span className="text-xs text-gray-400 italic ml-1">
                            tap story number to load
                          </span>
                        )}

                        {frameCount > 0 && (
                          <div className="flex flex-wrap gap-1">
                            {Array.from({ length: frameCount }, (_, i) => i + 1).map((frameNum) => {
                              const isSelected = isObsFrameSelected(storyNum, frameNum)
                              const isStartFrame = obsRangeStart?.story === storyNum && obsRangeStart.frame === frameNum
                              const isEndFrame = obsRangeEnd?.story === storyNum && obsRangeEnd.frame === frameNum
                              const isCurFrame = isCurrentStory && currentRef.verse === frameNum

                              return (
                                <button
                                  key={frameNum}
                                  ref={isStartFrame ? startVerseRef : null}
                                  type="button"
                                  onClick={() => handleObsRangeClick(storyNum, frameNum)}
                                  className={`
                                    w-8 h-8 text-xs font-medium rounded transition-all
                                    ${
                                      isStartFrame || isEndFrame
                                        ? 'bg-blue-600 text-white ring-2 ring-blue-400 font-bold'
                                        : isSelected
                                        ? 'bg-blue-400 text-white'
                                        : isCurFrame
                                        ? 'bg-white text-blue-700 ring-2 ring-blue-400 font-bold'
                                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }
                                  `}
                                >
                                  {frameNum}
                                </button>
                              )
                            })}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}

          {step === 2 && pickerScope === 'scripture' && scripturePickerMode === 'section' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded transition-colors"
                    title="Change book"
                    aria-label="Change book"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <BookOpen className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <strong>{getBookTitle(bookTitleSource, selectedBook)}</strong>
                  {pickedSectionIdx != null && pickedSectionIdx >= 0 && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {pickedSectionIdx + 1} / {sections.length}
                    </span>
                  )}
                </div>
              </div>

              {sections.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <AlertCircle className="w-12 h-12 text-gray-300" />
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-6">
                  <div className="space-y-1.5">
                    {sections.map((section, idx) => {
                      const startRef = `${section.start.chapter}:${section.start.verse}`
                      const endRef =
                        section.end.chapter !== section.start.chapter
                          ? `${section.end.chapter}:${section.end.verse}`
                          : section.end.verse.toString()
                      const isPicked = idx === pickedSectionIdx

                      return (
                        <button
                          key={idx}
                          ref={isPicked ? currentSectionRef : null}
                          type="button"
                          onClick={() => setPickedSectionIdx(idx)}
                          className={`
                          w-full text-left p-2.5 border rounded-lg transition-colors flex items-center gap-3
                          ${
                            isPicked
                              ? 'border-blue-500 bg-blue-50'
                              : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                          }
                        `}
                        >
                          <div
                            className={`
                          flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-bold text-xs
                          ${isPicked ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700'}
                        `}
                          >
                            {idx + 1}
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 truncate">{`Section ${idx + 1}`}</div>
                            <div className="text-sm text-gray-600 mt-0.5 font-medium">
                              {startRef} - {endRef}
                            </div>
                          </div>

                          {isPicked && <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />}
                        </button>
                      )
                    })}
                  </div>
                </div>
              )}
            </div>
          )}

          {step === 2 && pickerScope === 'scripture' && scripturePickerMode !== 'section' && (
            <div className="flex-1 flex flex-col min-h-0">
              <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setStep(1)}
                    className="flex items-center gap-1 text-blue-600 hover:text-blue-700 p-1.5 hover:bg-blue-50 rounded transition-colors"
                    title="Change book"
                    aria-label="Change book"
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </button>
                  <BookOpen className="w-4 h-4 text-gray-500" />
                </div>
                <div className="text-sm text-gray-600 flex items-center gap-2">
                  <strong>{(() => {
                    const n = getBookTitle(bookTitleSource, selectedBook)
                    return n !== selectedBook.toUpperCase() ? n : (getBookTitleStatic(selectedBook) || n)
                  })()}</strong>
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    {getSelectionCount()}
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-auto p-6">
                <div className="space-y-6">
                  {chapters.map((chapter) => (
                    <div key={chapter}>
                      <button
                        type="button"
                        onClick={() => handleChapterClick(chapter)}
                        className="mb-3 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 text-sm transition-colors"
                        title={`${chapter}`}
                        aria-label={`Chapter ${chapter}`}
                      >
                        {chapter}
                      </button>

                      <div className="flex flex-wrap gap-1">
                        {versesByChapter[chapter]?.map((v) => {
                          const selected = isVerseSelected(v.key)
                          const isStart = isStartVerse(v.key)
                          const isEnd = isEndVerse(v.key)

                          return (
                            <button
                              key={v.key}
                              ref={isStart ? startVerseRef : null}
                              type="button"
                              onClick={() => handleVerseClick(v.key)}
                              className={`
                              w-8 h-8 text-xs font-medium rounded transition-all
                              ${
                                isStart || isEnd
                                  ? 'bg-blue-600 text-white ring-2 ring-blue-400 font-bold'
                                  : selected
                                    ? 'bg-blue-400 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                              }
                            `}
                            >
                              {v.verse}
                            </button>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Scripture section Apply */}
        {step === 2 && pickerScope === 'scripture' && scripturePickerMode === 'section' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end flex-shrink-0">
            <button
              type="button"
              onClick={applySectionSelection}
              disabled={pickedSectionIdx == null || sections.length === 0}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Apply selection"
              aria-label="Apply selection"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* OBS story Apply */}
        {step === 1 && pickerScope === 'obs' && pickerObsMode === 'chapter' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end flex-shrink-0">
            <button
              type="button"
              onClick={handleObsStoryApply}
              disabled={selectedObsStory == null}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Apply selection"
              aria-label="Apply selection"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        )}

        {/* OBS range Apply — mirrors scripture Apply button */}
        {pickerScope === 'obs' && pickerObsMode === 'verse' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end flex-shrink-0">
            <button
              type="button"
              onClick={handleObsRangeApply}
              disabled={!obsRangeStart}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Apply selection"
              aria-label="Apply selection"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        )}

        {step === 2 && pickerScope === 'scripture' && scripturePickerMode !== 'section' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end flex-shrink-0">
            <button
              type="button"
              onClick={handleApply}
              disabled={!startVerse}
              className="p-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Apply selection"
              aria-label="Apply selection"
            >
              <Check className="w-5 h-5" />
            </button>
          </div>
        )}
      </div>
    </div>
  )
}
