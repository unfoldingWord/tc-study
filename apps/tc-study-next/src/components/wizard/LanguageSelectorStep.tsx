/**
 * Language Selector Step - Refactored with DRY principles
 * Uses shared useDoor43Data hook and SelectableGrid component
 */

import { useState } from 'react'
import { useWizardStore } from '../../lib/stores/wizardStore'
import { useCatalogManager } from '../../contexts'
import { useDoor43Data } from '../../hooks'
import { Loader2, Database, Wifi, Globe, AlertCircle, RefreshCw } from 'lucide-react'
import {
  door43ToListNameFields,
  languageListDisplayName,
} from '../../features/read/languageListDisplayName'
import { SelectableGridWithStatus } from '../shared/SelectableGrid'

export function LanguageSelectorStep() {
  const [searchQuery, setSearchQuery] = useState('')

  const catalogManager = useCatalogManager()
  const selectedLanguages = useWizardStore((state) => state.selectedLanguages)
  const toggleLanguage = useWizardStore((state) => state.toggleLanguage)
  const setAvailableLanguages = useWizardStore((state) => state.setAvailableLanguages)

  // Use shared hook for Door43 data fetching
  const { data: languages, loading: isLoading, error, retry } = useDoor43Data({
    fetchFn: async (client, filters) => {


      // Get Door43 languages first (to get proper names)
      const door43Langs = await client.getLanguages(filters)



      const door43NameMap = new Map<string, string>()
      const door43AnglicizedMap = new Map<string, string>()
      for (const lang of door43Langs) {
        const fields = door43ToListNameFields(lang)
        door43NameMap.set(lang.code, fields.name || lang.code.toUpperCase())
        if (fields.anglicizedName) door43AnglicizedMap.set(lang.code, fields.anglicizedName)
      }

      // Get catalog languages and use Door43 names if available
      const catalogStats = await catalogManager.getCatalogStats()
      const catalogLanguageCodes = Object.keys(catalogStats.byLanguage)


      // Merge and deduplicate
      const languageMap = new Map<
        string,
        { code: string; name: string; anglicizedName?: string; source: 'catalog' | 'door43' }
      >()

      // Add catalog languages with proper names from Door43
      for (const code of catalogLanguageCodes) {
        languageMap.set(code, {
          code,
          name: door43NameMap.get(code) || code.toUpperCase(),
          anglicizedName: door43AnglicizedMap.get(code),
          source: 'catalog'
        })
      }

      // Add remaining Door43 languages that aren't in catalog
      for (const lang of door43Langs) {
        if (!languageMap.has(lang.code)) {
          languageMap.set(lang.code, {
            code: lang.code,
            ...door43ToListNameFields(lang),
            source: 'door43'
          })
        }
      }

      const merged = Array.from(languageMap.values()).sort((a, b) => a.name.localeCompare(b.name))

      // Update workspace store
      setAvailableLanguages(merged)

      const _catalogCount = Array.from(languageMap.values()).filter(l => l.source === 'catalog').length





      return merged
    },
    dependencies: [],
  })

  const filteredLanguages = searchQuery
    ? languages.filter(
        (lang) =>
          lang.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          lang.code.toLowerCase().includes(searchQuery.toLowerCase()) ||
          (lang.anglicizedName?.toLowerCase().includes(searchQuery.toLowerCase()) ?? false)
      )
    : languages

  const catalogLanguages = filteredLanguages.filter(l => l.source === 'catalog')
  const onlineLanguages = filteredLanguages.filter(l => l.source === 'door43')

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-accent" />
      </div>
    )
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center py-20">
        <AlertCircle className="w-12 h-12 text-danger mb-4" />
        <button
          onClick={retry}
          className="flex items-center gap-2 px-4 py-2 bg-accent text-white rounded-lg hover:bg-accent-hover transition-colors"
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
          <Globe className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-fg-muted" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-border rounded-lg focus:ring-2 focus:ring-accent focus:border-accent bg-surface text-fg placeholder:text-fg-muted"
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
            renderItem={(lang, _isSelected, _status) => (
              <>
                <div className="font-semibold text-fg mb-0.5">
                  {languageListDisplayName(lang, lang.code)}
                </div>
                <div className="text-sm text-fg-secondary">{lang.code}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <Database className="w-3 h-3 text-accent" />
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
            renderItem={(lang, _isSelected, _status) => (
              <>
                <div className="font-semibold text-fg mb-0.5">
                  {languageListDisplayName(lang, lang.code)}
                </div>
                <div className="text-sm text-fg-secondary">{lang.code}</div>
                <div className="flex items-center gap-1 mt-1.5">
                  <Wifi className="w-3 h-3 text-accent" />
                </div>
              </>
            )}
          />
        )}

        {/* No Results */}
        {filteredLanguages.length === 0 && (
          <div className="text-center py-12 text-fg-secondary">
            <Globe className="w-12 h-12 mx-auto mb-3 text-fg-muted" />
          </div>
        )}
      </div>
    </div>
  )
}
