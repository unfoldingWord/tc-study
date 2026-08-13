/**
 * CombinedHelpsViewer — thin orchestration shell.
 * Pipeline / signals / deps / list / handlers live in sibling modules.
 */

import { useEffect, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigationMode, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import type { ResourceInfo } from '../../../contexts/types'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import { resolveHelpsViewerDirection } from '../../../features/read/paneDirection'
import { useHelpsLanguageActions } from '../../../features/helps/HelpsLanguageActionsContext'
import {
  formatHelpsPassageLabel,
  fullHelpsLangFromResourceKey,
  resolveHelpsLanguageCodeForCopy,
} from '../../../features/helps/helpsEmptyCopy'
import { listedLanguageByCode } from '../../../features/read/languageListDisplayName'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { useEntryTitles } from '../TranslationNotesViewer/hooks/useEntryTitles'
import { useTAMetadataForTitles } from '../TranslationNotesViewer/hooks/useTAMetadataForTitles'
import { useTATitles } from '../TranslationNotesViewer/hooks/useTATitles'
import { useTranslationNotesContent } from '../TranslationNotesViewer/hooks/useTranslationNotesContent'
import {
    useScriptureTokens,
    useTWPreviews,
    useTWTitles,
    useWordsLinksContent,
} from '../WordsLinksViewer/hooks'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { HelpsFilterBanners } from '../shared/HelpsFilterBanners'
import { CombinedHelpsList } from './CombinedHelpsList'
import { primaryLangCode } from './combinedHelpsUtils'
import type { HelpsKindFilter, ObsQuoteFilter, VerseFilterState } from './types'
import { useCombinedHelpsDeps } from './useCombinedHelpsDeps'
import { useCombinedHelpsHandlers } from './useCombinedHelpsHandlers'
import { useCombinedHelpsPipeline } from './useCombinedHelpsPipeline'
import { useCombinedHelpsResources } from './useCombinedHelpsResources'
import { useCombinedHelpsSignals } from './useCombinedHelpsSignals'
import { useCombinedHelpsTitlePreload } from './useCombinedHelpsTitlePreload'

export {
    COMBINED_HELPS_IDS, COMBINED_HELPS_RESOURCE_ID,
    OBS_COMBINED_HELPS_RESOURCE_ID
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
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const bookTitleSource = useBookTitleSource()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const loadedResources = useAppStore((s) => s.loadedResources)
  const helpsLanguageActions = useHelpsLanguageActions()

  const [kindFilter, setKindFilter] = useState<HelpsKindFilter>('all')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
  const [verseFilter, setVerseFilter] = useState<VerseFilterState | null>(null)
  const [obsQuoteFilter, setObsQuoteFilter] = useState<ObsQuoteFilter | null>(null)

  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource
  // Prefer store projection (updated on language switch) over possibly-stale props
  const wantLang = primaryLangCode(
    effectiveResource.language ||
      effectiveResource.languageCode ||
      resource.language ||
      resource.languageCode ||
      ''
  )
  const injectedTnKey = effectiveResource.helpsTnResourceKey
  const injectedTwlKey = effectiveResource.helpsTwlResourceKey
  const helpsScope: 'scripture' | 'obs' = effectiveResource.appliesToScope === 'obs' ? 'obs' : 'scripture'

  const { tnKey, twlKey } = useCombinedHelpsResources({
    loadedResources,
    wantLang,
    injectedTnKey,
    injectedTwlKey,
    helpsScope,
  })

  const tnLoaderId = helpsScope === 'obs' ? 'obs-notes' : 'notes'
  const twlLoaderId = helpsScope === 'obs' ? 'obs-words-links' : 'words-links'

  const { notes: tnNotes, loading: tnLoading, error: tnError } = useTranslationNotesContent(
    tnKey,
    currentRef.book || '',
    tnLoaderId
  )

  const { content: twlContent, loading: twlLoading, error: twlError } = useWordsLinksContent({
    resourceKey: twlKey,
    loaderTypeId: twlLoaderId,
  })

  // Listen on the mounted CombinedHelps id (not TN/TWL catalog keys)
  const scriptureTokenListenerId = resourceId

  useEffect(() => {
    setTokenFilter(null)
    setVerseFilter(null)
    setObsQuoteFilter(null)
    setSelectedNoteId(null)
    setSelectedLinkId(null)
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

  const { catalogMetadata, depsOk } = useCombinedHelpsDeps({
    resourceKey,
    tnKey,
    twlKey,
    helpsScope,
    catalogManager,
    resourceTypeRegistry,
  })

  const { sourceResourceId: targetSourceId, resourceMetadata: targetScriptureMetadata } = useScriptureTokens({
    resourceId: scriptureTokenListenerId,
  })

  const languageCode =
    resource?.language ?? tnKey.split('/')[1]?.split('_')[0] ?? twlKey.split('/')[1]?.split('_')[0] ?? ''
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

  const { loadingTitles, fetchTATitle, getTATitle } = useTATitles(tnKey || resourceKey)
  const taMetadata = useTAMetadataForTitles(tnKey || resourceKey)
  const { fetchEntryTitle, getEntryTitle, invalidateTitles } = useEntryTitles(tnKey || resourceKey, taMetadata)

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
  } = useCombinedHelpsPipeline({
    tnNotes,
    twlLinksRaw: twlContent?.links,
    tnKey,
    twlKey,
    resourceKey,
    resourceId,
    helpsScope,
    kindFilter,
    currentRef,
    navigationMode,
    tokenFilter,
    verseFilter,
    obsQuoteFilter,
  })

  const { sendTokenClick, sendEntryLinkClick, broadcastObsHighlight } = useCombinedHelpsSignals({
    resourceId,
    resourceKey,
    tnKey,
    twlKey,
    helpsScope,
    kindFilter,
    wantLang,
    currentRef: {
      book: currentRef.book,
      chapter: currentRef.chapter,
      verse: currentRef.verse,
    },
        navigationMode,
        notesWithAlignedTokens,
        filteredByReference,
    underlineTnGroups,
    underlineTwlGroups,
    setTokenFilter,
    setVerseFilter,
    setObsQuoteFilter,
    setSelectedNoteId,
    setSelectedLinkId,
  })

  const hasMatches = obsQuoteFilter
    ? hasNoteMatches || hasLinkMatches
    : tokenFilter
      ? kindFilter === 'notes'
        ? hasNoteMatches
        : kindFilter === 'twl'
          ? hasLinkMatches
          : hasNoteMatches || hasLinkMatches
      : verseFilter
        ? kindFilter === 'notes'
          ? hasNoteMatches
          : kindFilter === 'twl'
            ? hasLinkMatches
            : hasNoteMatches || hasLinkMatches
        : true

  const displayCount =
    kindFilter === 'all'
      ? displayNotes.length + displayLinks.length
      : kindFilter === 'notes'
        ? displayNotes.length
        : displayLinks.length

  const { twTitles, loadingTitles: twLoadingTitles, fetchTWTitle, getTWTitle } = useTWTitles(twlKey || resourceKey)
  const { twPreviews, loadingPreviews: twLoadingPreviews, fetchTWPreview, getTWPreview } = useTWPreviews(
    twlKey || resourceKey
  )

  useCombinedHelpsTitlePreload({
    displayNotes,
    displayLinks,
    fetchTATitle,
    fetchEntryTitle,
    invalidateTitles,
    twTitles,
    twLoadingTitles,
    fetchTWTitle,
    twPreviews,
    twLoadingPreviews,
    fetchTWPreview,
  })

  const {
    handleNoteSelect,
    handleNoteQuoteClick,
    handleSupportReferenceClick,
    handleTitleClick,
    handleLinkQuoteClick,
  } = useCombinedHelpsHandlers({
    helpsScope,
    bookCode: currentRef.book,
    tnKey,
    twlKey,
    resourceKey,
    onEntryLinkClick,
    sendTokenClick,
    sendEntryLinkClick,
    broadcastObsHighlight,
    setSelectedNoteId,
    setSelectedLinkId,
  })

  const loading = !!(tnKey && tnLoading) || !!(twlKey && twlLoading)
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

  // null when inactive so CombinedHelps can keep kind toggles in the header slot.
  const filterScopeBar =
    obsQuoteFilter || tokenFilter || verseFilter ? (
      <HelpsFilterBanners
        obsQuoteFilter={obsQuoteFilter}
        tokenFilter={tokenFilter}
        verseFilter={verseFilter}
        displayCount={displayCount}
        hasMatches={hasMatches}
        onClearObsQuoteFilter={() => {
          setObsQuoteFilter(null)
          setSelectedNoteId(null)
          setSelectedLinkId(null)
        }}
        onClearTokenFilter={() => setTokenFilter(null)}
        onClearVerseFilter={() => setVerseFilter(null)}
      />
    ) : null

  return (
    <div className="h-full flex flex-col">
      <CombinedHelpsList
        resource={resource}
        effectiveResource={effectiveResource}
        bookCode={currentRef.book}
        bookTitleSource={bookTitleSource}
        languageDirection={helpsLanguageDirection}
        kindFilter={kindFilter}
        setKindFilter={setKindFilter}
        filterScopeBar={filterScopeBar}
        helpsLanguageCode={helpsLanguageCodeForCopy}
        helpsLanguageName={helpsLanguageName}
        passageLabel={passageLabel}
        noSources={noSources}
        depsOk={depsOk}
        loading={loading}
        tnError={tnError}
        twlError={twlError}
        tnKey={tnKey}
        twlKey={twlKey}
        resourceKey={resourceKey}
        mergedGroups={mergedGroups}
        selectedNoteId={selectedNoteId}
        selectedLinkId={selectedLinkId}
        targetSourceId={targetSourceId}
        helpsScope={helpsScope}
        tokenFilter={tokenFilter}
        loadingTitles={loadingTitles}
        twLoadingTitles={twLoadingTitles}
        getEntryTitle={getEntryTitle}
        getTATitle={getTATitle}
        getTWTitle={getTWTitle}
        getTWPreview={getTWPreview}
        onSupportReferenceClick={handleSupportReferenceClick}
        onEntryLinkClick={onEntryLinkClick}
        onNoteQuoteClick={handleNoteQuoteClick}
        onNoteSelect={handleNoteSelect}
        onTitleClick={handleTitleClick}
        onLinkQuoteClick={handleLinkQuoteClick}
      />
    </div>
  )
}
