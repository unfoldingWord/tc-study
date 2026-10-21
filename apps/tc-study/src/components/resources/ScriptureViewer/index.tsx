/**
 * ScriptureViewer - Main component for displaying scripture with proper USFM parsing
 *
 * Features:
 * - Loads content based on current reference
 * - Tokenizes for inter-panel communication
 * - Exposes TOC for navigation
 * - Handles verse ranges
 * - Highlights based on messages
 * - Primary SoT: UsjScriptureViewModel via ScriptureLoader.loadViewModel()
 */

import { useSignalHandler } from '@bt-synergy/resource-panels'
import { Book } from 'lucide-react'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useAppStore } from '../../../contexts/AppContext'
import {
  useCatalogManager,
  useCurrentPassageSet,
  useCurrentReference,
  useNavigation,
  useNavigationMode,
} from '../../../contexts'
import type { ResourceMetadata } from '../../../contexts/types'
import {
  pickSuccessorScriptureResourceId,
  resolveLastActiveAfterScriptureUnmount,
  shouldClaimScriptureTokensOwnership,
} from '../../../features/messaging/scriptureTokensOwnership'
import { setHelpsTargetScriptureKey } from '../../../features/helps/helpsTargetScripture'
import {
  advanceNavigationUnit,
  canAdvanceNavigationUnit,
} from '../../../features/nav/advanceNavigationUnit'
import { RESOURCE_TYPE_IDS } from '../../../resourceTypes/resourceTypeIds'
import {
  EDGE_NAV_THRESHOLD_PX,
  isPastCommitThreshold,
} from '../../../features/nav/scriptureEdgeNavigate'
import { markReadNavigationInternal } from '../../../features/read/replaceReadUrlFromUi'
import {
  scriptureChapterTokensReady,
  usjDisplayTokensReady,
} from '../../../features/helps/helpsCardScriptureNav'
import { usePreparedChapter } from '../../../features/scripture/usePreparedChapter'
import { resolveScriptureBroadcastBookCode } from '../../../features/scripture/scriptureTokensBookNav'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import type { VerseNavigationSignal } from '../../../signals/studioSignals'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { ScriptureContent, ScriptureLayoutToggle } from './components'
import { ScriptureEdgeCue } from './components/ScriptureEdgeCue'
import {
  resolveScriptureScrollParent,
  useContent,
  useHighlighting,
  useScriptureEdgeNavigate,
  useTOC,
  useTokenBroadcast,
  useUnderlinedTokens,
} from './hooks'
import { resolveLastChapter } from '../../../features/nav/bookChapterCounts'
import {
  lastChapterFromViewModel,
  useChapterInfiniteScroll,
} from './hooks/useChapterInfiniteScroll'
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
  const navigation = useNavigation()
  const { navigateToReference } = navigation
  const navigationMode = useNavigationMode()
  const passageSet = useCurrentPassageSet()
  const hasPassageSet = !!passageSet
  const catalogManager = useCatalogManager()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const [catalogMetadata, setCatalogMetadata] = useState<ResourceMetadata | null>(null)

  const contentRootRef = useRef<HTMLDivElement>(null)
  const [elasticContentEl, setElasticContentEl] = useState<HTMLDivElement | null>(null)
  const [scrollParent, setScrollParent] = useState<HTMLElement | null>(null)
  const pendingScrollAlignRef = useRef<'start' | 'end' | null>(null)
  const [isUnitTransitioning, setIsUnitTransitioning] = useState(false)
  const unitTransitionStartedAtRef = useRef(0)

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

  useEffect(() => {
    useAppStore.getState().setLastActiveScriptureResource(resourceId)
    // Shared helps SoT: catalog key only (not panel instance / tokens).
    setHelpsTargetScriptureKey(resourceKey)
    return () => {
      const app = useAppStore.getState()
      if (app.lastActiveScriptureResourceId !== resourceId) return
      const successors = Object.entries(app.loadedResources)
        .filter(
          ([id, res]) =>
            id !== resourceId &&
            (res?.type === RESOURCE_TYPE_IDS.SCRIPTURE || res?.type === 'scripture')
        )
        .map(([id]) => id)
      const next = resolveLastActiveAfterScriptureUnmount({
        leavingResourceId: resourceId,
        lastActiveScriptureResourceId: app.lastActiveScriptureResourceId,
        anchorResourceId: app.anchorResourceId,
        successorResourceId: pickSuccessorScriptureResourceId(resourceId, successors),
      })
      app.setLastActiveScriptureResource(next)
    }
  }, [resourceId, resourceKey])

  // Mode-switch can leave lastActive on an unmounted panel instance. Reclaim so
  // SCRIPTURE_TOKENS (and helps quote align) resume without a full page reload.
  const lastActiveScriptureResourceId = useAppStore((s) => s.lastActiveScriptureResourceId)
  const liveScriptureIdsSig = useAppStore((s) =>
    Object.entries(s.loadedResources)
      .filter(
        ([, res]) =>
          res?.type === RESOURCE_TYPE_IDS.SCRIPTURE || res?.type === 'scripture'
      )
      .map(([id]) => id)
      .sort()
      .join('|')
  )
  useEffect(() => {
    const live = new Set(liveScriptureIdsSig ? liveScriptureIdsSig.split('|') : [])
    if (
      !shouldClaimScriptureTokensOwnership({
        resourceId,
        lastActiveScriptureResourceId,
        liveScriptureResourceIds: live,
      })
    ) {
      return
    }
    useAppStore.getState().setLastActiveScriptureResource(resourceId)
  }, [resourceId, lastActiveScriptureResourceId, liveScriptureIdsSig])

  useEffect(() => {
    if (availableBooks.length === 0) return
    setAsAnchor()
  }, [resourceId, availableBooks.length, setAsAnchor])

  // Prefer resource language fields over the prop default ('es') so OL
  // resources (el-x-koine / hbo) detect as original language on /read.
  // UHB often has languageCode only after catalog merge; also honor the key.
  const languageCode =
    resource?.language ||
    resource?.languageCode ||
    (resourceKey.includes('/hbo/') ? 'hbo' : resourceKey.includes('/el-x-koine/') ? 'el-x-koine' : '') ||
    language

  const {
    viewModel,
    nav,
    isLoading,
    error,
    currentChapter: _currentChapter,
    displayVerses,
  } = useContent(resourceKey, availableBooks, languageCode)

  const tocChapters = availableBooks.find(
    (b) => b.code.toLowerCase() === (currentRef.book || '').toLowerCase()
  )?.chapters
  const lastChapter = resolveLastChapter({
    bookId: currentRef.book || '',
    explicit:
      lastChapterFromViewModel(viewModel?.chapters) ||
      lastChapterFromViewModel(nav?.chapters) ||
      undefined,
    tocChapters,
  })
  const chapterScroll = useChapterInfiniteScroll(lastChapter, {
    resourceKey,
    bookId: currentRef.book,
    // Verse/section already painted from USJ — when switching back to chapter
    // mode, upgrade immediately and let VerseBlock cover until prepared-full lands.
    canFallbackToUsjTokens: Boolean(viewModel),
  })

  const preparedOpen = usePreparedChapter({
    resourceKey,
    bookId: currentRef.book,
    chapter: currentRef.chapter || 1,
    enabled: Boolean(resourceKey && currentRef.book),
  })

  // Language direction: catalog first, then list-languages, then known RTL codes (so /read/ar works before APIs load)
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const languageDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )

  // Must come before useHighlighting so the coverage set is available for click decisions
  const underlinedSemanticIds = useUnderlinedTokens(resourceId)
  const tokensReady = scriptureChapterTokensReady({
    visibleChapter: currentRef.chapter || 1,
    matchKeys: preparedOpen.matchKeys,
    hasUsjTokens: usjDisplayTokensReady(displayVerses, currentRef.chapter || 1),
  })

  // Handle highlighting and token clicks (using resource-panels signal API)
  const {
    highlightTarget,
    selectedTokenId,
    handleTokenClick,
    handleInternedTokenClick,
    handleVerseFilter,
  } = useHighlighting(resourceId, languageCode, underlinedSemanticIds, tokensReady)

  // Listen for verse-navigation signals (from modals, other panels, etc.)
  const handleVerseNavigation = useCallback((signal: VerseNavigationSignal) => {
    const { book, chapter, verse, endChapter, endVerse } = signal.verse
    markReadNavigationInternal()
    navigateToReference({
      book: book || currentRef.book,
      chapter: chapter ?? currentRef.chapter,
      verse: verse ?? currentRef.verse,
      ...(endChapter != null ? { endChapter } : {}),
      ...(endVerse != null ? { endVerse } : {}),
    })
  }, [navigateToReference, currentRef.book, currentRef.chapter, currentRef.verse])

  useSignalHandler<VerseNavigationSignal>(
    'verse-navigation',
    resourceId,
    handleVerseNavigation
  )

  // SCRIPTURE_TOKENS — real BCV span for verse/section/custom-range.
  // Missing endVerse ⇒ whole chapter(s) (chapter infinite scroll).
  // Prefer currentRef.book so mid-nav frames never label SCRIPTURE_TOKENS with a
  // lingering nav/viewModel bookCode (book switch → ol-fallback until reload).
  useTokenBroadcast({
    resourceId,
    resourceKey,
    viewModel,
    fullChapter: preparedOpen.full,
    bookCode: resolveScriptureBroadcastBookCode({
      currentBook: currentRef.book,
      navBookId: nav?.bookId,
      viewModelBookCode: viewModel?.bookCode,
    }),
    language: languageCode,
    languageDirection,
    currentChapter: currentRef.chapter || 1,
    currentVerse: currentRef.verse || 1,
    endChapter: currentRef.endChapter || currentRef.chapter || 1,
    endVerse: currentRef.endVerse ?? 999,
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

  useLayoutEffect(() => {
    setScrollParent(
      resolveScriptureScrollParent(contentRootRef.current) ??
        resolveScriptureScrollParent(chapterScroll.contentRef.current)
    )
  }, [
    isLoading,
    displayVerses,
    currentRef.book,
    currentRef.chapter,
    currentRef.verse,
    chapterScroll.chapterSlots,
  ])

  const unitArgs = {
    navigationMode,
    currentRef,
    navigation,
    hasPassageSet,
  }

  const beginUnitTransition = useCallback(() => {
    unitTransitionStartedAtRef.current = Date.now()
    setIsUnitTransitioning(true)
  }, [])

  const handleEdgeNext = useCallback(() => {
    if (chapterScroll.enabled) {
      chapterScroll.revealChapterAtEdge('next')
      return
    }
    markReadNavigationInternal()
    const ok = advanceNavigationUnit({ ...unitArgs, direction: 'next' })
    if (ok) {
      pendingScrollAlignRef.current = 'start'
      beginUnitTransition()
    }
  }, [chapterScroll.enabled, chapterScroll.revealChapterAtEdge, navigationMode, currentRef, navigation, hasPassageSet, beginUnitTransition])

  const handleEdgePrev = useCallback(() => {
    if (chapterScroll.enabled) {
      chapterScroll.revealChapterAtEdge('previous')
      return
    }
    markReadNavigationInternal()
    const ok = advanceNavigationUnit({ ...unitArgs, direction: 'previous' })
    if (ok) {
      pendingScrollAlignRef.current = 'end'
      beginUnitTransition()
    }
  }, [chapterScroll.enabled, chapterScroll.revealChapterAtEdge, navigationMode, currentRef, navigation, hasPassageSet, beginUnitTransition])

  const canEdgeNext = useCallback(
    () =>
      chapterScroll.enabled
        ? chapterScroll.canRevealChapterAtEdge('next')
        : !isUnitTransitioning &&
          canAdvanceNavigationUnit({ ...unitArgs, direction: 'next' }),
    [
      chapterScroll.enabled,
      chapterScroll.canRevealChapterAtEdge,
      navigationMode,
      currentRef,
      navigation,
      hasPassageSet,
      isUnitTransitioning,
    ]
  )

  const canEdgePrev = useCallback(
    () =>
      chapterScroll.enabled
        ? chapterScroll.canRevealChapterAtEdge('previous')
        : !isUnitTransitioning &&
          canAdvanceNavigationUnit({ ...unitArgs, direction: 'previous' }),
    [
      chapterScroll.enabled,
      chapterScroll.canRevealChapterAtEdge,
      navigationMode,
      currentRef,
      navigation,
      hasPassageSet,
      isUnitTransitioning,
    ]
  )

  const { pullPx, rawPullPx, edge, showTopCue, showBottomCue, clickPrev, clickNext } =
    useScriptureEdgeNavigate({
      scrollParent,
      contentEl: elasticContentEl,
      onNext: handleEdgeNext,
      onPrev: handleEdgePrev,
      canNext: canEdgeNext,
      canPrev: canEdgePrev,
      onArmed: (armedEdge) => {
        chapterScroll.warmChapterAtEdge(armedEdge === 'top' ? 'previous' : 'next')
      },
      enabled: !isLoading && !(isUnitTransitioning && !chapterScroll.enabled) && !error,
    })

  // After unit change (non-chapter modes): land at start (next) or end (prev).
  useLayoutEffect(() => {
    if (chapterScroll.enabled) return
    const align = pendingScrollAlignRef.current
    if (!align || !scrollParent) return
    pendingScrollAlignRef.current = null
    if (align === 'start') {
      scrollParent.scrollTop = 0
    } else {
      scrollParent.scrollTop = scrollParent.scrollHeight
    }
  }, [
    chapterScroll.enabled,
    currentRef.book,
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse,
    displayVerses,
    chapterScroll.chapterSlots,
    scrollParent,
  ])

  // Brief spinner for non-chapter unit swaps only.
  useEffect(() => {
    if (chapterScroll.enabled || !isUnitTransitioning) return
    if (isLoading) return
    const elapsed = Date.now() - unitTransitionStartedAtRef.current
    const remaining = Math.max(0, 180 - elapsed)
    const timer = window.setTimeout(() => setIsUnitTransitioning(false), remaining)
    return () => window.clearTimeout(timer)
  }, [
    chapterScroll.enabled,
    isUnitTransitioning,
    isLoading,
    currentRef.book,
    currentRef.chapter,
    currentRef.verse,
    currentRef.endChapter,
    currentRef.endVerse,
    displayVerses,
    chapterScroll.chapterSlots,
  ])

  const showContentLoading = isLoading || (isUnitTransitioning && !chapterScroll.enabled)
  const armedToCommit = isPastCommitThreshold(rawPullPx, EDGE_NAV_THRESHOLD_PX)
  const pullingTop = edge === 'top' && Math.abs(pullPx) > 8
  const pullingBottom = edge === 'bottom' && Math.abs(pullPx) > 8

  return (
    <div className="h-full min-h-0 flex flex-col" dir={languageDirection}>
      <ResourceViewerHeader
        title={resource.title}
        icon={Book}
        direction={languageDirection}
        infoResource={resource}
        actions={<ScriptureLayoutToggle />}
      />

      {/* Owned scrollport; edge cues live at content start/end (scroll with document). */}
      <div className="flex-1 min-h-0 bg-scripture text-scripture-fg">
        <div
          ref={contentRootRef}
          className="h-full overflow-auto p-content-lg cursor-pointer"
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
          <div
            ref={setElasticContentEl}
            className="max-w-2xl mx-auto w-full will-change-transform"
          >
            <ScriptureEdgeCue
              edge="top"
              visible={showTopCue}
              pulling={pullingTop}
              armedToCommit={armedToCommit}
              onClick={clickPrev}
            />
            <ScriptureContent
              isLoading={showContentLoading}
              isLoadingTOC={isLoadingTOC}
              error={error}
              viewModel={viewModel}
              nav={nav}
              resourceKey={resourceKey}
              availableBooks={availableBooks}
              displayVerses={displayVerses}
              currentRef={currentRef}
              highlightTarget={highlightTarget}
              underlinedSemanticIds={underlinedSemanticIds}
              tokensReady={tokensReady}
              selectedTokenId={selectedTokenId}
              onTokenClick={handleTokenClick}
              onInternedTokenClick={handleInternedTokenClick}
              onVerseClick={handleVerseClick}
              onChapterClick={handleChapterClick}
              onScriptureRefClick={navigateToReference}
              language={languageCode}
              languageDirection={languageDirection}
              displayChapters={chapterScroll.displayChapters}
              chapterSlots={chapterScroll.chapterSlots}
              registerChapter={chapterScroll.registerChapter}
              contentRef={chapterScroll.contentRef}
              tokenSourceFailed={chapterScroll.tokenSourceFailed}
              onRetryTokenSource={chapterScroll.retryTokenSource}
            />
            <ScriptureEdgeCue
              edge="bottom"
              visible={showBottomCue}
              pulling={pullingBottom}
              armedToCommit={armedToCommit}
              onClick={clickNext}
            />
          </div>
        </div>
      </div>
    </div>
  )
}

