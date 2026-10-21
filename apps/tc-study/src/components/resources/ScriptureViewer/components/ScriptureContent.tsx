import {
  buildUsjLayoutBlocks,
  collectVerseBlockSequence,
  filterUsjLayoutBlocks,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { BookX } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import { useCacheAdapter } from '../../../../contexts'
import type { BCVReference, BookInfo, ReferenceState } from '../../../../contexts/types-only'
import { useScriptureDisplayStore } from '../../../../lib/stores/scriptureDisplayStore'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { isOriginalLanguageCode } from '../../../../features/helps/resolveAlignedQuoteTokens'
import type { ChapterSlot } from '../../../../features/nav/chapterInfiniteScroll'
import {
  contentChaptersFromSlots,
  paragraphChaptersFromSlots,
} from '../../../../features/nav/chapterInfiniteScroll'
import { resolveLastChapter } from '../../../../features/nav/bookChapterCounts'
import {
  beginProgrammaticScrollSuppress,
  getChapterScrollActivity,
} from '../../../../features/nav/chapterScrollActivity'
import {
  getHelpsHighlightEpoch,
  getPersistedHelpsHighlight,
  isHelpsHighlightApplied,
  markHelpsHighlightApplied,
  parseTokenVerseRef,
  shouldScrollToQuoteHighlight,
} from '../../../../features/helps/helpsCardScriptureNav'
import {
  ensurePreparedFullChapter,
  isPreparedSourceMissing,
} from '../../../../features/scripture/ensurePreparedFullChapter'
import {
  paragraphsFromLightChapter,
  peekPreparedChapter,
} from '../../../../features/scripture/preparedChapterCache'
import { usePreparedChapterWindow, usePreparedBookLightPreload } from '../../../../features/scripture/usePreparedChapter'
import { useStackedChapterViewModel } from '../../../../features/scripture/useStackedChapterViewModel'
import {
  buildLightChapter,
  type ScriptureNavRecord,
} from '../../../../features/scripture/scripturePreparer'
import { lastChapterFromViewModel } from '../hooks/useChapterInfiniteScroll'
import { isScriptureBooksPending } from '../hooks/scriptureContentLoad'
import type { DisplayUsjVerse, OriginalLanguageToken } from '../types'
import {
  getChapterDisplayVerses,
  getChapterParagraphs,
  getChapterVerseBlockItems,
  prefetchAdjacentChapterParagraphs,
  prefetchChapterLayouts,
} from '../utils/chapterLayoutCache'
import { chaptersToWarm } from '../utils/chaptersToWarm'
import { displayVersesForChapters } from '../utils/displayVersesForChapters'
import { chaptersForRef, includeVerseForRef } from '../utils/scriptureNavRange'
import { ChapterHeading } from './ChapterHeading'
import { ChapterParagraphPane } from './ChapterParagraphPane'
import { FormattedScriptureContent } from './FormattedScriptureContent'
import { PreparedFullChapterPane } from './PreparedFullChapterPane'
import { PreparedLightChapterPane } from './PreparedLightChapterPane'
import { TokenSourceHealButton } from './TokenSourceHealButton'
import { VerseBlockChapterPane, VerseBlockItems } from './VerseBlockChapterPane'

interface ScriptureContentProps {
  isLoading: boolean
  isLoadingTOC?: boolean
  error: string | null
  viewModel: UsjScriptureViewModel | null
  nav?: ScriptureNavRecord | null
  resourceKey: string
  availableBooks: BookInfo[]
  displayVerses: DisplayUsjVerse[]
  currentRef: ReferenceState
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  /** Destination chapter tokens have painted (prepared-full or USJ). */
  tokensReady?: boolean
  selectedTokenId: string | null
  onTokenClick: (token: UsjWordToken) => void
  onInternedTokenClick?: (
    verseRef: string,
    token: import('../../../../features/scripture/scripturePreparer').InternedToken,
    matchKeys: readonly string[]
  ) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onChapterClick?: (chapter: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  language?: string
  languageDirection?: 'ltr' | 'rtl'
  displayChapters?: number[] | null
  chapterSlots?: ChapterSlot[] | null
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
  contentRef?: React.RefObject<HTMLDivElement | null>
  /** Settled chapter cannot obtain full tokens (USJ source missing/stale). */
  tokenSourceFailed?: boolean
  onRetryTokenSource?: () => void
}

export function ScriptureContent({
  isLoading,
  isLoadingTOC = false,
  error,
  viewModel,
  nav = null,
  resourceKey,
  availableBooks,
  displayVerses,
  currentRef,
  highlightTarget,
  underlinedSemanticIds,
  tokensReady = false,
  selectedTokenId,
  onTokenClick,
  onInternedTokenClick,
  onVerseClick,
  onChapterClick,
  onScriptureRefClick,
  language,
  languageDirection = 'ltr',
  displayChapters,
  chapterSlots,
  registerChapter,
  contentRef,
  tokenSourceFailed = false,
  onRetryTokenSource,
}: ScriptureContentProps) {
  const layoutMode = useScriptureDisplayStore((s) => s.layoutMode)
  const cache = useCacheAdapter()
  const localContainerRef = useRef<HTMLDivElement>(null)
  const containerRef = contentRef ?? localContainerRef
  const lastScrolledTokenRef = useRef<string | null>(null)
  const lastScrolledEpochRef = useRef(-1)
  const slots = chapterSlots && chapterSlots.length > 0 ? chapterSlots : null
  const slotsActive = slots != null

  const stackChapters = useMemo(() => {
    if (slots) return contentChaptersFromSlots(slots)
    if (displayChapters?.length) return [...displayChapters]
    return currentRef.chapter ? [currentRef.chapter] : []
  }, [slots, displayChapters, currentRef.chapter])

  const warmChapters = useMemo(() => {
    const last = resolveLastChapter({
      bookId: currentRef.book || '',
      explicit:
        lastChapterFromViewModel(nav?.chapters) ||
        lastChapterFromViewModel(viewModel?.chapters) ||
        undefined,
      tocChapters: availableBooks.find(
        (b) => b.code.toLowerCase() === (currentRef.book || '').toLowerCase()
      )?.chapters,
    })
    // displayChapters is the painted stack whenever slots are on, null otherwise.
    const painted = slots ? contentChaptersFromSlots(slots) : (displayChapters ?? [])
    return chaptersToWarm({ navChapter: currentRef.chapter || 1, lastChapter: last, painted }).sort(
      (a, b) => a - b
    )
  }, [slots, displayChapters, nav, viewModel, currentRef.chapter, currentRef.book, availableBooks])

  const allBookChapters = useMemo(() => {
    if (nav?.chapters?.length) {
      return nav.chapters.map((c) => c.number).filter((n) => n >= 1)
    }
    if (viewModel?.chapters?.length) {
      return viewModel.chapters.map((c) => c.number).filter((n) => n >= 1)
    }
    return []
  }, [nav, viewModel])

  const preparedRevision = usePreparedChapterWindow({
    resourceKey,
    bookId: currentRef.book,
    chapters: warmChapters,
    enabled: Boolean(resourceKey && currentRef.book),
  })

  const bookLightRevision = usePreparedBookLightPreload({
    resourceKey,
    bookId: currentRef.book,
    chapters: allBookChapters,
    enabled: Boolean(resourceKey && currentRef.book && allBookChapters.length > 0),
  })

  // Chapter-grained SoT only ships the focused chapter. Expand with SoT slices
  // for every painted stack chapter so layout toggle can re-render 4/5 too.
  const paintViewModel = useStackedChapterViewModel({
    viewModel,
    resourceKey,
    bookId: currentRef.book || '',
    chapters: stackChapters,
    enabled: Boolean(viewModel && slotsActive),
    reloadToken: `${preparedRevision}:${bookLightRevision}`,
  })

  const paragraphsForChapter = (chapter: number): string[] => {
    void preparedRevision
    void bookLightRevision
    const peeked = peekPreparedChapter(resourceKey, currentRef.book, chapter)
    const fromLight = paragraphsFromLightChapter(peeked?.light)
    if (fromLight.length > 0) return fromLight
    if (viewModel) return getChapterParagraphs(viewModel, chapter)
    return []
  }

  const lightPaneForChapter = (chapter: number, slotKind: 'paragraph' | 'rendered') => {
    void preparedRevision
    void bookLightRevision
    const peeked = peekPreparedChapter(resourceKey, currentRef.book, chapter)
    // Prefer cached light; if the prepare worker has not filled the LRU yet but
    // the view model is already in hand, build light sync so verse markers paint
    // during the paragraph phase (not only after full-tier upgrade).
    const vm = paintViewModel ?? viewModel
    const light = peeked?.light?.blocks?.length
      ? peeked.light
      : vm
        ? buildLightChapter(vm, chapter)
        : null
    if (!light?.blocks?.length) return null
    return (
      <PreparedLightChapterPane
        key={`prepared-light-${chapter}`}
        chapterNum={chapter}
        light={light}
        registerChapter={registerChapter}
        onChapterClick={onChapterClick}
        onVerseClick={onVerseClick}
        slotKind={slotKind}
      />
    )
  }

  /** Plain paragraphs while a chapter has no light blocks yet — never token trees. */
  const paragraphPane = (chapter: number, key: string) => (
    <ChapterParagraphPane
      key={key}
      chapter={chapter}
      paragraphs={paragraphsForChapter(chapter)}
      register={registerChapter}
      onChapterClick={onChapterClick}
    />
  )

  useEffect(() => {
    const vm = paintViewModel ?? viewModel
    if (!vm || !slots || slots.length === 0) return
    const contentChapters = contentChaptersFromSlots(slots)
    prefetchAdjacentChapterParagraphs(vm, contentChapters)
    prefetchChapterLayouts(vm, paragraphChaptersFromSlots(slots))
  }, [paintViewModel, viewModel, slots])

  // Rendered/paragraph slots without full tokens — kick full prepare once per
  // chapter, stop when the worker reports source-missing (heal owns recovery).
  useEffect(() => {
    if (!resourceKey || !currentRef.book || !slots) return
    if (isPreparedSourceMissing(resourceKey, currentRef.book)) return
    const needFull = slots
      .filter((slot) => slot.kind === 'rendered' || slot.kind === 'paragraph')
      .map((slot) => slot.chapter)
      .filter((chapter) => {
        const peeked = peekPreparedChapter(resourceKey, currentRef.book, chapter)
        return !peeked?.full?.blocks?.length
      })
      .slice(0, 3)
    if (needFull.length === 0) return
    let cancelled = false
    void (async () => {
      for (const chapter of needFull) {
        if (cancelled) return
        if (isPreparedSourceMissing(resourceKey, currentRef.book)) return
        const result = await ensurePreparedFullChapter(
          cache,
          resourceKey,
          currentRef.book,
          chapter
        )
        if (result.status === 'source-missing') return
      }
    })()
    return () => {
      cancelled = true
    }
  }, [cache, resourceKey, currentRef.book, slots, preparedRevision])

  useEffect(() => {
    if (!highlightTarget || !selectedTokenId) {
      lastScrolledTokenRef.current = null
      lastScrolledEpochRef.current = -1
      return
    }

    const persist = getPersistedHelpsHighlight()
    const highlightChapter =
      persist?.chapter || parseTokenVerseRef(highlightTarget.verseRef)?.chapter || null
    const highlightEpoch = getHelpsHighlightEpoch()
    const shouldScroll = () =>
      shouldScrollToQuoteHighlight({
        selectedTokenId,
        lastScrolledTokenId: lastScrolledTokenRef.current,
        lastScrolledEpoch: lastScrolledEpochRef.current,
        highlightEpoch,
        userScrolling: getChapterScrollActivity().unsettled,
        highlightChapter,
        visibleChapter: currentRef.chapter,
        highlightApplied: isHelpsHighlightApplied(),
      })
    if (!shouldScroll()) return

    let cancelled = false
    const tryScroll = (attempt: number) => {
      if (cancelled) return
      if (!shouldScroll()) return
      const highlightedElements = containerRef.current?.querySelectorAll('[data-highlighted="true"]')
      if (highlightedElements && highlightedElements.length > 0) {
        // Top of the scrollport with scroll-mt on highlighted tokens (not center):
        // centering early-chapter tokens pulls the previous chapter into the
        // settle band and flips nav back.
        beginProgrammaticScrollSuppress(500)
        ;(highlightedElements[0] as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          block: 'start',
          inline: 'nearest',
        })
        lastScrolledTokenRef.current = selectedTokenId
        lastScrolledEpochRef.current = highlightEpoch
        markHelpsHighlightApplied(currentRef.book, highlightChapter ?? currentRef.chapter)
        return
      }
      if (attempt < 16) {
        window.setTimeout(() => tryScroll(attempt + 1), 80)
      }
    }

    const timer = window.setTimeout(() => tryScroll(0), tokensReady ? 40 : 100)
    return () => {
      cancelled = true
      window.clearTimeout(timer)
    }
  }, [highlightTarget, selectedTokenId, tokensReady, currentRef.book, currentRef.chapter])

  const includeVerse = useMemo(() => includeVerseForRef(currentRef), [currentRef])
  const navChapters = useMemo(() => chaptersForRef(currentRef), [currentRef])

  const layoutBlocks = useMemo(
    () =>
      viewModel && layoutMode === 'verse-block' && !slotsActive
        ? filterUsjLayoutBlocks(buildUsjLayoutBlocks(viewModel.usj, viewModel), {
            chapters: navChapters,
            includeVerse,
          })
        : [],
    [viewModel, layoutMode, slotsActive, navChapters, includeVerse]
  )

  const { versesByChapter, chapters } = useMemo(() => {
    if (slotsActive && displayChapters && displayChapters.length > 0) {
      return {
        versesByChapter: {} as Record<number, DisplayUsjVerse[]>,
        chapters: displayChapters,
      }
    }
    const grouped = displayVerses.reduce((acc, verse) => {
      const chapterNum = verse.chapterNumber || currentRef.chapter
      if (!acc[chapterNum]) acc[chapterNum] = []
      acc[chapterNum].push(verse)
      return acc
    }, {} as Record<number, DisplayUsjVerse[]>)
    return {
      versesByChapter: grouped,
      chapters: Object.keys(grouped).map(Number).sort((a, b) => a - b),
    }
  }, [slotsActive, displayChapters, displayVerses, currentRef.chapter])

  const verseBlockItemsByChapter = useMemo(() => {
    if (slotsActive || layoutMode !== 'verse-block') {
      return new Map<number, ReturnType<typeof collectVerseBlockSequence>>()
    }
    const grouped = new Map<number, ReturnType<typeof collectVerseBlockSequence>>()
    for (const chapterNum of chapters) {
      const chapterVerses = (versesByChapter[chapterNum] ?? []).map((verse) => ({
        chapter: chapterNum,
        verse: verse.number,
      }))
      const chapterBlocks = layoutBlocks.filter(
        (block) =>
          block.chapterNumber === chapterNum &&
          (block.role === 'heading' ||
            block.role === 'break' ||
            block.marker === 'b' ||
            block.verseNumbers.length > 0)
      )
      grouped.set(chapterNum, collectVerseBlockSequence(chapterBlocks, chapterVerses))
    }
    return grouped
  }, [slotsActive, layoutMode, layoutBlocks, chapters, versesByChapter])

  const showFullScreenLoading =
    isLoading ||
    isScriptureBooksPending({
      isLoadingTOC,
      isLoading: false,
      availableBookCount: availableBooks.length,
      hasViewModel: Boolean(viewModel),
      hasNav: Boolean(nav),
    })
  if (showFullScreenLoading) {
    return (
      <LoadingSpinner
        centered
        label="Loading scripture"
        className="text-accent"
        containerClassName="py-12"
      />
    )
  }

  if (error) {
    if (error === 'BOOK_NOT_AVAILABLE') {
      return (
        <div
          className="flex items-center justify-center h-full"
          role="status"
          aria-label="Book not available in this resource"
          title="Book not available in this resource"
        >
          <BookX className="w-16 h-16 text-fg-muted" />
        </div>
      )
    }
    return (
      <div className="text-center py-12 text-danger">
        <p className="font-semibold">Error loading content</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    )
  }

  const isOriginalLanguage = isOriginalLanguageCode(language)
  const healButton =
    tokenSourceFailed && onRetryTokenSource ? (
      <div className="sticky top-0 z-10 flex justify-end -mb-2">
        <TokenSourceHealButton onRetry={onRetryTokenSource} />
      </div>
    ) : null
  const tokenProps = {
    highlightTarget,
    underlinedSemanticIds,
    onTokenClick,
    onVerseClick,
    onScriptureRefClick,
    currentBook: currentRef.book,
    isOriginalLanguage,
  }

  // Nav-only: paint slot chrome (light / paragraph) without the viewModel.
  // When full prepared rows exist, render interned tokens without loading the view model.
  if (!viewModel && nav && slotsActive && slots) {
    return (
      <div ref={containerRef} className="space-y-6" dir={languageDirection}>
        {healButton}
        {slots.map((slot) => {
          if (slot.kind === 'rendered') {
            void preparedRevision
            const peeked = peekPreparedChapter(resourceKey, currentRef.book, slot.chapter)
            if (peeked?.full && onInternedTokenClick) {
              return (
                <PreparedFullChapterPane
                  key={`prepared-full-${slot.chapter}`}
                  chapterNum={slot.chapter}
                  full={peeked.full}
                  book={currentRef.book}
                  registerChapter={registerChapter}
                  highlightTarget={highlightTarget}
                  underlinedSemanticIds={underlinedSemanticIds}
                  onInternedTokenClick={onInternedTokenClick}
                  onChapterClick={onChapterClick}
                  onVerseClick={onVerseClick}
                  isOriginalLanguage={isOriginalLanguage}
                />
              )
            }
            // Full tokens missing — stay on light (paragraph), never claim interactive.
            return (
              lightPaneForChapter(slot.chapter, 'paragraph') ??
              paragraphPane(slot.chapter, `pending-rendered-${slot.chapter}`)
            )
          }
          return (
            lightPaneForChapter(slot.chapter, 'paragraph') ??
            paragraphPane(slot.chapter, `paragraph-${slot.chapter}-${slot.chapter}`)
          )
        })}
      </div>
    )
  }

  if (!viewModel) {
    return (
      <div className="text-center py-12 text-fg-secondary">
        <p>No content available for {currentRef.book.toUpperCase()}</p>
        <p className="text-sm mt-2">
          Available books: {availableBooks.map((b) => b.code).join(', ').toUpperCase()}
        </p>
      </div>
    )
  }

  const slotPaintViewModel = paintViewModel ?? viewModel

  const slotWindowVerses =
    slotsActive && displayChapters && displayChapters.length > 0
      ? displayVersesForChapters(slotPaintViewModel, displayChapters)
      : displayVerses

  if (
    slotWindowVerses.length === 0 &&
    !(slotsActive && displayChapters && displayChapters.length > 0)
  ) {
    const refString = `${currentRef.book.toUpperCase()} ${currentRef.chapter}:${currentRef.verse}${
      currentRef.endVerse ? `-${currentRef.endVerse}` : ''
    }`
    return (
      <div className="text-center py-12 text-fg-secondary">
        <p>No verses found for {refString}</p>
      </div>
    )
  }

  return (
    <div ref={containerRef} className="space-y-6" dir={languageDirection}>
      {healButton}
      {layoutMode === 'formatted' && slotPaintViewModel ? (
        <FormattedScriptureContent
          viewModel={slotPaintViewModel}
          resourceKey={resourceKey}
          currentRef={currentRef}
          highlightTarget={highlightTarget}
          underlinedSemanticIds={underlinedSemanticIds}
          onTokenClick={onTokenClick}
          onVerseClick={onVerseClick}
          onChapterClick={onChapterClick}
          onScriptureRefClick={onScriptureRefClick}
          isOriginalLanguage={isOriginalLanguage}
          displayChapters={displayChapters}
          chapterSlots={chapterSlots}
          registerChapter={registerChapter}
        />
      ) : slotsActive && slots ? (
        slots.map((slot) => {
          if (slot.kind !== 'rendered') {
            return (
              lightPaneForChapter(slot.chapter, 'paragraph') ??
              paragraphPane(slot.chapter, `paragraph-${slot.chapter}-${slot.chapter}`)
            )
          }
          // Verse-block mode must use one-verse-per-block layout. PreparedFull
          // paints USJ paragraph blocks (same as formatted), so preferring it
          // here made the layout toggle a no-op under infinite-scroll slots.
          void preparedRevision
          const verses = getChapterDisplayVerses(slotPaintViewModel, slot.chapter)
          if (verses.length === 0) {
            // Stack chapter not yet merged into the focused SoT slice — keep
            // light text visible until useStackedChapterViewModel lands.
            return (
              lightPaneForChapter(slot.chapter, 'rendered') ??
              paragraphPane(slot.chapter, `pending-verse-block-${slot.chapter}`)
            )
          }
          return (
            <VerseBlockChapterPane
              key={`verse-block-${slot.chapter}`}
              chapterNum={slot.chapter}
              items={getChapterVerseBlockItems(slotPaintViewModel, slot.chapter)}
              verses={verses}
              registerChapter={registerChapter}
              onChapterClick={onChapterClick}
              {...tokenProps}
            />
          )
        })
      ) : (
        chapters.map((chapterNum) => (
          <div key={chapterNum} className="space-y-1" data-scripture-layout="verse-block">
            <ChapterHeading chapter={chapterNum} onChapterClick={onChapterClick} />
            <VerseBlockItems
              chapterNum={chapterNum}
              items={verseBlockItemsByChapter.get(chapterNum) ?? []}
              verses={versesByChapter[chapterNum] ?? []}
              {...tokenProps}
            />
          </div>
        ))
      )}
    </div>
  )
}
