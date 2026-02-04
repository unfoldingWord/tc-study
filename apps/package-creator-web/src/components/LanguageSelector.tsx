/**
 * Language Selection Component
 * Allows users to select one or more languages
 */

import { useEffect } from 'react'
import { usePackageStore } from '@/lib/store'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { Loader2, Check, Globe } from 'lucide-react'
import { API_FILTERS } from '@/lib/subjects'

export function LanguageSelector() {
  const availableLanguages = usePackageStore((state) => state.availableLanguages)
  const selectedLanguages = usePackageStore((state) => state.selectedLanguages)
  const loadingLanguages = usePackageStore((state) => state.loadingLanguages)
  const setAvailableLanguages = usePackageStore((state) => state.setAvailableLanguages)
  const setLoadingLanguages = usePackageStore((state) => state.setLoadingLanguages)
  const toggleLanguage = usePackageStore((state) => state.toggleLanguage)

  useEffect(() => {
    loadLanguages()
  }, [])

  const loadLanguages = async () => {
    setLoadingLanguages(true)
    try {
      console.log('🌐 Loading languages with filters:', API_FILTERS)
      const client = getDoor43ApiClient()
      
      const languages = await client.getLanguages(API_FILTERS)
      
      console.log('✅ Door43 API Response:', {
        endpoint: '/api/v1/catalog/list/languages',
        filters: API_FILTERS,
        count: languages.length,
        sample: languages.slice(0, 3),
      })
      
      // Show ALL languages from API, even if incomplete
      // This helps identify API data issues
      setAvailableLanguages(languages)
      
      // Log warnings for data quality issues
      const missingCode = languages.filter(l => !l.code).length
      const missingName = languages.filter(l => !l.name).length
      
      if (missingCode > 0 || missingName > 0) {
        console.warn('⚠️ API Data Quality Issues:', {
          total: languages.length,
          missingCode,
          missingName,
          message: 'Some languages are missing required fields'
        })
      }
    } catch (error) {
      console.error('❌ Failed to load languages:', error)
      throw error // Re-throw to show error in UI
    } finally {
      setLoadingLanguages(false)
    }
  }

  if (loadingLanguages) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-3 text-gray-600">Loading languages from Door43 API...</span>
      </div>
    )
  }

  const validLanguages = availableLanguages.filter(l => l.code && l.name)
  const invalidLanguages = availableLanguages.filter(l => !l.code || !l.name)

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Languages</h2>
        <p className="text-gray-600">
          Choose one or more languages for your package. You can mix resources from different languages.
        </p>
        
        {/* API Filters & Status */}
        <div className="mt-4 space-y-3">
          <div className="p-3 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="text-sm mb-2">
              <span className="font-semibold text-purple-900">API Filters:</span>
            </div>
            <div className="flex flex-wrap items-center gap-2 text-xs mb-2">
              <code className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                stage=prod
              </code>
              <code className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                topic=tc-ready
              </code>
            </div>
            <div className="text-xs text-purple-700 mb-1">
              <span className="font-semibold">Subjects (7):</span>
            </div>
            <div className="flex flex-wrap gap-1 text-xs">
              {['Bible', 'Aligned Bible', 'Translation Words', 'Translation Academy', 
                'TSV Translation Notes', 'TSV Translation Questions', 'TSV Translation Words Links'].map(subject => (
                <code key={subject} className="px-2 py-0.5 bg-purple-100 text-purple-700 rounded">
                  {subject}
                </code>
              ))}
            </div>
            <div className="text-xs text-purple-600 mt-2">
              Only showing languages with published packages in these subjects
            </div>
          </div>
          
          <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-center gap-2 text-sm">
              <span className="font-semibold">API Response:</span>
              <span>{availableLanguages.length} total languages</span>
              {validLanguages.length > 0 && (
                <span className="text-green-600">• {validLanguages.length} valid</span>
              )}
              {invalidLanguages.length > 0 && (
                <span className="text-orange-600">• {invalidLanguages.length} incomplete</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {availableLanguages.length === 0 && (
        <div className="text-center py-12">
          <div className="text-red-600 font-semibold mb-2">❌ No languages returned from API</div>
          <div className="text-sm text-gray-600">
            Check console for error details. Endpoint: /api/v1/catalog/list/languages
          </div>
        </div>
      )}

      {validLanguages.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {validLanguages.map((language) => {
            const isSelected = selectedLanguages.has(language.code)
            
            return (
              <button
                key={language.code}
                onClick={() => toggleLanguage(language.code)}
                className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                  isSelected
                    ? 'border-primary-500 bg-primary-50'
                    : 'border-gray-200 hover:border-primary-300 bg-white'
                }`}
              >
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2">
                    <Globe className="w-5 h-5 text-gray-400" />
                    <div>
                      <div className="font-semibold text-gray-900">{language.name}</div>
                      <div className="text-sm text-gray-500">
                        {language.code}
                        {language.anglicized_name && language.anglicized_name !== language.name && (
                          <span className="text-gray-400"> • {language.anglicized_name}</span>
                        )}
                      </div>
                    </div>
                  </div>
                  
                  {isSelected && (
                    <Check className="w-5 h-5 text-primary-600" />
                  )}
                </div>
                
                {language.direction === 'rtl' && (
                  <div className="mt-2 text-xs text-gray-500">Right-to-left</div>
                )}
              </button>
            )
          })}
        </div>
      )}

      {invalidLanguages.length > 0 && (
        <div className="mt-6 p-4 bg-orange-50 border border-orange-200 rounded-lg">
          <div className="font-semibold text-orange-900 mb-2">
            ⚠️ {invalidLanguages.length} Incomplete Language Records
          </div>
          <div className="text-sm text-orange-700 mb-3">
            These languages are missing required fields (code or name) and cannot be used:
          </div>
          <div className="max-h-40 overflow-y-auto">
            <pre className="text-xs bg-white p-2 rounded">
              {JSON.stringify(invalidLanguages.slice(0, 5), null, 2)}
            </pre>
          </div>
          {invalidLanguages.length > 5 && (
            <div className="text-xs text-orange-600 mt-2">
              ... and {invalidLanguages.length - 5} more
            </div>
          )}
        </div>
      )}

      {selectedLanguages.size > 0 && (
        <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <div className="font-medium text-primary-900 mb-2">
            Selected Languages ({selectedLanguages.size}):
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedLanguages).map((code) => {
              const lang = availableLanguages.find((l) => l.code === code)
              return (
                <span
                  key={code}
                  className="px-3 py-1 bg-primary-600 text-white rounded-full text-sm"
                >
                  {lang?.name || code}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
