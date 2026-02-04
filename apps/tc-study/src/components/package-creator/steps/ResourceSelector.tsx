/**
 * Resource Selector Step
 * Shows and allows selection of available resources
 */

import { useEffect, useState } from 'react'
import { usePackageCreatorStore } from '../../../lib/stores'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { Door43Resource } from '@bt-synergy/door43-api'
import { Loader2, Check, Book, FileText, HelpCircle, BookOpen, Info, Package } from 'lucide-react'
import { API_FILTERS, RESOURCE_TYPE_COLORS } from '../../../lib/config'

export function ResourceSelector() {
  const selectedLanguages = usePackageCreatorStore((state) => state.selectedLanguages)
  const selectedOrganizations = usePackageCreatorStore((state) => state.selectedOrganizations)
  const selectedResources = usePackageCreatorStore((state) => state.selectedResources)
  const toggleResource = usePackageCreatorStore((state) => state.toggleResource)
  const getLanguageDisplayName = usePackageCreatorStore((state) => state.getLanguageDisplayName)

  const [resources, setResources] = useState<Door43Resource[]>([])
  const [loading, setLoading] = useState(false)
  const [groupBy, setGroupBy] = useState<'language' | 'organization' | 'type'>('type')

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
      
      // Fetch resources for each combination of language + organization
      for (const lang of Array.from(selectedLanguages)) {
        for (const org of Array.from(selectedOrganizations)) {
          try {
            const resources = await client.getResourcesByOrgAndLanguage(org, lang, {
              subjects: API_FILTERS.subject,
              stage: API_FILTERS.stage,
              topic: API_FILTERS.topic,
            })
            console.log(`📚 Resources for ${org}/${lang}:`, resources.length)
            console.log(`   Subjects found:`, [...new Set(resources.map(r => r.subject))])
            allResources.push(...resources)
          } catch (error) {
            console.error(`Failed to load resources for ${org}/${lang}:`, error)
          }
        }
      }
      
      console.log('📚 Total resources loaded:', allResources.length)
      console.log('📚 All unique subjects:', [...new Set(allResources.map(r => r.subject))].sort())
      console.log('📚 Resource breakdown by subject:', 
        allResources.reduce((acc, r) => {
          acc[r.subject] = (acc[r.subject] || 0) + 1
          return acc
        }, {} as Record<string, number>)
      )

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
    return Package
  }

  const groupedResources = () => {
    if (groupBy === 'language') {
      return resources.reduce((acc, resource) => {
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
  
  const getGroupDisplayName = (group: string) => {
    if (groupBy === 'language') {
      const displayName = getLanguageDisplayName(group)
      if (displayName !== group) {
        return `${displayName} (${group})`
      }
      return group
    }
    return group
  }

  // Check if any selected resources are Aligned Bibles
  const hasAlignedBible = Array.from(selectedResources.values()).some(
    r => r.subject === 'Aligned Bible'
  )

  if (selectedLanguages.size === 0 || selectedOrganizations.size === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-24 text-center">
        <Package className="mb-4 h-12 w-12 text-gray-300" />
        <p className="text-gray-600">
          Please select languages and organizations first
        </p>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24">
        <Loader2 className="h-10 w-10 animate-spin text-gray-400" />
        <span className="mt-4 text-sm text-gray-600">Loading resources...</span>
      </div>
    )
  }

  const grouped = groupedResources()

  return (
    <div>
      <div className="mb-8">
        <h2 className="mb-2 text-2xl font-semibold text-gray-900">
          Select Resources
        </h2>
        <p className="text-gray-600">
          Choose the resources to include in your package
        </p>
      </div>

      {/* Aligned Bible Notice */}
      {hasAlignedBible && (
        <div className="mb-6 rounded-lg border border-blue-200 bg-blue-50 p-4">
          <div className="flex gap-3">
            <Info className="h-5 w-5 flex-shrink-0 text-blue-600" />
            <div className="text-sm">
              <div className="font-medium text-blue-900">
                Original Languages Required
              </div>
              <div className="text-blue-700">
                You've selected Aligned Bible resources. In the next step, you'll choose Greek and Hebrew texts.
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Group By Selector */}
      <div className="mb-6 flex items-center gap-3">
        <label className="text-sm font-medium text-gray-700">Group by:</label>
        <select
          value={groupBy}
          onChange={(e) => setGroupBy(e.target.value as any)}
          className="rounded-lg border border-gray-300 px-3 py-1.5 text-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900"
        >
          <option value="type">Subject</option>
          <option value="language">Language</option>
          <option value="organization">Organization</option>
        </select>
      </div>

      {/* Resources Grid */}
      <div className="space-y-6">
        {Object.entries(grouped).map(([group, groupResources]) => (
          <div key={group} className="rounded-lg border border-gray-200 p-5">
            <h3 className="mb-4 text-lg font-semibold text-gray-900">
              {getGroupDisplayName(group)}
            </h3>
            
            <div className="grid gap-3 sm:grid-cols-2">
              {groupResources.map((resource) => {
                const key = `${resource.owner}_${resource.language}_${resource.id}`
                const isSelected = selectedResources.has(key)
                const Icon = getResourceIcon(resource.id)
                const badgeColor = RESOURCE_TYPE_COLORS[resource.subject || ''] || 'bg-gray-100 text-gray-700'
                
                return (
                  <button
                    key={key}
                    onClick={() => toggleResource(resource)}
                    className={`group flex items-start justify-between rounded-lg border-2 p-4 text-left transition-all ${
                      isSelected
                        ? 'border-gray-900 bg-gray-50'
                        : 'border-gray-200 bg-white hover:border-gray-400'
                    }`}
                  >
                    <div className="flex flex-1 items-start gap-3">
                      <Icon className={`h-5 w-5 flex-shrink-0 ${isSelected ? 'text-gray-900' : 'text-gray-400'}`} />
                      <div className="flex-1">
                        <div className={`font-medium ${isSelected ? 'text-gray-900' : 'text-gray-700'}`}>
                          {resource.name}
                        </div>
                        <div className="mt-1 text-xs text-gray-500">
                          {resource.id.toUpperCase()} • {resource.owner}
                        </div>
                        {resource.subject && groupBy !== 'type' && (
                          <div className="mt-2">
                            <span className={`inline-block rounded px-2 py-0.5 text-xs ${badgeColor}`}>
                              {resource.subject}
                            </span>
                          </div>
                        )}
                      </div>
                    </div>
                    
                    {isSelected && (
                      <Check className="h-5 w-5 flex-shrink-0 text-gray-900" />
                    )}
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      {resources.length === 0 && (
        <div className="py-12 text-center text-gray-500">
          No resources found for selected languages and organizations
        </div>
      )}
    </div>
  )
}
