/**
 * ScriptureContent - Main content area displaying verses
 */

import type { ProcessedVerse, WordToken } from '@bt-synergy/usfm-processor'
import { BookX } from 'lucide-react'
import { useEffect, useRef } from 'react'
import type { BookInfo } from '../../../../contexts/types-only'
import type { OriginalLanguageToken } from '../types'
import { VerseRenderer } from './VerseRenderer'

interface ScriptureContentProps {
  isLoading: boolean
  error: string | null
  loadedContent: any
  availableBooks: BookInfo[]
  displayVerses: ProcessedVerse[]
  currentRef: any
  highlightTarget: OriginalLanguageToken | null
  selectedTokenId: string | null
  onTokenClick: (token: WordToken) => void
  language?: string
  languageDirection?: 'ltr' | 'rtl'
}

export function ScriptureContent({
  isLoading,
  error,
  loadedContent,
  availableBooks,
  displayVerses,
  currentRef,
  highlightTarget,
  selectedTokenId,
  onTokenClick,
  language,
  languageDirection = 'ltr',
}: ScriptureContentProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const lastScrolledTokenRef = useRef<string | null>(null)

  // Auto-scroll to highlighted token when highlightTarget changes
  useEffect(() => {
    // Only scroll if there's a highlight target and it's different from last scrolled
    if (!highlightTarget || !selectedTokenId) {
      return
    }

    // Don't scroll again to the same token
    if (lastScrolledTokenRef.current === selectedTokenId) {
      return
    }

    // Wait a tick for DOM to update
    const timer = setTimeout(() => {
      const highlightedElements = containerRef.current?.querySelectorAll('[data-highlighted="true"]')
      
      if (highlightedElements && highlightedElements.length > 0) {
        const firstHighlighted = highlightedElements[0] as HTMLElement
        
        // Scroll with smooth behavior and center alignment
        firstHighlighted.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
          inline: 'nearest'
        })
        
        // Remember this token to avoid redundant scrolls
        lastScrolledTokenRef.current = selectedTokenId
      }
    }, 100)

    return () => clearTimeout(timer)
  }, [highlightTarget, selectedTokenId])

  // Reset scroll tracking when reference changes
  useEffect(() => {
    lastScrolledTokenRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse])
  if (isLoading) {
    return (
      <div 
        className="flex items-center justify-center py-12"
        role="status"
        aria-label="Loading scripture"
      >
        <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full" />
      </div>
    )
  }

  if (error) {
    // Special handling for "book not available" case
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
    
    // General error display for other errors
    return (
      <div className="text-center py-12 text-red-600">
        <p className="font-semibold">Error loading content</p>
        <p className="text-sm mt-2">{error}</p>
      </div>
    )
  }

  if (!loadedContent) {
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

  // Determine if this is an original language resource
  const isOriginalLanguage = language === 'el-x-koine' || language === 'hbo'

  // Group verses by chapter for cross-chapter range support
  const versesByChapter = displayVerses.reduce((acc, verse) => {
    // Use verse.chapterNumber if available (cross-chapter), otherwise use currentRef.chapter
    const verseWithChapter = verse as ProcessedVerse & { chapterNumber?: number }
    const chapterNum = verseWithChapter.chapterNumber || currentRef.chapter
    if (!acc[chapterNum]) {
      acc[chapterNum] = []
    }
    acc[chapterNum].push(verse)
    return acc
  }, {} as Record<number, ProcessedVerse[]>)

  const chapters = Object.keys(versesByChapter).map(Number).sort((a, b) => a - b)
  const isCrossChapter = chapters.length > 1

  return (
    <div ref={containerRef} className="space-y-6" dir={languageDirection}>
      {chapters.map((chapterNum) => (
        <div key={chapterNum} className="space-y-1">
          {/* Chapter Header - shown for each chapter in cross-chapter ranges */}
          <h2 className="text-2xl font-bold text-gray-800 mb-4 pb-2 border-b border-gray-200">
            {chapterNum}
          </h2>
          
          {/* Verses in this chapter */}
          {versesByChapter[chapterNum].map((verse) => (
        <VerseRenderer
              key={`${chapterNum}:${verse.number}`}
          verse={verse}
              highlightedTokens={[]} // Keep for backward compatibility but not used
          selectedTokenId={selectedTokenId}
              highlightTarget={highlightTarget}
          onTokenClick={onTokenClick}
              isOriginalLanguage={isOriginalLanguage}
        />
          ))}
        </div>
      ))}
    </div>
  )
}


