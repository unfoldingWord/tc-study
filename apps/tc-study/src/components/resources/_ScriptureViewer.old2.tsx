/**
 * ScriptureViewer - Displays scripture with proper USFM parsing
 * Adapted from mobile app pattern for web
 * 
 * Features:
 * - Loads content based on current reference
 * - Tokenizes for inter-panel communication
 * - Exposes TOC for navigation
 * - Handles verse ranges
 * - Highlights based on messages
 */

import { useState, useEffect, useMemo } from 'react'
import { useResourceAPI, useCurrentState, useEvents } from 'linked-panels'
import { useCurrentReference, useApp, type BookInfo, type ResourceTOC } from '../../contexts'
import type { TokenClickEvent, HighlightedTokensState, VerseReferenceFilterEvent } from '../../plugins/types'

interface ScriptureViewerProps {
  resourceId: string
  resourceKey: string
  server?: string
  owner?: string
  language?: string
  resourceType?: string
  isAnchor?: boolean
}

// Sample USFM data (will be replaced with real content from catalog)
const SAMPLE_USFM_BY_BOOK: Record<string, string> = {
  'tit': `\\id TIT Unlocked Literal Bible
\\h Titus
\\c 1
\\p
\\v 1 Paul, a servant of God and an apostle of Jesus Christ, for the faith of God's chosen people and the knowledge of the truth that agrees with godliness,
\\v 2 with the certain hope of everlasting life that God, who does not lie, promised before all the ages of time.
\\v 3 At the right time, he revealed his word by the message that he trusted me to deliver. I was to do this by the command of God our Savior.
\\v 4 To Titus, a true son in our common faith. Grace and peace from God the Father and Christ Jesus our Savior.
\\v 5 For this purpose I left you in Crete, that you might set in order things not yet complete and ordain elders in every city as I directed you.`,
  'gen': `\\id GEN Unlocked Literal Bible  
\\h Genesis
\\c 1
\\p
\\v 1 In the beginning, God created the heavens and the earth.
\\v 2 The earth was without form and empty. Darkness was upon the surface of the deep. The Spirit of God was moving above the surface of the waters.
\\v 3 God said, "Let there be light," and there was light.`,
  'mat': `\\id MAT Unlocked Literal Bible
\\h Matthew
\\c 1
\\p
\\v 1 The book of the genealogy of Jesus Christ, son of David, son of Abraham.
\\v 2 Abraham was the father of Isaac, and Isaac the father of Jacob, and Jacob the father of Judah and his brothers.`,
}

// Parse USFM to extract verses
interface ParsedVerse {
  number: number
  text: string
  tokens: Array<{
    id: string
    content: string
    verseNumber: number
    position: number
  }>
}

interface ParsedChapter {
  number: number
  verses: ParsedVerse[]
}

function parseUSFM(usfm: string, bookCode: string): ParsedChapter[] {
  const chapters: ParsedChapter[] = []
  let currentChapter: ParsedChapter | null = null
  let currentVerse: ParsedVerse | null = null

  const lines = usfm.split('\n')
  
  for (const line of lines) {
    // Chapter marker
    if (line.startsWith('\\c ')) {
      const chapterNum = parseInt(line.substring(3))
      if (!isNaN(chapterNum)) {
        currentChapter = { number: chapterNum, verses: [] }
        chapters.push(currentChapter)
      }
    }
    // Verse marker
    else if (line.startsWith('\\v ')) {
      if (!currentChapter) continue
      
      const match = line.match(/\\v (\d+)\s+(.+)/)
      if (match) {
        const verseNum = parseInt(match[1])
        const text = match[2]
        
        // Tokenize the verse text
        const words = text.split(/\s+/)
        const tokens = words.map((word, idx) => ({
          id: `${bookCode}-${currentChapter.number}-${verseNum}-${idx}`,
          content: word,
          verseNumber: verseNum,
          position: idx,
        }))
        
        currentVerse = {
          number: verseNum,
          text,
          tokens,
        }
        currentChapter.verses.push(currentVerse)
      }
    }
  }
  
  return chapters
}

// Extract TOC from USFM
function extractTOC(bookCode: string, usfm: string): BookInfo {
  const chapters = parseUSFM(usfm, bookCode)
  const verses = chapters.map((ch) => ch.verses.length)
  
  return {
    code: bookCode,
    name: bookCode.toUpperCase(),
    chapters: chapters.length,
    verses,
  }
}

export function ScriptureViewer({
  resourceId,
  resourceKey,
  server = 'git.door43.org',
  owner = 'unfoldingWord',
  language = 'es',
  resourceType = 'bible',
  isAnchor,
}: ScriptureViewerProps) {
  const api = useResourceAPI<TokenClickEvent>(resourceId)
  const app = useApp()
  const currentRef = useCurrentReference()
  
  // Local state for highlighting (from spike pattern)
  const [localHighlightedTokens, setLocalHighlightedTokens] = useState<string[]>([])
  const [localSelectedToken, setLocalSelectedToken] = useState<string | null>(null)
  const [loadedContent, setLoadedContent] = useState<ParsedChapter[] | null>(null)
  const [availableBooks, setAvailableBooks] = useState<BookInfo[]>([])
  
  // Listen for highlighted-tokens state
  const highlightState = useCurrentState<HighlightedTokensState>(
    resourceId,
    'current-highlighted-tokens'
  )
  
  // Listen for verse-filter events
  useEvents<VerseReferenceFilterEvent>(
    resourceId,
    ['verse-filter'],
    (event) => {
      console.log('📨 ScriptureViewer received verse-filter:', event.verseRef)
    }
  )

  // Load content for current book
  useEffect(() => {
    const bookCode = currentRef.book
    console.log('📖 Loading content for book:', bookCode)
    
    // Get USFM for this book (sample data for now)
    const usfm = SAMPLE_USFM_BY_BOOK[bookCode]
    
    if (usfm) {
      const parsed = parseUSFM(usfm, bookCode)
      setLoadedContent(parsed)
      console.log('✅ Loaded', parsed.length, 'chapters for', bookCode)
    } else {
      console.warn('⚠️ No content for book:', bookCode)
      setLoadedContent(null)
    }
  }, [currentRef.book])

  // Expose TOC on mount (if anchor resource)
  useEffect(() => {
    if (isAnchor) {
      // Build TOC from available USFM data
      const books: BookInfo[] = Object.keys(SAMPLE_USFM_BY_BOOK).map((bookCode) => {
        const usfm = SAMPLE_USFM_BY_BOOK[bookCode]
        return extractTOC(bookCode, usfm)
      })
      
      setAvailableBooks(books)
      
      const toc: ResourceTOC = {
        resourceId,
        resourceType: 'scripture',
        books,
      }
      
      app.setAnchorResource(resourceId, toc)
      console.log('⚓ ScriptureViewer exposed TOC with', books.length, 'books')
    }
  }, [isAnchor, resourceId])

  // Get current chapter data
  const currentChapter = useMemo(() => {
    if (!loadedContent) return null
    return loadedContent.find((ch) => ch.number === currentRef.chapter)
  }, [loadedContent, currentRef.chapter])

  // Get verses in range
  const displayVerses = useMemo(() => {
    if (!currentChapter) return []
    
    const startVerse = currentRef.verse
    const endVerse = currentRef.endVerse || currentRef.endChapter ? 999 : startVerse
    
    return currentChapter.verses.filter(
      (v) => v.number >= startVerse && v.number <= endVerse
    )
  }, [currentChapter, currentRef])

  // Combine local + broadcast highlighting
  const highlightedTokens = localHighlightedTokens.length > 0
    ? localHighlightedTokens
    : (highlightState?.tokenIds || [])
  const selectedTokenId = localSelectedToken || highlightState?.selectedTokenId

  // Handle token click
  const handleTokenClick = (token: any) => {
    console.log('🖱️ Token clicked:', token.content)
    
    // Update local state immediately
    setLocalHighlightedTokens([token.id])
    setLocalSelectedToken(token.id)
    
    // Broadcast token-click event
    const message: TokenClickEvent = {
      type: 'token-click',
      lifecycle: 'event',
      token: {
        id: token.id,
        content: token.content,
        semanticId: token.id, // TODO: Add proper semantic IDs
        verseRef: `${currentRef.book.toUpperCase()} ${currentRef.chapter}:${token.verseNumber}`,
        position: token.position,
      },
      sourceResourceId: resourceId,
      timestamp: Date.now(),
    }
    
    api.messaging.sendToAll(message)
  }

  // Format reference
  const refString = `${currentRef.book.toUpperCase()} ${currentRef.chapter}:${currentRef.verse}${
    currentRef.endVerse ? `-${currentRef.endVerse}` : ''
  }`

  return (
    <div className="h-full flex flex-col p-6">
      {/* Header */}
      <div className="mb-4">
        <h3 className="text-lg font-semibold text-gray-900">{resourceKey}</h3>
        <p className="text-sm text-gray-500">{refString}</p>
        {isAnchor && (
          <span className="inline-block mt-1 px-2 py-0.5 bg-blue-100 text-blue-700 text-xs rounded">
            ⚓ Anchor Resource
          </span>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {!loadedContent ? (
          <div className="text-center py-12 text-gray-500">
            <p>No content available for {currentRef.book.toUpperCase()}</p>
            <p className="text-sm mt-2">
              Available books: {Object.keys(SAMPLE_USFM_BY_BOOK).join(', ').toUpperCase()}
            </p>
          </div>
        ) : displayVerses.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <p>No verses found for {refString}</p>
          </div>
        ) : (
          <div className="space-y-4">
            {displayVerses.map((verse) => (
              <div key={verse.number} className="flex gap-3">
                {/* Verse Number */}
                <span className="text-sm font-bold text-gray-500 select-none min-w-[2rem]">
                  {verse.number}
                </span>

                {/* Verse Tokens */}
                <div className="flex-1 text-lg leading-relaxed">
                  {verse.tokens.map((token, idx) => {
                    const isHighlighted = highlightedTokens.includes(token.id)
                    const isSelected = selectedTokenId === token.id

                    return (
                      <span key={token.id}>
                        <span
                          onClick={() => handleTokenClick(token)}
                          className={`
                            cursor-pointer px-1 py-0.5 rounded transition-all
                            ${isSelected ? 'bg-yellow-400 font-bold' : ''}
                            ${isHighlighted && !isSelected ? 'bg-yellow-100' : ''}
                            ${!isHighlighted && !isSelected ? 'hover:bg-gray-100' : ''}
                          `}
                        >
                          {token.content}
                        </span>
                        {idx < verse.tokens.length - 1 && ' '}
                      </span>
                    )
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Info */}
      <div className="mt-4 p-3 bg-blue-50 rounded-lg text-sm">
        <strong>Status:</strong>
        <ul className="mt-2 space-y-1 text-gray-700">
          <li>• Book: {currentRef.book.toUpperCase()}</li>
          <li>• Chapter: {currentRef.chapter}</li>
          <li>• Verses: {displayVerses.length}</li>
          <li>• Tokens highlighted: {highlightedTokens.length}</li>
          <li>• Available books: {availableBooks.length}</li>
        </ul>
      </div>
    </div>
  )
}

