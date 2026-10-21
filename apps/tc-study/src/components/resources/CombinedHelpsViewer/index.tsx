/**
 * CombinedHelpsViewer — thin orchestration shell.
 * Pipeline / signals / deps / list / handlers live in sibling modules.
 */

import { useEffect, useMemo, useRef } from 'react'
import { useCatalogManager, useNavigationMode } from '../../../contexts'
import { usePinnedHelpsReference } from '../../../features/nav/usePinnedHelpsReference'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import type { ResourceInfo } from '../../../contexts/types'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import { resolveHelpsViewerDirection } from '../../../features/read/paneDirection'
import { useHelpsLanguageActions } from '../../../features/helps/HelpsLanguageActionsContext'
import {
  formatHelpsPassageLabel,
  fullHelpsLangFromResourceKey,
  resolveHelpsLanguageCodeForCopy,
} from '../../../features/helps/helpsEmptyCopy'
import {
  getPersistedHelpsHighlight,
  shouldKeepSelectedHelpsCardOnPassageChange,
} from '../../../features/helps/helpsCardScriptureNav'
import {
  isHelpsContentPending,
  staleQuotesAreUnderlineReady,
} from '../../../features/helps/helpsListLoading'
import { helpsLane1Ready } from '../../../features/warm/warmLanePolicy'
import { useWarmLanes } from '../../../features/warm/useWarmLanes'
import { listedLanguageByCode } from '../../../features/read/languageListDisplayName'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { useTranslationNotesContent } from '../TranslationNotesViewer/hooks/useTranslationNotesContent'
import { useScriptureTokens, useWordsLinksContent } from '../WordsLinksViewer/hooks'
import { CombinedHelpsList } from './CombinedHelpsList'
import { resourceKeyLangSegment } from './combinedHelpsUtils'
import {
  buildHelpsFilterChrome,
  combinedHelpsFilterDisplayCount,
  combinedHelpsFilterHasMatches,
} from './helpsFilterChrome'
import { useCombinedHelpsDeps } from './useCombinedHelpsDeps'
import { useCombinedHelpsFilterState } from './useCombinedHelpsFilterState'
import { useCombinedHelpsHandlers } from './useCombinedHelpsHandlers'
import { useCombinedHelpsIdentity } from './useCombinedHelpsIdentity'
import { useCombinedHelpsPipeline } from './useCombinedHelpsPipeline'
import { useCombinedHelpsPrepare } from './useCombinedHelpsPrepare'
import { useCombinedHelpsSignals } from './useCombinedHelpsSignals'
import { useCombinedHelpsTitles } from './useCombinedHelpsTitles'
import { loadedResourcesMembershipKey } from '../../../features/read/loadedResourcesMembershipKey'
import {
  resolveHelpsTargetScriptureKey,
  useHelpsTargetScriptureKey,
} from '../../../features/helps/helpsTargetScripture'
import { getLastScriptureTokensSourceResourceId } from '../../../features/helps/scriptureTokensStore'
import { navigationLanguageCode } from '../../../features/read/readPanelModel'
import { useReadPanelStore } from '../../../features/read/readPanelStore'
import { warmVisibleHelpsResources } from './warmVisibleHelpsResources'

export {
  COMBINED_HELPS_IDS, COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID,
} from '../../../features/helps/combinedHelpsIds'

interface CombinedHelpsViewerProps {
  resourceId: string
  resourceKey: string
  resource: ResourceInfo
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
}

export function CombinedHelpsViewer({
  resourceId,
  resourceKey,
  resource,
  onEntryLinkClick,
}: CombinedHelpsViewerProps) {
  const currentRef = usePinnedHelpsReference()
  const navigationMode = useNavigationMode()
  const catalogManager = useCatalogManager()
  const bookTitleSource = useBookTitleSource()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const loadedMembership = useAppStore((s) => loadedResourcesMembershipKey(s.loadedResources))
  const loadedResources = useMemo(() => useAppStore.getState().loadedResources, [loadedMembership])
  const packageResources = useWorkspaceStore((s) => s.currentPackage?.resources)
  const helpsLanguageActions = useHelpsLanguageActions()
  const filters = useCombinedHelpsFilterState(currentRef.book)

  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const { effectiveResource, wantLang, helpsScope, tnKey, twlKey } = useCombinedHelpsIdentity({
    resourceId,
    resourceKey,
    resource,
    resourceFromStore,
    packageResources,
    loadedResources,
  })

  const tnLoaderId = helpsScope === 'obs' ? 'obs-notes' : 'notes'
  const twlLoaderId = helpsScope === 'obs' ? 'obs-words-links' : 'words-links'
  const { notes: tnNotes, notesByChapter, loading: tnLoading, error: tnError } =
    useTranslationNotesContent(tnKey, currentRef.book || '', tnLoaderId)
  const { content: twlContent, loading: twlLoading, error: twlError } = useWordsLinksContent({
    resourceKey: twlKey,
    loaderTypeId: twlLoaderId,
  })

  const startChapter = currentRef.chapter || 1
  const endChapter = currentRef.endChapter || startChapter
  const bookId = currentRef.book || ''
  const { preparedNotes, notesPrepareStatus, preparedLinks, linksPrepareStatus } = useCombinedHelpsPrepare({
    tnNotes,
    notesByChapter,
    twlContent,
    tnKey,
    twlKey,
    bookId,
    startChapter,
    endChapter,
  })

  const filterResetKey =
    navigationMode === 'chapter'
      ? `${currentRef.book}:${currentRef.chapter}`
      : `${currentRef.book}:${currentRef.chapter}:${currentRef.verse}:${currentRef.endVerse ?? ''}`

  const supportRefFilterRef = useRef(filters.supportRefFilter)
  supportRefFilterRef.current = filters.supportRefFilter
  const twlArticleFilterRef = useRef(filters.twlArticleFilter)
  twlArticleFilterRef.current = filters.twlArticleFilter
  useEffect(() => {
    filters.setTokenFilter(null)
    filters.setVerseFilter(null)
    filters.setObsQuoteFilter(null)
    if (
      !shouldKeepSelectedHelpsCardOnPassageChange({
        supportRefActive: Boolean(supportRefFilterRef.current || twlArticleFilterRef.current),
        persist: getPersistedHelpsHighlight(),
        nextBook: currentRef.book,
        nextChapter: currentRef.chapter,
      })
    ) {
      filters.setSelectedHelpsCard(null)
    }
  }, [filterResetKey])

  const { catalogMetadata } = useCombinedHelpsDeps({ resourceKey, catalogManager })

  // SCRIPTURE_TOKENS is received on the mounted CombinedHelps resourceId.
  const { sourceResourceId: broadcastTargetId, resourceMetadata: targetScriptureMetadata } =
    useScriptureTokens({ resourceId })
  const sharedTargetKey = useHelpsTargetScriptureKey()
  const readPanels = useReadPanelStore((s) => s.panels)
  const textLangPrefer = navigationLanguageCode(readPanels)
  const targetSourceId = useMemo(
    () =>
      resolveHelpsTargetScriptureKey({
        sharedKey: sharedTargetKey,
        broadcastKey: broadcastTargetId,
        lastKnownKey: getLastScriptureTokensSourceResourceId(),
        loadedResources,
        preferLanguage: textLangPrefer || helpsLanguageActions?.selectedLanguageCode,
      }),
    [
      sharedTargetKey,
      broadcastTargetId,
      loadedResources,
      textLangPrefer,
      helpsLanguageActions?.selectedLanguageCode,
      // Re-resolve after SCRIPTURE_TOKENS invalidate clears hydrate but keeps lastKnown.
      targetScriptureMetadata?.id,
    ]
  )

  const helpsLangForWarm =
    helpsLanguageActions?.selectedLanguageCode || resourceKeyLangSegment(tnKey) || resourceKeyLangSegment(twlKey) || ''
  const textLangForWarm = resourceKeyLangSegment(targetSourceId) || helpsLangForWarm
  const warmVisibleResources = useMemo(
    () => warmVisibleHelpsResources({ targetSourceId, tnKey, twlKey }),
    [targetSourceId, tnKey, twlKey]
  )

  const languageCode = resource?.language ?? resourceKeyLangSegment(tnKey) ?? resourceKeyLangSegment(twlKey) ?? ''
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const resourceDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )
  const helpsLanguageDirection = resolveHelpsViewerDirection({
    resourceDirection,
    targetScriptureDirection: targetScriptureMetadata?.languageDirection,
  })

  const {
    notesWithAlignedTokens,
    filteredByReference,
    underlineTnGroups,
    underlineTwlGroups,
    displayNotes,
    hasNoteMatches,
    displayLinks,
    hasLinkMatches,
    mergedGroups,
    tnQuoteBuildReady,
    twlQuoteBuildReady,
    quotesBlocked,
    supportRefStreamPending,
    twlArticleStreamPending,
  } = useCombinedHelpsPipeline({
    tnNotes,
    notesByChapter,
    preparedNotes,
    twlLinksRaw: twlContent?.links,
    linksByChapter: twlContent?.linksByChapter,
    preparedLinks,
    tnKey,
    twlKey,
    resourceKey,
    resourceId,
    helpsScope,
    kindFilter: filters.kindFilter,
    currentRef,
    navigationMode,
    tokenFilter: filters.tokenFilter,
    verseFilter: filters.verseFilter,
    obsQuoteFilter: filters.obsQuoteFilter,
    supportRefFilter: filters.supportRefFilter,
    twlArticleFilter: filters.twlArticleFilter,
    targetKey: targetSourceId,
  })

  const { sendTokenClick, sendEntryLinkClick, sendVerseFilter, sendVerseNavigation, broadcastObsHighlight } =
    useCombinedHelpsSignals({
    resourceId,
    resourceKey,
    tnKey,
    twlKey,
    helpsScope,
    kindFilter: filters.kindFilter,
    wantLang,
    currentRef: { book: currentRef.book, chapter: currentRef.chapter, verse: currentRef.verse },
    navigationMode,
    notesWithAlignedTokens,
    filteredByReference,
    underlineTnGroups,
    underlineTwlGroups,
    setTokenFilter: filters.setTokenFilter,
    setVerseFilter: filters.setVerseFilter,
    setObsQuoteFilter: filters.setObsQuoteFilter,
    setSupportRefFilter: filters.setSupportRefFilter,
    setTwlArticleFilter: filters.setTwlArticleFilter,
    setSelectedHelpsCard: filters.setSelectedHelpsCard,
    restoreBookKind: filters.restoreBookKind,
  })

  const hasMatches = combinedHelpsFilterHasMatches({ ...filters, hasNoteMatches, hasLinkMatches })
  const displayCount = combinedHelpsFilterDisplayCount({
    kindFilter: filters.kindFilter,
    notesCount: displayNotes.length,
    linksCount: displayLinks.length,
  })
  const titles = useCombinedHelpsTitles({
    tnKey,
    twlKey,
    resourceKey,
    displayNotes,
    displayLinks,
  })

  const handlers = useCombinedHelpsHandlers({
    helpsScope,
    bookCode: currentRef.book,
    tnKey,
    twlKey,
    resourceKey,
    onEntryLinkClick,
    sendTokenClick,
    sendEntryLinkClick,
    sendVerseFilter,
    sendVerseNavigation,
    broadcastObsHighlight,
    setSelectedHelpsCard: filters.setSelectedHelpsCard,
    setSupportRefFilter: filters.setSupportRefFilter,
    setTwlArticleFilter: filters.setTwlArticleFilter,
    clearCompetingFilters: filters.clearCompetingFilters,
    enterBookKindFilter: filters.enterBookKind,
  })

  const loading = isHelpsContentPending({
    tnKey, twlKey, tnLoading, twlLoading,
    catalogLoading: Boolean(helpsLanguageActions?.isCatalogLoading),
    preparePending: notesPrepareStatus === 'pending' || linksPrepareStatus === 'pending',
    hasVisibleRows: mergedGroups.length > 0,
  }) || Boolean(
    ((filters.supportRefFilter && supportRefStreamPending) ||
      (filters.twlArticleFilter && twlArticleStreamPending)) &&
      mergedGroups.length === 0
  )
  useWarmLanes({
    owner: 'helps',
    visibleResources: warmVisibleResources,
    sourceResourceId: targetSourceId,
    textLanguageCode: textLangForWarm,
    helpsLanguageCode: helpsLangForWarm,
    lane1Ready: helpsLane1Ready({
      contentPending: loading,
      quoteReady:
        tnQuoteBuildReady ||
        twlQuoteBuildReady ||
        (mergedGroups.length > 0 && !displayNotes.some((n) => n.quote?.trim())),
      cacheHit:
        staleQuotesAreUnderlineReady(displayNotes) ||
        staleQuotesAreUnderlineReady(displayLinks),
      quotesBlocked: quotesBlocked && mergedGroups.length > 0,
      bookFilterRowsReady:
        Boolean(filters.supportRefFilter || filters.twlArticleFilter) &&
        mergedGroups.length > 0,
    }),
  })
  const noSources = !tnKey && !twlKey
  const helpsLanguageCodeForCopy = resolveHelpsLanguageCodeForCopy({
    selectedCode: helpsLanguageActions?.selectedLanguageCode,
    keyLanguage: fullHelpsLangFromResourceKey(tnKey) || fullHelpsLangFromResourceKey(twlKey),
    resourceLanguage:
      effectiveResource.language ||
      effectiveResource.languageCode ||
      resource.language ||
      resource.languageCode ||
      '',
  })
  const listedHelpsLang = listedLanguageByCode(availableLanguages, helpsLanguageCodeForCopy)
  const helpsLanguageName = listedHelpsLang ?? ''
  const passageLabel = formatHelpsPassageLabel(currentRef.book, currentRef.chapter)
  const { filterScopeBar, onClearActiveFilter } = buildHelpsFilterChrome({
    ...filters,
    displayCount,
    hasMatches,
    sendVerseFilter,
  })

  return (
    <div className="h-full min-h-0 overflow-hidden flex flex-col">
      <CombinedHelpsList
        resource={resource}
        effectiveResource={effectiveResource}
        bookCode={currentRef.book}
        bookTitleSource={bookTitleSource}
        languageDirection={helpsLanguageDirection}
        kindFilter={filters.kindFilter}
        setKindFilter={filters.setKindFilter}
        filterScopeBar={filterScopeBar}
        helpsLanguageCode={helpsLanguageCodeForCopy}
        helpsLanguageName={helpsLanguageName}
        passageLabel={passageLabel}
        noSources={noSources}
        chapterHasHelps={notesWithAlignedTokens.length > 0 || filteredByReference.length > 0}
        onClearActiveFilter={onClearActiveFilter}
        loading={loading}
        tnError={tnError}
        twlError={twlError}
        tnKey={tnKey}
        twlKey={twlKey}
        resourceKey={resourceKey}
        mergedGroups={mergedGroups}
        selectedHelpsCard={filters.selectedHelpsCard}
        targetSourceId={targetSourceId}
        helpsScope={helpsScope}
        tokenFilter={filters.tokenFilter}
        verseFilter={filters.verseFilter}
        obsQuoteFilter={filters.obsQuoteFilter}
        supportRefFilter={filters.supportRefFilter}
        twlArticleFilter={filters.twlArticleFilter}
        loadingTitles={titles.loadingTitles}
        twLoadingTitles={titles.twLoadingTitles}
        getEntryTitle={titles.getEntryTitle}
        getTATitle={titles.getTATitle}
        getTWTitle={titles.getTWTitle}
        getTWPreview={titles.getTWPreview}
        isTWPreviewPending={titles.isTWPreviewPending}
        onSupportReferenceClick={handlers.handleSupportReferenceClick}
        onFilterBySupportReference={handlers.handleFilterBySupportReference}
        onFilterByTwlArticle={handlers.handleFilterByTwlArticle}
        onEntryLinkClick={onEntryLinkClick}
        onNoteQuoteClick={handlers.handleNoteQuoteClick}
        onNoteSelect={handlers.handleNoteSelect}
        onTitleClick={handlers.handleTitleClick}
        onLinkQuoteClick={handlers.handleLinkQuoteClick}
      />
    </div>
  )
}
