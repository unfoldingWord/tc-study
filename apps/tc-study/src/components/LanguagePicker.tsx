/**
 * Language Picker Component
 *
 * Modal for selecting a language on the Read page. Styled like the resource
 * selection wizard in the Studio sidebar (header, progress strip, content, footer)
 * but with a single step: language selection only.
 * Uses Door43 API via useDoor43Data (same as LanguageSelectorStep).
 */

import {
    AlertCircle,
    Database,
    Globe,
    Languages,
    Loader2,
    RefreshCw,
    Wifi,
    X,
} from 'lucide-react'
import { useCallback, useEffect, useRef, useState } from 'react'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { useCatalogManager, useResourceTypeRegistry } from '../contexts'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { SelectableGridWithStatus } from './shared/SelectableGrid'

// Cache key for localStorage
const LANGUAGES_CACHE_KEY = 'tc-study:languages-cache'
const CACHE_VERSION = 2 // Increment to invalidate cache (v2: include direction from list/languages)

interface CachedLanguages {
  version: number
  timestamp: number
  subjects: string[]
  languages: Array<{ code: string; name: string; source: 'catalog' | 'door43'; direction?: 'ltr' | 'rtl' }>
}

interface LanguagePickerProps {
  onLanguageSelected?: (languageCode: string) => void
  compact?: boolean
  autoOpen?: boolean
}

export function LanguagePicker({ onLanguageSelected, compact = false, autoOpen = false }: LanguagePickerProps) {
  const [isOpen, setIsOpen] = useState(autoOpen)
  
  // React to autoOpen prop changes
  useEffect(() => {
    console.log('[LanguagePicker] autoOpen changed to:', autoOpen)
    if (autoOpen) {
      setIsOpen(true)
    }
  }, [autoOpen])
  const [searchQuery, setSearchQuery] = useState('')

  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  const setAvailableLanguages = useWorkspaceStore((s) => s.setAvailableLanguages)

  // Get supported subjects for filtering (stable string for effect/callback deps)
  const supportedSubjects = resourceTypeRegistry.getSupportedSubjects()
  const supportedSubjectsKey = supportedSubjects.join(',')
  
  // Try to load from cache first
  const loadFromCache = (): Array<{ code: string; name: string; source: 'catalog' | 'door43'; direction?: 'ltr' | 'rtl' }> | null => {
    try {
      const cached = localStorage.getItem(LANGUAGES_CACHE_KEY)
      if (!cached) return null
      
      const parsed: CachedLanguages = JSON.parse(cached)
      
      // Validate cache version and subjects match
      if (parsed.version !== CACHE_VERSION) {
        console.log('📦 Cache version mismatch, will fetch fresh')
        return null
      }
      
      // Check if subjects match (order doesn't matter)
      const cachedSubjects = new Set(parsed.subjects)
      const currentSubjects = new Set(supportedSubjects)
      if (cachedSubjects.size !== currentSubjects.size || 
          !supportedSubjects.every(s => cachedSubjects.has(s))) {
        console.log('📦 Cache subjects mismatch, will fetch fresh')
        return null
      }
      
      console.log(`📦 Using cached languages (${parsed.languages.length} languages)`)
      return parsed.languages
    } catch (error) {
      console.warn('⚠️ Failed to load languages from cache:', error)
      return null
    }
  }
  
  // Save to cache after successful fetch
  const saveToCache = (languages: Array<{ code: string; name: string; source: 'catalog' | 'door43'; direction?: 'ltr' | 'rtl' }>) => {
    try {
      const cacheData: CachedLanguages = {
        version: CACHE_VERSION,
        timestamp: Date.now(),
        subjects: supportedSubjects,
        languages,
      }
      localStorage.setItem(LANGUAGES_CACHE_KEY, JSON.stringify(cacheData))
      console.log(`💾 Saved ${languages.length} languages to cache`)
    } catch (error) {
      console.warn('⚠️ Failed to save languages to cache:', error)
    }
  }

  // Displayed list: show cache immediately, then update when revalidation completes
  const [displayedLanguages, setDisplayedLanguages] = useState<Array<{ code: string; name: string; source: 'catalog' | 'door43'; direction?: 'ltr' | 'rtl' }>>([])
  const [isRevalidating, setIsRevalidating] = useState(false)
  const [error, setError] = useState<Error | null>(null)

  const revalidate = useCallback(async () => {
    setIsRevalidating(true)
    setError(null)
    try {
      const client = getDoor43ApiClient()
      console.log('🌐 Revalidating languages with subjects:', supportedSubjects)
      const door43Langs = await client.getLanguages({
        subjects: supportedSubjects,
        stage: 'prod',
        topic: 'tc-ready',
      })
      const door43NameMap = new Map<string, string>()
      const door43DirectionMap = new Map<string, 'ltr' | 'rtl'>()
      for (const lang of door43Langs) {
        door43NameMap.set(lang.code, lang.name || lang.code.toUpperCase())
        door43DirectionMap.set(lang.code, lang.direction)
      }
      const catalogStats = await catalogManager.getCatalogStats()
      const catalogLanguageCodes = Object.keys(catalogStats.byLanguage)
      const languageMap = new Map<
        string,
        { code: string; name: string; source: 'catalog' | 'door43'; direction?: 'ltr' | 'rtl' }
      >()
      for (const code of catalogLanguageCodes) {
        languageMap.set(code, {
          code,
          name: door43NameMap.get(code) || code.toUpperCase(),
          source: 'catalog',
          direction: door43DirectionMap.get(code),
        })
      }
      for (const lang of door43Langs) {
        if (!languageMap.has(lang.code)) {
          languageMap.set(lang.code, {
            code: lang.code,
            name: lang.name || lang.code.toUpperCase(),
            source: 'door43',
            direction: lang.direction,
          })
        }
      }
      const merged = Array.from(languageMap.values()).sort((a, b) =>
        a.name.localeCompare(b.name)
      )
      saveToCache(merged)
      setDisplayedLanguages(merged)
      setAvailableLanguages(merged)
    } catch (err) {
      console.error('❌ Failed to revalidate languages:', err)
      setError(err as Error)
    } finally {
      setIsRevalidating(false)
    }
  }, [supportedSubjectsKey, catalogManager])

  const revalidateRef = useRef(revalidate)
  revalidateRef.current = revalidate

  // When picker opens: show cache immediately (optimistic), then revalidate in background
  useEffect(() => {
    if (!isOpen) return

    const cached = loadFromCache()
    if (cached?.length) {
      setDisplayedLanguages(cached)
      setAvailableLanguages(cached)
    } else {
      setDisplayedLanguages([])
    }
    setError(null)
    revalidateRef.current()
  }, [isOpen])

  const languages = displayedLanguages
  const isLoading = isRevalidating && displayedLanguages.length === 0
  const retry = revalidate

  const filteredLanguages = searchQuery
    ? languages.filter(
        (lang) =>
          lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : languages

  const catalogLanguages = filteredLanguages.filter((l) => l.source === 'catalog')
  const onlineLanguages = filteredLanguages.filter((l) => l.source === 'door43')

  const closeModal = () => {
    setIsOpen(false)
    setSearchQuery('')
  }

  const handleSelect = (code: string) => {
    onLanguageSelected?.(code)
    closeModal()
  }

  return (
    <div className="relative">
      <button
        onClick={() => setIsOpen(true)}
        className={`flex items-center gap-1.5 rounded transition-colors ${
          compact ? 'p-1 text-gray-700 hover:bg-gray-100' : 'px-3 py-1.5 bg-blue-600 text-white hover:bg-blue-700 shadow-md'
        }`}
        title="Select language"
        aria-label="Select language"
      >
        <Languages className="w-4 h-4" />
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center">
          <div
            className="absolute inset-0 bg-black/50 backdrop-blur-sm"
            onClick={closeModal}
            aria-hidden="true"
          />
          <div
            className="relative flex flex-col bg-white border border-gray-200 rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden m-4"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-picker-title"
          >
            {/* Header - matches wizard */}
            <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50 flex-shrink-0">
              <div className="flex items-center gap-2">
                <Languages className="w-5 h-5 text-blue-600" />
              </div>
              <button
                onClick={closeModal}
                className="p-1 hover:bg-gray-100 rounded transition-colors"
                title="Close"
                aria-label="Close"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Progress strip - single step (wizard-style) */}
            <div className="px-4 py-2 border-b border-gray-200 bg-white flex-shrink-0">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <div
                    className="p-1.5 rounded-full bg-blue-600 text-white"
                    title="Language selection"
                    aria-label="Language selection"
                  >
                    <Languages className="w-3.5 h-3.5" />
                  </div>
                </div>
                {(!isLoading || displayedLanguages.length > 0) && !error && (
                  <div className="flex items-center gap-1.5 px-2 py-1 bg-gray-100 rounded-full">
                    {isRevalidating && displayedLanguages.length > 0 && (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" aria-hidden />
                    )}
                    <Globe className="w-3.5 h-3.5 text-gray-600" />
                    <span className="text-xs font-medium text-gray-900">
                      {filteredLanguages.length}
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Content - matches wizard step layout */}
            <div className="flex-1 overflow-auto p-4 min-h-0">
              {isLoading && (
                <div className="flex items-center justify-center py-20">
                  <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
                </div>
              )}

              {error && (
                <div className="flex flex-col items-center justify-center py-20">
                  <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
                  <button
                    onClick={retry}
                    className="flex items-center justify-center p-3 bg-blue-600 text-white rounded-full hover:bg-blue-700 transition-colors"
                    title="Retry loading languages"
                    aria-label="Retry loading languages"
                  >
                    <RefreshCw className="w-5 h-5" />
                  </button>
                </div>
              )}

              {!isLoading && !error && (
                <div>
                  <div className="mb-4">
                    <div className="relative">
                      <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-400"
                        placeholder="..."
                        aria-label="Search languages"
                      />
                    </div>
                  </div>

                  <div className="space-y-4">
                    {catalogLanguages.length > 0 && (
                      <SelectableGridWithStatus
                        items={catalogLanguages}
                        selected={new Set<string>()}
                        onToggle={handleSelect}
                        getKey={(lang) => lang.code}
                        getStatus={() => 'cached'}
                        renderItem={(lang, _selected, _status) => (
                          <>
                            <div className="font-semibold text-gray-900 mb-0.5">{lang.name}</div>
                            <div className="text-sm text-gray-500">{lang.code}</div>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Database className="w-3 h-3 text-green-600" />
                            </div>
                          </>
                        )}
                      />
                    )}
                    {onlineLanguages.length > 0 && (
                      <SelectableGridWithStatus
                        items={onlineLanguages}
                        selected={new Set<string>()}
                        onToggle={handleSelect}
                        getKey={(lang) => lang.code}
                        getStatus={() => 'online'}
                        renderItem={(lang, _selected, _status) => (
                          <>
                            <div className="font-semibold text-gray-900 mb-0.5">{lang.name}</div>
                            <div className="text-sm text-gray-500">{lang.code}</div>
                            <div className="flex items-center gap-1 mt-1.5">
                              <Wifi className="w-3 h-3 text-blue-600" />
                            </div>
                          </>
                        )}
                      />
                    )}
                    {filteredLanguages.length === 0 && (
                      <div className="text-center py-12 text-gray-500">
                        <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            {/* Footer - matches wizard (Cancel only) */}
            <div className="px-4 py-2 border-t border-gray-200 bg-gray-50 flex-shrink-0">
              <div className="flex items-center justify-end gap-1.5">
                <button
                  onClick={closeModal}
                  className="p-1.5 text-gray-700 hover:bg-gray-100 rounded transition-colors"
                  title="Cancel"
                  aria-label="Cancel"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
