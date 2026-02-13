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
import { BookOpen, BookX, Link, Loader } from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useCurrentReference, useResourceTypeRegistry } from '../../../contexts'
import { useAppStore, useBookTitleSource } from '../../../contexts/AppContext'
import { useWorkspaceStore } from '../../../lib/stores/workspaceStore'
import type { EntryLinkClickSignal, TokenClickSignal } from '../../../signals/studioSignals'
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
import { generateSemanticIdsForQuoteTokens, parseTWLink } from './utils'

export function WordsLinksViewer({
  resourceId,
  resourceKey,
  resource,
  wordsLinksContent,
  onEntryLinkClick,
}: WordsLinksViewerProps) {
  const currentRef = useCurrentReference()
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const bookTitleSource = useBookTitleSource()
  const resourceFromStore = useAppStore((s) => (resource?.id ? s.loadedResources[resource.id] : undefined))
  const effectiveResource = resourceFromStore ?? resource

  const availableLanguages = useWorkspaceStore((s) => s.availableLanguages)
  const [selectedLink, setSelectedLink] = useState<string | null>(null)
  const [tokenFilter, setTokenFilter] = useState<TokenFilter | null>(null)
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

  // Load TWL content
  const { content, loading, error } = useWordsLinksContent({
    resourceKey,
    wordsLinksContent,
  })
  
  // Determine resource metadata for signal system
  const resourceMetadata = useMemo(() => {
    const parts = resourceKey.split('/')
    const owner = parts[0] || ''
    const language = parts[1]?.split('_')[0] || ''
    return {
      type: 'words-links' as const,
      language,
      owner,
      tags: ['words-links'],
    }
  }, [resourceKey])
  
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
      setSelectedLink(null)
    }, [resourceId]),
    {
      debug: false,  // Reduced logging
      resourceMetadata,
    }
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
        'words-links',
        language,
        owner,
        resourceTypeRegistry,
        catalogManager,
        false // quiet mode (no debug logs for UI)
      )
      
      setDependenciesReady(ready)
    }
    
    checkDeps()
  }, [resourceKey, resourceTypeRegistry, catalogManager, catalogTrigger])
  
  // Clear token filter when reference changes
  useEffect(() => {
    setTokenFilter(null)
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
    const endVerse = currentRef.endVerse || startVerse
    
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
  }, [processedLinks, currentRef.chapter, currentRef.verse, currentRef.endChapter, currentRef.endVerse])
  
  // Apply token filter if active
  const { displayLinks, hasMatches } = useMemo(() => {
    if (!tokenFilter) {
      return { displayLinks: filteredByReference, hasMatches: true }
    }
    
    const cleanToken = tokenFilter.content.toLowerCase().trim()
    const bookCode = currentRef.book?.toLowerCase() || ''
    
    const filtered = filteredByReference.filter((link) => {
      // STRATEGY 1: Alignment-based matching (PRIMARY)
      // Generate semantic IDs for this link's quote tokens and compare with clicked token's aligned IDs
      if (link.quoteTokens && link.quoteTokens.length > 0) {
        const refParts = link.reference.split(':')
        const linkChapter = parseInt(refParts[0] || '1', 10)
        const linkVerse = parseInt(refParts[1] || '1', 10)
        const linkOccurrence = parseInt(link.occurrence || '1', 10)
        
        // Generate semantic IDs for this link's quote tokens
        const linkSemanticIds = generateSemanticIdsForQuoteTokens(
          link.quoteTokens,
          bookCode,
          linkChapter,
          linkVerse,
          linkOccurrence
        )
        
        // Check if any of the clicked token's aligned IDs match this link's semantic IDs
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
    
    // If no matches found, show all TWLs for the current range instead of empty list
    const hasMatches = filtered.length > 0
    return {
      displayLinks: hasMatches ? filtered : filteredByReference,
      hasMatches,
    }
  }, [filteredByReference, tokenFilter, currentRef.book])
  
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
    
    const [owner, langResource] = parts
    const language = langResource.split('_')[0]
    const twResourceKey = `${owner}/${language}/tw`
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
  }, [resourceKey, onEntryLinkClick, sendEntryLinkClick])
  
  // Handle clicking on quote text (broadcasts tokens for highlighting only)
  const handleQuoteClick = useCallback((link: typeof displayLinks[0]) => {
    setSelectedLink(link.id)
    
    // Send token-click signals for original language quote tokens
    // This will highlight aligned tokens in target language scripture panels
    if (link.quoteTokens && link.quoteTokens.length > 0) {
      const refParts = link.reference.split(':')
      const chapter = parseInt(refParts[0] || '1', 10)
      const verse = parseInt(refParts[1] || '1', 10)
      const bookCode = currentRef.book?.toLowerCase() || ''
      const baseOccurrence = parseInt(link.occurrence || '1', 10)
      
      // Generate semantic IDs with correct occurrence number
      const semanticIds = generateSemanticIdsForQuoteTokens(
        link.quoteTokens,
        bookCode,
        chapter,
        verse,
        baseOccurrence
      )
      
      // Send a token-click signal for each quote token
      link.quoteTokens.forEach((token, index) => {
        const semanticId = semanticIds[index]
        if (!semanticId) return
        
        sendTokenClick({
          lifecycle: 'event',
          token: {
            id: String(token.id),
            content: token.text,
            semanticId: semanticId,
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
  }, [currentRef.book, sendTokenClick])
  
  return (
    <div className="h-full flex flex-col">
      {tokenFilter && (
        <TokenFilterBanner
          tokenFilter={tokenFilter}
          displayLinksCount={displayLinks.length}
          hasMatches={hasMatches}
          onClearFilter={() => setTokenFilter(null)}
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
