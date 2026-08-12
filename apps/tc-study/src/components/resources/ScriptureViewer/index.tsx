/**
 * ScriptureViewer - Main component for displaying scripture with proper USFM parsing
 *
 * Features:
 * - Loads content based on current reference
 * - Tokenizes for inter-panel communication
 * - Exposes TOC for navigation
 * - Handles verse ranges
 * - Highlights based on messages
 * - Primary SoT: UsjScriptureViewModel via ScriptureLoader.loadScriptureResult()
 */

import { useSignalHandler } from '@bt-synergy/resource-panels'
import { Book } from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { useAppStore } from '../../../contexts/AppContext'
import { useCatalogManager, useCurrentReference, useNavigation } from '../../../contexts'
import type { ResourceMetadata } from '../../../contexts/types'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import type { VerseNavigationSignal } from '../../../signals/studioSignals'
import { getBookTitle } from '../../../utils/bookNames'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { ScriptureContent } from './components'
import { useContent, useHighlighting, useTOC, useTokenBroadcast, useUnderlinedTokens } from './hooks'
import type { ScriptureViewerProps } from './types'

export function ScriptureViewer({
  resourceId,
  resourceKey,
  resource,
  server: _server = 'git.door43.org',
  owner: _owner = 'unfoldingWord',
  language = 'es',
  resourceType: _resourceType = 'bible',
  isAnchor,
}: ScriptureViewerProps) {
  const currentRef = useCurrentReference()
  const { navigateToReference } = useNavigation()
  const catalogManager = useCatalogManager()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const [catalogMetadata, setCatalogMetadata] = useState<ResourceMetadata | null>(null)

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

  // Register as last active scripture when this viewer is mounted (so book titles use our ingredients).
  // On leave: only clear if we still own lastActive; fall back to anchor so sibling scripture can publish tokens.
  useEffect(() => {
    useAppStore.getState().setLastActiveScriptureResource(resourceId)
    return () => {
      const app = useAppStore.getState()
      if (app.lastActiveScriptureResourceId === resourceId) {
        app.setLastActiveScriptureResource(app.anchorResourceId)
      }
    }
  }, [resourceId])

  // Auto-set as anchor whenever this scripture resource becomes active (when user switches tabs)
  useEffect(() => {
    if (availableBooks.length > 0 && anchorSetRef.current !== resourceId) {
      setAsAnchor()
      anchorSetRef.current = resourceId
    }
  }, [resourceId, availableBooks.length, setAsAnchor])

  // Prefer resource.language over the prop default ('es') so OL resources
  // (el-x-koine / hbo) correctly detect isOriginalLanguage on /read.
  const languageCode = resource?.language ?? language

  const {
    viewModel,
    isLoading,
    error,
    currentChapter: _currentChapter,
    displayVerses,
  } = useContent(resourceKey, availableBooks, languageCode)

  // Language direction: catalog first, then list-languages, then known RTL codes (so /read/ar works before APIs load)
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const languageDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )

  // Use latest resource from store so we get ingredients when Phase 2 metadata loads (localized book title)
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource

  // Language and book title from current scripture metadata (for header)
  const languageDisplay =
    effectiveResource.languageName ??
    (catalogMetadata as ResourceMetadata & { language_title?: string })?.language_title ??
    effectiveResource.language ??
    languageCode
  const currentBookTitle = getBookTitle(effectiveResource, currentRef.book)

  // Must come before useHighlighting so the coverage set is available for click decisions
  const underlinedSemanticIds = useUnderlinedTokens(resourceId)

  // Handle highlighting and token clicks (using resource-panels signal API)
  const {
    highlightTarget,
    selectedTokenId,
    handleTokenClick,
    handleVerseFilter,
  } = useHighlighting(resourceId, languageCode, underlinedSemanticIds)

  // Listen for verse-navigation signals (from modals, other panels, etc.)
  const handleVerseNavigation = useCallback((signal: VerseNavigationSignal) => {
    const { book, chapter, verse, endChapter, endVerse } = signal.verse
    navigateToReference({
      book: book || currentRef.book,
      chapter: chapter ?? currentRef.chapter,
      verse: verse ?? currentRef.verse,
      endChapter: endChapter ?? currentRef.endChapter,
      endVerse: endVerse ?? currentRef.endVerse,
    })
  }, [navigateToReference, currentRef.book, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse])

  useSignalHandler<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    handleVerseNavigation
  )

  // SCRIPTURE_TOKENS from UsjWordToken[] — Helps keep semanticId + alignedOriginalWordIds
  useTokenBroadcast({
    resourceId,
    resourceKey,
    viewModel,
    language: languageCode,
    languageDirection,
    currentChapter: currentRef.chapter || 1,
    currentVerse: 1,
    endChapter: currentRef.chapter,
    endVerse: 999,
  })

  const handleVerseClick = useCallback((chapter: number, verse: number) => {
    handleVerseFilter(chapter, verse)
  }, [handleVerseFilter])

  const handleChapterClick = useCallback((chapter: number) => {
    handleVerseFilter(chapter)
  }, [handleVerseFilter])

  // Handle click to set as anchor resource for navigation
  const handleViewerClick = () => {
    setAsAnchor()
  }

  return (
    <div className="h-full flex flex-col" dir={languageDirection}>
      <ResourceViewerHeader
        title={resource.title}
        subtitle={[languageDisplay, currentBookTitle].filter(Boolean).join(' · ')}
        icon={Book}
        direction={languageDirection}
      />

      <div
        className="flex-1 p-6 relative cursor-pointer bg-white"
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
          viewModel={viewModel}
          availableBooks={availableBooks}
          displayVerses={displayVerses}
          currentRef={currentRef}
          highlightTarget={highlightTarget}
          underlinedSemanticIds={underlinedSemanticIds}
          selectedTokenId={selectedTokenId}
          onTokenClick={handleTokenClick}
          onVerseClick={handleVerseClick}
          onChapterClick={handleChapterClick}
          language={languageCode}
          languageDirection={languageDirection}
        />
        </div>
      </div>
    </div>
  )
}

