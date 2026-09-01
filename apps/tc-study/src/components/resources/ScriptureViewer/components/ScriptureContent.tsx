import {
  buildUsjLayoutBlocks,
  collectVerseBlockSequence,
  filterUsjLayoutBlocks,
  type UsjScriptureViewModel,
  type UsjWordToken,
} from '@bt-synergy/scripture-loader'
import { BookX } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { BCVReference, BookInfo, ReferenceState } from '../../../../contexts/types-only'
import { useScriptureDisplayStore } from '../../../../lib/stores/scriptureDisplayStore'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import { isOriginalLanguageCode } from '../../../../features/helps/resolveAlignedQuoteTokens'
import { isScriptureBooksPending } from '../hooks/scriptureContentLoad'
import type { DisplayUsjVerse, OriginalLanguageToken } from '../types'
import { chaptersForRef, includeVerseForRef } from '../utils/scriptureNavRange'
import { FormattedBlockRenderer } from './FormattedBlockRenderer'
import { FormattedScriptureContent } from './FormattedScriptureContent'
import { VerseRenderer } from './VerseRenderer'

interface ScriptureContentProps {
  isLoading: boolean
  isLoadingTOC?: boolean
  error: string | null
  viewModel: UsjScriptureViewModel | null
  availableBooks: BookInfo[]
  displayVerses: DisplayUsjVerse[]
  currentRef: ReferenceState
  highlightTarget: OriginalLanguageToken | null
  underlinedSemanticIds?: Set<string>
  selectedTokenId: string | null
  onTokenClick: (token: UsjWordToken) => void
  onVerseClick?: (chapter: number, verse: number) => void
  onChapterClick?: (chapter: number) => void
  onScriptureRefClick?: (ref: BCVReference) => void
  language?: string
  languageDirection?: 'ltr' | 'rtl'
}

export function ScriptureContent({
  isLoading,
  isLoadingTOC = false,
  error,
  viewModel,
  availableBooks,
  displayVerses,
  currentRef,
  highlightTarget,
  underlinedSemanticIds,
  selectedTokenId,
  onTokenClick,
  onVerseClick,
  onChapterClick,
  onScriptureRefClick,
  language,
  languageDirection = 'ltr',
}: ScriptureContentProps) {
  const layoutMode = useScriptureDisplayStore((s) => s.layoutMode)
  const containerRef = useRef<HTMLDivElement>(null)
  const lastScrolledTokenRef = useRef<string | null>(null)

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
  }, [highlightTarget, selectedTokenId])

  useEffect(() => {
    lastScrolledTokenRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

  const includeVerse = useMemo(() => includeVerseForRef(currentRef), [currentRef])
  const navChapters = useMemo(() => chaptersForRef(currentRef), [currentRef])

  const layoutBlocks = useMemo(
    () =>
      viewModel && layoutMode === 'verse-block'
        ? filterUsjLayoutBlocks(buildUsjLayoutBlocks(viewModel.usj, viewModel), {
            chapters: navChapters,
            includeVerse,
          })
        : [],
    [viewModel, layoutMode, navChapters, includeVerse]
  )

  const verseByKey = useMemo(() => {
    const map = new Map<string, DisplayUsjVerse>()
    for (const verse of displayVerses) {
      map.set(`${verse.chapterNumber || currentRef.chapter}:${verse.number}`, verse)
    }
    return map
  }, [displayVerses, currentRef.chapter])

  const { versesByChapter, chapters } = useMemo(() => {
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
  }, [displayVerses, currentRef.chapter])

  const verseBlockItemsByChapter = useMemo(() => {
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
  }, [layoutBlocks, chapters, versesByChapter])

  const showFullScreenLoading = isScriptureBooksPending({
    isLoadingTOC,
    isLoading,
    availableBookCount: availableBooks.length,
    hasViewModel: Boolean(viewModel),
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

  if (displayVerses.length === 0) {
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
      {layoutMode === 'formatted' && viewModel ? (
        <FormattedScriptureContent
          viewModel={viewModel}
          currentRef={currentRef}
          highlightTarget={highlightTarget}
          underlinedSemanticIds={underlinedSemanticIds}
          onTokenClick={onTokenClick}
          onVerseClick={onVerseClick}
          onChapterClick={onChapterClick}
          onScriptureRefClick={onScriptureRefClick}
          isOriginalLanguage={isOriginalLanguage}
        />
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
