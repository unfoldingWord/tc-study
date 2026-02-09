/**
 * ScriptureViewer - Main component for displaying scripture with proper USFM parsing
 * 
 * Features:
 * - Loads content based on current reference
 * - Tokenizes for inter-panel communication
 * - Exposes TOC for navigation
 * - Handles verse ranges
 * - Highlights based on messages
 * - Uses ProcessedScripture format from @bt-synergy/usfm-processor
 */

import { Book, Bug } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useEvents } from 'linked-panels'
import { useCatalogManager, useCurrentReference } from '../../../contexts'
import type { VerseNavigationSignal } from '../../../signals/studioSignals'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import {
    DebugPanel,
    ScriptureContent,
} from './components'
import { useContent, useContentRequests, useHighlighting, useScriptureEvents, useTOC, useTokenBroadcast } from './hooks'
import type { ScriptureViewerProps } from './types'

export function ScriptureViewer({
  resourceId,
  resourceKey,
  resource,
  server = 'git.door43.org',
  owner = 'unfoldingWord',
  language = 'es',
  resourceType = 'bible',
  isAnchor,
}: ScriptureViewerProps) {
  const currentRef = useCurrentReference()
  const catalogManager = useCatalogManager()
  const { setBook, setChapter, setVerse, setEndChapter, setEndVerse } = currentRef

  // Debug panel visibility state
  const [showDebug, setShowDebug] = useState(false)
  
  // Catalog metadata (Door43 manifest data)
  const [catalogMetadata, setCatalogMetadata] = useState<any>(null)
  
  // Track if we've set this resource as anchor to prevent repeated calls
  const anchorSetRef = useRef<string | null>(null)

  // Load catalog metadata
  useEffect(() => {
    let cancelled = false
    
    const loadCatalogMetadata = async () => {
      try {
        const metadata = await catalogManager.getResourceMetadata(resourceKey)
        if (!cancelled && metadata) {
          setCatalogMetadata(metadata)
        }
      } catch (err) {
        console.error('Failed to load catalog metadata:', err)
      }
    }
    
    loadCatalogMetadata()
    
    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager])

  // Load TOC and available books
  const { availableBooks, isLoadingTOC, setAsAnchor } = useTOC(resourceKey, resourceId, isAnchor)

  // Auto-set as anchor whenever this scripture resource becomes active (when user switches tabs)
  // This ensures the navigation updates to show the current scripture resource's books
  useEffect(() => {
    if (availableBooks.length > 0 && anchorSetRef.current !== resourceId) {
      setAsAnchor()
      anchorSetRef.current = resourceId
    }
  }, [resourceId, availableBooks.length, setAsAnchor])

  // Load content for current book/chapter
  const {
    loadedContent,
    isLoading,
    error,
    currentChapter,
    displayVerses,
  } = useContent(resourceKey, availableBooks, language)
  
  // Get language direction from catalog metadata
  const languageDirection = catalogMetadata?.languageDirection || 'ltr'

  // Handle highlighting and token clicks (using resource-panels signal API)
  const {
    highlightTarget,
    selectedTokenId,
    handleTokenClick,
  } = useHighlighting(resourceId, language)

  // Handle inter-panel events
  useScriptureEvents(resourceId)
  
  // Listen for verse-navigation signals (from modals, other panels, etc.)
  const handleVerseNavigation = useCallback((signal: VerseNavigationSignal) => {
    console.log('[ScriptureViewer] Received verse-navigation signal:', signal.verse)
    
    const { book, chapter, verse, endChapter, endVerse } = signal.verse
    
    // Navigate to the specified reference
    if (book) setBook(book)
    if (chapter) setChapter(chapter)
    if (verse) setVerse(verse)
    if (endChapter) setEndChapter(endChapter)
    if (endVerse) setEndVerse(endVerse)
    
    console.log('[ScriptureViewer] Navigated to:', {
      book,
      chapter,
      verse,
      endChapter,
      endVerse
    })
  }, [setBook, setChapter, setVerse, setEndChapter, setEndVerse])
  
  useEvents<VerseNavigationSignal>(
    resourceId,
    ['verse-navigation'],
    handleVerseNavigation
  )

  // Handle content requests from other panels (e.g., TWL viewer)
  // DEPRECATED: This will be removed in favor of broadcast approach
  useContentRequests({
    resourceId,
    resourceKey,
    loadedContent,
    language,
  })

  // Broadcast tokens to other panels (new broadcast approach)
  // Broadcast ALL verses in current chapter for TWL/TN to have complete data
  // This allows help resources to show links for the entire chapter
  useTokenBroadcast({
    resourceId,
    resourceKey,
    loadedContent,
    language,
    languageDirection,
    currentChapter: currentRef.chapter || 1,
    currentVerse: 1, // Start from verse 1
    endChapter: currentRef.chapter, // Same chapter
    endVerse: 999, // All verses in chapter (will be clamped to actual verse count)
  })

  // Handle click to set as anchor resource for navigation
  const handleViewerClick = () => {
    setAsAnchor()
  }

  return (
    <div className="h-full flex flex-col">
      <ResourceViewerHeader 
        title={resource.title}
        icon={Book}
      />
      
      <div 
        className="flex-1 p-6 relative cursor-pointer" 
        onClick={handleViewerClick}
        role="button"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            handleViewerClick()
          }
        }}
      >
        {/* Content - scrolling handled by parent container */}
        <div className="flex-1">
          <ScriptureContent
          isLoading={isLoading}
          isLoadingTOC={isLoadingTOC}
          error={error}
          loadedContent={loadedContent}
          availableBooks={availableBooks}
          displayVerses={displayVerses}
          currentRef={currentRef}
          highlightTarget={highlightTarget}
          selectedTokenId={selectedTokenId}
          onTokenClick={handleTokenClick}
          language={language}
          languageDirection={languageDirection}
        />
      </div>

      {/* Debug Panel (conditionally shown) */}
      {showDebug && (
        <DebugPanel
        isLoading={isLoading}
        error={error}
        loadedContent={loadedContent}
          catalogMetadata={catalogMetadata}
        availableBooks={availableBooks}
        currentChapter={currentChapter}
        displayVerses={displayVerses}
        currentRef={currentRef}
          highlightTarget={highlightTarget}
          onClose={() => setShowDebug(false)}
      />
      )}

        {/* Floating Debug Button (smaller, positioned within panel) */}
        <button
          onClick={(e) => {
            e.stopPropagation() // Prevent triggering parent onClick
            setShowDebug(!showDebug)
          }}
          className={`
            absolute bottom-2 right-2 p-1.5 rounded-full shadow-md
            transition-all duration-200 hover:scale-110
            ${showDebug 
              ? 'bg-blue-600 text-white hover:bg-blue-700' 
              : 'bg-gray-200 text-gray-700 hover:bg-gray-300'
            }
          `}
          title={showDebug ? 'Hide debug panel' : 'Show debug panel'}
          aria-label={showDebug ? 'Hide debug panel' : 'Show debug panel'}
        >
          <Bug className="w-3 h-3" />
        </button>
      </div>
    </div>
  )
}

