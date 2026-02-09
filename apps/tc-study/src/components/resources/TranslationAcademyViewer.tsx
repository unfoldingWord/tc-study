/**
 * Translation Academy Viewer Component
 * 
 * Displays Translation Academy content (training articles for translators)
 */

import { AlertCircle, ArrowLeft, ChevronDown, ChevronUp, FileText, GraduationCap, Loader, Search } from 'lucide-react'
import { useEffect, useMemo, useState } from 'react'
import { useCatalogManager, useLoaderRegistry } from '../../contexts/CatalogContext'

interface TranslationAcademyArticle {
  id: string
  title: string
  content: string
  question?: string
  relatedArticles?: string[]
}

const TA_ARTICLE_CACHE_MAX = 80
const taArticleCache = new Map<string, TranslationAcademyArticle>()

interface TranslationAcademyViewerExtendedProps {
  resourceKey: string
  metadata?: any
  initialEntryId?: string
  onEntryLinkClick?: (resourceKey: string, entryId: string) => void
}

export function TranslationAcademyViewer({ 
  resourceKey: rawResourceKey, 
  metadata: propMetadata,
  initialEntryId,
  onEntryLinkClick,
}: TranslationAcademyViewerExtendedProps) {
  // Use resource key as-is (no normalization needed)
  // Background downloads and cache use 3-part format: owner/language/resourceId
  const resourceKey = rawResourceKey
  
  const loaderRegistry = useLoaderRegistry()
  const catalogManager = useCatalogManager()
  const [selectedArticleId, setSelectedArticleId] = useState<string>(initialEntryId || '')
  const [article, setArticle] = useState<TranslationAcademyArticle | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [entries, setEntries] = useState<any[]>([])
  const [searchQuery, setSearchQuery] = useState('')
  const [viewMode, setViewMode] = useState<'toc' | 'article'>(initialEntryId ? 'article' : 'toc')
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set())
  
  // State for metadata
  const [metadata, setMetadata] = useState<any>(propMetadata)
  const [loadingMetadata, setLoadingMetadata] = useState(false)
  const [metadataLoaded, setMetadataLoaded] = useState(false)

  // Update metadata when props change
  useEffect(() => {
    if (propMetadata) {
      setMetadata(propMetadata)
      const ingredients = propMetadata?.contentMetadata?.ingredients || propMetadata?.ingredients || []
      const validIngredients = ingredients.filter((ing: any) => ing.is_dir !== true)
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
          const catalogValidIngredients = catalogIngredients.filter((ing: any) => ing.is_dir !== true)
          
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
    const ingredients = 
      metadata?.contentMetadata?.ingredients || 
      metadata?.ingredients || 
      []

    if (ingredients.length > 0) {
      const validEntries = ingredients.filter((entry: any) => {
        if (entry.is_dir === true) return false
        const hasValidPath = entry.path && entry.path.endsWith('.md')
        const hasValidIdentifier = entry.identifier && entry.identifier.includes('/')
        return hasValidPath || hasValidIdentifier
      })
      
      setEntries(validEntries)
      
      if (initialEntryId && !selectedArticleId) {
        setSelectedArticleId(initialEntryId)
        setViewMode('article')
      }
    } else {
      setEntries([])
      if (initialEntryId && !selectedArticleId) {
        setSelectedArticleId(initialEntryId)
        setViewMode('article')
      }
    }
  }, [metadata, selectedArticleId, initialEntryId])

  // Load article content when selection changes (cached by resourceKey+articleId so switching tabs doesn't re-fetch)
  useEffect(() => {
    if (!selectedArticleId || !resourceKey) return

    const key = `ta:${resourceKey}:${selectedArticleId}`
    const hit = taArticleCache.get(key)
    if (hit !== undefined) {
      setArticle(hit)
      setError(null)
      setLoading(false)
      setViewMode('article')
      return
    }

    const loadArticle = async () => {
      setLoading(true)
      setError(null)

      try {
        const loader = loaderRegistry.getLoader('academy')
        if (!loader) {
          throw new Error('No loader available for Translation Academy')
        }

        const loadedArticle = await loader.loadContent(resourceKey, selectedArticleId)
        if (taArticleCache.size >= TA_ARTICLE_CACHE_MAX) taArticleCache.delete(taArticleCache.keys().next().value!)
        taArticleCache.set(key, loadedArticle)
        setArticle(loadedArticle)
        setViewMode('article')
      } catch (err: any) {
        console.error('Failed to load article:', err)
        setError(err.message || 'Failed to load article')
        setArticle(null)
      } finally {
        setLoading(false)
      }
    }

    loadArticle()
  }, [selectedArticleId, resourceKey, loaderRegistry])

  // Group entries by manual/category
  const groupedEntries = useMemo(() => {
    const groups: Record<string, any[]> = {}
    
    entries.forEach(entry => {
      const category = entry.categories?.[0] || 'other'
      if (!groups[category]) {
        groups[category] = []
      }
      groups[category].push(entry)
    })
    
    return groups
  }, [entries])

  // Filter entries based on search
  const filteredGroupedEntries = useMemo(() => {
    if (!searchQuery.trim()) {
      return groupedEntries
    }
    
    const query = searchQuery.toLowerCase()
    const filtered: Record<string, any[]> = {}
    
    Object.entries(groupedEntries).forEach(([category, categoryEntries]) => {
      const matchingEntries = categoryEntries.filter(entry => 
        entry.title?.toLowerCase().includes(query) ||
        entry.identifier?.toLowerCase().includes(query)
      )
      
      if (matchingEntries.length > 0) {
        filtered[category] = matchingEntries
      }
    })
    
    return filtered
  }, [groupedEntries, searchQuery])

  const toggleCategory = (category: string) => {
    const newExpanded = new Set(expandedCategories)
    if (newExpanded.has(category)) {
      newExpanded.delete(category)
    } else {
      newExpanded.add(category)
    }
    setExpandedCategories(newExpanded)
  }

  const handleBackToToc = () => {
    setViewMode('toc')
    setSelectedArticleId('')
    setArticle(null)
  }

  const handleArticleClick = (entryId: string) => {
    setSelectedArticleId(entryId)
  }

  const handleEntryLinkClick = (linkHref: string) => {
    // Extract article ID from link (e.g., "rc://en/ta/man/translate/translate-unknown" -> "translate/translate-unknown")
    const match = linkHref.match(/\/ta\/man\/(.+)/)
    if (match && onEntryLinkClick) {
      const entryId = match[1]
      onEntryLinkClick(resourceKey, entryId)
    }
  }

  const categoryDisplayNames: Record<string, string> = {
    'translate': 'Translate Manual',
    'checking': 'Checking Manual',
    'process': 'Process Manual',
    'intro': 'Introduction',
    'other': 'Other'
  }

  // TOC View
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
              className="w-full pl-8 pr-3 py-1.5 text-sm border border-gray-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
              aria-label="Search translation academy articles"
            />
          </div>
        </div>

        {/* TOC Content */}
        <div className="flex-1 overflow-y-auto">
          {loadingMetadata || !metadataLoaded ? (
            <div 
              className="flex items-center justify-center h-32"
              role="status"
              aria-label="Loading content"
            >
              <Loader className="w-6 h-6 text-purple-500 animate-spin" />
            </div>
          ) : Object.keys(filteredGroupedEntries).length === 0 ? (
            <div 
              className="flex items-center justify-center h-full"
              title={searchQuery ? 'No matches' : 'No entries'}
            >
              <FileText className="w-16 h-16 text-gray-300 opacity-60" />
            </div>
          ) : (
            Object.entries(filteredGroupedEntries).map(([category, categoryEntries]) => {
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
                    <GraduationCap className="w-4 h-4 text-purple-600" />
                    <span className="text-sm font-medium text-gray-700">
                      {categoryDisplayNames[category] || category}
                    </span>
                    <span className="ml-auto px-1.5 py-0.5 bg-gray-200 text-gray-600 rounded text-xs font-semibold">
                      {categoryEntries.length}
                    </span>
                  </button>
                  
                  {/* Entries - only show if expanded */}
                  {isExpanded && (
                    <>
                      {categoryEntries.map((entry) => {
                        const entryId = entry.identifier || entry.id
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
                              if (onEntryLinkClick && resourceKey) {
                                onEntryLinkClick(resourceKey, entryId)
                              } else {
                                setSelectedArticleId(entryId)
                                setViewMode('article')
                              }
                            }}
                            className={`w-full text-left px-3 py-2 text-sm hover:bg-white transition-colors flex items-center gap-2 ${
                              selectedArticleId === entryId
                                ? 'bg-white text-purple-600 border-l-2 border-purple-600 font-medium'
                                : 'text-gray-700'
                            }`}
                            title={entry.title}
                            aria-label={`View ${entry.title}`}
                          >
                            <FileText className={`w-3.5 h-3.5 flex-shrink-0 ${
                              selectedArticleId === entryId ? 'text-purple-600' : 'text-gray-400'
                            }`} />
                            <span className="truncate flex-1">{entry.title}</span>
                          </button>
                        )
                      })}
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

  // Article View
  return (
    <div className="h-full flex flex-col bg-white">
      {/* Header */}
      <div className="flex-shrink-0 p-4 border-b">
        <button
          onClick={handleBackToToc}
          className="flex items-center gap-2 text-purple-600 hover:text-purple-700 mb-2"
        >
          <ArrowLeft className="w-4 h-4" />
          <span className="text-sm font-medium">Back to articles</span>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto">
        {loading ? (
          <div 
            className="flex items-center justify-center h-full"
            role="status"
            aria-label="Loading article"
          >
            <Loader className="w-8 h-8 text-purple-500 animate-spin" />
          </div>
        ) : error ? (
          <div 
            className="flex items-center justify-center h-full"
            title={error}
          >
            <AlertCircle className="w-12 h-12 text-red-500" />
          </div>
        ) : article ? (
          <article className="max-w-4xl mx-auto p-6">
            {/* Article Header */}
            <header className="mb-6 pb-4 border-b border-slate-200">
              <div className="flex items-start gap-3 mb-2">
                <GraduationCap className="w-6 h-6 text-purple-500 mt-1 flex-shrink-0" />
                <div className="flex-1">
                  <h1 className="text-2xl font-bold text-slate-800">{article.title}</h1>
                  {article.question && (
                    <p className="text-sm text-slate-600 mt-2 italic">
                      This page answers: {article.question}
                    </p>
                  )}
                </div>
              </div>
            </header>

            {/* Article Content */}
            {article.content && (
              <div 
                className="prose prose-slate max-w-none mb-8"
                dangerouslySetInnerHTML={{ __html: article.content }}
                onClick={(e) => {
                  const target = e.target as HTMLElement
                  if (target.tagName === 'A') {
                    e.preventDefault()
                    const href = target.getAttribute('href')
                    if (href) {
                      handleEntryLinkClick(href)
                    }
                  }
                }}
              />
            )}

            {/* Related Articles */}
            {article.relatedArticles && article.relatedArticles.length > 0 && (
              <div className="mt-6 pt-6 border-t border-slate-200">
                <h3 className="text-sm font-semibold text-slate-700 mb-3">Related Articles</h3>
                <div className="flex flex-wrap gap-2">
                  {article.relatedArticles.map((link, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleEntryLinkClick(link)}
                      className="inline-flex items-center gap-1 px-3 py-1 bg-purple-50 text-purple-700 rounded-full text-xs hover:bg-purple-100 transition-colors"
                    >
                      <FileText className="w-3 h-3" />
                      {link}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </article>
        ) : (
          <div 
            className="flex items-center justify-center h-full"
            title="No article selected"
          >
            <FileText className="w-16 h-16 text-gray-300 opacity-60" />
          </div>
        )}
      </div>
    </div>
  )
}
