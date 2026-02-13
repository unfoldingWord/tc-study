/**
 * Translation Notes Viewer Component
 * 
 * Displays Translation Notes - translation guidance for specific phrases in Scripture,
 * with links to Translation Academy articles for further training.
 */

import { useSignal, useSignalHandler } from '@bt-synergy/resource-panels'
import { BookOpen, ExternalLink, Loader, FileText } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useCurrentReference, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import type { EntryLinkClickSignal, TokenClickSignal } from '../../../signals/studioSignals'
import { checkDependenciesReady } from '../../../utils/resourceDependencies'
import { formatVerseRefParts, getBookTitleWithFallback } from '../../../utils/bookNames'
import { getLanguageDirection } from '../../../utils/languageDirection'
import { ResourceViewerHeader } from '../common/ResourceViewerHeader'
import { TranslationNoteCard } from './components/TranslationNoteCard'
import { useTranslationNotesContent } from './hooks/useTranslationNotesContent'
import { useTATitles } from './hooks/useTATitles'
import { useTAMetadataForTitles } from './hooks/useTAMetadataForTitles'
import { useEntryTitles } from './hooks/useEntryTitles'
import { useAlignedTokens, useQuoteTokens, useScriptureTokens } from '../WordsLinksViewer/hooks'
import { generateSemanticIdsForQuoteTokens } from '../WordsLinksViewer/utils'
import { TokenFilterBanner } from '../WordsLinksViewer/components/TokenFilterBanner'

import type { ResourceInfo } from '../../../contexts/types'

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
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const bookTitleSource = useBookTitleSource()
  const availableLanguages = useWorkspaceStore((s) => s.availableLanguages)
  // Use latest resource from store so we pick up ingredients when metadata loads (Phase 2)
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource
  const [selectedNoteId, setSelectedNoteId] = useState<string | null>(null)
  const [catalogMetadata, setCatalogMetadata] = useState<{ languageDirection?: 'ltr' | 'rtl' } | null>(null)
  const [tokenFilter, setTokenFilter] = useState<{ semanticId: string; content: string; alignedSemanticIds: string[]; timestamp: number } | null>(null)
  const [dependenciesReady, setDependenciesReady] = useState(false)
  const [catalogTrigger, setCatalogTrigger] = useState(0)

  // Load translation notes for current book
  const { notes, loading, error } = useTranslationNotesContent(
    resourceKey,
    currentRef.book
  )
  
  // Fetch TA titles
  const { taTitles, loadingTitles, fetchTATitle, getTATitle } = useTATitles(resourceKey)
  
  // Stateful TA metadata: useEffect + async request; when ingredients load, state updates and we re-render (no retries)
  const taMetadata = useTAMetadataForTitles(resourceKey)
  const { fetchEntryTitle, getEntryTitle, invalidateTitles } = useEntryTitles(resourceKey, taMetadata)
  const [entryTitleRefreshTrigger, setEntryTitleRefreshTrigger] = useState(0)
  
  // Determine resource metadata for signal system
  const resourceMetadata = useMemo(() => {
    const parts = resourceKey.split('/')
    const owner = parts[0] || ''
    const language = parts[1]?.split('_')[0] || ''
    return {
      type: 'tn' as const,
      language,
      owner,
      tags: ['tn', 'notes'],
    }
  }, [resourceKey])
  
  // Get signal sender for token-click (to highlight aligned tokens in scripture)
  const { sendToAll: sendTokenClick } = useSignal<TokenClickSignal>(
    'token-click',
    resourceId,
    resourceMetadata
  )
  
  // Listen for token-click signals from scripture (for filtering notes)
  useSignalHandler<TokenClickSignal>(
    'token-click',
    resourceId,
    useCallback((signal) => {
      // Don't filter on our own clicks
      if (signal.sourceResourceId === resourceId) {
        return
      }
      
      // Store filter
      setTokenFilter({
        semanticId: signal.token.semanticId,
        content: signal.token.content,
        alignedSemanticIds: signal.token.alignedSemanticIds || [],
        timestamp: signal.timestamp,
      })
      setSelectedNoteId(null)
    }, [resourceId]),
    {
      debug: false,
      resourceMetadata,
    }
  )

  // Check dependencies (original language scriptures) on resource change
  useEffect(() => {
    const parts = resourceKey.split('/')
    const language = parts.length >= 2 ? parts[1] : ''
    const owner = parts[0] || ''
    
    checkDependenciesReady('tn', language, owner, resourceTypeRegistry, catalogManager, false)
      .then((ready) => {
        setDependenciesReady(ready)
      })
      .catch((err) => {
        console.error('Error checking TN dependencies:', err)
        setDependenciesReady(false)
      })
  }, [resourceKey, catalogManager, resourceTypeRegistry, catalogTrigger])
  
  // Clear token filter when reference changes
  useEffect(() => {
    setTokenFilter(null)
    setSelectedNoteId(null)
  }, [currentRef.book, currentRef.chapter, currentRef.verse])
  
  // Listen for scripture token broadcasts (for target language alignment)
  // Load catalog metadata for this resource (for RTL fallback when no scripture is broadcasting)
  useEffect(() => {
    let cancelled = false
    catalogManager.getResourceMetadata(resourceKey).then((meta) => {
      if (!cancelled && meta) setCatalogMetadata(meta)
    })
    return () => { cancelled = true }
  }, [resourceKey, catalogManager])

  // The useAlignedTokens hook will use these internally
  // Also get the source resource ID and language direction for quote attribution
  const { 
    sourceResourceId: targetSourceId,
    tokens: targetScriptureTokens,
    resourceMetadata: targetScriptureMetadata,
  } = useScriptureTokens({ 
    resourceId 
  })

  // Language direction: target scripture broadcast first, then this resource's catalog/list, then known RTL codes
  const languageCode = resource?.language ?? resourceKey.split('/')[1]?.split('_')[0] ?? ''
  const languageFromList = availableLanguages.find((l) => l.code === languageCode)
  const resourceDirection = getLanguageDirection(
    catalogMetadata?.languageDirection ?? undefined,
    languageFromList?.direction ?? undefined,
    languageCode
  )
  const targetLanguageDirection = targetScriptureMetadata?.languageDirection ?? resourceDirection

  // Filter notes for current chapter/verse range
  const relevantNotes = useMemo(() => {
    if (!notes || notes.length === 0) return []

    const startChapter = currentRef.chapter
    const startVerse = currentRef.verse
    const endChapter = currentRef.endChapter || startChapter
    const endVerse = currentRef.endVerse || startVerse

    return notes.filter(note => {
      const [noteChapterStr, noteVerseRange] = note.reference.split(':')
      const noteChapter = parseInt(noteChapterStr)

      // Check if note's chapter is within range
      if (noteChapter < startChapter || noteChapter > endChapter) {
        return false
      }

      // Parse verse range (could be single verse or range like "1-3")
      let noteStartVerse: number
      let noteEndVerse: number

      if (noteVerseRange.includes('-')) {
        const [start, end] = noteVerseRange.split('-').map(v => parseInt(v))
        noteStartVerse = start
        noteEndVerse = end
      } else {
        noteStartVerse = noteEndVerse = parseInt(noteVerseRange)
      }

      // Check if note overlaps with displayed verse range
      if (noteChapter === startChapter && noteEndVerse < startVerse) return false
      if (noteChapter === endChapter && noteStartVerse > endVerse) return false

      return true
    })
  }, [notes, currentRef])
  
  // Transform notes to include quote field for alignment
  // Only include notes that have a non-empty quote field
  const notesWithQuotes = useMemo(() => {
    const transformed = relevantNotes
      .filter(note => note.quote && note.quote.trim().length > 0) // Filter out empty quotes
      .map(note => ({
        id: note.id,
        reference: note.reference,
        tags: note.tags || '',
        occurrence: note.occurrence || '1',
        origWords: note.quote, // Use quote field (equivalent to TWL's origWords)
        articlePath: '', // Not used for TN but required by TranslationWordsLink interface
      }))
    
    return transformed
  }, [relevantNotes])
  
  // Parse original language tokens from quote fields
  const { linksWithQuotes, hasOriginalContent } = useQuoteTokens({
    resourceKey,
    resourceId,
    links: notesWithQuotes,
  })
  
  // Get aligned tokens in target language
  const { linksWithAlignedTokens, hasTargetContent } = useAlignedTokens({
    resourceKey,
    resourceId,
    links: linksWithQuotes,
  })

  // Merge quote tokens (original language) and aligned tokens back into notes
  const notesWithAlignedTokens = useMemo(() => {
    // Create maps for efficient lookup
    const quoteTokensMap = new Map(
      linksWithQuotes.map(link => [link.id, link.quoteTokens])
    )
    const alignedTokensMap = new Map(
      linksWithAlignedTokens.map(link => [link.id, link.alignedTokens])
    )
    
    return relevantNotes.map(note => ({
      ...note,
      quoteTokens: quoteTokensMap.get(note.id), // Original language tokens
      alignedTokens: alignedTokensMap.get(note.id), // Target language tokens (for display)
    }))
  }, [relevantNotes, linksWithQuotes, linksWithAlignedTokens])
  
  // Apply token filter if active (similar to TWL)
  const { displayNotes, hasMatches } = useMemo(() => {
    if (!tokenFilter) {
      return { displayNotes: notesWithAlignedTokens, hasMatches: true }
    }
    
    const cleanToken = tokenFilter.content.toLowerCase().trim()
    const bookCode = currentRef.book?.toLowerCase() || ''
    
    const filtered = notesWithAlignedTokens.filter((note) => {
      // STRATEGY 1: Alignment-based matching (PRIMARY)
      // Generate semantic IDs for this note's quote tokens and compare with clicked token's aligned IDs
      if (note.quoteTokens && note.quoteTokens.length > 0) {
        const refParts = note.reference.split(':')
        const noteChapter = parseInt(refParts[0] || '1', 10)
        const noteVerse = parseInt(refParts[1] || '1', 10)
        const noteOccurrence = parseInt(note.occurrence || '1', 10)
        
        // Generate semantic IDs for this note's quote tokens
        const noteSemanticIds = generateSemanticIdsForQuoteTokens(
          note.quoteTokens,
          bookCode,
          noteChapter,
          noteVerse,
          noteOccurrence
        )
        
        // Check if any of the clicked token's aligned IDs match this note's semantic IDs
        const hasAlignedMatch = tokenFilter.alignedSemanticIds?.some(alignedId => {
          const alignedIdLower = alignedId.toLowerCase()
          return noteSemanticIds.some(noteSemanticId => 
            noteSemanticId.toLowerCase() === alignedIdLower
          )
        })
        
        if (hasAlignedMatch) return true
      }
      
      // STRATEGY 2: Text-based fuzzy matching (FALLBACK)
      const quoteLower = note.quote?.toLowerCase() || ''
      const hasTextMatch = quoteLower.includes(cleanToken)
      
      // STRATEGY 3: Quote token text matching (ORIGINAL LANGUAGE)
      const hasQuoteTokenMatch = note.quoteTokens?.some(token => 
        token.text.toLowerCase().includes(cleanToken)
      )
      
      return hasTextMatch || hasQuoteTokenMatch
    })
    
    // If no matches found, show all notes for the current range instead of empty list
    const hasMatches = filtered.length > 0
    return {
      displayNotes: hasMatches ? filtered : notesWithAlignedTokens,
      hasMatches,
    }
  }, [notesWithAlignedTokens, tokenFilter, currentRef.book])
  
  // Load TA titles for visible notes
  useEffect(() => {
    if (!displayNotes.length) return
    
    displayNotes.forEach(note => {
      if (note.supportReference && note.supportReference.startsWith('rc://')) {
        fetchTATitle(note)
      }
    })
  }, [displayNotes, fetchTATitle])

  // When tab becomes visible, re-fetch entry titles so we show TOC titles once TA is ready (e.g. after language switch)
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        invalidateTitles()
        setEntryTitleRefreshTrigger(t => t + 1)
      }
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
    return () => document.removeEventListener('visibilitychange', onVisibilityChange)
  }, [invalidateTitles])

  // Preload entry titles (TW/TA) from rc:// links in note markdown content
  useEffect(() => {
    if (!displayNotes.length) return
    
    displayNotes.forEach(note => {
      if (!note.note) return
      
      // Extract all rc:// links from markdown content
      // Handles both [[rc://...]] and [text](rc://...) formats
      const rcLinkPattern = /rc:\/\/[^\s\])\n]+/g
      const matches = note.note.match(rcLinkPattern)
      
      if (matches) {
        matches.forEach(rcLink => {
          fetchEntryTitle(rcLink)
        })
      }
    })
  }, [displayNotes, fetchEntryTitle, entryTitleRefreshTrigger])

  // Group notes by verse for display
  const notesByVerse = useMemo(() => {
    const grouped: Record<string, typeof displayNotes> = {}
    for (const note of displayNotes) {
      const ref = note.reference
      if (!grouped[ref]) {
        grouped[ref] = []
      }
      grouped[ref].push(note)
    }
    return grouped
  }, [displayNotes])
  
  // Handle clicking on aligned quote tokens (broadcast ORIGINAL LANGUAGE tokens, same as TWL)
  const handleQuoteClick = useCallback((note: typeof notesWithAlignedTokens[0]) => {
    // CRITICAL: Send original language tokens (quoteTokens), not aligned tokens
    // The scripture viewer will find and highlight the aligned target tokens
    if (!note.quoteTokens || note.quoteTokens.length === 0) return
    
    const refParts = note.reference.split(':')
    const chapter = parseInt(refParts[0] || '1', 10)
    const verse = parseInt(refParts[1] || '1', 10)
    const bookCode = currentRef.book?.toLowerCase() || ''
    const baseOccurrence = parseInt(note.occurrence || '1', 10)
    
    // Generate semantic IDs with correct occurrence number (same as TWL)
    const semanticIds = generateSemanticIdsForQuoteTokens(
      note.quoteTokens,
      bookCode,
      chapter,
      verse,
      baseOccurrence
    )
    
    // CRITICAL: Send a SINGLE signal with ALL semantic IDs in alignedSemanticIds
    // This ensures the scripture viewer highlights all tokens at once
    // instead of each signal replacing the previous highlighting
    const firstToken = note.quoteTokens[0]
    if (!firstToken) return
    
    console.log('🔍 [TN-CLICK] Broadcasting single signal with all semantic IDs:', {
      noteId: note.id,
      quoteTokensCount: note.quoteTokens.length,
      allSemanticIds: semanticIds,
      originalTokens: note.quoteTokens.map((t: any, i: number) => ({ 
        text: t.text, 
        semanticId: semanticIds[i]
      })),
    })
    
    // Send a SINGLE token-click signal with all semantic IDs in alignedSemanticIds
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
        alignedSemanticIds: semanticIds, // ALL semantic IDs here!
      },
    })
  }, [currentRef.book, sendTokenClick])

  // Handle clicking on a Support Reference (link to TA)
  const handleSupportReferenceClick = useCallback((supportRef: string) => {
    // Parse RC link: rc://*/ta/man/translate/figs-metaphor
    const match = supportRef.match(/rc:\/\/\*\/ta\/man\/(.+)/)
    if (match && onEntryLinkClick) {
      const entryId = match[1]
      // Extract language from current resource key
      const parts = resourceKey.split('/')
      const language = parts.length >= 2 ? parts[1] : 'en'
      const owner = parts[0] || 'unfoldingWord'
      
      const taResourceKey = `${owner}/${language}/ta`
      onEntryLinkClick(taResourceKey, entryId)
    }
  }, [resourceKey, onEntryLinkClick])

  // Listen for entry link click signals
  useSignalHandler<EntryLinkClickSignal>(
    'entry-link-click',
    resourceId,
    (signal: EntryLinkClickSignal) => {
      if (signal.resourceKey === resourceKey && signal.entryId) {
        setSelectedNoteId(signal.entryId)
      }
    }
  )

  return (
    <div className="h-full flex flex-col">
      {tokenFilter && (
        <TokenFilterBanner
          tokenFilter={tokenFilter}
          displayLinksCount={displayNotes.length}
          hasMatches={hasMatches}
          onClearFilter={() => setTokenFilter(null)}
        />
      )}
      
      <div className="flex-1 overflow-y-auto bg-gray-50" dir={targetLanguageDirection}>
        <ResourceViewerHeader 
          title={resource.title}
          icon={FileText}
          direction={targetLanguageDirection}
        />
        <div className="p-4">
        {loading ? (
          <div 
            className="flex items-center justify-center py-12"
            role="status"
            aria-label="Loading content"
          >
            <Loader className="w-8 h-8 text-amber-500 animate-spin" />
          </div>
        ) : error ? (
        <div className="text-center py-12 text-gray-500">
          <BookOpen className="w-12 h-12 mx-auto mb-4 text-gray-300" />
          <p className="text-sm">{error}</p>
        </div>
      ) : displayNotes.length === 0 ? (
        <div 
          className="flex items-center justify-center h-full"
          title="No notes for this passage"
        >
          <BookOpen className="w-16 h-16 text-gray-300 opacity-60" />
        </div>
      ) : (
        <div className="space-y-4">
          {Object.entries(notesByVerse).map(([verse, verseNotes]) => {
            const bookCode = currentRef.book
            const resolved = getBookTitleWithFallback(effectiveResource, bookTitleSource, bookCode)
            return (
            <div key={verse} className="space-y-3">
              {/* Verse Header - LTR: book 1:4; RTL: 4:1 book (flex enforces order when book is RTL script) */}
              <div className="flex items-center gap-2 px-2.5 py-1.5 bg-gradient-to-r from-gray-50 to-gray-100/50 rounded-lg" dir={targetLanguageDirection}>
                <BookOpen className="w-3.5 h-3.5 text-amber-500" />
                <h3 className="text-xs font-semibold text-gray-700">
                  {(() => {
                    const { bookPart, numberPart } = formatVerseRefParts(resolved, verse, targetLanguageDirection === 'rtl')
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
                <span className="ml-auto px-2 py-0.5 bg-amber-100/50 text-amber-700 rounded-full text-[10px] font-medium">
                  {verseNotes.length}
                </span>
              </div>

              {/* Notes for this verse */}
              {verseNotes.map((note, idx) => {
                // Prefer getEntryTitle (stateful taMetadata) for bottom orange link so it matches markdown and re-renders when TA TOC loads
                const entryTitle = note.supportReference?.startsWith('rc://') ? getEntryTitle(note.supportReference) : null
                const taTitle = entryTitle ?? getTATitle(note)
                const isLoadingTitle = note.supportReference ? loadingTitles.has(note.supportReference.match(/rc:\/\/\*\/ta\/man\/(.+)/)?.[1] || '') : false
                
                return (
                  <TranslationNoteCard
                    key={note.id || `${verse}-${idx}`}
                    note={note}
                    isSelected={selectedNoteId === note.id}
                    onSupportReferenceClick={handleSupportReferenceClick}
                    onEntryLinkClick={onEntryLinkClick}
                    onQuoteClick={() => handleQuoteClick(note)}
                    onClick={() => setSelectedNoteId(note.id)}
                    targetResourceId={targetSourceId || undefined}
                    resourceKey={resourceKey}
                    languageDirection={targetLanguageDirection}
                    taTitle={taTitle}
                    isLoadingTATitle={isLoadingTitle}
                    getEntryTitle={getEntryTitle}
                  />
                )
              })}
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
