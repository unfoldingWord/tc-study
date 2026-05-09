/**
 * WordsLinksViewer - Displays Translation Words Links
 * 
 * Shows which words in a verse link to Translation Words articles.
 * Supports:
 * - Filtering by chapter/verse reference
 * - Token-click filtering from scripture
 * - Fetching TW article titles dynamically
 * - Building original language quotes from tokens
 * - Opening TW articles via inter-panel communication
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { useResourceAPI } from 'linked-panels'
import { BookOpen, BookX, Link, Loader } from 'lucide-react'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useCatalogManager, useCurrentReference, useNavigationMode, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import { RESOURCE_TYPE_IDS } from '../../../resourceTypes/resourceTypeIds'
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
import { TokenFilterBanner, WordLinkCard } from './components'
import {
    useAlignedTokens,
    useQuoteTokens,
    useScriptureTokens,
    useTWTitles,
    useWordsLinksContent,
} from './hooks'
import type { TokenFilter, WordsLinksViewerProps } from './types'
import { generateSemanticIdsForQuoteTokens, parseLinkChapterVerse, parseTWLink } from './utils'

export function WordsLinksViewer({
  resourceId,
  resourceKey,
  resource,
  wordsLinksContent,
  onEntryLinkClick,
}: WordsLinksViewerProps) {
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const bookTitleSource = useBookTitleSource()
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource

  // Resolve the TW resource key from the workspace — OBS-TWL may be owned by a GL org
  // (e.g. es-419_gl/en/obs-twl) while the TW dictionary is always unfoldingWord/en/tw.
  const twResourceKeyFromStore = useAppStore((s) => {
    const lang = resourceKey.split('/')[1]?.split('_')[0] ?? ''
    const entry = Object.values(s.loadedResources).find(
      (r: any) => (r.type === 'words' || r.type === RESOURCE_TYPE_IDS.TRANSLATION_WORDS) &&
        r.language === lang
    )
    return entry ? (entry.key ?? entry.id ?? entry.resourceKey) : null
  })

  // Determine whether this viewer is rendering OBS TWL or scripture TWL.
  // Check both the resource key (reliable, always correct) and the stored type.
  // The stored type can be stale (e.g. degraded from 'obs-words-links' to 'words-links'
  // if the ResourceType enum didn't include the app-level ID at load time).
  const resourceIdFromKey = resourceKey.split('/')[2] ?? ''
  const loaderTypeId: string =
    resourceIdFromKey.startsWith('obs-') ||
    String(effectiveResource?.type ?? resource?.type ?? '').includes('obs')
      ? RESOURCE_TYPE_IDS.OBS_WORDS_LINKS
      : RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS

  const availableLanguages = useWorkspaceStore((s) => s.availableLanguages)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  // OBS-only: filter to the single entry whose quote was clicked in the OBS frame text
  const [obsQuoteFilter, setObsQuoteFilter] = useState<{ quote: string; occurrence: number; rowId?: string } | null>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
  const [verseFilter, setVerseFilter] = useState<{ chapter: number; verse?: number; timestamp: number } | null>(null)
  const [dependenciesReady, setDependenciesReady] = useState(false)
  const [catalogTrigger, setCatalogTrigger] = useState(0)
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)

  // Resolve RTL: list first, then catalog, then known RTL codes (so /read/ar works before APIs load)
  const languageCode = resource?.language ?? resourceKey.split('/')[1]?.split('_')[0] ?? ''
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const languageDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )

  // Load catalog metadata for direction
  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => { cancelled = true }
  }, [resourceKey, catalogManager])

  // Load TWL content — pass the derived loaderTypeId so OBS TWL uses 'obs-words-links'
  const { content, loading, error } = useWordsLinksContent({
    resourceKey,
    wordsLinksContent,
    loaderTypeId,
  })
  
  // Determine resource metadata for signal system
  const resourceMetadata = useMemo(() => {
    const parts = resourceKey.split('/')
    const owner = parts[0] || ''
    const language = parts[1]?.split('_')[0] || ''
    return {
      type: loaderTypeId as 'words-links' | 'obs-words-links',
      language,
      owner,
      tags: [loaderTypeId],
    }
  }, [resourceKey, loaderTypeId])
  
  // Get signal sender for entry-link-click
  const { sendToAll: sendEntryLinkClick } = useSignal<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    resourceMetadata
  )

  // Get signal sender for token-click (to highlight aligned tokens in target language panels)
  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    resourceMetadata
  )

  // OBS: broadcast obs-frame-highlight (bidirectional: quote click → OBS viewer)
  const { sendToAll: broadcastObsHighlight } = useSignal<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    resourceMetadata
  )
  
  // Listen for token-click signals from scripture
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal) => {
      if (signal.sourceResourceId === resourceId) {
        return
      }
      
      // Store filter (UI will show blue/amber banner)
      setTokenFilter({
        semanticId: signal.token.semanticId,
        content: signal.token.content,
        alignedSemanticIds: signal.token.alignedSemanticIds || [],
        timestamp: signal.timestamp,
      })
      setVerseFilter(null)
      setSelectedLink(null)
    }, [resourceId]),
    {
      debug: false,  // Reduced logging
      resourceMetadata,
    }
  )

  // Listen for verse-filter signals from scripture (for filtering links by verse/chapter)
  useSignalHandler<VerseFilterSignal>(
    'verse-filter',
    resourceId,
    useCallback((signal) => {
      if (signal.sourceResourceId === resourceId) return
      setVerseFilter({
        chapter: signal.filter.chapter,
        verse: signal.filter.verse,
        timestamp: signal.timestamp,
      })
      setTokenFilter(null)
      setSelectedLink(null)
    }, [resourceId]),
    { debug: false, resourceMetadata }
  )
  
  // Monitor catalog for changes (to react when dependencies are added)
  useEffect(() => {
    const checkCatalog = async () => {
      const keys = await catalogManager.getAllResourceKeys()
      setCatalogTrigger(keys.length)
    }
    checkCatalog()
    
    // Recheck periodically (slower to avoid re-render thrashing)
    const interval = setInterval(checkCatalog, 5000)
    return () => clearInterval(interval)
  }, [catalogManager])
  
  // Check if dependencies are ready
  useEffect(() => {
    const checkDeps = async () => {
      const parts = resourceKey.split('/')
      if (parts.length < 2) {
        setDependenciesReady(true)
        return
      }
      
      const owner = parts[0]
      const language = parts.length === 3 ? parts[1] : parts[1].split('_')[0]
      
      const ready = await checkDependenciesReady(
        loaderTypeId,
        language,
        owner,
        resourceTypeRegistry,
        catalogManager,
        false
      )
      
      setDependenciesReady(ready)
    }
    
    checkDeps()
  }, [resourceKey, loaderTypeId, resourceTypeRegistry, catalogManager, catalogTrigger])
  
  // Clear filters when reference changes
  useEffect(() => {
    setTokenFilter(null)
    setVerseFilter(null)
    setObsQuoteFilter(null)
    setSelectedLink(null)
  }, [currentRef.book, currentRef.chapter, currentRef.verse])
  
  // Parse links from content (add articlePath if missing)
  const links = useMemo(() => {
    if (!content?.links) return []
    
    return content.links.map(link => ({
      ...link,
      articlePath: link.articlePath || (() => {
        if (!link.twLink) return ''
        const match = link.twLink.match(/rc:\/\/\*\/tw\/dict\/(.+)$/)
        return match ? match[1] : ''
      })(),
    }))
  }, [content])
  
  // Fetch TW titles
  const { twTitles, loadingTitles, fetchTWTitle, getTWTitle } = useTWTitles(resourceKey)
  
  // Build quote tokens from original language (use processed links with articlePath)
  const { linksWithQuotes, loadingOriginal, originalError, hasOriginalContent } = useQuoteTokens({
    resourceKey,
    resourceId,
    links: links, // Use processed links instead of raw content?.links
  })
  
  // Get source resource ID from scripture broadcasts (for quote attribution only)
  const { sourceResourceId: targetSourceId } = useScriptureTokens({ resourceId })
  // Use same book title source as TN: getBookTitleWithFallback(ownResource, bookTitleSource, bookCode)
  // bookTitleSource = last active scripture or anchor (set by ScriptureViewer), so we get localized name when that scripture is in the same language.
  
  // Get aligned tokens from target language scripture (e.g., ULT)
  const { linksWithAlignedTokens, loadingAligned, alignedError, hasTargetContent } = useAlignedTokens({
    resourceKey,
    resourceId,
    links: linksWithQuotes,
  })
  
  // Use links with aligned tokens (target language) for display
  const processedLinks = useMemo(() => {
    // Ensure all arrays exist
    if (!links || !linksWithQuotes || !linksWithAlignedTokens) {
      return links || []
    }
    
    // Prefer aligned tokens (target language) over original language tokens
    if (linksWithAlignedTokens.length === links.length && links.length > 0) {
      return linksWithAlignedTokens
    }
    // Fall back to original language tokens if no aligned tokens
    if (linksWithQuotes.length === links.length && links.length > 0) {
      return linksWithQuotes
    }
    return links
  }, [links, linksWithQuotes, linksWithAlignedTokens])
  
  // Filter links by current reference (supports cross-chapter ranges)
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
      
      // Case 1: Single chapter range (e.g., JON 1:5-10)
      if (startChapter === endChapter) {
        if (linkChapter !== startChapter) return false
        return linkVerse >= startVerse && linkVerse <= endVerse
      }
      
      // Case 2: Cross-chapter range (e.g., JON 1:16-2:3)
      // Link is before start of range
      if (linkChapter < startChapter) return false
      // Link is after end of range
      if (linkChapter > endChapter) return false
      
      // Link is in starting chapter - include verses from startVerse onwards
      if (linkChapter === startChapter) {
        return linkVerse >= startVerse
      }
      
      // Link is in ending chapter - include verses up to endVerse
      if (linkChapter === endChapter) {
        return linkVerse <= endVerse
      }
      
      // Link is in intermediate chapter - include all verses
      return true
    })
  }, [processedLinks, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse, currentRef.book, navigationMode])

  /** Semantic ID groups for passive scripture underlining (all TWL links in current passage range). */
  const underlineTokenGroups = useMemo(() => {
    const bookCode = currentRef.book?.toLowerCase() || ''
    const groups: { sourceId: string; semanticIds: string[] }[] = []
    for (const link of filteredByReference) {
      if (!link.quoteTokens?.length) continue
      const cached = (link as any).semanticIds as string[] | undefined
      const semanticIds = cached ?? (() => {
        const { chapter, verse } = parseLinkChapterVerse(link.reference)
        return generateSemanticIdsForQuoteTokens(link.quoteTokens!, bookCode, chapter, verse, parseInt(link.occurrence || '1', 10))
      })()
      if (semanticIds.length > 0) {
        groups.push({ sourceId: link.id, semanticIds })
      }
    }
    return groups
  }, [filteredByReference, currentRef.book])

  const twlTokenGroupsApi = useResourceAPI<NotesTokenGroupsSignal>(resourceId)

  const lastTwlBroadcastKeyRef = useRef<string | null>(null)

  useEffect(() => {
    const key = underlineTokenGroups.map(g => `${g.sourceId}:${g.semanticIds.length}`).join('|')
    if (key === lastTwlBroadcastKeyRef.current) return
    lastTwlBroadcastKeyRef.current = key

    const parts = resourceKey.split('/')
    const language = parts[1]?.split('_')[0] || ''
    twlTokenGroupsApi.messaging.sendToAll({
      type: 'notes-token-groups',
      lifecycle: 'state',
      stateKey: 'current-notes-token-groups-twl',
      sourceResourceId: resourceId,
      tokenGroups: underlineTokenGroups,
      resourceMetadata: { id: resourceKey, language, type: 'words-links' },
      timestamp: Date.now(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps -- messaging ref is stable; key guards content changes
  }, [resourceId, resourceKey, underlineTokenGroups])

  useEffect(() => {
    return () => {
      lastTwlBroadcastKeyRef.current = null
      twlTokenGroupsApi.messaging.sendToAll({
        type: 'notes-token-groups',
        lifecycle: 'state',
        stateKey: 'current-notes-token-groups-twl',
        sourceResourceId: resourceId,
        tokenGroups: [],
        resourceMetadata: { id: resourceKey, language: '', type: 'words-links' },
        timestamp: Date.now(),
      })
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- messaging ref is stable
  }, [resourceId])
  
  // Apply verse filter, token filter, or OBS quote filter if active
  const { displayLinks, hasMatches } = useMemo(() => {
    // OBS quote filter: user clicked a quoted span in the OBS frame → show only the matching entry
    if (loaderTypeId === RESOURCE_TYPE_IDS.OBS_WORDS_LINKS && obsQuoteFilter) {
      const match = filteredByReference.find(
        (l) =>
          (obsQuoteFilter.rowId && l.id === obsQuoteFilter.rowId) ||
          (l.origWords?.trim().toLowerCase() === obsQuoteFilter.quote.trim().toLowerCase() &&
            Number.parseInt(String(l.occurrence ?? '1'), 10) === obsQuoteFilter.occurrence)
      )
      return { displayLinks: match ? [match] : filteredByReference, hasMatches: !!match }
    }

    // Verse filter: narrow by reference (chapter/verse click)
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
      return { displayLinks: filtered, hasMatches: filtered.length > 0 }
    }

    // Token filter: alignment-based matching
    if (!tokenFilter) {
      return { displayLinks: filteredByReference, hasMatches: true }
    }
    
    const cleanToken = tokenFilter.content.toLowerCase().trim()
    const bookCode = currentRef.book?.toLowerCase() || ''
    
    const filtered = filteredByReference.filter((link) => {
      // STRATEGY 1: Alignment-based matching (PRIMARY)
      if (link.quoteTokens && link.quoteTokens.length > 0) {
        const cached = (link as any).semanticIds as string[] | undefined
        const linkSemanticIds = cached ?? (() => {
          const refParts = link.reference.split(':')
          const ch = parseInt(refParts[0] || '1', 10)
          const vs = parseInt(refParts[1] || '1', 10)
          return generateSemanticIdsForQuoteTokens(link.quoteTokens!, bookCode, ch, vs, parseInt(link.occurrence || '1', 10))
        })()
        
        const hasAlignedMatch = tokenFilter.alignedSemanticIds?.some(alignedId => {
          const alignedIdLower = alignedId.toLowerCase()
          return linkSemanticIds.some(linkSemanticId => 
            linkSemanticId.toLowerCase() === alignedIdLower
          )
        })
        
        if (hasAlignedMatch) return true
      }
      
      // STRATEGY 2: Text-based fuzzy matching (FALLBACK)
      const origWordsLower = link.origWords?.toLowerCase() || ''
      const hasTextMatch = origWordsLower.includes(cleanToken)
      
      // STRATEGY 3: Quote token text matching (ORIGINAL LANGUAGE)
      const hasQuoteTokenMatch = link.quoteTokens?.some(token => 
        token.text.toLowerCase().includes(cleanToken)
      )
      
      return hasTextMatch || hasQuoteTokenMatch
    })
    
    const hasMatches = filtered.length > 0
    return {
      displayLinks: hasMatches ? filtered : filteredByReference,
      hasMatches,
    }
  }, [filteredByReference, tokenFilter, verseFilter, obsQuoteFilter, loaderTypeId, currentRef.book])
  
  // Load TW titles for visible links
  useEffect(() => {
    if (!displayLinks.length) return
    
    displayLinks.forEach(link => {
      const twInfo = parseTWLink(link.twLink)
      const cacheKey = `${twInfo.category}/${twInfo.term}`
      
      if (!twTitles.has(cacheKey) && !loadingTitles.has(cacheKey)) {
        fetchTWTitle(link)
      }
    })
  }, [displayLinks, twTitles, loadingTitles, fetchTWTitle])
  
  // Group links by chapter and verse (for cross-chapter range support)
  const linksByVerse = useMemo(() => {
    const grouped: Record<string, typeof displayLinks> = {}
    
    displayLinks.forEach(link => {
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      
      // Use "chapter:verse" as key to support cross-chapter ranges
      const key = `${chapter}:${verse}`
      
      if (!grouped[key]) {
        grouped[key] = []
      }
      grouped[key].push(link)
    })
    
    return grouped
  }, [displayLinks])
  
  // Handle clicking on TW article title (opens modal only)
  const handleTitleClick = useCallback((link: typeof displayLinks[0]) => {
    setSelectedLink(link.id)
    
    const twInfo = parseTWLink(link.twLink)
    const parts = resourceKey.split('/')
    if (parts.length < 2) return
    
    const language = (parts[1] ?? '').split('_')[0]
    // Prefer the workspace-resolved TW key so OBS-TWL (owned by a GL org like es-419_gl)
    // opens the correct unfoldingWord/en/tw resource instead of es-419_gl/en/tw.
    const twResourceKey = twResourceKeyFromStore ?? `${parts[0]}/${language}/tw`
    const entryId = `bible/${twInfo.category}/${twInfo.term}`
    
    // Open TW article in modal
    if (onEntryLinkClick) {
      onEntryLinkClick(twResourceKey, entryId)
    }
    
    sendEntryLinkClick({
      lifecycle: 'event',
      link: {
        resourceType: 'words',
        resourceId: twResourceKey,
        entryId,
        text: twInfo.term,
      },
    })
  }, [resourceKey, twResourceKeyFromStore, onEntryLinkClick, sendEntryLinkClick])
  
  // Handle clicking on quote text
  const handleQuoteClick = useCallback((link: typeof displayLinks[0]) => {
    setSelectedLink(link.id)

    // OBS mode: highlight frame text in the OBS viewer
    if (loaderTypeId === RESOURCE_TYPE_IDS.OBS_WORDS_LINKS) {
      const quote = link.origWords?.trim()
      if (!quote) return
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const occRaw = Number.parseInt(String(link.occurrence ?? '1'), 10)
      broadcastObsHighlight({
        lifecycle: 'event',
        highlight: {
          storyNumber: chapter,
          frameNumber: verse,
          quote,
          occurrence: Number.isFinite(occRaw) ? occRaw : 1,
          rowId: link.id,
        },
      })
      return
    }

    // Scripture mode: send token-click signals for each original language quote token
    if (link.quoteTokens && link.quoteTokens.length > 0) {
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const bookCode = currentRef.book?.toLowerCase() || ''
      const baseOccurrence = parseInt(link.occurrence || '1', 10)
      const semanticIds = generateSemanticIdsForQuoteTokens(link.quoteTokens, bookCode, chapter, verse, baseOccurrence)
      link.quoteTokens.forEach((token, index) => {
        const semanticId = semanticIds[index]
        if (!semanticId) return
        sendTokenClick({
          lifecycle: 'event',
          token: {
            id: String(token.id),
            content: token.text,
            semanticId,
            verseRef: `${bookCode} ${chapter}:${verse}`,
            position: index,
            strong: token.strong,
            lemma: token.lemma,
            morph: token.morph,
            alignedSemanticIds: [semanticId],
          },
        })
      })
    }
  }, [loaderTypeId, currentRef.book, broadcastObsHighlight, sendTokenClick])
  
  // OBS: handle incoming obs-frame-highlight (OBS viewer clicked a quoted span → filter + select row)
  useSignalHandler<ObsFrameHighlightSignal>(
    'obs-frame-highlight',
    resourceId,
    useCallback(
      (signal) => {
        if (signal.sourceResourceId === resourceId) return
        if (loaderTypeId !== RESOURCE_TYPE_IDS.OBS_WORDS_LINKS) return
        if (signal.highlight === null) {
          setObsQuoteFilter(null)
          setSelectedLink(null)
          return
        }
        const h = signal.highlight
        if (currentRef.book !== 'obs' || h.storyNumber !== currentRef.chapter) return
        const isObsStoryMode = navigationMode === 'chapter'
        if (!isObsStoryMode && h.frameNumber !== currentRef.verse) return
        // TN click → this viewer has no relevant entry; clear any existing filter
        if (h.kind === 'tn') {
          setObsQuoteFilter(null)
          setSelectedLink(null)
          return
        }
        // Set the filter — displayLinks will narrow to just this entry
        setObsQuoteFilter({ quote: h.quote, occurrence: h.occurrence, rowId: h.rowId })
        // Also mark the entry as selected so the card renders in its selected style
        if (h.rowId && filteredByReference.some((l) => l.id === h.rowId)) {
          setSelectedLink(h.rowId)
          return
        }
        const nq = h.quote.trim().toLowerCase()
        for (const link of filteredByReference) {
          if ((link.origWords || '').trim().toLowerCase() !== nq) continue
          const occ = Number.parseInt(String(link.occurrence ?? '1'), 10)
          if (occ === h.occurrence) { setSelectedLink(link.id); return }
        }
      },
      [resourceId, loaderTypeId, currentRef.book, currentRef.chapter, currentRef.verse, navigationMode, filteredByReference]
    ),
    { debug: false, resourceMetadata }
  )

  // OBS: broadcast obs-frame-quotes so the OBS viewer can underline matching frame text
  const obsFrameQuotesApi = useResourceAPI<ObsFrameQuotesSignal>(resourceId)
  const lastObsQuotesKeyRef = useRef<string | null>(null)

  useEffect(() => {
    lastObsQuotesKeyRef.current = null
  }, [currentRef.book, currentRef.chapter, currentRef.verse])

  useEffect(() => {
    if (loaderTypeId !== RESOURCE_TYPE_IDS.OBS_WORDS_LINKS) return
    const storyNumber = currentRef.book === 'obs' ? currentRef.chapter : 0
    const frameNumber = currentRef.book === 'obs' ? currentRef.verse : 0
    const refStr = `${storyNumber}:${frameNumber}`

    const frameQuoteMap: Record<number, ObsFrameQuoteEntry[]> = {}
    const quotes: ObsFrameQuoteEntry[] = []
    if (currentRef.book === 'obs') {
      // Use unfiltered links so underlines persist even when obsQuoteFilter is active.
      for (const l of filteredByReference) {
        if (!l.origWords?.trim()) continue
        const [chStr, frStr] = l.reference.split(':')
        if (parseInt(chStr) !== storyNumber) continue
        const fr = parseInt(frStr)
        const entry: ObsFrameQuoteEntry = {
          sourceId: l.id,
          kind: 'twl',
          quote: l.origWords!.trim(),
          occurrence: Number.isFinite(Number.parseInt(String(l.occurrence ?? '1'), 10))
            ? Number.parseInt(String(l.occurrence ?? '1'), 10)
            : 1,
        }
        if (!frameQuoteMap[fr]) frameQuoteMap[fr] = []
        frameQuoteMap[fr].push(entry)
        if (fr === frameNumber) quotes.push(entry)
      }
    }

    const key = `${refStr}:${quotes.map((q) => `${q.sourceId}:${q.quote}:${q.occurrence}`).join('|')}`
    if (key === lastObsQuotesKeyRef.current) return
    lastObsQuotesKeyRef.current = key
    obsFrameQuotesApi.messaging.sendToAll({
      type: 'obs-frame-quotes',
      lifecycle: 'state',
      stateKey: 'current-obs-frame-quotes',
      sourceResourceId: resourceId,
      storyNumber,
      frameNumber,
      quotes,
      frameQuoteMap,
      timestamp: Date.now(),
    })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaderTypeId, resourceId, currentRef.book, currentRef.chapter, currentRef.verse, filteredByReference])

  return (
    <div className="h-full flex flex-col">
      {obsQuoteFilter && (
        <TokenFilterBanner
          tokenFilter={{
            semanticId: '',
            content: obsQuoteFilter.quote,
            alignedSemanticIds: [],
            timestamp: 0,
          }}
          displayLinksCount={displayLinks.length}
          hasMatches={hasMatches}
          onClearFilter={() => { setObsQuoteFilter(null); setSelectedLink(null) }}
        />
      )}
      {!obsQuoteFilter && tokenFilter && (
        <TokenFilterBanner
          tokenFilter={tokenFilter}
          displayLinksCount={displayLinks.length}
          hasMatches={hasMatches}
          onClearFilter={() => setTokenFilter(null)}
        />
      )}
      {!obsQuoteFilter && verseFilter && (
        <TokenFilterBanner
          tokenFilter={{
            semanticId: '',
            content: verseFilter.verse !== undefined
              ? `${verseFilter.chapter}:${verseFilter.verse}`
              : `Ch ${verseFilter.chapter}`,
            alignedSemanticIds: [],
            timestamp: verseFilter.timestamp,
          }}
          displayLinksCount={displayLinks.length}
          hasMatches={hasMatches}
          onClearFilter={() => setVerseFilter(null)}
        />
      )}
      
      <div className="flex-1 overflow-y-auto bg-gray-50" dir={languageDirection}>
        <ResourceViewerHeader 
          title={resource.title}
          icon={Link}
          direction={languageDirection}
        />
        <div className="p-4">
        {!dependenciesReady ? (
          <div 
            className="flex items-center justify-center py-12"
            role="status"
            aria-label="Loading dependencies"
            title="Waiting for dependencies"
          >
            <Loader className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : loading ? (
          <div 
            className="flex items-center justify-center py-12"
            role="status"
            aria-label="Loading content"
          >
            <Loader className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : error ? (
          // Icon-based error display (semiotic)
          <div 
            className="flex items-center justify-center h-full"
            role="status"
            aria-label={`Word links not available for ${currentRef.book?.toUpperCase() || 'this book'}`}
            title={`Word links not available for ${currentRef.book?.toUpperCase() || 'this book'}`}
          >
            <BookX className="w-16 h-16 text-gray-400" />
          </div>
        ) : Object.keys(linksByVerse).length === 0 ? (
          // Icon-based empty state (semiotic)
          <div 
            className="flex items-center justify-center h-full"
            role="status"
            aria-label={tokenFilter 
              ? `No word links found for "${tokenFilter.content}"` 
              : 'No word links available for this reference'}
            title={tokenFilter 
              ? `No word links found for "${tokenFilter.content}"` 
              : 'No word links available for this reference'}
          >
            <BookOpen className="w-16 h-16 text-gray-400" />
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(linksByVerse)
              .sort(([a], [b]) => {
                // Sort by chapter, then verse
                const [chapterA, verseA] = a.split(':').map(Number)
                const [chapterB, verseB] = b.split(':').map(Number)
                
                if (chapterA !== chapterB) {
                  return chapterA - chapterB
                }
                return verseA - verseB
              })
              .map(([chapterVerse, verseLinks]) => {
                const [chapter, verse] = chapterVerse.split(':')
                const bookCode = currentRef.book || 'gen'
                const resolved = getBookTitleWithFallback(effectiveResource, bookTitleSource, bookCode)
                return (
                  <div key={chapterVerse} className="space-y-2">
                    {/* Verse Header - LTR: book 1:4; RTL: 4:1 book (flex enforces order when book is RTL script) */}
                    <div className="px-2.5 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-lg" dir={languageDirection}>
                      <div className="flex items-center gap-2">
                        <BookOpen className="w-3.5 h-3.5 text-purple-600" />
                        <h3 className="text-xs font-semibold text-gray-700">
                          {(() => {
                            const { bookPart, numberPart } = formatVerseRefParts(resolved, `${chapter}:${verse}`, languageDirection === 'rtl')
                            return languageDirection === 'rtl' ? (
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
                      </div>
                    </div>
                    
                    {/* Word Links */}
                    <div className="grid grid-cols-1 gap-3">
                      {verseLinks.map((link) => {
                        const isSelected = selectedLink === link.id
                        const twInfo = parseTWLink(link.twLink)
                        const twTitle = getTWTitle(link)
                        const isLoadingTitle = loadingTitles.has(`${twInfo.category}/${twInfo.term}`)
                        
                        return (
                          <WordLinkCard
                            key={link.id}
                            link={link}
                            isSelected={isSelected}
                            twTitle={twTitle}
                            isLoadingTitle={isLoadingTitle}
                            onTitleClick={handleTitleClick}
                            onQuoteClick={handleQuoteClick}
                            tokenFilter={tokenFilter}
                            targetResourceId={targetSourceId}
                            languageDirection={languageDirection}
                            obsMode={loaderTypeId === RESOURCE_TYPE_IDS.OBS_WORDS_LINKS}
                          />
                        )
                      })}
                    </div>
                  </div>
                )
              })}
          </div>
        )}
        </div>
      </div>
    </div>
  )
}
