/**
 * Organization Selector Step
 * Allows users to select content organizations
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { Building2, Check, Loader2, Search } from 'lucide-react'
import { useEffect, useState } from 'react'
import { API_FILTERS } from '../../../lib/config'
import { usePackageCreatorStore } from '../../../lib/stores'

export function OrganizationSelector() {
  const selectedLanguages = usePackageCreatorStore((state) => state.selectedLanguages)
  const availableOrganizations = usePackageCreatorStore((state) => state.availableOrganizations)
  const selectedOrganizations = usePackageCreatorStore((state) => state.selectedOrganizations)
  const loadingOrganizations = usePackageCreatorStore((state) => state.loadingOrganizations)
  const setAvailableOrganizations = usePackageCreatorStore((state) => state.setAvailableOrganizations)
  const setLoadingOrganizations = usePackageCreatorStore((state) => state.setLoadingOrganizations)
  const toggleOrganization = usePackageCreatorStore((state) => state.toggleOrganization)

  const [searchQuery, setSearchQuery] = useState('')

  useEffect(() => {
    if (selectedLanguages.size > 0) {
      loadOrganizations()
    }
  }, [selectedLanguages])

  const loadOrganizations = async () => {
    setLoadingOrganizations(true)
    try {
      const client = getDoor43ApiClient()
      const languageCodes = Array.from(selectedLanguages)
      
      // Get organizations for selected languages
      const orgs = await client.getOwners({
        ...API_FILTERS,
        languages: languageCodes,
      })
      
      console.log('📦 Organizations from API:', orgs)
      console.log('📦 First org sample:', orgs[0])
      console.log('📦 Type of first org:', typeof orgs[0])
      
      // Transform to our Door43Organization format
      // Handle both string[] and object[] responses from API
      const transformedOrgs = (orgs || []).map((org: any) => {
        // If it's already an object with username/id, use it
        if (typeof org === 'object' && org !== null) {
          const id = org.username || org.id || org.name || ''
          // Prefer full_name for display, fallback to username
          const displayName = org.full_name || org.username || org.name || org.id || ''
          return {
            id: String(id),
            name: String(displayName),
            url: org.website || `https://git.door43.org/${id}`,
          }
        }
        // Otherwise treat as string
        return {
          id: String(org),
          name: String(org),
          url: `https://git.door43.org/${org}`,
        }
      })
      
      console.log('📦 Transformed organizations:', transformedOrgs)
      console.log('📦 First transformed org:', transformedOrgs[0])
      
      setAvailableOrganizations(transformedOrgs)
    } catch (error) {
      console.error('Failed to load organizations:', error)
      setAvailableOrganizations([])
    } finally {
      setLoadingOrganizations(false)
    }
  }

  const filteredOrganizations = availableOrganizations.filter(org => {
    // Always expect objects with name property since we transform them
    if (!org || typeof org !== 'object') return false
    const orgName = org.name
    if (!orgName || typeof orgName !== 'string') return false
    if (!searchQuery) return true // No search query, show all
    return orgName.toLowerCase().includes(searchQuery.toLowerCase())
  })

  console.log('📦 Filtered organizations:', filteredOrganizations.length, 'out of', availableOrganizations.length)

  if (selectedLanguages.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Building2 className="mb-4 h-12 w-12 text-gray-300" />
        <p className="text-gray-600">
          Please select at least one language first
        </p>
      </div>
    )
  }

  if (loadingOrganizations) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
        <span className="mt-4 text-sm text-gray-600">Loading organizations...</span>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-8">
        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          Select Organization
        </h2>
        <p className="text-gray-600">
          Choose the content provider (e.g., unfoldingWord)
        </p>
      </div>

      {/* Search */}
      <div className="mb-6">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search organizations..."
            className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
          />
        </div>
      </div>

      {/* Organization Grid */}
      <div className="grid max-h-[400px] gap-3 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3">
        {filteredOrganizations.map((org) => {
          // Always expect objects now since we transform them
          const orgId = org.id
          const orgName = org.name
          const isSelected = selectedOrganizations.has(orgId)
          
          return (
            <button
              key={orgId}
              onClick={() => toggleOrganization(orgId)}
              className={`group flex items-center justify-between rounded-lg border-2 p-4 text-left transition-all ${
                isSelected
                  ? 'border-gray-900 bg-gray-50'
                  : 'border-gray-200 bg-white hover:border-gray-400'
              }`}
            >
              <div className="flex items-center gap-3">
                <Building2 className={`h-5 w-5 ${isSelected ? 'text-gray-900' : 'text-gray-400'}`} />
                <div>
                  <div className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                    {orgName}
                  </div>
                </div>
              </div>
              {isSelected && (
                <Check className="h-5 w-5 text-gray-900" />
              )}
            </button>
          )
        })}
      </div>

      {filteredOrganizations.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          {searchQuery ? `No organizations found matching "${searchQuery}"` : 'No organizations available'}
        </div>
      )}

      {selectedOrganizations.size > 0 && (
        <div className="mt-6 rounded-lg border border-gray-200 bg-gray-50 p-4">
          <div className="text-sm font-medium text-gray-700">
            Selected: {selectedOrganizations.size} organization{selectedOrganizations.size !== 1 ? 's' : ''}
          </div>
        </div>
      )}
    </div>
  )
}
