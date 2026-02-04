/**
 * Language Selector Step - Refactored with DRY principles
 * Uses shared useDoor43Data hook and SelectableGrid component
 */

import { useState } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useCatalogManager } from '../../contexts'
import { useDoor43Data } from '../../hooks'
import { Loader2, Database, Wifi, Globe, AlertCircle, RefreshCw } from 'lucide-react'
import { SelectableGridWithStatus } from '../shared/SelectableGrid'

export function LanguageSelectorStep() {
  const [searchQuery, setSearchQuery] = useState('')
  
  const catalogManager = useCatalogManager()
  const selectedLanguages = useWorkspaceStore((state) => state.selectedLanguages)
  const toggleLanguage = useWorkspaceStore((state) => state.toggleLanguage)
  const setAvailableLanguages = useWorkspaceStore((state) => state.setAvailableLanguages)

  // Use shared hook for Door43 data fetching
  const { data: languages, loading: isLoading, error, retry } = useDoor43Data({
    fetchFn: async (client, filters) => {
      console.log('🔍 Loading languages with filters:', filters)
      
      // Get Door43 languages first (to get proper names)
      const door43Langs = await client.getLanguages(filters)
      console.log('🌐 Found', door43Langs.length, 'languages from Door43')
      console.log('   (filtered by', filters.subjects?.length || 0, 'supported subjects)')
      
      // Create a map of language codes to names from Door43
      const door43NameMap = new Map<string, string>()
      for (const lang of door43Langs) {
        door43NameMap.set(lang.code, lang.name || lang.code.toUpperCase())
      }
      
      // Get catalog languages and use Door43 names if available
      const catalogStats = await catalogManager.getCatalogStats()
      const catalogLanguageCodes = Object.keys(catalogStats.byLanguage)
      console.log('📚 Found', catalogLanguageCodes.length, 'languages in local catalog')
      
      // Merge and deduplicate
      const languageMap = new Map<string, { code: string; name: string; source: 'catalog' | 'door43' }>()
      
      // Add catalog languages with proper names from Door43
      for (const code of catalogLanguageCodes) {
        languageMap.set(code, {
          code,
          name: door43NameMap.get(code) || code.toUpperCase(),
          source: 'catalog'
        })
      }
      
      // Add remaining Door43 languages that aren't in catalog
      for (const lang of door43Langs) {
        if (!languageMap.has(lang.code)) {
          languageMap.set(lang.code, {
            code: lang.code,
            name: lang.name || lang.code.toUpperCase(),
            source: 'door43'
          })
        }
      }
      
      const merged = Array.from(languageMap.values()).sort((a, b) => a.name.localeCompare(b.name))
      
      // Update workspace store
      setAvailableLanguages(merged)
      
      const catalogCount = Array.from(languageMap.values()).filter(l => l.source === 'catalog').length
      console.log('✅ Total unique languages:', merged.length)
      console.log('   From catalog:', catalogCount)
      console.log('   From Door43:', door43Langs.length)
      console.log('   Merged (deduplicated):', merged.length)
      
      return merged
    },
    dependencies: [],
  })

  const filteredLanguages = searchQuery
    ? languages.filter(
        (lang) =>
          lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.code.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : languages

  const catalogLanguages = filteredLanguages.filter(l => l.source === 'catalog')
  const onlineLanguages = filteredLanguages.filter(l => l.source === 'door43')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }
  
  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-red-500 mb-4" />
        <button
          onClick={retry}
          className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors"
          title="Retry loading languages"
          aria-label="Retry loading languages"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    )
  }
  
  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-400"
            placeholder="Search..."
            aria-label="Search languages"
          />
        </div>
      </div>

      {/* Language Grid using shared SelectableGridWithStatus */}
      <div className="space-y-4">
        {/* Catalog Languages */}
        {catalogLanguages.length > 0 && (
          <SelectableGridWithStatus
            items={catalogLanguages}
            selected={selectedLanguages}
            onToggle={toggleLanguage}
            getKey={(lang) => lang.code}
            getStatus={() => 'cached'}
            renderItem={(lang, isSelected, status) => (
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

        {/* Online Languages */}
        {onlineLanguages.length > 0 && (
          <SelectableGridWithStatus
            items={onlineLanguages}
            selected={selectedLanguages}
            onToggle={toggleLanguage}
            getKey={(lang) => lang.code}
            getStatus={() => 'online'}
            renderItem={(lang, isSelected, status) => (
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

        {/* No Results */}
        {filteredLanguages.length === 0 && (
          <div className="text-center py-12 text-gray-500">
            <Globe className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          </div>
        )}
      </div>
    </div>
  )
}
