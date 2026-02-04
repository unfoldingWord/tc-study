/**
 * Organization Selector Step - Refactored with DRY principles
 * Uses shared useDoor43Data hook and SelectableGrid component
 */

import { useState } from 'react'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { useDoor43Data } from '../../hooks'
import { Loader2, Building2, AlertCircle, RefreshCw } from 'lucide-react'
import { SelectableGrid } from '../shared/SelectableGrid'

export function OrganizationSelectorStep() {
  const [searchQuery, setSearchQuery] = useState('')
  
  const selectedLanguages = useWorkspaceStore((state) => state.selectedLanguages)
  const selectedOrganizations = useWorkspaceStore((state) => state.selectedOrganizations)
  const toggleOrganization = useWorkspaceStore((state) => state.toggleOrganization)
  const setAvailableOrganizations = useWorkspaceStore((state) => state.setAvailableOrganizations)

  // Use shared hook for Door43 data fetching
  const { data: organizations, loading: isLoading, error, retry } = useDoor43Data({
    fetchFn: async (client, filters) => {
      console.log('🔍 Loading organizations with filters:', filters)
      console.log('   Selected languages:', Array.from(selectedLanguages))

      const orgs = await client.getOrganizations({
        languages: Array.from(selectedLanguages),
        subjects: filters.subjects,
        stage: filters.stage,
        topic: filters.topic,
      })
      
      console.log('🏢 Found', orgs.length, 'organizations')
      console.log('   (filtered by', selectedLanguages.size, 'languages and', filters.subjects?.length || 0, 'subjects)')
      
      // Transform to consistent format
      const transformed = orgs.map(org => ({
        id: org.id,
        username: org.username,
        name: org.full_name || org.username,
        description: org.description,
        avatarUrl: org.avatar_url,
      }))
      
      // Update workspace store
      setAvailableOrganizations(transformed)
      
      return transformed
    },
    dependencies: [selectedLanguages.size], // Reload when languages change
    autoLoad: selectedLanguages.size > 0, // Only load if languages are selected
  })

  const filteredOrganizations = searchQuery
    ? organizations.filter(
        (org) =>
          org.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          org.username.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : organizations

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
          title="Retry loading organizations"
          aria-label="Retry loading organizations"
        >
          <RefreshCw className="w-4 h-4" />
        </button>
      </div>
    )
  }
  
  if (selectedLanguages.size === 0) {
    return (
      <div className="text-center py-20">
        <Building2 className="w-16 h-16 mx-auto mb-4 text-gray-300" />
      </div>
    )
  }

  return (
    <div>
      {/* Search */}
      <div className="mb-4">
        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-blue-500 bg-white text-gray-900 placeholder-gray-400"
            placeholder="Search..."
            aria-label="Search organizations"
          />
        </div>
      </div>

      {/* Organization Grid using shared SelectableGrid */}
      <div className="space-y-4">
        {filteredOrganizations.length === 0 ? (
          <div className="text-center py-12 text-gray-500">
            <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
          </div>
        ) : (
          <SelectableGrid
            items={filteredOrganizations}
            selected={selectedOrganizations}
            onToggle={toggleOrganization}
            getKey={(org) => org.username}
            renderItem={(org, isSelected) => (
              <>
                {org.avatarUrl && (
                  <img 
                    src={org.avatarUrl} 
                    alt=""
                    className="w-10 h-10 rounded-full mb-2"
                  />
                )}
                
                <div className="font-semibold text-gray-900 mb-0.5 pr-6 truncate">{org.name}</div>
                <div className="text-sm text-gray-500 truncate">{org.username}</div>
              </>
            )}
          />
        )}
      </div>
    </div>
  )
}
