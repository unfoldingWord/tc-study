/**
 * NavigationBar - Context-aware navigation controls
 */

import { ArrowLeft, Book, BookOpen, ChevronLeft, ChevronRight, Download, FolderOpen, History, List, ListOrdered, Menu, X } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCurrentPassageSet, useCurrentReference, useNavigation, useNavigationHistory, useNavigationMode } from '../../contexts'
import { useAnchorResource, useAppStore } from '../../contexts/AppContext'
import { getBookTitle } from '../../utils/bookNames'
import { LanguagePicker } from '../LanguagePicker'
import { BCVNavigator } from './BCVNavigator'
import { NavigationHistoryModal } from './NavigationHistoryModal'
import { NavigationTypeSelector } from './NavigationTypeSelector'

interface NavigationBarProps {
  isCompact?: boolean
  onToggleCompact?: () => void
  onLanguageSelected?: (languageCode: string) => void // For Read page language selection
  showLanguagePicker?: boolean // Show language picker in navigation bar
  autoOpenLanguagePicker?: boolean // Auto-open language picker on mount (for Read page)
  downloadIndicator?: React.ReactNode // Download indicator component
  onDownloadCollection?: () => void // Download current collection (Read page)
  onLoadCollection?: () => void // Load a collection (Read page)
}

export function NavigationBar({ isCompact = false, onToggleCompact, onLanguageSelected, showLanguagePicker = false, autoOpenLanguagePicker = false, downloadIndicator, onDownloadCollection, onLoadCollection }: NavigationBarProps = {}) {
  const navigation = useNavigation()
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const passageSet = useCurrentPassageSet()
  const history = useNavigationHistory()
  const anchorResourceId = useAppStore((s) => s.anchorResourceId)
  const anchorResource = useAnchorResource()
  const [isNavigatorOpen, setIsNavigatorOpen] = useState(false)
  const [isHistoryOpen, setIsHistoryOpen] = useState(false)
  const [isTypeSelectorOpen, setIsTypeSelectorOpen] = useState(false)
  const [isMenuOpen, setIsMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const typeSelectorRef = useRef<HTMLDivElement>(null)
  
  // Debug auto-open language picker
  useEffect(() => {
    if (autoOpenLanguagePicker) {
      console.log('[NavigationBar] Received autoOpenLanguagePicker=true')
    }
  }, [autoOpenLanguagePicker])

  // Close menu when clicking outside
  useEffect(() => {
    if (!isMenuOpen) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setIsMenuOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isMenuOpen])
  
  // Close type selector when clicking outside
  useEffect(() => {
    if (!isTypeSelectorOpen) return
    
    const handleClickOutside = (e: MouseEvent) => {
      if (typeSelectorRef.current && !typeSelectorRef.current.contains(e.target as Node)) {
        setIsTypeSelectorOpen(false)
      }
    }
    
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [isTypeSelectorOpen])

  // Navigation is available when:
  // 1. Anchor resource is set (BCV, sections, etc.)
  // 2. OR passage set is loaded (passage set navigation only)
  const hasAnchor = !!anchorResourceId
  const hasPassageSet = !!passageSet
  const hasNavigationSource = hasAnchor || hasPassageSet

  const formatReference = (ref: typeof currentRef) => {
    // Get localized book name from anchor resource's ingredients (e.g., "Tito" for Spanish)
    const bookName = getBookTitle(anchorResource, ref.book)
    let result = `${bookName} ${ref.chapter}:${ref.verse}`
    if (ref.endChapter || ref.endVerse) {
      if (ref.endChapter && ref.endChapter !== ref.chapter) {
        result += `-${ref.endChapter}:${ref.endVerse || 1}`
      } else if (ref.endVerse && ref.endVerse !== ref.verse) {
        result += `-${ref.endVerse}`
      }
    }
    return result
  }

  const getModeLabel = () => {
    switch (navigationMode) {
      case 'verse':
        return 'Range'
      case 'section':
        return 'Section'
      case 'passage-set':
        return 'Passage'
      default:
        return ''
    }
  }

  const handlePrevious = () => {
    if (navigationMode === 'passage-set' && hasPassageSet) {
      navigation.previousPassage()
    } else if (navigationMode === 'verse') {
      navigation.previousVerse()
    } else if (navigationMode === 'section') {
      navigation.previousSection()
    }
  }

  const handleNext = () => {
    if (navigationMode === 'passage-set' && hasPassageSet) {
      navigation.nextPassage()
    } else if (navigationMode === 'verse') {
      navigation.nextVerse()
    } else if (navigationMode === 'section') {
      navigation.nextSection()
    }
  }

  const canGoPrevious = () => {
    if (navigationMode === 'passage-set') {
      return navigation.canGoToPreviousPassage()
    } else if (navigationMode === 'verse') {
      return navigation.canGoToPreviousVerse()
    } else if (navigationMode === 'section') {
      return navigation.canGoToPreviousSection()
    }
    return false
  }

  const canGoNext = () => {
    if (navigationMode === 'passage-set') {
      return navigation.canGoToNextPassage()
    } else if (navigationMode === 'verse') {
      return navigation.canGoToNextVerse()
    } else if (navigationMode === 'section') {
      return navigation.canGoToNextSection()
    }
    return false
  }

  // Range expansion helpers for custom range mode
  const expandRangeBackward = () => {
    if (navigationMode !== 'verse') return
    
    const bookInfo = navigation.getBookInfo(currentRef.book)
    if (!bookInfo) return

    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse

    let newStartChapter = startChapter
    let newStartVerse = startVerse - 1

    if (newStartVerse < 1) {
      // Move to previous chapter
      newStartChapter = startChapter - 1
      if (newStartChapter >= 1) {
        newStartVerse = bookInfo.verses[newStartChapter - 1] || 1
      } else {
        return // Can't go before chapter 1
      }
    }

    navigation.navigateToReference({
      book: currentRef.book,
      chapter: newStartChapter,
      verse: newStartVerse,
      endChapter: endChapter,
      endVerse: endVerse,
    })
  }

  const expandRangeForward = () => {
    if (navigationMode !== 'verse') return
    
    const bookInfo = navigation.getBookInfo(currentRef.book)
    if (!bookInfo) return

    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse

    let newEndChapter = endChapter
    let newEndVerse = endVerse + 1
    const maxVerseInChapter = bookInfo.verses[newEndChapter - 1] || 0

    if (newEndVerse > maxVerseInChapter) {
      // Move to next chapter
      newEndChapter = endChapter + 1
      if (newEndChapter <= bookInfo.verses.length) {
        newEndVerse = 1
      } else {
        return // Can't go beyond last chapter
      }
    }

    navigation.navigateToReference({
      book: currentRef.book,
      chapter: startChapter,
      verse: startVerse,
      endChapter: newEndChapter,
      endVerse: newEndVerse,
    })
  }

  const canExpandBackward = () => {
    if (navigationMode !== 'verse') return false
    const bookInfo = navigation.getBookInfo(currentRef.book)
    if (!bookInfo) return false
    return currentRef.verse > 1 || currentRef.chapter > 1
  }

  const canExpandForward = () => {
    if (navigationMode !== 'verse') return false
    const bookInfo = navigation.getBookInfo(currentRef.book)
    if (!bookInfo) return false
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse
    const maxVerse = bookInfo.verses[endChapter - 1] || 0
    return endVerse < maxVerse || endChapter < bookInfo.verses.length
  }

  const shrinkRangeFromStart = () => {
    if (navigationMode !== 'verse') return
    
    const bookInfo = navigation.getBookInfo(currentRef.book)
    if (!bookInfo) return

    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse

    // Can't shrink a single verse
    if (startChapter === endChapter && startVerse === endVerse) return

    let newStartChapter = startChapter
    let newStartVerse = startVerse + 1
    const maxVerseInChapter = bookInfo.verses[startChapter - 1] || 0

    if (newStartVerse > maxVerseInChapter) {
      // Move to next chapter
      newStartChapter = startChapter + 1
      newStartVerse = 1
    }

    // Check if we've met or passed the end
    const getVerseKey = (ch: number, v: number) => ch * 1000 + v
    if (getVerseKey(newStartChapter, newStartVerse) >= getVerseKey(endChapter, endVerse)) {
      // Collapse to single verse at end
      navigation.navigateToReference({
        book: currentRef.book,
        chapter: endChapter,
        verse: endVerse,
      })
      return
    }

    navigation.navigateToReference({
      book: currentRef.book,
      chapter: newStartChapter,
      verse: newStartVerse,
      endChapter: endChapter,
      endVerse: endVerse,
    })
  }

  const shrinkRangeFromEnd = () => {
    if (navigationMode !== 'verse') return
    
    const bookInfo = navigation.getBookInfo(currentRef.book)
    if (!bookInfo) return

    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse

    // Can't shrink a single verse
    if (startChapter === endChapter && startVerse === endVerse) return

    let newEndChapter = endChapter
    let newEndVerse = endVerse - 1

    if (newEndVerse < 1) {
      // Move to previous chapter
      newEndChapter = endChapter - 1
      if (newEndChapter >= 1) {
        newEndVerse = bookInfo.verses[newEndChapter - 1] || 1
      } else {
        return
      }
    }

    // Check if we've met or gone before start
    const getVerseKey = (ch: number, v: number) => ch * 1000 + v
    if (getVerseKey(newEndChapter, newEndVerse) <= getVerseKey(startChapter, startVerse)) {
      // Collapse to single verse at start
      navigation.navigateToReference({
        book: currentRef.book,
        chapter: startChapter,
        verse: startVerse,
      })
      return
    }

    navigation.navigateToReference({
      book: currentRef.book,
      chapter: startChapter,
      verse: startVerse,
      endChapter: newEndChapter,
      endVerse: newEndVerse,
    })
  }

  const canShrinkFromStart = () => {
    if (navigationMode !== 'verse') return false
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse
    return !(currentRef.chapter === endChapter && currentRef.verse === endVerse)
  }

  const canShrinkFromEnd = () => {
    if (navigationMode !== 'verse') return false
    const endChapter = currentRef.endChapter || currentRef.chapter
    const endVerse = currentRef.endVerse || currentRef.verse
    return !(currentRef.chapter === endChapter && currentRef.verse === endVerse)
  }

  // If no navigation source, show minimal disabled state with icon indicators only
  // When showLanguagePicker is true (Read page), always show the language picker so user can select a language first
  if (!hasNavigationSource) {
    if (isCompact) {
      return (
        <div className="flex items-center gap-2 w-full">
          <div className="flex items-center gap-1 flex-1 justify-center opacity-40">
            <button disabled className="p-1 rounded cursor-not-allowed" title="Navigation disabled">
              <ChevronLeft className="w-4 h-4 text-gray-400" />
            </button>
            <div className="px-2 py-1 bg-gray-100 rounded flex items-center gap-1">
              <Book className="w-3 h-3 text-gray-400" />
              <div className="w-16 h-3 bg-gray-200 rounded" />
            </div>
            <button disabled className="p-1 rounded cursor-not-allowed" title="Navigation disabled">
              <ChevronRight className="w-4 h-4 text-gray-400" />
            </button>
          </div>
          {showLanguagePicker && (
            <div className="flex items-center gap-1 shrink-0">
              <div className="w-px h-4 bg-gray-300" />
              <LanguagePicker onLanguageSelected={onLanguageSelected} compact autoOpen={autoOpenLanguagePicker} />
            </div>
          )}
        </div>
      )
    }

    return (
      <div className="bg-gray-50 border-b border-gray-200 px-4 py-3 flex items-center justify-center gap-4">
        <div className="flex items-center gap-2 opacity-40">
          <button
            disabled
            className="p-2 rounded cursor-not-allowed"
            title="Navigation disabled: Add scripture resource or load passage set"
          >
            <ChevronLeft className="w-5 h-5 text-gray-400" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-gray-100 rounded-lg">
            <Book className="w-4 h-4 text-gray-400" />
            <div className="w-24 h-4 bg-gray-200 rounded" title="No reference selected" />
          </div>
          <button
            disabled
            className="p-2 rounded cursor-not-allowed"
            title="Navigation disabled: Add scripture resource or load passage set"
          >
            <ChevronRight className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        {showLanguagePicker && (
          <LanguagePicker onLanguageSelected={onLanguageSelected} compact={false} autoOpen={autoOpenLanguagePicker} />
        )}
      </div>
    )
  }

  // Compact version - minimal, icon-only (always compact now)
  if (isCompact) {
    return (
      <div className="flex items-center gap-2 w-full">
        {/* Left side controls */}
        <div className="flex items-center gap-1">
          {/* Back button for navigation history - moved to left side */}
          {navigation.canGoBack() && (
            <button
              onClick={() => navigation.goBack()}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
              title="Go back in navigation history"
              aria-label="Go back"
            >
              <ArrowLeft className="w-4 h-4" />
            </button>
          )}
        </div>
        
        {/* Center navigation group - unified component with circular arrows inside blue container */}
        <div className="flex-1 flex items-center justify-center">
          {/* Blue container holds everything */}
          <div className="flex items-center gap-2 bg-blue-50 px-2 py-2 rounded-full">
            {/* Previous button - circular, inside container */}
            <button
              onClick={handlePrevious}
              disabled={!canGoPrevious()}
              className="w-7 h-7 rounded-full bg-blue-200 hover:bg-blue-300 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 transition-colors flex items-center justify-center flex-shrink-0"
              title={`Previous ${getModeLabel()}`}
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            
            {/* Navigation type selector */}
            <div className="relative" ref={typeSelectorRef}>
              <button
                onClick={() => setIsTypeSelectorOpen(!isTypeSelectorOpen)}
                className="p-1.5 hover:bg-blue-100 text-blue-700 transition-colors rounded-full flex items-center justify-center"
                title={`Navigation type: ${getModeLabel()}`}
              >
                {navigationMode === 'verse' && <BookOpen className="w-4 h-4" />}
                {navigationMode === 'section' && <List className="w-4 h-4" />}
                {navigationMode === 'passage-set' && <ListOrdered className="w-4 h-4" />}
              </button>
              
              {/* Navigation Type Selector Dropdown */}
              {isTypeSelectorOpen && (
                <NavigationTypeSelector 
                  onClose={() => setIsTypeSelectorOpen(false)}
                />
            )}
            </div>

            {/* Divider */}
            <div className="w-px h-6 bg-blue-200"></div>

            {/* Reference display */}
            <button
              onClick={() => setIsNavigatorOpen(true)}
              className="px-3 py-1 hover:bg-blue-100 text-sm font-medium text-blue-900 transition-colors rounded-md"
              title="Click to navigate or adjust range"
            >
              {formatReference(currentRef)}
            </button>
            
            {/* Next button - circular, inside container */}
            <button
              onClick={handleNext}
              disabled={!canGoNext()}
              className="w-7 h-7 rounded-full bg-blue-200 hover:bg-blue-300 disabled:opacity-40 disabled:cursor-not-allowed text-blue-700 transition-colors flex items-center justify-center flex-shrink-0"
              title={`Next ${getModeLabel()}`}
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
          </div>
        </div>
        
        {/* Right side controls - Download Indicator & Hamburger Menu */}
        <div className="flex items-center gap-1">
          {/* Download Indicator */}
          {downloadIndicator}
          
          <div className="relative" ref={menuRef}>
            <button
              onClick={() => setIsMenuOpen(!isMenuOpen)}
              className="p-2 rounded-full hover:bg-gray-100 text-gray-600 hover:text-gray-800 transition-colors"
              title={isMenuOpen ? 'Close menu' : 'Open menu'}
              aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
            >
              {isMenuOpen ? <X className="w-4 h-4" /> : <Menu className="w-4 h-4" />}
            </button>
            
            {/* Dropdown Menu */}
            {isMenuOpen && (
              <div className="absolute top-full right-0 mt-1 w-auto bg-white rounded-lg shadow-xl border border-gray-200 py-1 z-50">
                {/* History Button - Icon Only */}
                <button
                  onClick={() => {
                    setIsHistoryOpen(true)
                    setIsMenuOpen(false)
                  }}
                  disabled={history.length === 0}
                  className="flex items-center justify-center p-2 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed relative"
                  title={`Navigation history${history.length > 0 ? ` (${history.length})` : ''}`}
                  aria-label={`Navigation history${history.length > 0 ? ` (${history.length} locations)` : ''}`}
                >
                  <History className="w-4 h-4 text-gray-500" />
                  {history.length > 0 && (
                    <span className="absolute -top-0.5 -right-0.5 bg-blue-500 text-white text-[9px] font-semibold rounded-full w-3.5 h-3.5 flex items-center justify-center">
                      {history.length > 9 ? '9+' : history.length}
                    </span>
                  )}
                </button>
                
                {/* Collection Management Buttons - Show in Read page */}
                {(onDownloadCollection || onLoadCollection) && (
                  <>
                    {/* Download Collection Button - Icon Only */}
                    {onDownloadCollection && (
                      <button
                        onClick={() => {
                          onDownloadCollection()
                          setIsMenuOpen(false)
                        }}
                        className="flex items-center justify-center p-2 hover:bg-gray-50"
                        title="Download current collection"
                        aria-label="Download current collection"
                      >
                        <Download className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                    
                    {/* Load Collection Button - Icon Only */}
                    {onLoadCollection && (
                      <button
                        onClick={() => {
                          onLoadCollection()
                          setIsMenuOpen(false)
                        }}
                        className="flex items-center justify-center p-2 hover:bg-gray-50"
                        title="Load a collection (from database or file)"
                        aria-label="Load a collection (from database or file)"
                      >
                        <FolderOpen className="w-4 h-4 text-gray-500" />
                      </button>
                    )}
                  </>
                )}
                
                {/* Language Picker */}
                {showLanguagePicker && (
                  <div className="border-t border-gray-100 p-2">
                    <LanguagePicker 
                      onLanguageSelected={(lang) => {
                        onLanguageSelected?.(lang)
                        setIsMenuOpen(false)
                      }}
                      compact={true}
                      autoOpen={autoOpenLanguagePicker}
                    />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
        
        {/* BCV Navigator Modal */}
        {isNavigatorOpen && hasAnchor && (
          <BCVNavigator 
            onClose={() => setIsNavigatorOpen(false)} 
            mode={navigationMode === 'section' ? 'section' : 'verse'}
          />
        )}
        
        {/* Navigation History Modal */}
        {isHistoryOpen && (
          <NavigationHistoryModal onClose={() => setIsHistoryOpen(false)} />
        )}
      </div>
    )
  }

  // Not compact - this should never happen now, but keep as fallback
  return null
}
