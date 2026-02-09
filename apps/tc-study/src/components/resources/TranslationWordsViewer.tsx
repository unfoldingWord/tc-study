/**
 * Translation Words Viewer Component
 * 
 * Displays Translation Words content (biblical term definitions)
 */

import { AlertCircle, ArrowLeft, BookOpen, ChevronDown, ChevronUp, FileText, Hash, Loader, Search, User } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useLoaderRegistry } from '../../contexts/CatalogContext'

interface TranslationWord {
  id: string
  term: string
  definition: string
  content?: string
  relatedTerms?: string[]
  seeAlso?: string[]
}

const TW_WORD_CACHE_MAX = 80
const twWordCache = new Map<string, TranslationWord>()

interface TranslationWordsViewerExtendedProps {
  resourceKey: string
  metadata?: any
  initialEntryId?: string
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
}

export function TranslationWordsViewer({ 
  resourceKey: rawResourceKey, 
  metadata: propMetadata,
  initialEntryId,
  onEntryLinkClick,
}: TranslationWordsViewerExtendedProps) {
  // Use resource key as-is (no normalization needed)
  // Background downloads and cache use 3-part format: owner/language/resourceId
  const resourceKey = rawResourceKey
  
  const loaderRegistry = useLoaderRegistry()
  const catalogManager = useCatalogManager()
  const [selectedWordId, setSelectedWordId] = useState<string>(initialEntryId || '')
  const [word, setWord] = useState<TranslationWord | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'toc' | 'article'>(initialEntryId ? 'article' : 'toc')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  
  // State for metadata (can be from props or fetched from catalog)
  const [metadata, setMetadata] = useState<any>(propMetadata)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [metadataLoaded, setMetadataLoaded] = useState(false)

  // If propMetadata changes, update local state
  useEffect(() => {
    if (propMetadata) {
      setMetadata(propMetadata)
      const ingredients = propMetadata?.contentMetadata?.ingredients || propMetadata?.ingredients || []
      const validIngredients = ingredients.filter((ing: any) => ing.is_dir !== true && ing.identifier !== 'bible')
      if (validIngredients.length > 0) {
        setMetadataLoaded(true)
      }
    }
  }, [propMetadata])

  // Fetch metadata from catalog if not provided (with polling, no flickering)
  useEffect(() => {
    if (metadataLoaded) return // Already have metadata
    
    let intervalId: number | undefined
    let cancelled = false
    
    const checkForMetadata = async () => {
      if (cancelled) return
      
      try {
        const catalogMetadata = await catalogManager.getResourceMetadata(resourceKey)
        
        if (cancelled) return
        
        if (catalogMetadata) {
          const catalogIngredients = catalogMetadata.contentMetadata?.ingredients || []
          const catalogValidIngredients = catalogIngredients.filter((ing: any) => ing.is_dir !== true && ing.identifier !== 'bible')
          
          if (catalogValidIngredients.length > 0) {
            setMetadata(catalogMetadata)
            setMetadataLoaded(true)
            setLoadingMetadata(false)
            
            // Stop polling once we have metadata
            if (intervalId) {
              clearInterval(intervalId)
            }
          }
        }
      } catch (err) {
        if (!cancelled) {
          console.error('Failed to fetch metadata from catalog:', err)
        }
      }
    }
    
    // Start checking
    setLoadingMetadata(true)
    checkForMetadata() // Check immediately
    
    // Then poll every 1 second until metadata is found
    intervalId = window.setInterval(checkForMetadata, 1000)
    
    return () => {
      cancelled = true
      if (intervalId) {
        clearInterval(intervalId)
      }
    }
  }, [resourceKey, catalogManager, metadataLoaded])

  // Load available entries from metadata
  useEffect(() => {
    // Check multiple possible locations for ingredients
    const ingredients = 
      metadata?.contentMetadata?.ingredients || 
      metadata?.ingredients || 
      []

    if (ingredients.length > 0) {
      // Filter out directory entries - only include actual word files
      const validEntries = ingredients.filter((entry: any) => {
        // Exclude entries that are directories (is_dir: true)
        if (entry.is_dir === true) return false
        
        // Exclude entries where identifier is just "bible" (directory)
        if (entry.identifier === 'bible' || entry.path === './bible' || entry.path === 'bible') {
          return false
        }
        
        // Include entries that have a path ending in .md or identifier contains a category
        const hasValidPath = entry.path && (entry.path.endsWith('.md') || entry.path.includes('/'))
        const hasValidIdentifier = entry.identifier && entry.identifier.includes('/') && entry.identifier !== 'bible'
        
        return hasValidPath || hasValidIdentifier
      })
      
      setEntries(validEntries)
      
      // Only select initial entry if provided - don't auto-select first entry
      if (initialEntryId && !selectedWordId) {
        console.log('[TranslationWordsViewer] Setting initialEntryId from entries:', initialEntryId)
        setSelectedWordId(initialEntryId)
        setViewMode('article')
      }
    } else {
      setEntries([])
      // If we have initialEntryId but no entries yet, still set it so loading can start
      if (initialEntryId && !selectedWordId) {
        console.log('[TranslationWordsViewer] No entries yet, but setting initialEntryId:', initialEntryId)
        setSelectedWordId(initialEntryId)
        setViewMode('article')
      }
    }
  }, [metadata, selectedWordId, initialEntryId])

  // Load word content when selection changes (cached by resourceKey+entryId so switching tabs doesn't re-fetch)
  useEffect(() => {
    if (!selectedWordId || !resourceKey) return

    if (selectedWordId === 'bible' || !selectedWordId.includes('/')) {
      setError('Please select a word entry, not a category')
      setLoading(false)
      return
    }

    if (!loaderRegistry) {
      setError('Resource loader not available. Please refresh the page.')
      setLoading(false)
      return
    }

    const key = `tw:${resourceKey}:${selectedWordId}`
    const hit = twWordCache.get(key)
    if (hit !== undefined) {
      setWord(hit)
      setError(null)
      setLoading(false)
      return
    }

    const loadWord = async () => {
      setLoading(true)
      setError(null)

      try {
        const loader = loaderRegistry.getLoader('words')
        if (!loader) {
          throw new Error('Translation Words loader not found')
        }
        const wordData = await loader.loadContent(resourceKey, selectedWordId)
        const w = wordData as TranslationWord
        if (twWordCache.size >= TW_WORD_CACHE_MAX) twWordCache.delete(twWordCache.keys().next().value!)
        twWordCache.set(key, w)
        setWord(w)
      } catch (err) {
        console.error('❌ Failed to load word:', { resourceKey, entryId: selectedWordId, error: err })
        setError(err instanceof Error ? err.message : 'Failed to load word')
      } finally {
        setLoading(false)
      }
    }

    loadWord()
  }, [selectedWordId, resourceKey, loaderRegistry])

  if (!resourceKey) {
    return (
      <div className="p-6 text-center text-gray-500 bg-white">
        No resource selected
      </div>
    )
  }
  
  // Ensure we have required contexts
  if (!loaderRegistry) {
    console.error('[TranslationWordsViewer] loaderRegistry is null/undefined')
    return (
      <div className="p-6 text-center text-gray-500 bg-white">
        <p className="font-semibold text-red-600 mb-2">Error: Resource loader not available</p>
        <p className="text-sm">Please refresh the page or check the console for details.</p>
      </div>
    )
  }
  
  if (!catalogManager) {
    console.warn('[TranslationWordsViewer] catalogManager is null/undefined')
  }

  // Category icons and labels
  const categoryConfig: Record<string, { icon: any; label: string; color: string }> = {
    kt: { icon: Hash, label: 'Key Terms', color: 'text-blue-600' },
    names: { icon: User, label: 'Names', color: 'text-purple-600' },
    other: { icon: FileText, label: 'Other', color: 'text-gray-600' }
  }

  // Filter and group entries
  const { groupedEntries, filteredCount } = useMemo(() => {
    // Filter entries by search query
    const filtered = searchQuery
      ? entries.filter(entry => 
          entry.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          entry.identifier?.toLowerCase().includes(searchQuery.toLowerCase())
        )
      : entries

    // Group by category
    const grouped = filtered.reduce((acc: any, entry: any) => {
      const category = entry.categories?.[0] || 'other'
      if (!acc[category]) acc[category] = []
      acc[category].push(entry)
      return acc
    }, {})

    return { groupedEntries: grouped, filteredCount: filtered.length }
  }, [entries, searchQuery])

  // Clean up expanded categories when entries change (remove categories that no longer exist)
  useEffect(() => {
    if (Object.keys(groupedEntries).length > 0) {
      const allCategories = new Set(Object.keys(groupedEntries))
      setExpandedCategories(prev => {
        const merged = new Set(prev)
        // Remove categories that no longer exist
        merged.forEach(cat => {
          if (!allCategories.has(cat)) {
            merged.delete(cat)
          }
        })
        return merged
      })
    }
  }, [groupedEntries])

  // Toggle category expansion
  const toggleCategory = (category: string) => {
    setExpandedCategories(prev => {
      const next = new Set(prev)
      if (next.has(category)) {
        next.delete(category)
      } else {
        next.add(category)
      }
      return next
    })
  }

  // Show loading state while fetching metadata from catalog
  if (loadingMetadata || !metadataLoaded) {
    return (
      <div 
        className="h-full flex items-center justify-center bg-gray-50"
        role="status"
        aria-label="Loading content"
      >
        <Loader className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    )
  }

  // Show TOC or Article based on viewMode
  if (viewMode === 'toc') {
    return (
      <div className="h-full flex flex-col bg-gray-50">
        {/* Header with search */}
        <div className="p-3 border-b border-gray-200 bg-white sticky top-0 z-10">
          {/* Search */}
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
            <input
              type="text"
              placeholder="Search..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              aria-label="Search translation words"
            />
          </div>
        </div>

        {/* TOC Content */}
        <div className="flex-1 overflow-y-auto">
          {Object.keys(groupedEntries).length === 0 ? (
            <div 
              className="flex items-center justify-center h-full"
              title={searchQuery ? 'No matches' : 'No entries'}
            >
              <FileText className="w-16 h-16 text-gray-300 opacity-60" />
            </div>
          ) : (
            Object.entries(groupedEntries).map(([category, categoryEntries]: [string, any]) => {
              const config = categoryConfig[category] || categoryConfig.other
              const Icon = config.icon
              const isExpanded = expandedCategories.has(category)
              const ChevronIcon = isExpanded ? ChevronUp : ChevronDown
              
              return (
                <div key={category} className="mb-1">
                  {/* Category header - clickable to toggle */}
                  <button
                    onClick={() => toggleCategory(category)}
                    className="w-full px-3 py-1.5 flex items-center gap-2 bg-gray-100 hover:bg-gray-200 transition-colors sticky top-0 z-5"
                    title={isExpanded ? 'Collapse category' : 'Expand category'}
                    aria-label={`${isExpanded ? 'Collapse' : 'Expand'} category`}
                  >
                    <ChevronIcon className="w-3 h-3 text-gray-500 flex-shrink-0" />
                    <Icon className={`w-4 h-4 ${config.color}`} />
                    <span className="ml-auto px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-semibold">
                      {(categoryEntries as any[]).length}
                    </span>
                  </button>
                  
                  {/* Entries - only show if expanded */}
                  {isExpanded && (
                    <>
                      {(categoryEntries as any[]).map((entry: any) => {
                        // Ensure identifier is valid - use identifier, id, or path as fallback
                        const entryId = entry.identifier || entry.id || (entry.path ? entry.path.replace(/\.md$/, '') : '')
                        if (!entryId) {
                          console.warn('⚠️ Entry missing identifier:', entry)
                          return null
                        }
                        return (
                        <button
                          key={entryId}
                          onClick={() => {
                            if (!entryId) {
                              console.error('❌ Cannot load entry: missing identifier', entry)
                              return
                            }
                            // Use modal if onEntryLinkClick is provided, otherwise navigate within viewer
                            if (onEntryLinkClick && rawResourceKey) {
                              // Use rawResourceKey (with slashes) for modal, not the normalized resourceKey
                              onEntryLinkClick(rawResourceKey, entryId)
                            } else {
                              setSelectedWordId(entryId)
                              setViewMode('article')
                            }
                          }}
                          className={`w-full text-left px-3 py-2 text-sm hover:bg-white transition-colors flex items-center gap-2 ${
                            selectedWordId === entryId
                              ? 'bg-white text-blue-600 border-l-2 border-blue-600 font-medium'
                              : 'text-gray-700'
                          }`}
                          title={entry.title}
                          aria-label={`View ${entry.title}`}
                        >
                          <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${
                            selectedWordId === entryId ? 'text-blue-600' : 'text-gray-400'
                          }`} />
                          <span className="truncate flex-1">{entry.title}</span>
                        </button>
                      )})}
                    </>
                  )}
                </div>
              )
            })
          )}
        </div>
      </div>
    )
  }

  // Article view - covers TOC
  return (
    <div className="h-full flex flex-col bg-white">
        {loading && (
          <div className="flex items-center justify-center h-full">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        )}

        {error && (
          <div 
            className="flex items-center justify-center h-full"
            title={error}
          >
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
        )}

        {!loading && !error && word && (
          <div className="flex-1 overflow-y-auto">
            <div className="p-6 max-w-3xl mx-auto">
              {/* Back Button */}
              <button
                onClick={() => setViewMode('toc')}
                className="mb-4 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
                title="Back to table of contents"
                aria-label="Back to table of contents"
              >
                <ArrowLeft className="w-4 h-4" />
                <span className="text-sm font-medium">Back</span>
              </button>

              {/* Term Header */}
              <div className="mb-6 pb-4 border-b border-gray-200">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-lg bg-blue-500 flex items-center justify-center flex-shrink-0">
                    <Hash className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <h1 className="text-2xl font-bold text-gray-900 mb-1">
                      {word.term}
                    </h1>
                    <p className="text-xs text-gray-500 font-mono truncate">
                      {word.id}
                    </p>
                  </div>
                </div>
              </div>

            {/* Definition Content */}
            <div className="prose prose-blue max-w-none">
              <div className="text-gray-700 whitespace-pre-wrap leading-relaxed">
                {word.definition || word.content}
              </div>
            </div>

            {/* Related Terms - Clickable to navigate with history */}
            {word.relatedTerms && word.relatedTerms.length > 0 && (
              <div className="mt-8 pt-6 border-t border-gray-200">
                <div className="flex items-center gap-2 mb-3">
                  <Hash className="w-4 h-4 text-blue-600" />
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded-full text-xs font-semibold">
                    {word.relatedTerms.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {word.relatedTerms.map((term, idx) => (
                    <button
                      key={idx}
                      onClick={() => {
                        if (onEntryLinkClick && rawResourceKey) {
                          // Navigate to related term using modal history (use rawResourceKey with slashes)
                          onEntryLinkClick(rawResourceKey, term)
                        } else {
                          // Direct navigation within same viewer
                          setSelectedWordId(term)
                          setViewMode('article')
                        }
                      }}
                      className="px-3 py-1.5 bg-blue-50 text-blue-700 rounded-lg text-sm hover:bg-blue-100 hover:shadow-sm transition-all cursor-pointer flex items-center gap-1.5"
                      title={`View ${term}`}
                      aria-label={`View related term ${term}`}
                    >
                      <Hash className="w-3.5 h-3.5" />
                      {term}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* See Also */}
            {word.seeAlso && word.seeAlso.length > 0 && (
              <div className="mt-6">
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-gray-600" />
                  <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                    {word.seeAlso.length}
                  </span>
                </div>
                <div className="flex flex-wrap gap-2">
                  {word.seeAlso.map((term, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1.5 bg-gray-100 text-gray-700 rounded-lg text-sm flex items-center gap-1.5"
                    >
                      <FileText className="w-3.5 h-3.5" />
                      {term}
                    </span>
                  ))}
                </div>
              </div>
            )}
            </div>
          </div>
        )}

        {!loading && !error && !word && (
          <div className="flex-1 flex flex-col items-center justify-center text-gray-400">
            <BookOpen className="w-16 h-16 mb-4 opacity-50" />
            <p className="text-sm">Loading article...</p>
          </div>
        )}
    </div>
  )
}

