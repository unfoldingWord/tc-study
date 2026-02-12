/**
 * BCVNavigator - Book-Chapter-Verse or Section selection modal
 * 
 * Two-step process:
 * 1. Select book from available books
 * 2a. Select custom range in a grid (can span chapters) - verse mode
 * 2b. Select from preset sections - section mode
 * 
 * Only works when anchor resource is set.
 */

import type { TranslatorSection } from '@bt-synergy/usfm-processor'
import { AlertCircle, ArrowLeft, BookOpen, Check, Hash, List, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useAvailableBooks, useCurrentSectionIndex, useNavigation, useNavigationMode, type BCVReference } from '../../contexts'
import { useAppStore, useBookTitleSource } from '../../contexts/AppContext'
import { getDefaultSections } from '../../lib/data/default-sections'
import { getBookTitle } from '../../utils/bookNames'

interface BCVNavigatorProps {
  onClose: () => void
  mode?: 'verse' | 'section' // Default is 'verse'
}

export function BCVNavigator({ onClose, mode = 'verse' }: BCVNavigatorProps) {
  const navigation = useNavigation()
  const availableBooks = useAvailableBooks()
  const navigationMode = useNavigationMode()
  const currentSectionIndex = useCurrentSectionIndex()
  const anchorResourceId = useAppStore((s) => s.anchorResourceId)
  const bookTitleSource = useBookTitleSource()
  const currentRef = navigation.currentReference
  
  // Use provided mode or fall back to current navigation mode
  const effectiveMode = mode || navigationMode
  
  // Refs for scrolling to current section/verse/book
  const currentSectionRef = useRef<HTMLButtonElement>(null)
  const startVerseRef = useRef<HTMLButtonElement>(null)
  const selectedBookRef = useRef<HTMLButtonElement>(null)

  // Guard: Navigator requires anchor resource
  if (!anchorResourceId || availableBooks.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center">
        {/* Backdrop */}
        <div
          className="absolute inset-0 bg-black/50 backdrop-blur-sm"
          onClick={onClose}
          aria-hidden="true"
        />
        
        {/* Modal */}
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
          <div className="flex-1 flex items-center justify-center min-h-0">
            <AlertCircle className="w-24 h-24 text-gray-300" />
          </div>
        </div>
      </div>
    )
  }

  // Start at step 2 if we already have a book selected
  const [step, setStep] = useState<1 | 2>(currentRef.book ? 2 : 1)
  const [selectedBook, setSelectedBook] = useState(currentRef.book)
  
  // Initialize with current reference range
  const initStartVerse = currentRef.chapter && currentRef.verse 
    ? `${currentRef.chapter}:${currentRef.verse}` 
    : null
  const initEndVerse = currentRef.endChapter && currentRef.endVerse
    ? `${currentRef.endChapter}:${currentRef.endVerse}`
    : currentRef.endVerse && !currentRef.endChapter
    ? `${currentRef.chapter}:${currentRef.endVerse}`
    : null
    
  const [startVerse, setStartVerse] = useState<string | null>(initStartVerse)
  const [endVerse, setEndVerse] = useState<string | null>(initEndVerse)
  const [sections, setSections] = useState<TranslatorSection[]>([])
  const [selectedSection, setSelectedSection] = useState<TranslatorSection | null>(null)
  
  // Load sections when in section mode
  useEffect(() => {
    if (effectiveMode === 'section' && selectedBook) {
      let cancelled = false
      getDefaultSections(selectedBook).then((defaultSections) => {
        if (!cancelled && defaultSections.length > 0) {
          setSections(defaultSections)
          navigation.setBookSections(selectedBook, defaultSections)
        } else if (!cancelled) {
          setSections([])
        }
      })
      return () => { cancelled = true }
    }
  }, [effectiveMode, selectedBook, navigation])
  
  // Scroll to current section when modal opens and sections are loaded
  useEffect(() => {
    if (effectiveMode === 'section' && currentSectionRef.current && step === 2) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        currentSectionRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        })
      }, 100)
    }
  }, [effectiveMode, step, sections])
  
  // Scroll to current verse range when modal opens in verse mode
  useEffect(() => {
    if (effectiveMode !== 'section' && startVerseRef.current && step === 2 && startVerse) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        startVerseRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        })
      }, 100)
    }
  }, [effectiveMode, step, startVerse])
  
  // Scroll to selected book when modal opens on step 1
  useEffect(() => {
    if (step === 1 && selectedBookRef.current && selectedBook) {
      // Small delay to ensure rendering is complete
      setTimeout(() => {
        selectedBookRef.current?.scrollIntoView({ 
          behavior: 'smooth', 
          block: 'center' 
        })
      }, 100)
    }
  }, [step, selectedBook])

  // Get current book info
  const bookInfo = navigation.getBookInfo(selectedBook)
  
  // Generate verse grid data
  const verses: Array<{ chapter: number; verse: number; key: string }> = []
  if (bookInfo && bookInfo.verses) {
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

  // Group verses by chapter for rendering
  const versesByChapter = verses.reduce((acc, v) => {
    if (!acc[v.chapter]) acc[v.chapter] = []
    acc[v.chapter].push(v)
    return acc
  }, {} as Record<number, typeof verses>)

  const chapters = Object.keys(versesByChapter).map(Number).sort((a, b) => a - b)

  // Compare two verse keys (chapter:verse); true if a is before b in biblical order
  const isBefore = (a: string, b: string): boolean => {
    const [ac, av] = a.split(':').map(Number)
    const [bc, bv] = b.split(':').map(Number)
    return ac < bc || (ac === bc && av < bv)
  }

  // Handle verse click/selection - click once for start, twice for end. Always store so start is before end (by chapter then verse).
  const handleVerseClick = (verseKey: string) => {
    if (!startVerse) {
      // First click: set start verse
      setStartVerse(verseKey)
      setEndVerse(null)
    } else if (verseKey === startVerse && !endVerse) {
      // Clicking the only selected verse: deselect
      setStartVerse(null)
      setEndVerse(null)
    } else if (isVerseSelected(verseKey)) {
      // Clicking any verse in the current range: clear range and select only this verse
      setStartVerse(verseKey)
      setEndVerse(null)
    } else {
      // Clicking outside the range: set end verse. Normalize so start is always before end (endVerse < startVerse only when endChapter > startChapter).
      if (isBefore(verseKey, startVerse)) {
        setStartVerse(verseKey)
        setEndVerse(startVerse)
      } else {
        setEndVerse(verseKey)
      }
    }
  }

  // Handle chapter click (select whole chapter)
  const handleChapterClick = (chapter: number) => {
    const chapterVerses = versesByChapter[chapter] || []
    if (chapterVerses.length === 0) return

    const firstVerse = chapterVerses[0].key
    const lastVerse = chapterVerses[chapterVerses.length - 1].key

    setStartVerse(firstVerse)
    setEndVerse(lastVerse)
  }

  // Helper to check if a verse is in the selected range
  const isVerseSelected = (verseKey: string): boolean => {
    if (!startVerse) return false
    if (!endVerse) return verseKey === startVerse

    // Parse verses to determine range
    const [startC, startV] = startVerse.split(':').map(Number)
    const [endC, endV] = endVerse.split(':').map(Number)
    const [currentC, currentV] = verseKey.split(':').map(Number)

    // Ensure start is before end
    const actualStart = (startC < endC || (startC === endC && startV <= endV)) 
      ? { c: startC, v: startV } 
      : { c: endC, v: endV }
    const actualEnd = (startC < endC || (startC === endC && startV <= endV)) 
      ? { c: endC, v: endV } 
      : { c: startC, v: startV }

    // Check if current verse is within range
    if (currentC < actualStart.c || currentC > actualEnd.c) return false
    if (currentC === actualStart.c && currentV < actualStart.v) return false
    if (currentC === actualEnd.c && currentV > actualEnd.v) return false
    return true
  }

  // Helper to check if verse is start or end point
  const isStartVerse = (verseKey: string): boolean => verseKey === startVerse
  const isEndVerse = (verseKey: string): boolean => verseKey === endVerse

  // Get selection count
  const getSelectionCount = (): number => {
    if (!startVerse) return 0
    if (!endVerse) return 1

    const [startC, startV] = startVerse.split(':').map(Number)
    const [endC, endV] = endVerse.split(':').map(Number)

    let count = 0
    verses.forEach(v => {
      if (isVerseSelected(v.key)) count++
    })
    return count
  }

  // Handle section selection
  const handleSectionSelect = (section: TranslatorSection) => {
    setSelectedSection(section)
    
    const newRef: BCVReference = {
      book: selectedBook,
      chapter: section.start.chapter,
      verse: section.start.verse,
      endChapter: section.end.chapter !== section.start.chapter ? section.end.chapter : undefined,
      endVerse: section.end.verse,
    }
    
    // Navigate first, then set sections (so section index is calculated based on new reference)
    navigation.navigateToReference(newRef)
    navigation.setBookSections(selectedBook, sections)
    onClose()
  }

  // Handle apply (verse mode)
  const handleApply = () => {
    if (!startVerse) return

    const [startC, startV] = startVerse.split(':').map(Number)

    const newRef: BCVReference = {
      book: selectedBook,
      chapter: startC,
      verse: startV,
    }

    // Add end if range
    if (endVerse) {
      const [endC, endV] = endVerse.split(':').map(Number)
      newRef.endChapter = endC
      newRef.endVerse = endV
    }

    navigation.navigateToReference(newRef)
    onClose()
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
        aria-hidden="true"
      />
      
      {/* Modal */}
      <div
        className="relative flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] overflow-hidden m-4"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
      >
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
          <div className="flex items-center gap-2">
            {step === 1 ? (
              <BookOpen className="w-5 h-5 text-blue-600" />
            ) : effectiveMode === 'section' ? (
              <List className="w-5 h-5 text-blue-600" />
            ) : (
              <Hash className="w-5 h-5 text-blue-600" />
            )}
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded transition-colors"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 flex flex-col min-h-0">
          {step === 1 ? (
            // Step 1: Book Selection
            <div className="flex-1 overflow-auto p-4">
              <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 gap-2">
                {availableBooks.map((book) => {
                  const isSelected = selectedBook === book.code
                  const fullBookName = getBookTitle(bookTitleSource, book.code)
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
            </div>
          ) : effectiveMode === 'section' ? (
            // Step 2: Section Selection
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header bar - stays visible */}
              <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
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
                  {currentSectionIndex >= 0 && (
                    <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                      {currentSectionIndex + 1} / {sections.length}
                    </span>
                  )}
                </div>
              </div>

              {/* Section List - scrollable */}
              {sections.length === 0 ? (
                <div className="flex-1 flex items-center justify-center">
                  <AlertCircle className="w-12 h-12 text-gray-300" />
                </div>
              ) : (
                <div className="flex-1 overflow-auto p-6">
                  <div className="space-y-1.5">
                  {sections.map((section, idx) => {
                    const startRef = `${section.start.chapter}:${section.start.verse}`
                    const endRef = section.end.chapter !== section.start.chapter 
                      ? `${section.end.chapter}:${section.end.verse}`
                      : section.end.verse.toString()
                    const isCurrent = idx === currentSectionIndex
                    
                    return (
                      <button
                        key={idx}
                        ref={isCurrent ? currentSectionRef : null}
                        onClick={() => handleSectionSelect(section)}
                        className={`
                          w-full text-left p-2.5 border rounded-lg transition-colors flex items-center gap-3
                          ${isCurrent 
                            ? 'border-blue-500 bg-blue-50' 
                            : 'border-gray-200 hover:border-blue-400 hover:bg-blue-50'
                          }
                        `}
                      >
                        {/* Section Number */}
                        <div className={`
                          flex-shrink-0 w-6 h-6 rounded flex items-center justify-center font-bold text-xs
                          ${isCurrent 
                            ? 'bg-blue-600 text-white' 
                            : 'bg-gray-100 text-gray-700'
                          }
                        `}>
                          {idx + 1}
                        </div>
                        
                        {/* Section Content */}
                        <div className="flex-1 min-w-0">
                          <div className="font-medium text-gray-900 truncate">{section.heading}</div>
                          <div className="text-sm text-gray-600 mt-0.5 font-medium">
                            {startRef} - {endRef}
                          </div>
                        </div>
                        
                        {/* Current Indicator */}
                        {isCurrent && (
                          <Check className="w-5 h-5 text-blue-600 flex-shrink-0" />
                        )}
                      </button>
                    )
                  })}
                  </div>
                </div>
              )}
            </div>
          ) : (
            // Step 2: Custom Range Grid
            <div className="flex-1 flex flex-col min-h-0">
              {/* Header bar - stays visible */}
              <div className="px-6 py-3 flex items-center justify-between border-b border-gray-200 bg-gray-50 flex-shrink-0">
                <div className="flex items-center gap-2">
                  <button
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
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded text-xs font-medium">
                    {getSelectionCount()}
                  </span>
                </div>
              </div>

              {/* Verse Grid by Chapter - scrollable */}
              <div className="flex-1 overflow-auto p-6">
                <div className="space-y-6">
                {chapters.map((chapter) => (
                  <div key={chapter}>
                    {/* Chapter Header */}
                    <button
                      onClick={() => handleChapterClick(chapter)}
                      className="mb-3 px-3 py-1.5 bg-gray-100 hover:bg-gray-200 rounded-lg font-bold text-gray-700 text-sm transition-colors"
                      title={`${chapter}`}
                      aria-label={`Chapter ${chapter}`}
                    >
                      {chapter}
                    </button>

                    {/* Verse Grid */}
                    <div className="flex flex-wrap gap-1">
                      {versesByChapter[chapter]?.map((v) => {
                        const selected = isVerseSelected(v.key)
                        const isStart = isStartVerse(v.key)
                        const isEnd = isEndVerse(v.key)
                        
                        return (
                          <button
                            key={v.key}
                            ref={isStart ? startVerseRef : null}
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

        {/* Footer */}
        {step === 2 && effectiveMode !== 'section' && (
          <div className="px-6 py-4 border-t border-gray-200 bg-gray-50 flex items-center justify-end flex-shrink-0">
            <button
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
