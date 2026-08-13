/**
 * Translation Notes Viewer — thin orchestration shell.
 * Pipeline / signals / list rendering live in sibling hooks & components.
 */

import { useCallback, useEffect, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigationMode, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import { useWizardStore } from '../../../lib/stores/wizardStore'
import type { ObsQuoteFilter, VerseFilterState } from '../../../features/helps/helpsDisplayFilters'
import { generateSemanticIdsForQuoteTokens } from '../../../features/helps/quoteTokens'
import { checkDependenciesReady } from '../../../utils/resourceDependencies'
import { resolveHelpsViewerDirection } from '../../../features/read/paneDirection'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { HelpsFilterBanners } from '../shared/HelpsFilterBanners'
import { useScriptureTokens } from '../WordsLinksViewer/hooks'
import type { TokenFilter } from '../WordsLinksViewer/types'
import type { ResourceInfo } from '../../../contexts/types'
import { TranslationNotesList } from './components/TranslationNotesList'
import type { NoteWithTokens } from './components/TranslationNoteCard'
import { useEntryTitles } from './hooks/useEntryTitles'
import { useTAMetadataForTitles } from './hooks/useTAMetadataForTitles'
import { useTATitles } from './hooks/useTATitles'
import { useTranslationNotesContent } from './hooks/useTranslationNotesContent'
import { useTranslationNotesPipeline } from './hooks/useTranslationNotesPipeline'
import { useTranslationNotesSignals } from './hooks/useTranslationNotesSignals'

interface TranslationNotesViewerProps {
  resourceKey: string
  resourceId: string
  resource: ResourceInfo
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
}

export function TranslationNotesViewer({
  resourceKey,
  resourceId,
  resource,
  onEntryLinkClick,
}: TranslationNotesViewerProps) {
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const bookTitleSource = useBookTitleSource()
  const availableLanguages = useWizardStore((s) => s.availableLanguages)
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource

  const resourceIdFromKey = resourceKey.split('/')[2] ?? ''
  const isObs =
    resourceIdFromKey.startsWith('obs-') ||
    String(effectiveResource?.type ?? resource?.type ?? '').includes('obs')

  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
  const [verseFilter, setVerseFilter] = useState<VerseFilterState | null>(null)
  const [obsQuoteFilter, setObsQuoteFilter] = useState<ObsQuoteFilter | null>(null)
  const [_dependenciesReady, setDependenciesReady] = useState(false)
  const [catalogTrigger, setCatalogTrigger] = useState(0)
  const [entryTitleRefreshTrigger, setEntryTitleRefreshTrigger] = useState(0)

  const { notes, loading, error } = useTranslationNotesContent(
    resourceKey,
    currentRef.book,
    isObs ? 'obs-notes' : 'notes'
  )

  const { loadingTitles, fetchTATitle, getTATitle } = useTATitles(resourceKey)
  const taMetadata = useTAMetadataForTitles(resourceKey)
  const { fetchEntryTitle, getEntryTitle, invalidateTitles } = useEntryTitles(resourceKey, taMetadata)

  const {
    notesWithAlignedTokens,
    underlineTokenGroups,
    displayNotes,
    hasMatches,
    notesByVerse,
  } = useTranslationNotesPipeline({
    notes,
    resourceKey,
    resourceId,
    currentRef,
    navigationMode,
    isObs,
    tokenFilter,
    verseFilter,
    obsQuoteFilter,
  })

  const { sendTokenClick, broadcastObsHighlight } = useTranslationNotesSignals({
    resourceId,
    resourceKey,
    isObs,
    currentRef,
    navigationMode,
    notesWithAlignedTokens,
    underlineTokenGroups,
    setTokenFilter,
    setVerseFilter,
    setObsQuoteFilter,
    setSelectedNoteId,
  })

  useEffect(() => {
    const parts = resourceKey.split('/')
    const language = parts.length >= 2 ? parts[1] : ''
    const owner = parts[0] || ''
    checkDependenciesReady('tn', language, owner, resourceTypeRegistry, catalogManager, false)
      .then(setDependenciesReady)
      .catch((err) => {
        console.error('Error checking TN dependencies:', err)
        setDependenciesReady(false)
      })
  }, [resourceKey, catalogManager, resourceTypeRegistry, catalogTrigger])

  useEffect(() => {
    setTokenFilter(null)
    setVerseFilter(null)
    setObsQuoteFilter(null)
    setSelectedNoteId(null)
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => {
      cancelled = true
    }
  }, [resourceKey, catalogManager])

  useEffect(() => {
    const checkCatalog = async () => {
      const keys = await catalogManager.getAllResourceKeys()
      setCatalogTrigger(keys.length)
    }
    checkCatalog()
    const interval = setInterval(checkCatalog, 5000)
    return () => clearInterval(interval)
  }, [catalogManager])

  const { sourceResourceId: targetSourceId, resourceMetadata: targetScriptureMetadata } = useScriptureTokens({
    resourceId,
  })

  const languageCode = resource?.language ?? resourceKey.split('/')[1]?.split('_')[0] ?? ''
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

  useEffect(() => {
    if (!displayNotes.length) return
    displayNotes.forEach((note) => {
      if (note.supportReference?.startsWith('rc://')) fetchTATitle(note)
    })
  }, [displayNotes, fetchTATitle])

  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateTitles()
        setEntryTitleRefreshTrigger((t) => t + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [invalidateTitles])

  useEffect(() => {
    if (!displayNotes.length) return
    displayNotes.forEach((note) => {
      if (!note.note) return
      const matches = note.note.match(/rc:\/\/[^\s\])\n]+/g)
      matches?.forEach((rcLink) => fetchEntryTitle(rcLink))
    })
  }, [displayNotes, fetchEntryTitle, entryTitleRefreshTrigger])

  const handleNoteSelect = useCallback((note: { id: string }) => {
    setSelectedNoteId(note.id)
  }, [])

  const handleQuoteClick = useCallback(
    (note: NoteWithTokens) => {
      setSelectedNoteId(note.id)
      if (isObs) {
        const quote = note.quote?.trim()
        if (!quote) return
        const refParts = note.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const occRaw = Number.parseInt(String(note.occurrence ?? '1'), 10)
        broadcastObsHighlight({
          lifecycle: 'event',
          highlight: {
            storyNumber: chapter,
            frameNumber: verse,
            quote,
            occurrence: Number.isFinite(occRaw) ? occRaw : 1,
            rowId: note.id,
            kind: 'tn',
          },
        })
        return
      }
      if (!note.quoteTokens?.length) return
      const refParts = note.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const bookCode = currentRef.book?.toLowerCase() || ''
      const baseOccurrence = parseInt(note.occurrence || '1', 10)
      const semanticIds = generateSemanticIdsForQuoteTokens(
        note.quoteTokens,
        bookCode,
        chapter,
        verse,
        baseOccurrence
      )
      const firstToken = note.quoteTokens[0]
      if (!firstToken) return
      sendTokenClick({
        lifecycle: 'event',
        token: {
          id: String(firstToken.id),
          content: firstToken.text,
          semanticId: semanticIds[0],
          verseRef: `${bookCode} ${chapter}:${verse}`,
          position: 0,
          strong: firstToken.strong,
          lemma: firstToken.lemma,
          morph: firstToken.morph,
          alignedSemanticIds: semanticIds,
        },
      })
    },
    [isObs, currentRef.book, broadcastObsHighlight, sendTokenClick]
  )

  const handleSupportReferenceClick = useCallback(
    (supportRef: string) => {
      const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
      if (match && onEntryLinkClick) {
        const entryId = match[1]
        const parts = resourceKey.split('/')
        const language = parts.length >= 2 ? parts[1] : 'en'
        const owner = parts[0] || 'unfoldingWord'
        onEntryLinkClick(`${owner}/${language}/ta`, entryId)
      }
    },
    [resourceKey, onEntryLinkClick]
  )

  const filterScopeBar =
    obsQuoteFilter || tokenFilter || verseFilter ? (
      <HelpsFilterBanners
        obsQuoteFilter={obsQuoteFilter}
        tokenFilter={tokenFilter}
        verseFilter={verseFilter}
        displayCount={displayNotes.length}
        hasMatches={hasMatches}
        onClearObsQuoteFilter={() => {
          setObsQuoteFilter(null)
          setSelectedNoteId(null)
        }}
        onClearTokenFilter={() => setTokenFilter(null)}
        onClearVerseFilter={() => setVerseFilter(null)}
      />
    ) : null

  return (
    <div className="h-full flex flex-col">
      <TranslationNotesList
        resource={resource}
        effectiveResource={effectiveResource}
        bookCode={currentRef.book}
        bookTitleSource={bookTitleSource}
        languageDirection={helpsLanguageDirection}
        filterScopeBar={filterScopeBar}
        loading={loading}
        error={error}
        notesByVerse={notesByVerse}
        selectedNoteId={selectedNoteId}
        targetSourceId={targetSourceId}
        resourceKey={resourceKey}
        isObs={isObs}
        loadingTitles={loadingTitles}
        getTATitle={getTATitle}
        getEntryTitle={getEntryTitle}
        onSupportReferenceClick={handleSupportReferenceClick}
        onEntryLinkClick={onEntryLinkClick}
        onQuoteClick={handleQuoteClick}
        onNoteSelect={handleNoteSelect}
      />
    </div>
  )
}
