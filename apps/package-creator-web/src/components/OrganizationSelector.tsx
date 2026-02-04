/**
 * Organization Selection Component
 * Shows organizations that have resources in selected languages
 */

import { useEffect, useState } from 'react'
import { usePackageStore } from '@/lib/store'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { Loader2, Check, Building2 } from 'lucide-react'
import type { Door43Organization } from '@/types/manifest'
import { API_FILTERS } from '@/lib/subjects'

export function OrganizationSelector() {
  const selectedLanguages = usePackageStore((state) => state.selectedLanguages)
  const selectedOrganizations = usePackageStore((state) => state.selectedOrganizations)
  const setLoadingOrganizations = usePackageStore((state) => state.setLoadingOrganizations)
  const toggleOrganization = usePackageStore((state) => state.toggleOrganization)

  const [organizations, setOrganizations] = useState<Door43Organization[]>([])
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    if (selectedLanguages.size > 0) {
      loadOrganizations()
    }
  }, [selectedLanguages])

  const loadOrganizations = async () => {
    setLoading(true)
    setLoadingOrganizations(true)
    
    try {
      console.log('🏢 Loading organizations with filters:', API_FILTERS)
      const client = getDoor43ApiClient()
      
      // Combine selected languages with API filters
      const languages = Array.from(selectedLanguages)
      
      console.log('📡 Fetching organizations with filters:', {
        languages,
        ...API_FILTERS
      })
      
      const orgs = await client.getOrganizations({
        languages,
        subjects: API_FILTERS.subjects,
        stage: API_FILTERS.stage,
        topic: API_FILTERS.topic
      })
      
      console.log(`✅ Received ${orgs.length} organizations`)
      setOrganizations(orgs)
      
      if (orgs.length === 0) {
        console.warn('⚠️ No organizations found for selected languages')
      }
    } catch (error) {
      console.error('❌ Failed to load organizations:', error)
      setOrganizations([])
    } finally {
      setLoading(false)
      setLoadingOrganizations(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-3 text-gray-600">Loading organizations...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Organizations</h2>
        <p className="text-gray-600 mb-4">
          Choose one or more organizations to source resources from.
        </p>
        
        {/* Filter Status */}
        <div className="p-3 bg-blue-50 border border-blue-200 rounded-lg">
          <div className="text-sm">
            <span className="font-semibold text-blue-900">Filtered by:</span>
            <div className="mt-2 flex flex-wrap gap-2">
              {Array.from(selectedLanguages).map(lang => (
                <code key={lang} className="px-2 py-0.5 bg-blue-100 text-blue-700 rounded text-xs">
                  {lang}
                </code>
              ))}
            </div>
            <div className="text-xs text-blue-600 mt-2">
              Showing organizations with published packages in selected languages
            </div>
          </div>
        </div>
        
        {!loading && organizations.length > 0 && (
          <div className="mt-3 p-2 bg-green-50 border border-green-200 rounded text-sm text-green-700">
            ✅ Found {organizations.length} organization{organizations.length !== 1 ? 's' : ''} with resources
          </div>
        )}
      </div>

      {organizations.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-orange-600 font-semibold mb-2">
            ⚠️ No organizations found
          </div>
          <div className="text-sm">
            No organizations have published packages for the selected languages.
            <br />
            Try selecting different languages.
          </div>
        </div>
      )}

      {organizations.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {organizations.map((org) => {
          const isSelected = selectedOrganizations.has(org.username)
          
          return (
            <button
              key={org.id}
              onClick={() => toggleOrganization(org.username)}
              className={`relative p-6 rounded-lg border-2 transition-all text-left ${
                isSelected
                  ? 'border-primary-500 bg-primary-50'
                  : 'border-gray-200 hover:border-primary-300 bg-white'
              }`}
            >
              <div className="flex items-start justify-between mb-3">
                <div className="flex items-center gap-3">
                  {org.avatar_url ? (
                    <img
                      src={org.avatar_url}
                      alt={org.username}
                      className="w-10 h-10 rounded-full"
                    />
                  ) : (
                    <Building2 className="w-10 h-10 text-gray-400" />
                  )}
                  <div>
                    <div className="font-semibold text-gray-900">
                      {org.full_name || org.username}
                    </div>
                    <div className="text-sm text-gray-500">@{org.username}</div>
                  </div>
                </div>
                
                {isSelected && (
                  <Check className="w-5 h-5 text-primary-600 flex-shrink-0" />
                )}
              </div>
              
              {org.description && (
                <p className="text-sm text-gray-600 line-clamp-2">
                  {org.description}
                </p>
              )}
              
              {org.website && (
                <div className="mt-3 text-xs text-primary-600">
                  {org.website}
                </div>
              )}
            </button>
            )
          })}
        </div>
      )}

      {selectedOrganizations.size > 0 && (
        <div className="mt-6 p-4 bg-primary-50 rounded-lg border border-primary-200">
          <div className="font-medium text-primary-900 mb-2">
            Selected Organizations ({selectedOrganizations.size}):
          </div>
          <div className="flex flex-wrap gap-2">
            {Array.from(selectedOrganizations).map((username) => {
              const org = organizations.find((o) => o.username === username)
              return (
                <span
                  key={username}
                  className="px-3 py-1 bg-primary-600 text-white rounded-full text-sm"
                >
                  {org?.full_name || username}
                </span>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
