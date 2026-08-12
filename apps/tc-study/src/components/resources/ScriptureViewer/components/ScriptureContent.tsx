import type { UsjScriptureViewModel, UsjWordToken } from '@bt-synergy/scripture-loader'
import { BookX } from 'lucide-react'
import { useEffect, useMemo, useRef } from 'react'
import type { BookInfo, ReferenceState } from '../../../../contexts/types-only'
import { LoadingSpinner } from '../../../../shared/LoadingSpinner'
import type { DisplayUsjVerse, OriginalLanguageToken } from '../types'
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
  language,
  languageDirection = 'ltr',
}: ScriptureContentProps) {
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

  const showFullScreenLoading = (isLoadingTOC || isLoading) && !viewModel
  if (showFullScreenLoading) {
    return (
      <LoadingSpinner
        centered
        label="Loading scripture"
        className="text-blue-600"
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
          <BookX className="w-16 h-16 text-gray-400" />
        </div>
      )
    }
    return (
      <div className="text-center py-12 text-red-600">
        <p className="font-semibold">Error loading content</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    )
  }

  if (!viewModel) {
    return (
      <div className="text-center py-12 text-gray-500">
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
      <div className="text-center py-12 text-gray-500">
        <p>No verses found for {refString}</p>
      </div>
    )
  }

  const isOriginalLanguage = language === 'el-x-koine' || language === 'hbo'

  return (
    <div ref={containerRef} className="space-y-6" dir={languageDirection}>
      {chapters.map((chapterNum) => (
        <div key={chapterNum} className="space-y-1">
          <h2
            className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200 cursor-pointer hover:text-blue-600 transition-colors"
            onClick={(e) => {
              e.stopPropagation()
              onChapterClick?.(chapterNum)
            }}
          >
            {chapterNum}
          </h2>

          {versesByChapter[chapterNum]!.map((verse) => (
            <VerseRenderer
              key={`${chapterNum}:${verse.number}`}
              verse={verse}
              chapterNumber={chapterNum}
              highlightTarget={highlightTarget}
              underlinedSemanticIds={underlinedSemanticIds}
              onTokenClick={onTokenClick}
              onVerseClick={onVerseClick}
              isOriginalLanguage={isOriginalLanguage}
            />
          ))}
        </div>
      ))}
    </div>
  )
}
