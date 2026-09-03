import {
  buildUsjLayoutBlocks,
  collectVerseBlockSequence,
  filterUsjLayoutBlocks,
  type UsjScriptureViewModel,
  type UsjVerseBlockItem,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { BookX } from 'lucide-react'
import { memo, useEffect, useMemo, useRef } from 'react'
import { useCacheAdapter } from '../../../../contexts'
import type { BCVReference, BookInfo, ReferenceState } from '../../../../contexts/types-only'
import { useScriptureDisplayStore } from '../../../../lib/stores/scriptureDisplayStore'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { isOriginalLanguageCode } from '../../../../features/helps/resolveAlignedQuoteTokens'
import type { ChapterSlot } from '../../../../features/nav/chapterInfiniteScroll'
import {
  chapterWindowAround,
  contentChaptersFromSlots,
  lastChapterNumber,
  paragraphChaptersFromSlots,
} from '../../../../features/nav/chapterInfiniteScroll'
import {
  ensurePreparedFullChapter,
  isPreparedSourceMissing,
} from '../../../../features/scripture/ensurePreparedFullChapter'
import {
  paragraphsFromLightChapter,
  peekPreparedChapter,
} from '../../../../features/scripture/preparedChapterCache'
import { usePreparedChapterWindow, usePreparedBookLightPreload } from '../../../../features/scripture/usePreparedChapter'
import {
  buildLightChapter,
  type ScriptureNavRecord,
} from '../../../../features/scripture/scripturePreparer'
import { isScriptureBooksPending } from '../hooks/scriptureContentLoad'
import type { DisplayUsjVerse, OriginalLanguageToken } from '../types'
import {
  getChapterDisplayVerses,
  getChapterParagraphs,
  getChapterVerseBlockItems,
  prefetchAdjacentChapterParagraphs,
  prefetchChapterLayouts,
} from '../utils/chapterLayoutCache'
import { displayVersesForChapters } from '../utils/displayVersesForChapters'
import { chaptersForRef, includeVerseForRef } from '../utils/scriptureNavRange'
import { ChapterScrollSection } from './ChapterScrollSection'
import { ChapterSlotChrome } from './ChapterSlotChrome'
import { FormattedBlockRenderer } from './FormattedBlockRenderer'
import { FormattedScriptureContent } from './FormattedScriptureContent'
import { PreparedFullChapterPane } from './PreparedFullChapterPane'
import { PreparedLightChapterPane } from './PreparedLightChapterPane'
import { TokenSourceHealButton } from './TokenSourceHealButton'
import { VerseRenderer } from './VerseRenderer'

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

interface VerseBlockChapterPaneProps {
  chapterNum: number
  items: UsjVerseBlockItem[]
  verses: DisplayUsjVerse[]
  registerChapter?: (chapter: number, el: HTMLElement | null) => void
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onChapterClick?: (chapter: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  currentBook: string
  isOriginalLanguage: boolean
}

const VerseBlockChapterPane = memo(function VerseBlockChapterPane({
  chapterNum,
  items,
  verses,
  registerChapter,
  highlightTarget,
  underlinedSemanticIds,
  onTokenClick,
  onVerseClick,
  onChapterClick,
  onScriptureRefClick,
  currentBook,
  isOriginalLanguage,
}: VerseBlockChapterPaneProps) {
  const verseByNumber = new Map<number, DisplayUsjVerse>()
  for (const verse of verses) verseByNumber.set(verse.number, verse)

  return (
    <ChapterScrollSection
      chapter={chapterNum}
      kind="rendered"
      register={registerChapter}
      className="space-y-1"
      layout="verse-block"
      book={currentBook}
    >
      <h2
        className="text-2xl font-bold text-scripture-fg mb-4 pb-2 border-b border-border cursor-pointer hover:text-accent transition-colors"
        onClick={(e) => {
          e.stopPropagation()
          onChapterClick?.(chapterNum)
        }}
      >
        {chapterNum}
      </h2>

      {items.map((item, idx) => {
        if (item.kind === 'chrome') {
          return (
            <FormattedBlockRenderer
              key={`chrome-${chapterNum}-${item.block.marker}-${idx}`}
              block={item.block}
              blockIndex={idx}
              highlightTarget={highlightTarget}
              underlinedSemanticIds={underlinedSemanticIds}
              onTokenClick={onTokenClick}
              onVerseClick={onVerseClick}
              onScriptureRefClick={onScriptureRefClick}
              currentBook={currentBook}
              isOriginalLanguage={isOriginalLanguage}
            />
          )
        }
        const verse = verseByNumber.get(item.verse)
        if (!verse) return null
        return (
          <VerseRenderer
            key={`${item.chapter}:${item.verse}`}
            verse={verse}
            chapterNumber={item.chapter}
            displayInline={item.displayInline}
            highlightTarget={highlightTarget}
            underlinedSemanticIds={underlinedSemanticIds}
            onTokenClick={onTokenClick}
            onVerseClick={onVerseClick}
            onScriptureRefClick={onScriptureRefClick}
            currentBook={currentBook}
            isOriginalLanguage={isOriginalLanguage}
          />
        )
      })}
    </ChapterScrollSection>
  )
})

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
  const slots = chapterSlots && chapterSlots.length > 0 ? chapterSlots : null
  const slotsActive = slots != null

  const warmChapters = useMemo(() => {
    const last =
      (nav?.chapters?.length
        ? lastChapterNumber(nav.chapters.map((c) => c.number))
        : 0) ||
      (viewModel?.chapters?.length
        ? lastChapterNumber(viewModel.chapters.map((c) => c.number))
        : 0) ||
      currentRef.chapter
    const around = chapterWindowAround(currentRef.chapter || 1, last)
    const set = new Set<number>(around)
    if (slots) {
      const painted = contentChaptersFromSlots(slots)
      for (const chapter of painted) set.add(chapter)
      if (painted.length > 0) {
        const lo = Math.min(...painted)
        const hi = Math.max(...painted)
        if (lo > 1) set.add(lo - 1)
        if (hi < last) set.add(hi + 1)
      }
      for (const slot of slots) {
        if (slot.kind === 'placeholder') set.add(slot.chapter)
      }
    } else if (displayChapters?.length) {
      for (const chapter of displayChapters) set.add(chapter)
    }
    return [...set].sort((a, b) => a - b)
  }, [slots, displayChapters, nav, viewModel, currentRef.chapter])

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

  const paragraphsForChapter = (chapter: number): string[] => {
    void preparedRevision
    void bookLightRevision
    const peeked = peekPreparedChapter(resourceKey, currentRef.book, chapter)
    const fromLight = paragraphsFromLightChapter(peeked?.light)
    if (fromLight.length > 0) return fromLight
    if (viewModel) return getChapterParagraphs(viewModel, chapter)
    return []
  }

  const lightPaneForChapter = (
    chapter: number,
    slotKind: 'paragraph' | 'rendered' = 'paragraph'
  ) => {
    void preparedRevision
    void bookLightRevision
    const peeked = peekPreparedChapter(resourceKey, currentRef.book, chapter)
    // Prefer cached light; if the prepare worker has not filled the LRU yet but
    // the view model is already in hand, build light sync so verse markers paint
    // during the paragraph phase (not only after full-tier upgrade).
    const light =
      peeked?.light?.blocks?.length
        ? peeked.light
        : viewModel
          ? buildLightChapter(viewModel, chapter)
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

  useEffect(() => {
    if (!viewModel || !slots || slots.length === 0) return
    const contentChapters = contentChaptersFromSlots(slots)
    prefetchAdjacentChapterParagraphs(viewModel, contentChapters)
    prefetchChapterLayouts(viewModel, paragraphChaptersFromSlots(slots))
  }, [viewModel, slots])

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
    if (!highlightTarget || !selectedTokenId) return
    if (lastScrolledTokenRef.current === selectedTokenId) return

    const timer = setTimeout(() => {
      const highlightedElements = containerRef.current?.querySelectorAll('[data-highlighted="true"]')
      if (highlightedElements && highlightedElements.length > 0) {
        ;(highlightedElements[0] as HTMLElement).scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest',
        })
        lastScrolledTokenRef.current = selectedTokenId
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [highlightTarget, selectedTokenId, containerRef])

  useEffect(() => {
    lastScrolledTokenRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

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

  const verseByKey = useMemo(() => {
    const map = new Map<string, DisplayUsjVerse>()
    for (const verse of displayVerses) {
      map.set(`${verse.chapterNumber || currentRef.chapter}:${verse.number}`, verse)
    }
    return map
  }, [displayVerses, currentRef.chapter])

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

  // Nav-only: show infinite-scroll chrome (paragraph/placeholder) without viewModel.
  // When full prepared rows exist, render interned tokens without loading the view model.
  if (!viewModel && nav && slotsActive && slots) {
    const isOriginalLanguage = isOriginalLanguageCode(language)
    return (
      <div ref={containerRef} className="space-y-6" dir={languageDirection}>
        {tokenSourceFailed && onRetryTokenSource ? (
          <div className="sticky top-0 z-10 flex justify-end -mb-2">
            <TokenSourceHealButton onRetry={onRetryTokenSource} />
          </div>
        ) : null}
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
            const light = lightPaneForChapter(slot.chapter, 'paragraph')
            if (light) return light
            return (
              <ChapterSlotChrome
                key={`pending-rendered-${slot.chapter}`}
                slot={{ ...slot, kind: 'paragraph' }}
                book={currentRef.book}
                paragraphs={paragraphsForChapter(slot.chapter)}
                register={registerChapter}
                onChapterClick={onChapterClick}
              />
            )
          }
          if (slot.kind === 'paragraph' || slot.kind === 'placeholder') {
            const light = lightPaneForChapter(slot.chapter, 'paragraph')
            if (light) return light
          }
          return (
            <ChapterSlotChrome
              key={`${slot.kind}-${slot.chapter}-${slot.toChapter ?? slot.chapter}`}
              slot={slot}
              book={currentRef.book}
              paragraphs={
                slot.kind === 'paragraph' ? paragraphsForChapter(slot.chapter) : undefined
              }
              register={registerChapter}
              onChapterClick={onChapterClick}
            />
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

  const slotWindowVerses =
    slotsActive && displayChapters && displayChapters.length > 0
      ? displayVersesForChapters(viewModel, displayChapters)
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

  const isOriginalLanguage = isOriginalLanguageCode(language)

  return (
    <div ref={containerRef} className="space-y-6" dir={languageDirection}>
      {tokenSourceFailed && onRetryTokenSource ? (
        <div className="sticky top-0 z-10 flex justify-end -mb-2">
          <TokenSourceHealButton onRetry={onRetryTokenSource} />
        </div>
      ) : null}
      {layoutMode === 'formatted' && viewModel ? (
        <FormattedScriptureContent
          viewModel={viewModel}
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
            if (slot.kind === 'paragraph' || slot.kind === 'placeholder') {
              const light = lightPaneForChapter(slot.chapter, 'paragraph')
              if (light) return light
            }
            return (
              <ChapterSlotChrome
                key={`${slot.kind}-${slot.chapter}-${slot.toChapter ?? slot.chapter}`}
                slot={slot}
                book={currentRef.book}
                paragraphs={
                  slot.kind === 'paragraph'
                    ? paragraphsForChapter(slot.chapter)
                    : undefined
                }
                register={registerChapter}
                onChapterClick={onChapterClick}
              />
            )
          }
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
          // While full prepare is cold, fall back to USJ tokens (hover/underline capable)
          // instead of non-interactive light chrome labeled as rendered.
          return (
            <VerseBlockChapterPane
              key={`usj-pending-full-${slot.chapter}`}
              chapterNum={slot.chapter}
              items={getChapterVerseBlockItems(viewModel, slot.chapter)}
              verses={getChapterDisplayVerses(viewModel, slot.chapter)}
              registerChapter={registerChapter}
              highlightTarget={highlightTarget}
              underlinedSemanticIds={underlinedSemanticIds}
              onTokenClick={onTokenClick}
              onVerseClick={onVerseClick}
              onChapterClick={onChapterClick}
              onScriptureRefClick={onScriptureRefClick}
              currentBook={currentRef.book}
              isOriginalLanguage={isOriginalLanguage}
            />
          )
        })
      ) : (
        chapters.map((chapterNum) => (
          <div key={chapterNum} className="space-y-1" data-scripture-layout="verse-block">
            <h2
              className="text-2xl font-bold text-scripture-fg mb-4 pb-2 border-b border-border cursor-pointer hover:text-accent transition-colors"
              onClick={(e) => {
                e.stopPropagation()
                onChapterClick?.(chapterNum)
              }}
            >
              {chapterNum}
            </h2>

            {(verseBlockItemsByChapter.get(chapterNum) ?? []).map((item, idx) => {
              if (item.kind === 'chrome') {
                return (
                  <FormattedBlockRenderer
                    key={`chrome-${chapterNum}-${item.block.marker}-${idx}`}
                    block={item.block}
                    blockIndex={idx}
                    highlightTarget={highlightTarget}
                    underlinedSemanticIds={underlinedSemanticIds}
                    onTokenClick={onTokenClick}
                    onVerseClick={onVerseClick}
                    onScriptureRefClick={onScriptureRefClick}
                    currentBook={currentRef.book}
                    isOriginalLanguage={isOriginalLanguage}
                  />
                )
              }
              const verse = verseByKey.get(`${item.chapter}:${item.verse}`)
              if (!verse) return null
              return (
                <VerseRenderer
                  key={`${item.chapter}:${item.verse}`}
                  verse={verse}
                  chapterNumber={item.chapter}
                  displayInline={item.displayInline}
                  highlightTarget={highlightTarget}
                  underlinedSemanticIds={underlinedSemanticIds}
                  onTokenClick={onTokenClick}
                  onVerseClick={onVerseClick}
                  onScriptureRefClick={onScriptureRefClick}
                  currentBook={currentRef.book}
                  isOriginalLanguage={isOriginalLanguage}
                />
              )
            })}
          </div>
        ))
      )}
    </div>
  )
}
