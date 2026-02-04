/**
 * Resource Selection Component
 * Shows resources from selected languages and organizations
 */

import { useEffect, useState } from 'react'
import { usePackageStore } from '@/lib/store'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { Loader2, Check, Book, FileText, HelpCircle, BookOpen, Info } from 'lucide-react'
import type { Door43Resource } from '@/types/manifest'
import { API_FILTERS } from '@/lib/subjects'

export function ResourceSelector() {
  const selectedLanguages = usePackageStore((state) => state.selectedLanguages)
  const selectedOrganizations = usePackageStore((state) => state.selectedOrganizations)
  const selectedResources = usePackageStore((state) => state.selectedResources)
  const toggleResource = usePackageStore((state) => state.toggleResource)
  const getLanguageDisplayName = usePackageStore((state) => state.getLanguageDisplayName)

  const [resources, setResources] = useState<Door43Resource[]>([])
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<'language' | 'organization' | 'type'>('language')

  useEffect(() => {
    if (selectedLanguages.size > 0 && selectedOrganizations.size > 0) {
      loadResources()
    }
  }, [selectedLanguages, selectedOrganizations])

  const loadResources = async () => {
    setLoading(true)
    
    try {
      const client = getDoor43ApiClient()
      const allResources: Door43Resource[] = []

      console.log('📚 Loading resources with filters:', API_FILTERS)
      
      // Fetch resources for each combination of language + organization
      for (const lang of Array.from(selectedLanguages)) {
        for (const org of Array.from(selectedOrganizations)) {
          try {
            // Note: The Door43 API's catalog/search endpoint filters by subjects
            const resources = await client.getResourcesByOrgAndLanguage(org, lang, {
              subjects: API_FILTERS.subjects,
              stage: API_FILTERS.stage,
              topic: API_FILTERS.topic,
            })
            allResources.push(...resources)
          } catch (error) {
            console.error(`Failed to load resources for ${org}/${lang}:`, error)
          }
        }
      }

      setResources(allResources)
    } catch (error) {
      console.error('Failed to load resources:', error)
    } finally {
      setLoading(false)
    }
  }

  const getResourceIcon = (id: string) => {
    if (['ult', 'ust', 'glt', 'gst', 'ugnt', 'uhb'].includes(id)) return Book
    if (['tn'].includes(id)) return FileText
    if (['tq'].includes(id)) return HelpCircle
    if (['tw', 'ta'].includes(id)) return BookOpen
    return FileText
  }

  const groupedResources = () => {
    if (groupBy === 'language') {
      return resources.reduce((acc, resource) => {
        // Group by language code (we'll display the name later)
        const key = resource.language
        if (!acc[key]) acc[key] = []
        acc[key].push(resource)
        return acc
      }, {} as Record<string, Door43Resource[]>)
    }
    if (groupBy === 'organization') {
      return resources.reduce((acc, resource) => {
        const key = resource.owner
        if (!acc[key]) acc[key] = []
        acc[key].push(resource)
        return acc
      }, {} as Record<string, Door43Resource[]>)
    }
    // Group by subject
    return resources.reduce((acc, resource) => {
      const key = resource.subject || 'Other'
      if (!acc[key]) acc[key] = []
      acc[key].push(resource)
      return acc
    }, {} as Record<string, Door43Resource[]>)
  }
  
  // Helper function to get display name for group headers
  const getGroupDisplayName = (group: string) => {
    if (groupBy === 'language') {
      // Get the display name from cached language info
      const displayName = getLanguageDisplayName(group)
      if (displayName !== group) {
        // We have a proper name, show it with code in parentheses
        return `${displayName} (${group})`
      }
      return group
    }
    return group
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-3 text-gray-600">Loading resources...</span>
      </div>
    )
  }

  const grouped = groupedResources()

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Resources</h2>
        <p className="text-gray-600 mb-4">
          Choose the resources to include in your package.
        </p>
        
        {/* Aligned Bible notice */}
        {Array.from(selectedResources.values()).some(r => r.subject === 'Aligned Bible') && (
          <div className="mb-4 p-3 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start gap-2">
              <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
              <div className="text-sm">
                <div className="font-semibold text-blue-900 mb-1">
                  Original Languages Required
                </div>
                <div className="text-blue-700">
                  You've selected Aligned Bible resources. In the next step, you'll choose which Greek and Hebrew texts to include.
                </div>
              </div>
            </div>
          </div>
        )}

        <div className="flex gap-2">
          <label className="text-sm text-gray-600">Group by:</label>
          <select
            value={groupBy}
            onChange={(e) => setGroupBy(e.target.value as any)}
            className="text-sm border border-gray-300 rounded px-2 py-1"
          >
            <option value="language">Language</option>
            <option value="organization">Organization</option>
            <option value="type">Subject</option>
          </select>
        </div>
      </div>

      <div className="space-y-6">
        {Object.entries(grouped).map(([group, groupResources]) => (
          <div key={group} className="border border-gray-200 rounded-lg p-4">
            <h3 className="font-bold text-lg text-gray-800 mb-3">{getGroupDisplayName(group)}</h3>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {groupResources.map((resource) => {
                const key = `${resource.owner}_${resource.language}_${resource.id}`
                const isSelected = selectedResources.has(key)
                const Icon = getResourceIcon(resource.id)
                
                return (
                  <button
                    key={key}
                    onClick={() => toggleResource(resource)}
                    className={`relative p-4 rounded-lg border-2 transition-all text-left ${
                      isSelected
                        ? 'border-primary-500 bg-primary-50'
                        : 'border-gray-200 hover:border-primary-300 bg-white'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-3 flex-1">
                        <Icon className="w-5 h-5 text-gray-400 mt-0.5" />
                        <div className="flex-1">
                          <div className="font-semibold text-gray-900">{resource.name}</div>
                          <div className="text-sm text-gray-500 mt-1">
                            {resource.id.toUpperCase()} • {resource.owner}
                          </div>
                          {resource.subject && (
                            <div className="text-xs text-gray-400 mt-1">
                              {resource.subject}
                            </div>
                          )}
                        </div>
                      </div>
                      
                      {isSelected && (
                        <Check className="w-5 h-5 text-primary-600 flex-shrink-0" />
                      )}
                    </div>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {resources.length === 0 && !loading && (
        <div className="text-center py-12 text-gray-500">
          No resources found for selected languages and organizations.
        </div>
      )}
    </div>
  )
}
