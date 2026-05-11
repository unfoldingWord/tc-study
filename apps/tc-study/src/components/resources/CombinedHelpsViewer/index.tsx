/**
 * CombinedHelpsViewer (experimental)
 * Merges Translation Notes and Translation Words Links for the current passage
 * into one scrollable list, with All / Notes / TWL filter controls.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import type { TranslationNote, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { ResourceType } from '@bt-synergy/resource-catalog'
import { useResourceAPI } from 'linked-panels'
import { BookMarked, BookOpen, FileText, LayoutList, Layers, Loader, NotebookPen } from 'lucide-react'
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigationMode, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import type { ResourceInfo } from '../../../contexts/types'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import type {
  EntryLinkClickSignal,
  NotesTokenGroupsSignal,
  ObsFrameHighlightSignal,
  ObsFrameQuoteEntry,
  ObsFrameQuotesSignal,
  TokenClickSignal,
  VerseFilterSignal,
} from '../../../signals/studioSignals'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../utils/bookNames'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { checkDependenciesReady } from '../../../utils/resourceDependencies'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { TranslationNoteCard, type NoteWithTokens } from '../TranslationNotesViewer/components/TranslationNoteCard'
import { useTranslationNotesContent } from '../TranslationNotesViewer/hooks/useTranslationNotesContent'
import { useTATitles } from '../TranslationNotesViewer/hooks/useTATitles'
import { useTAMetadataForTitles } from '../TranslationNotesViewer/hooks/useTAMetadataForTitles'
import { useEntryTitles } from '../TranslationNotesViewer/hooks/useEntryTitles'
import { TokenFilterBanner, WordLinkCard } from '../WordsLinksViewer/components'
import {
  useAlignedTokens,
  useQuoteTokens,
  useScriptureTokens,
  useTWTitles,
  useWordsLinksContent,
} from '../WordsLinksViewer/hooks'
import type { TokenFilter } from '../WordsLinksViewer/types'
import { generateSemanticIdsForQuoteTokens, parseLinkChapterVerse, parseTWLink } from '../WordsLinksViewer/utils'
import { COMBINED_HELPS_IDS, COMBINED_HELPS_RESOURCE_ID } from './constants'

export { COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID, COMBINED_HELPS_IDS } from './constants'

type HelpsKindFilter = 'all' | 'notes' | 'twl'

type MergedRow =
  | { kind: 'tn'; ref: string; sortChapter: number; sortVerse: number; sortPosition: number; note: TranslationNote & { quoteTokens?: any[]; alignedTokens?: any[] } }
  | { kind: 'twl'; ref: string; sortChapter: number; sortVerse: number; sortPosition: number; link: TranslationWordsLink }

interface CombinedHelpsViewerProps {
  resourceId: string
  resourceKey: string
  resource: ResourceInfo
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
}

function primaryLangCode(code: string | undefined | null): string {
  if (!code) return ''
  return String(code).trim().split(/[-_/]/)[0]!.toLowerCase()
}

/** Language segment from `owner/lang/id` resource keys (handles `lang_region`). */
function langFromResourceKey(key: string | undefined): string {
  if (!key || !key.includes('/')) return ''
  const parts = key.split('/')
  return primaryLangCode(parts[1])
}

function isNotesType(t: string | undefined, scope: 'scripture' | 'obs' = 'scripture'): boolean {
  const s = String(t || '').toLowerCase()
  if (scope === 'obs') return s === 'obs-notes'
  return s === 'notes' || s === 'tn' || t === ResourceType.NOTES
}

function isWordsLinksType(t: string | undefined, scope: 'scripture' | 'obs' = 'scripture'): boolean {
  const s = String(t || '').toLowerCase()
  if (scope === 'obs') return s === 'obs-words-links'
  return s === 'words-links' || s === 'words_links' || s === 'twl' || t === ResourceType.WORDS_LINKS
}

function refSortParts(ref: string): { chapter: number; verse: number } {
  const { chapter, verse } = parseLinkChapterVerse(ref)
  return { chapter, verse }
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
  const availableLanguages = useWorkspaceStore((s) => s.availableLanguages)
  const loadedResources = useAppStore((s) => s.loadedResources)

  const [kindFilter, setKindFilter] = useState<HelpsKindFilter>('all')
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [selectedLinkId, setSelectedLinkId] = useState<string | null>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
  const [verseFilter, setVerseFilter] = useState<{ chapter: number; verse?: number; timestamp: number } | null>(null)
  // OBS-only: filter by frame quote click (legacy substring or word overlap via source ids)
  const [obsQuoteFilter, setObsQuoteFilter] = useState<{
    quote?: string
    occurrence?: number
    rowId?: string
    kind?: 'tn' | 'twl'
    sourceIds?: string[]
    wordIndex?: number
  } | null>(null)
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)
  const [tnDepsReady, setTnDepsReady] = useState(false)
  const [twlDepsReady, setTwlDepsReady] = useState(false)
  const [catalogTrigger, setCatalogTrigger] = useState(0)
  const [entryTitleRefreshTrigger, setEntryTitleRefreshTrigger] = useState(0)

  const wantLang = primaryLangCode(resource.language || resource.languageCode || '')

  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource
  const injectedTnKey = effectiveResource.helpsTnResourceKey
  const injectedTwlKey = effectiveResource.helpsTwlResourceKey
  const helpsScope: 'scripture' | 'obs' = effectiveResource.appliesToScope === 'obs' ? 'obs' : 'scripture'

  const { tnKey, twlKey } = useMemo(() => {
    let tn: string | null = injectedTnKey || null
    let twl: string | null = injectedTwlKey || null
    const list = Object.values(loadedResources).filter(Boolean) as ResourceInfo[]

    const matchesLang = (r: ResourceInfo) => {
      if (!wantLang) return true
      const key = r.key || r.id || ''
      return (
        primaryLangCode(r.language) === wantLang ||
        primaryLangCode(r.languageCode) === wantLang ||
        langFromResourceKey(key) === wantLang
      )
    }

    for (const r of list) {
      const t = r.type as string | undefined
      const key = r.key || r.id || ''
      if (COMBINED_HELPS_IDS.has(key)) continue
      if (!matchesLang(r)) continue
      if (isNotesType(t, helpsScope) && !tn) tn = key
      if (isWordsLinksType(t, helpsScope) && !twl) twl = key
    }

    // Fallback when metadata language is wrong: use `owner/lang/...` from the key only.
    // Never pick TN/TWL from another language still present in loadedResources.
    for (const r of list) {
      const t = r.type as string | undefined
      const key = r.key || r.id || ''
      if (COMBINED_HELPS_IDS.has(key)) continue
      if (wantLang && langFromResourceKey(key) !== wantLang) continue
      if (!tn && isNotesType(t, helpsScope)) tn = key
      if (!twl && isWordsLinksType(t, helpsScope)) twl = key
    }

    return { tnKey: tn || '', twlKey: twl || '' }
  }, [loadedResources, wantLang, injectedTnKey, injectedTwlKey, helpsScope])

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

  /** Same resource id the standalone TN/TWL viewers use — required for scripture token broadcast subscription. */
  const scriptureTokenListenerId = twlKey || tnKey || resourceId

  const resourceMetadata = useMemo(() => {
    const parts = resourceKey.split('/')
    const owner = parts[0] || ''
    const language = parts[1]?.split('_')[0] || wantLang || ''
    return {
      type: 'combined-helps' as const,
      language,
      owner,
      tags: ['combined-helps', 'tn', 'twl'],
    }
  }, [resourceKey, wantLang])

  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>('token-click', resourceId, resourceMetadata)
  const { sendToAll: sendEntryLinkClick } = useSignal<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    resourceMetadata
  )
  const { sendToAll: broadcastObsHighlight } = useSignal<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    resourceMetadata
  )

  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        setTokenFilter({
          semanticId: signal.token.semanticId,
          content: signal.token.content,
          alignedSemanticIds: signal.token.alignedSemanticIds || [],
          timestamp: signal.timestamp,
        })
        setVerseFilter(null)
        setSelectedNoteId(null)
        setSelectedLinkId(null)
      },
      [resourceId]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        setVerseFilter({
          chapter: signal.filter.chapter,
          verse: signal.filter.verse,
          timestamp: signal.timestamp,
        })
        setTokenFilter(null)
        setSelectedNoteId(null)
        setSelectedLinkId(null)
      },
      [resourceId]
    ),
    { debug: false, resourceMetadata }
  )

  useSignalHandler<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    (signal: EntryLinkClickSignal) => {
      if (tnKey && signal.resourceKey === tnKey && signal.entryId) {
        setSelectedNoteId(signal.entryId)
      }
    }
  )

  useEffect(() => {
    setTokenFilter(null)
    setVerseFilter(null)
    setObsQuoteFilter(null)
    setSelectedNoteId(null)
    setSelectedLinkId(null)
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

  useEffect(() => {
    if (!tnKey) {
      setTnDepsReady(true)
      return
    }
    const parts = tnKey.split('/')
    const language = parts.length >= 2 ? parts[1] : ''
    const owner = parts[0] || ''
    const tnTypeId = helpsScope === 'obs' ? 'obs-notes' : 'notes'
    checkDependenciesReady(tnTypeId, language, owner, resourceTypeRegistry, catalogManager, false)
      .then(setTnDepsReady)
      .catch(() => setTnDepsReady(false))
  }, [tnKey, helpsScope, catalogManager, resourceTypeRegistry, catalogTrigger])

  useEffect(() => {
    if (!twlKey) {
      setTwlDepsReady(true)
      return
    }
    const parts = twlKey.split('/')
    const owner = parts[0]
    const language = parts.length === 3 ? parts[1] : parts[1].split('_')[0]
    const twlTypeId = helpsScope === 'obs' ? 'obs-words-links' : 'words-links'
    checkDependenciesReady(twlTypeId, language, owner, resourceTypeRegistry, catalogManager, false)
      .then(setTwlDepsReady)
      .catch(() => setTwlDepsReady(false))
  }, [twlKey, helpsScope, catalogManager, resourceTypeRegistry, catalogTrigger])

  const {
    sourceResourceId: targetSourceId,
    resourceMetadata: targetScriptureMetadata,
  } = useScriptureTokens({ resourceId: scriptureTokenListenerId })

  const languageCode =
    resource?.language ?? tnKey.split('/')[1]?.split('_')[0] ?? twlKey.split('/')[1]?.split('_')[0] ?? ''
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const resourceDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )
  const targetLanguageDirection = targetScriptureMetadata?.languageDirection ?? resourceDirection

  const { taTitles, loadingTitles, fetchTATitle, getTATitle } = useTATitles(tnKey || resourceKey)
  const taMetadata = useTAMetadataForTitles(tnKey || resourceKey)
  const { fetchEntryTitle, getEntryTitle, invalidateTitles } = useEntryTitles(tnKey || resourceKey, taMetadata)

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

  const relevantNotes = useMemo(() => {
    if (!tnNotes?.length) return []
    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || startChapter
    // In OBS story mode show all frames of the story; otherwise restrict to the current range.
    const isObsStoryMode = navigationMode === 'chapter' && currentRef.book === 'obs'
    const endVerse = isObsStoryMode ? Number.POSITIVE_INFINITY : (currentRef.endVerse || startVerse)

    return tnNotes.filter((note) => {
      const [noteChapterStr, noteVerseRange] = note.reference.split(':')
      const noteChapter = parseInt(noteChapterStr)
      if (noteChapter < startChapter || noteChapter > endChapter) return false
      let noteStartVerse: number
      let noteEndVerse: number
      if (noteVerseRange?.includes('-')) {
        const [start, end] = noteVerseRange.split('-').map((v) => parseInt(v))
        noteStartVerse = start
        noteEndVerse = end
      } else {
        noteStartVerse = noteEndVerse = parseInt(noteVerseRange)
      }
      if (noteChapter === startChapter && noteEndVerse < startVerse) return false
      if (noteChapter === endChapter && noteStartVerse > endVerse) return false
      return true
    })
  }, [tnNotes, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse, currentRef.book, navigationMode])

  const notesWithQuotes = useMemo(() => {
    return relevantNotes
      .filter((note) => note.quote && note.quote.trim().length > 0)
      .map((note) => ({
        id: note.id,
        reference: note.reference,
        tags: note.tags || '',
        occurrence: note.occurrence || '1',
        origWords: note.quote!,
        articlePath: '',
      }))
  }, [relevantNotes])

  const tnPanelId = tnKey || resourceId

  const { linksWithQuotes: tnLinksWithQuotes } = useQuoteTokens({
    resourceKey: tnKey || resourceKey,
    resourceId: tnPanelId,
    links: notesWithQuotes,
  })

  const { linksWithAlignedTokens: tnLinksAligned } = useAlignedTokens({
    resourceKey: tnKey || resourceKey,
    resourceId: tnPanelId,
    links: tnLinksWithQuotes,
  })

  const notesWithAlignedTokens = useMemo(() => {
    const quoteMap = new Map(tnLinksWithQuotes.map((l) => [l.id, l.quoteTokens]))
    const alignedMap = new Map(tnLinksAligned.map((l) => [l.id, l.alignedTokens]))
    const semanticIdsMap = new Map(tnLinksAligned.map((l) => [l.id, (l as any).semanticIds as string[] | undefined]))
    return relevantNotes.map((note) => ({
      ...note,
      quoteTokens: quoteMap.get(note.id),
      alignedTokens: alignedMap.get(note.id),
      semanticIds: semanticIdsMap.get(note.id),
    }))
  }, [relevantNotes, tnLinksWithQuotes, tnLinksAligned])

  const links = useMemo(() => {
    if (!twlContent?.links) return []
    return twlContent.links.map((link) => ({
      ...link,
      articlePath:
        link.articlePath ||
        (() => {
          if (!link.twLink) return ''
          const m = link.twLink.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
          return m ? m[1] : ''
        })(),
    }))
  }, [twlContent])

  const twlPanelId = twlKey || resourceId

  const { linksWithQuotes: twlLinksWithQuotes } = useQuoteTokens({
    resourceKey: twlKey || resourceKey,
    resourceId: twlPanelId,
    links,
  })

  const { linksWithAlignedTokens: twlLinksAligned } = useAlignedTokens({
    resourceKey: twlKey || resourceKey,
    resourceId: twlPanelId,
    links: twlLinksWithQuotes,
  })

  const processedLinks = useMemo(() => {
    if (!links.length) return []
    if (twlLinksAligned.length === links.length && links.length > 0) return twlLinksAligned
    if (twlLinksWithQuotes.length === links.length && twlLinksWithQuotes.length > 0) return twlLinksWithQuotes
    return links
  }, [links, twlLinksWithQuotes, twlLinksAligned])

  const filteredByReference = useMemo(() => {
    if (!processedLinks.length) return []
    const startChapter = currentRef.chapter || 1
    const endChapter = currentRef.endChapter || startChapter
    const startVerse = currentRef.verse || 1
    // In OBS story mode show all frames of the story; otherwise restrict to the current range.
    const isObsStoryMode = navigationMode === 'chapter' && currentRef.book === 'obs'
    const endVerse = isObsStoryMode ? Number.POSITIVE_INFINITY : (currentRef.endVerse || startVerse)

    return processedLinks.filter((link) => {
      const refParts = link.reference.split(':')
      const linkChapter = parseInt(refParts[0] || '1', 10)
      const linkVerse = parseInt(refParts[1] || '1', 10)
      if (startChapter === endChapter) {
        if (linkChapter !== startChapter) return false
        return linkVerse >= startVerse && linkVerse <= endVerse
      }
      if (linkChapter < startChapter) return false
      if (linkChapter > endChapter) return false
      if (linkChapter === startChapter) return linkVerse >= startVerse
      if (linkChapter === endChapter) return linkVerse <= endVerse
      return true
    })
  }, [processedLinks, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse, currentRef.book, navigationMode])

  const bookCodeLower = currentRef.book?.toLowerCase() || ''

  const underlineTnGroups = useMemo(() => {
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const note of notesWithAlignedTokens) {
      if (!note.quoteTokens?.length) continue
      const cached = (note as any).semanticIds as string[] | undefined
      const semanticIds = cached ?? (() => {
        const { chapter, verse } = parseLinkChapterVerse(note.reference)
        return generateSemanticIdsForQuoteTokens(note.quoteTokens!, bookCodeLower, chapter, verse, parseInt(note.occurrence || '1', 10))
      })()
      if (semanticIds.length > 0) groups.push({ sourceId: note.id, semanticIds })
    }
    return groups
  }, [notesWithAlignedTokens, bookCodeLower])

  const underlineTwlGroups = useMemo(() => {
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const link of filteredByReference) {
      if (!link.quoteTokens?.length) continue
      const cached = (link as any).semanticIds as string[] | undefined
      const semanticIds = cached ?? (() => {
        const { chapter, verse } = parseLinkChapterVerse(link.reference)
        return generateSemanticIdsForQuoteTokens(link.quoteTokens!, bookCodeLower, chapter, verse, parseInt(link.occurrence || '1', 10))
      })()
      if (semanticIds.length > 0) groups.push({ sourceId: link.id, semanticIds })
    }
    return groups
  }, [filteredByReference, bookCodeLower])

  const tokenGroupsApi = useResourceAPI<NotesTokenGroupsSignal>(resourceId)
  const obsQuotesApi = useResourceAPI<ObsFrameQuotesSignal>(resourceId)
  const lastTnKeyRef = useRef<string | null>(null)
  const lastTwlKeyRef = useRef<string | null>(null)
  const lastObsQuotesKeyRef = useRef<string | null>(null)

  useEffect(() => {
    if (helpsScope === 'obs') return
    const activeGroups = kindFilter === 'twl' ? [] : underlineTnGroups
    const key = `${kindFilter}:${activeGroups.map((g) => `${g.sourceId}:${g.semanticIds.length}`).join('|')}`
    if (key === lastTnKeyRef.current) return
    lastTnKeyRef.current = key
    const parts = (tnKey || resourceKey).split('/')
    const language = parts[1]?.split('_')[0] || ''
    tokenGroupsApi.messaging.sendToAll({
      type: 'notes-token-groups',
      lifecycle: 'state',
      stateKey: 'current-notes-token-groups-tn',
      sourceResourceId: resourceId,
      tokenGroups: activeGroups,
      resourceMetadata: { id: tnKey || resourceKey, language, type: 'tn' },
      timestamp: Date.now(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- stable messaging ref; key dedupes
  }, [resourceId, tnKey, resourceKey, underlineTnGroups, kindFilter, helpsScope])

  useEffect(() => {
    if (helpsScope === 'obs') return
    const activeGroups = kindFilter === 'notes' ? [] : underlineTwlGroups
    const key = `${kindFilter}:${activeGroups.map((g) => `${g.sourceId}:${g.semanticIds.length}`).join('|')}`
    if (key === lastTwlKeyRef.current) return
    lastTwlKeyRef.current = key
    const parts = (twlKey || resourceKey).split('/')
    const language = parts[1]?.split('_')[0] || ''
    tokenGroupsApi.messaging.sendToAll({
      type: 'notes-token-groups',
      lifecycle: 'state',
      stateKey: 'current-notes-token-groups-twl',
      sourceResourceId: resourceId,
      tokenGroups: activeGroups,
      resourceMetadata: { id: twlKey || resourceKey, language, type: 'words-links' },
      timestamp: Date.now(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId, twlKey, resourceKey, underlineTwlGroups, kindFilter, helpsScope])

  useEffect(() => {
    return () => {
      lastTnKeyRef.current = null
      lastTwlKeyRef.current = null
      // Note: we intentionally do NOT call sendToAll on unmount.
      // linked-panels validates the sourceResourceId still exists in the store,
      // so broadcasting after removal produces "Sender resource does not exist"
      // console errors. Fresh broadcasts from newly mounted viewers replace stale state.
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resourceId])

  const { displayNotes, hasNoteMatches } = useMemo(() => {
    // OBS quote filter: user clicked a quoted span in the OBS frame → show only the matching note(s)
    if (helpsScope === 'obs' && obsQuoteFilter) {
      if (obsQuoteFilter.sourceIds?.length) {
        const idSet = new Set(obsQuoteFilter.sourceIds)
        const notes = notesWithAlignedTokens.filter((n) => idSet.has(n.id))
        return { displayNotes: notes, hasNoteMatches: notes.length > 0 }
      }
      // TWL-only legacy click → hide all notes
      if (obsQuoteFilter.kind === 'twl') return { displayNotes: [], hasNoteMatches: false }
      const q = obsQuoteFilter.quote?.trim().toLowerCase() ?? ''
      const occ = obsQuoteFilter.occurrence ?? 1
      const match = notesWithAlignedTokens.find(
        (n) =>
          (obsQuoteFilter.rowId && n.id === obsQuoteFilter.rowId) ||
          (n.quote?.trim().toLowerCase() === q && Number.parseInt(String(n.occurrence ?? '1'), 10) === occ)
      )
      return { displayNotes: match ? [match] : notesWithAlignedTokens, hasNoteMatches: !!match }
    }

    if (verseFilter) {
      const filtered = notesWithAlignedTokens.filter((note) => {
        const [chapterStr, verseRange] = note.reference.split(':')
        const noteChapter = parseInt(chapterStr)
        if (isNaN(noteChapter) || noteChapter !== verseFilter.chapter) return false
        if (verseFilter.verse === undefined) return true
        if (!verseRange || verseRange === 'intro') return false
        if (verseRange.includes('-')) {
          const [start, end] = verseRange.split('-').map(Number)
          return verseFilter.verse >= start && verseFilter.verse <= end
        }
        return parseInt(verseRange) === verseFilter.verse
      })
      return { displayNotes: filtered, hasNoteMatches: filtered.length > 0 }
    }
    if (!tokenFilter) {
      return { displayNotes: notesWithAlignedTokens, hasNoteMatches: true }
    }
    const cleanToken = tokenFilter.content.toLowerCase().trim()
    const filtered = notesWithAlignedTokens.filter((note) => {
      if (note.quoteTokens && note.quoteTokens.length > 0) {
        const cached = (note as any).semanticIds as string[] | undefined
        const noteSemanticIds = cached ?? (() => {
          const refParts = note.reference.split(':')
          const ch = parseInt(refParts[0] || '1', 10)
          const vs = parseInt(refParts[1] || '1', 10)
          return generateSemanticIdsForQuoteTokens(note.quoteTokens!, bookCodeLower, ch, vs, parseInt(note.occurrence || '1', 10))
        })()
        const hasAligned = tokenFilter.alignedSemanticIds?.some((alignedId) => {
          const al = alignedId.toLowerCase()
          return noteSemanticIds.some((id) => id.toLowerCase() === al)
        })
        if (hasAligned) return true
      }
      const quoteLower = note.quote?.toLowerCase() || ''
      const hasText = quoteLower.includes(cleanToken)
      const hasQt = note.quoteTokens?.some((tok: { text: string }) => tok.text.toLowerCase().includes(cleanToken))
      return hasText || !!hasQt
    })
    return {
      displayNotes: filtered,
      hasNoteMatches: filtered.length > 0,
    }
  }, [notesWithAlignedTokens, tokenFilter, verseFilter, obsQuoteFilter, helpsScope, bookCodeLower])

  const { displayLinks, hasLinkMatches } = useMemo(() => {
    // OBS quote filter: user clicked a quoted span in the OBS frame → show only the matching link(s)
    if (helpsScope === 'obs' && obsQuoteFilter) {
      if (obsQuoteFilter.sourceIds?.length) {
        const idSet = new Set(obsQuoteFilter.sourceIds)
        const links = filteredByReference.filter((l) => idSet.has(l.id))
        return { displayLinks: links, hasLinkMatches: links.length > 0 }
      }
      // TN-only legacy click → hide all links
      if (obsQuoteFilter.kind === 'tn') return { displayLinks: [], hasLinkMatches: false }
      const q = obsQuoteFilter.quote?.trim().toLowerCase() ?? ''
      const occ = obsQuoteFilter.occurrence ?? 1
      const match = filteredByReference.find(
        (l) =>
          (obsQuoteFilter.rowId && l.id === obsQuoteFilter.rowId) ||
          (l.origWords?.trim().toLowerCase() === q && Number.parseInt(String(l.occurrence ?? '1'), 10) === occ)
      )
      return { displayLinks: match ? [match] : filteredByReference, hasLinkMatches: !!match }
    }

    if (verseFilter) {
      const filtered = filteredByReference.filter((link) => {
        const [chapterStr, verseRange] = link.reference.split(':')
        const linkChapter = parseInt(chapterStr)
        if (isNaN(linkChapter) || linkChapter !== verseFilter.chapter) return false
        if (verseFilter.verse === undefined) return true
        if (!verseRange || verseRange === 'intro') return false
        if (verseRange.includes('-')) {
          const [start, end] = verseRange.split('-').map(Number)
          return verseFilter.verse >= start && verseFilter.verse <= end
        }
        return parseInt(verseRange) === verseFilter.verse
      })
      return { displayLinks: filtered, hasLinkMatches: filtered.length > 0 }
    }
    if (!tokenFilter) {
      return { displayLinks: filteredByReference, hasLinkMatches: true }
    }
    const cleanToken = tokenFilter.content.toLowerCase().trim()
    const filtered = filteredByReference.filter((link) => {
      if (link.quoteTokens && link.quoteTokens.length > 0) {
        const cached = (link as any).semanticIds as string[] | undefined
        const linkSemanticIds = cached ?? (() => {
          const refParts = link.reference.split(':')
          const ch = parseInt(refParts[0] || '1', 10)
          const vs = parseInt(refParts[1] || '1', 10)
          return generateSemanticIdsForQuoteTokens(link.quoteTokens!, bookCodeLower, ch, vs, parseInt(link.occurrence || '1', 10))
        })()
        const hasAligned = tokenFilter.alignedSemanticIds?.some((alignedId) => {
          const al = alignedId.toLowerCase()
          return linkSemanticIds.some((id) => id.toLowerCase() === al)
        })
        if (hasAligned) return true
      }
      const ow = link.origWords?.toLowerCase() || ''
      const hasText = ow.includes(cleanToken)
      const hasQt = link.quoteTokens?.some((tok) => tok.text.toLowerCase().includes(cleanToken))
      return hasText || !!hasQt
    })
    return {
      displayLinks: filtered,
      hasLinkMatches: filtered.length > 0,
    }
  }, [filteredByReference, tokenFilter, verseFilter, obsQuoteFilter, helpsScope, bookCodeLower])

  const obsFrameQuotesForBroadcast: ObsFrameQuoteEntry[] = useMemo(() => {
    if (helpsScope !== 'obs' || currentRef.book !== 'obs') return []
    const story = currentRef.chapter
    const frame = currentRef.verse
    const refStr = `${story}:${frame}`
    const out: ObsFrameQuoteEntry[] = []
    // Use unfiltered data so underlines persist even when obsQuoteFilter is active.
    for (const note of notesWithAlignedTokens) {
      if (note.reference !== refStr) continue
      const q = note.quote?.trim()
      if (!q) continue
      const occRaw = Number.parseInt(String(note.occurrence ?? '1'), 10)
      out.push({
        sourceId: note.id,
        kind: 'tn',
        quote: q,
        occurrence: Number.isFinite(occRaw) ? occRaw : 1,
      })
    }
    for (const link of filteredByReference) {
      if (link.reference !== refStr) continue
      const q = link.origWords?.trim()
      if (!q) continue
      const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
      out.push({
        sourceId: link.id,
        kind: 'twl',
        quote: q,
        occurrence: Number.isFinite(occRaw) ? occRaw : 1,
      })
    }
    return out
  }, [helpsScope, currentRef.book, currentRef.chapter, currentRef.verse, notesWithAlignedTokens, filteredByReference])

  // Full-story frame quote map: frame number → entries (for range/story-mode OBS underlines)
  const obsFrameQuoteMap = useMemo<Record<number, ObsFrameQuoteEntry[]>>(() => {
    if (helpsScope !== 'obs' || currentRef.book !== 'obs') return {}
    const story = currentRef.chapter
    const map: Record<number, ObsFrameQuoteEntry[]> = {}
    const addEntry = (ref: string, entry: ObsFrameQuoteEntry) => {
      const [chStr, frStr] = ref.split(':')
      if (parseInt(chStr) !== story) return
      const fr = parseInt(frStr)
      if (!map[fr]) map[fr] = []
      map[fr].push(entry)
    }
    // Use unfiltered data so underlines persist even when obsQuoteFilter is active.
    for (const note of notesWithAlignedTokens) {
      const q = note.quote?.trim()
      if (!q) continue
      const occRaw = Number.parseInt(String(note.occurrence ?? '1'), 10)
      addEntry(note.reference, { sourceId: note.id, kind: 'tn', quote: q, occurrence: Number.isFinite(occRaw) ? occRaw : 1 })
    }
    for (const link of filteredByReference) {
      const q = link.origWords?.trim()
      if (!q) continue
      const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
      addEntry(link.reference, { sourceId: link.id, kind: 'twl', quote: q, occurrence: Number.isFinite(occRaw) ? occRaw : 1 })
    }
    return map
  }, [helpsScope, currentRef.book, currentRef.chapter, notesWithAlignedTokens, filteredByReference])

  useEffect(() => {
    lastObsQuotesKeyRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse, helpsScope])

  useEffect(() => {
    if (helpsScope !== 'obs') return
    const key = `${currentRef.book}:${currentRef.chapter}:${currentRef.verse}:${kindFilter}:${obsFrameQuotesForBroadcast
      .map((q) => `${q.sourceId}:${q.quote}:${q.occurrence}`)
      .join('|')}`
    if (key === lastObsQuotesKeyRef.current) return
    lastObsQuotesKeyRef.current = key
    const storyNumber = currentRef.book === 'obs' ? currentRef.chapter : 0
    const frameNumber = currentRef.book === 'obs' ? currentRef.verse : 0
    obsQuotesApi.messaging.sendToAll({
      type: 'obs-frame-quotes',
      lifecycle: 'state',
      stateKey: 'current-obs-frame-quotes',
      sourceResourceId: resourceId,
      storyNumber,
      frameNumber,
      quotes: currentRef.book === 'obs' ? obsFrameQuotesForBroadcast : [],
      frameQuoteMap: currentRef.book === 'obs' ? obsFrameQuoteMap : undefined,
      timestamp: Date.now(),
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    helpsScope,
    resourceId,
    currentRef.book,
    currentRef.chapter,
    currentRef.verse,
    kindFilter,
    obsFrameQuotesForBroadcast,
    obsFrameQuoteMap,
  ])

  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (helpsScope !== 'obs') return
        if (signal.highlight === null) {
          setObsQuoteFilter(null)
          setSelectedNoteId(null)
          setSelectedLinkId(null)
          return
        }
        const h = signal.highlight
        if (currentRef.book !== 'obs' || h.storyNumber !== currentRef.chapter) return
        const isObsStoryMode = navigationMode === 'chapter'
        if (!isObsStoryMode && h.frameNumber !== currentRef.verse) return
        if (h.overlappingSourceIds?.length) {
          setObsQuoteFilter({
            sourceIds: h.overlappingSourceIds,
            wordIndex: h.wordIndex,
            quote: h.quote,
            occurrence: h.occurrence,
            rowId: h.rowId,
            kind: h.kind,
          })
          const firstTn = notesWithAlignedTokens.find((n) => h.overlappingSourceIds!.includes(n.id))
          const firstTwl = filteredByReference.find((l) => h.overlappingSourceIds!.includes(l.id))
          setSelectedNoteId(firstTn?.id ?? null)
          setSelectedLinkId(firstTwl?.id ?? null)
          return
        }
        if (h.quote === undefined || h.occurrence === undefined) return
        // Legacy substring pick — include kind so each list knows whether to show or hide itself entirely.
        setObsQuoteFilter({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId, kind: h.kind })
        if (h.rowId) {
          if (notesWithAlignedTokens.some((n) => n.id === h.rowId)) {
            setSelectedNoteId(h.rowId)
            setSelectedLinkId(null)
            return
          }
          if (filteredByReference.some((l) => l.id === h.rowId)) {
            setSelectedLinkId(h.rowId)
            setSelectedNoteId(null)
            return
          }
        }
        const nq = h.quote.trim().toLowerCase()
        for (const note of notesWithAlignedTokens) {
          if ((note.quote || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(note.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedNoteId(note.id)
            setSelectedLinkId(null)
            return
          }
        }
        for (const link of filteredByReference) {
          if ((link.origWords || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(link.occurrence ?? '1'), 10)
          if (occ === h.occurrence) {
            setSelectedLinkId(link.id)
            setSelectedNoteId(null)
            return
          }
        }
      },
      [
        resourceId,
        helpsScope,
        currentRef.book,
        currentRef.chapter,
        currentRef.verse,
        navigationMode,
        notesWithAlignedTokens,
        filteredByReference,
      ]
    ),
    { debug: false, resourceMetadata }
  )

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

  useEffect(() => {
    if (!displayNotes.length) return
    displayNotes.forEach((note) => {
      if (note.supportReference?.startsWith('rc://')) fetchTATitle(note)
    })
  }, [displayNotes, fetchTATitle])

  useEffect(() => {
    if (!displayNotes.length) return
    displayNotes.forEach((note) => {
      if (!note.note) return
      const rcLinkPattern = /rc:\/\/[^\s\])\n]+/g
      const matches = note.note.match(rcLinkPattern)
      matches?.forEach((rcLink) => fetchEntryTitle(rcLink))
    })
  }, [displayNotes, fetchEntryTitle, entryTitleRefreshTrigger])

  useEffect(() => {
    if (!displayLinks.length) return
    displayLinks.forEach((link) => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      if (!twTitles.has(cacheKey) && !twLoadingTitles.has(cacheKey)) fetchTWTitle(link)
    })
  }, [displayLinks, twTitles, twLoadingTitles, fetchTWTitle])

  const mergedRows = useMemo(() => {
    /**
     * Compute sort positions for an array of entries.
     * Entries with alignedTokens get their first token's position.
     * Entries without alignedTokens inherit the position of the preceding entry
     * in the same data array + 0.5 (chained, so consecutive unaligned entries
     * don't collapse on each other). This keeps each unaligned entry right after
     * its predecessor in TSV order rather than pushing it to the end of the verse.
     */
    function inheritedPositions(entries: Array<{ alignedTokens?: Array<{ position: number }> }>): number[] {
      const positions: number[] = []
      for (let i = 0; i < entries.length; i++) {
        const direct = entries[i]?.alignedTokens?.[0]?.position
        if (direct !== undefined) {
          positions.push(direct)
        } else {
          positions.push(i > 0 ? positions[i - 1]! + 0.5 : -1)
        }
      }
      return positions
    }

    const rows: MergedRow[] = []

    if (kindFilter !== 'twl') {
      const tnPositions = inheritedPositions(displayNotes as Array<{ alignedTokens?: Array<{ position: number }> }>)
      for (let i = 0; i < displayNotes.length; i++) {
        const note = displayNotes[i]!
        const { chapter, verse } = refSortParts(note.reference)
        rows.push({
          kind: 'tn',
          ref: note.reference,
          sortChapter: chapter,
          sortVerse: verse,
          sortPosition: tnPositions[i]!,
          note,
        })
      }
    }

    if (kindFilter !== 'notes') {
      const twlPositions = inheritedPositions(displayLinks as Array<{ alignedTokens?: Array<{ position: number }> }>)
      for (let i = 0; i < displayLinks.length; i++) {
        const link = displayLinks[i]!
        const { chapter, verse } = refSortParts(link.reference)
        rows.push({
          kind: 'twl',
          ref: link.reference,
          sortChapter: chapter,
          sortVerse: verse,
          sortPosition: twlPositions[i]!,
          link,
        })
      }
    }

    rows.sort((a, b) => {
      if (a.sortChapter !== b.sortChapter) return a.sortChapter - b.sortChapter
      if (a.sortVerse !== b.sortVerse) return a.sortVerse - b.sortVerse
      if (a.sortPosition !== b.sortPosition) return a.sortPosition - b.sortPosition
      // Tiebreaker when positions are equal (both unaligned at same inherited slot)
      if (a.kind !== b.kind) return a.kind === 'tn' ? -1 : 1
      const idA = a.kind === 'tn' ? a.note.id : a.link.id
      const idB = b.kind === 'tn' ? b.note.id : b.link.id
      return String(idA).localeCompare(String(idB))
    })

    return rows
  }, [displayNotes, displayLinks, kindFilter])

  const mergedGroups = useMemo(() => {
    const groups: { ref: string; items: MergedRow[] }[] = []
    for (const row of mergedRows) {
      const last = groups[groups.length - 1]
      if (last && last.ref === row.ref) last.items.push(row)
      else groups.push({ ref: row.ref, items: [row] })
    }
    return groups
  }, [mergedRows])

  const handleNoteSelect = useCallback((note: { id: string }) => {
    setSelectedNoteId(note.id)
  }, [])

  const handleNoteQuoteClick = useCallback(
    (note: NoteWithTokens) => {
      if (helpsScope === 'obs') {
        const quote = note.quote?.trim()
        if (!quote) return
        const refParts = note.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const occRaw = Number.parseInt(String(note.occurrence ?? '1'), 10)
        const occurrence = Number.isFinite(occRaw) ? occRaw : 1
        setSelectedNoteId(note.id)
        broadcastObsHighlight({
          lifecycle: 'event',
          highlight: {
            storyNumber: chapter,
            frameNumber: verse,
            quote,
            occurrence,
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
      const book = currentRef.book?.toLowerCase() || ''
      const baseOccurrence = parseInt(note.occurrence || '1', 10)
      const semanticIds = generateSemanticIdsForQuoteTokens(note.quoteTokens, book, chapter, verse, baseOccurrence)
      const firstToken = note.quoteTokens[0]
      if (!firstToken) return
      sendTokenClick({
        lifecycle: 'event',
        token: {
          id: String(firstToken.id),
          content: firstToken.text,
          semanticId: semanticIds[0],
          verseRef: `${book} ${chapter}:${verse}`,
          position: 0,
          strong: firstToken.strong,
          lemma: firstToken.lemma,
          morph: firstToken.morph,
          alignedSemanticIds: semanticIds,
        },
      })
    },
    [currentRef.book, helpsScope, broadcastObsHighlight, sendTokenClick]
  )

  const handleSupportReferenceClick = useCallback(
    (supportRef: string) => {
      const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
      if (match && onEntryLinkClick) {
        const entryId = match[1]
        const parts = (tnKey || resourceKey).split('/')
        const language = parts.length >= 2 ? parts[1] : 'en'
        const owner = parts[0] || 'unfoldingWord'
        onEntryLinkClick(`${owner}/${language}/ta`, entryId)
      }
    },
    [tnKey, resourceKey, onEntryLinkClick]
  )

  const handleTitleClick = useCallback(
    (link: TranslationWordsLink) => {
      setSelectedLinkId(link.id)
      const twInfo = parseTWLink(link.twLink)
      const parts = (twlKey || resourceKey).split('/')
      if (parts.length < 2) return
      const [owner, langResource] = parts
      const language = langResource.split('_')[0]
      const twResourceKey = `${owner}/${language}/tw`
      const entryId = `bible/${twInfo.category}/${twInfo.term}`
      onEntryLinkClick?.(twResourceKey, entryId)
      sendEntryLinkClick({
        lifecycle: 'event',
        link: {
          resourceType: 'words',
          resourceId: twResourceKey,
          entryId,
          text: twInfo.term,
        },
      })
    },
    [twlKey, resourceKey, onEntryLinkClick, sendEntryLinkClick]
  )

  const handleLinkQuoteClick = useCallback(
    (link: TranslationWordsLink) => {
      setSelectedLinkId(link.id)
      if (helpsScope === 'obs') {
        const quote = link.origWords?.trim()
        if (!quote) return
        const refParts = link.reference.split(':')
        const chapter = parseInt(refParts[0] || '1', 10)
        const verse = parseInt(refParts[1] || '1', 10)
        const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
        const occurrence = Number.isFinite(occRaw) ? occRaw : 1
        broadcastObsHighlight({
          lifecycle: 'event',
          highlight: {
            storyNumber: chapter,
            frameNumber: verse,
            quote,
            occurrence,
            rowId: link.id,
            kind: 'twl',
          },
        })
        return
      }
      if (!link.quoteTokens?.length) return
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const book = currentRef.book?.toLowerCase() || ''
      const baseOccurrence = parseInt(link.occurrence || '1', 10)
      const semanticIds = generateSemanticIdsForQuoteTokens(link.quoteTokens, book, chapter, verse, baseOccurrence)
      link.quoteTokens.forEach((token, index) => {
        const semanticId = semanticIds[index]
        if (!semanticId) return
        sendTokenClick({
          lifecycle: 'event',
          token: {
            id: String(token.id),
            content: token.text,
            semanticId,
            verseRef: `${book} ${chapter}:${verse}`,
            position: index,
            strong: token.strong,
            lemma: token.lemma,
            morph: token.morph,
            alignedSemanticIds: [semanticId],
          },
        })
      })
    },
    [currentRef.book, helpsScope, broadcastObsHighlight, sendTokenClick]
  )

  const depsOk = (!tnKey || tnDepsReady) && (!twlKey || twlDepsReady)
  const loading = (tnKey && tnLoading) || (twlKey && twlLoading)
  const noSources = !tnKey && !twlKey

  const FilterButton = ({
    active,
    icon,
    label,
    value,
  }: {
    active: boolean
    icon: React.ReactNode
    label: string
    value: HelpsKindFilter
  }) => (
    <button
      type="button"
      onClick={() => setKindFilter(value)}
      title={label}
      aria-label={label}
      className={`rounded-full p-1.5 transition-colors ${
        active
          ? 'bg-violet-600 text-white shadow-sm'
          : 'border border-violet-300 text-violet-800 bg-white hover:bg-violet-50'
      }`}
    >
      {icon}
    </button>
  )

  return (
    <div className="h-full flex flex-col">
      {obsQuoteFilter && (
        <TokenFilterBanner
          tokenFilter={{
            semanticId: '',
            content:
              obsQuoteFilter.quote?.trim() ||
              (obsQuoteFilter.wordIndex != null ? `Word ${obsQuoteFilter.wordIndex + 1}` : 'Frame selection'),
            alignedSemanticIds: [],
            timestamp: 0,
          }}
          displayLinksCount={displayCount}
          hasMatches={hasMatches}
          onClearFilter={() => { setObsQuoteFilter(null); setSelectedNoteId(null); setSelectedLinkId(null) }}
        />
      )}
      {!obsQuoteFilter && tokenFilter && (
        <TokenFilterBanner
          tokenFilter={tokenFilter}
          displayLinksCount={displayCount}
          hasMatches={hasMatches}
          onClearFilter={() => setTokenFilter(null)}
        />
      )}
      {!obsQuoteFilter && verseFilter && (
        <TokenFilterBanner
          tokenFilter={{
            semanticId: '',
            content:
              verseFilter.verse !== undefined ? `${verseFilter.chapter}:${verseFilter.verse}` : `Ch ${verseFilter.chapter}`,
            alignedSemanticIds: [],
            timestamp: verseFilter.timestamp,
          }}
          displayLinksCount={displayCount}
          hasMatches={hasMatches}
          onClearFilter={() => setVerseFilter(null)}
        />
      )}

      <div className="flex-1 overflow-y-auto bg-gray-50" dir={targetLanguageDirection}>
        <ResourceViewerHeader
          title={resource.title}
          icon={Layers}
          direction={targetLanguageDirection}
          actions={
            <div className="flex items-center gap-1">
              <FilterButton active={kindFilter === 'all'} icon={<LayoutList className="w-3.5 h-3.5" />} label="All" value="all" />
              <FilterButton active={kindFilter === 'notes'} icon={<NotebookPen className="w-3.5 h-3.5" />} label="Notes" value="notes" />
              <FilterButton active={kindFilter === 'twl'} icon={<BookMarked className="w-3.5 h-3.5" />} label="Word Links" value="twl" />
            </div>
          }
        />
        <div className="p-4">
          {noSources ? (
            <div className="text-center py-12 text-gray-500 text-sm">
              <FileText className="w-10 h-10 mx-auto mb-2 text-gray-300" />
              <p>No Translation Notes or Word Links found for this language.</p>
            </div>
          ) : !depsOk ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading dependencies">
              <Loader className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : loading ? (
            <div className="flex items-center justify-center py-12" role="status" aria-label="Loading helps">
              <Loader className="w-8 h-8 text-violet-500 animate-spin" />
            </div>
          ) : (
            <>
              {tnError && tnKey ? (
                <p className="text-xs text-amber-700 mb-2">{tnError}</p>
              ) : null}
              {twlError && twlKey ? (
                <p className="text-xs text-amber-700 mb-2">{twlError}</p>
              ) : null}
              {mergedGroups.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-gray-400">
                  <BookOpen className="w-14 h-14 mb-2 opacity-70" />
                  <p className="text-sm">No entries for this passage.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {mergedGroups.map((group) => {
                    const bookCode = currentRef.book || 'gen'
                    const resolved = getBookTitleWithFallback(effectiveResource, bookTitleSource, bookCode)
                    return (
                      <div key={group.ref} className="space-y-3">
                        <div
                          className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-violet-50 to-gray-100/50 rounded-lg"
                          dir={targetLanguageDirection}
                        >
                          <BookOpen className="w-3.5 h-3.5 text-violet-600" />
                          <h3 className="text-xs font-semibold text-gray-700">
                            {(() => {
                              const { bookPart, numberPart } = formatVerseRefParts(
                                resolved,
                                group.ref,
                                targetLanguageDirection === 'rtl'
                              )
                              return targetLanguageDirection === 'rtl' ? (
                                <span className="inline-flex flex-row-reverse gap-1" dir="rtl">
                                  <span>{numberPart}</span>
                                  <span>{bookPart}</span>
                                </span>
                              ) : (
                                <span className="inline-flex gap-1" dir="ltr">
                                  <span>{bookPart}</span>
                                  <span>{numberPart}</span>
                                </span>
                              )
                            })()}
                          </h3>
                          <span className="ml-auto px-2 py-0.5 bg-violet-100/60 text-violet-800 rounded-full text-[10px] font-medium">
                            {group.items.length}
                          </span>
                        </div>

                        {group.items.map((item, idx) => {
                          if (item.kind === 'tn') {
                            const note = item.note
                            const entryTitle = note.supportReference?.startsWith('rc://')
                              ? getEntryTitle(note.supportReference)
                              : null
                            const taTitle = entryTitle ?? getTATitle(note)
                            const isLoadingTitle = note.supportReference
                              ? loadingTitles.has(note.supportReference.match(/rc:\/\/\*\/ta\/man\/(.+)/)?.[1] || '')
                              : false
                            return (
                              <div key={`tn-${note.id}-${idx}`}>
                                <TranslationNoteCard
                                  note={note}
                                  isSelected={selectedNoteId === note.id}
                                  onSupportReferenceClick={handleSupportReferenceClick}
                                  onEntryLinkClick={onEntryLinkClick}
                                  onQuoteClick={handleNoteQuoteClick}
                                  onClick={handleNoteSelect}
                                  targetResourceId={targetSourceId || undefined}
                                  resourceKey={tnKey || resourceKey}
                                  languageDirection={targetLanguageDirection}
                                  taTitle={taTitle}
                                  isLoadingTATitle={isLoadingTitle}
                                  getEntryTitle={getEntryTitle}
                                  obsMode={helpsScope === 'obs'}
                                />
                              </div>
                            )
                          }
                          const link = item.link
                          const twInfo = parseTWLink(link.twLink)
                          const twTitle = getTWTitle(link)
                          const isLoadingTwTitle = twLoadingTitles.has(`${twInfo.category}/${twInfo.term}`)
                          return (
                            <div key={`twl-${link.id}-${idx}`}>
                              <WordLinkCard
                                link={link}
                                isSelected={selectedLinkId === link.id}
                                twTitle={twTitle}
                                isLoadingTitle={isLoadingTwTitle}
                                onTitleClick={handleTitleClick}
                                onQuoteClick={handleLinkQuoteClick}
                                tokenFilter={tokenFilter}
                                targetResourceId={targetSourceId}
                                languageDirection={targetLanguageDirection}
                                obsMode={helpsScope === 'obs'}
                              />
                            </div>
                          )
                        })}
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  )
}
