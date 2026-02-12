/**
 * Original Language Selector Component
 * Allows users to select Greek and Hebrew resources for Aligned Bible texts
 */

import { useEffect, useState } from 'react'
import { usePackageStore } from '@/lib/store'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { Loader2, Check, Book, Info } from 'lucide-react'
import type { Door43Resource } from '@/types/manifest'
import { API_FILTERS } from '@/lib/subjects'

export function OriginalLanguageSelector() {
  const selectedResources = usePackageStore((state) => state.selectedResources)
  const toggleResource = usePackageStore((state) => state.toggleResource)

  const [greekResources, setGreekResources] = useState<Door43Resource[]>([])
  const [hebrewResources, setHebrewResources] = useState<Door43Resource[]>([])
  const [loading, setLoading] = useState(false)
  const [recommendedGreekIds, setRecommendedGreekIds] = useState<Set<string>>(new Set())
  const [recommendedHebrewIds, setRecommendedHebrewIds] = useState<Set<string>>(new Set())
  const [autoSelectionDone, setAutoSelectionDone] = useState(false)

  useEffect(() => {
    loadOriginalLanguageResources()
  }, [])

  const loadOriginalLanguageResources = async () => {
    setLoading(true)
    
    try {
      const client = getDoor43ApiClient()
      
      // Determine recommended resources from relations in Aligned Bible resources
      const alignedBibleResources = Array.from(selectedResources.values()).filter(
        r => r.subject === 'Aligned Bible'
      )
      
      const recommendedGreek = new Set<string>()
      const recommendedHebrew = new Set<string>()
      
      if (alignedBibleResources.length > 0) {
        console.log('🔍 Checking relations for Aligned Bible resources:', alignedBibleResources.map(r => r.id))
        
        // Extract relations from catalog data (already fetched)
        alignedBibleResources.forEach(resource => {
          if (resource.relations && resource.relations.length > 0) {
            console.log(`   Relations for ${resource.id}:`, resource.relations)
            
            // Check each relation
            resource.relations.forEach((rel: { lang?: string; identifier?: string }) => {
              const lang = rel.lang
              const identifier = rel.identifier
              
              if (lang === 'el-x-koine' || identifier === 'ugnt') {
                if (identifier) recommendedGreek.add(identifier)
              } else if (lang === 'hbo' || identifier === 'uhb') {
                if (identifier) recommendedHebrew.add(identifier)
              }
            })
          } else {
            console.log(`   No relations found for ${resource.id}`)
          }
        })
        
        console.log('   Recommended Greek:', Array.from(recommendedGreek))
        console.log('   Recommended Hebrew:', Array.from(recommendedHebrew))
      }
      
      // Default to UGNT and UHB if no relations found
      if (recommendedGreek.size === 0) recommendedGreek.add('ugnt')
      if (recommendedHebrew.size === 0) recommendedHebrew.add('uhb')
      
      setRecommendedGreekIds(recommendedGreek)
      setRecommendedHebrewIds(recommendedHebrew)
      
      // Load Greek resources (Koine Greek)
      console.log('📜 Loading Greek resources...')
      const greekRes = await client.getResourcesByOrgAndLanguage('unfoldingWord', 'el-x-koine', {
        stage: API_FILTERS.stage,
        topic: API_FILTERS.topic,
      })
      console.log('   Found Greek resources:', greekRes.map(r => `${r.id} (${r.subject})`))
      setGreekResources(greekRes)
      
      // Load Hebrew resources
      console.log('📜 Loading Hebrew resources...')
      const hebrewRes = await client.getResourcesByOrgAndLanguage('unfoldingWord', 'hbo', {
        stage: API_FILTERS.stage,
        topic: API_FILTERS.topic,
      })
      console.log('   Found Hebrew resources:', hebrewRes.map(r => `${r.id} (${r.subject})`))
      setHebrewResources(hebrewRes)
      
      // Auto-select recommended resources (only if not already done)
      if (!autoSelectionDone) {
        console.log('\n🔄 Starting auto-selection...')
        console.log('   Recommended Greek IDs:', Array.from(recommendedGreek))
        console.log('   Recommended Hebrew IDs:', Array.from(recommendedHebrew))
        
        const allResources = greekRes.concat(hebrewRes)
        console.log('   All loaded resources:', allResources.map(r => `${r.id} (${r.language})`))
        
        // Get current state to avoid closure issues
        const currentlySelected = usePackageStore.getState().selectedResources
        
        allResources.forEach(resource => {
          const key = `${resource.owner}_${resource.language}_${resource.id}`
          const isRecommended = recommendedGreek.has(resource.id) || recommendedHebrew.has(resource.id)
          const alreadySelected = currentlySelected.has(key)
          
          console.log(`   Checking ${resource.id}:`, {
            key,
            isRecommended,
            alreadySelected,
            inGreek: recommendedGreek.has(resource.id),
            inHebrew: recommendedHebrew.has(resource.id)
          })
          
          if (isRecommended && !alreadySelected) {
            console.log(`   ✅ Auto-selecting: ${resource.id}`)
            toggleResource(resource)
          }
        })
        
        setAutoSelectionDone(true)
        console.log(`✅ Loaded ${greekRes.length} Greek and ${hebrewRes.length} Hebrew resources`)
      } else {
        console.log('⏭️ Skipping auto-selection (already done)')
      }
    } catch (error) {
      console.error('❌ Failed to load original language resources:', error)
    } finally {
      setLoading(false)
    }
  }
  
  // Format relation display (lang/id?v=version -> LANG / ID v.VERSION)
  const formatRelationDisplay = (rel: any): string => {
    const parts = [rel.identifier.toUpperCase()]
    if (rel.version) {
      parts.push(`v${rel.version}`)
    }
    return parts.join(' ')
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-primary-500" />
        <span className="ml-3 text-gray-600">Loading original language resources...</span>
      </div>
    )
  }

  const selectedGreek = greekResources.filter(r => 
    selectedResources.has(`${r.owner}_${r.language}_${r.id}`)
  )
  const selectedHebrew = hebrewResources.filter(r =>
    selectedResources.has(`${r.owner}_${r.language}_${r.id}`)
  )

  // Get all Aligned Bible resources that were selected
  const alignedBibleResources = Array.from(selectedResources.values()).filter(
    r => r.subject === 'Aligned Bible'
  )

  return (
    <div>
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 mb-2">Select Original Languages</h2>
        <p className="text-gray-600 mb-4">
          Choose Greek and Hebrew source texts for your Aligned Bible resources.
        </p>
        
        {/* Show Aligned Bible Resources and their relations */}
        {alignedBibleResources.length > 0 && (
          <div className="mb-4 p-4 bg-purple-50 border border-purple-200 rounded-lg">
            <div className="flex items-start gap-3">
              <Book className="w-5 h-5 text-purple-600 mt-0.5 flex-shrink-0" />
              <div className="flex-1">
                <div className="font-semibold text-purple-900 mb-2">
                  Your Aligned Bible Resources
                </div>
                <div className="space-y-2">
                  {alignedBibleResources.map(resource => {
                    const hasRelations = resource.relations && resource.relations.length > 0
                    return (
                      <div key={`${resource.owner}_${resource.language}_${resource.id}`} className="text-sm">
                        <div className="font-medium text-purple-900">
                          {resource.name} ({resource.id.toUpperCase()})
                        </div>
                        {hasRelations ? (
                          <div className="text-purple-700 ml-4 mt-1">
                            → Aligned to: {resource.relations!
                              .filter(rel => rel.lang === 'el-x-koine' || rel.lang === 'hbo')
                              .map(rel => formatRelationDisplay(rel))
                              .join(', ')}
                          </div>
                        ) : (
                          <div className="text-purple-600 ml-4 mt-1 italic">
                            → No alignment information available
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          </div>
        )}
        
        {/* Info Banner */}
        <div className="p-4 bg-blue-50 border border-blue-200 rounded-lg flex items-start gap-3">
          <Info className="w-5 h-5 text-blue-600 mt-0.5 flex-shrink-0" />
          <div className="text-sm text-blue-900">
            <div className="font-semibold mb-1">About Original Languages</div>
            <div className="text-blue-700">
              Aligned Bible resources are word-aligned to original Greek and Hebrew texts. 
              We've auto-selected the recommended texts based on your Aligned Bible selections, 
              but you can choose different ones if needed.
            </div>
          </div>
        </div>
      </div>

      {/* Greek Resources */}
      {greekResources.length > 0 && (
        <div className="mb-8">
          <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center gap-2">
            <Book className="w-5 h-5" />
            Greek New Testament
            <span className="text-sm font-normal text-gray-500">
              ({selectedGreek.length} of {greekResources.length} selected)
            </span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {greekResources.map((resource) => {
              const key = `${resource.owner}_${resource.language}_${resource.id}`
              const isSelected = selectedResources.has(key)
              const isRecommended = recommendedGreekIds.has(resource.id)
              
              return (
                <button
                  key={key}
                  onClick={() => toggleResource(resource)}
                  className={`p-4 rounded-lg border-2 transition-all text-left relative ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 shadow-sm'
                      : 'border-gray-200 hover:border-primary-300 bg-white hover:shadow-sm'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  
                  <div className="pr-8">
                    <div className="font-semibold text-gray-900 mb-1">
                      {resource.name || resource.title}
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {resource.id.toUpperCase()}
                      </span>
                      {isRecommended && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                          Recommended
                        </span>
                      )}
                    </div>
                    
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{resource.owner}</div>
                      <div>{resource.subject}</div>
                      <div>Version {resource.version}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Hebrew Resources */}
      {hebrewResources.length > 0 && (
        <div className="mb-6">
          <h3 className="font-bold text-lg text-gray-800 mb-3 flex items-center gap-2">
            <Book className="w-5 h-5" />
            Hebrew Old Testament
            <span className="text-sm font-normal text-gray-500">
              ({selectedHebrew.length} of {hebrewResources.length} selected)
            </span>
          </h3>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {hebrewResources.map((resource) => {
              const key = `${resource.owner}_${resource.language}_${resource.id}`
              const isSelected = selectedResources.has(key)
              const isRecommended = recommendedHebrewIds.has(resource.id)
              
              return (
                <button
                  key={key}
                  onClick={() => toggleResource(resource)}
                  className={`p-4 rounded-lg border-2 transition-all text-left relative ${
                    isSelected
                      ? 'border-primary-500 bg-primary-50 shadow-sm'
                      : 'border-gray-200 hover:border-primary-300 bg-white hover:shadow-sm'
                  }`}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2">
                      <div className="w-6 h-6 bg-primary-500 rounded-full flex items-center justify-center">
                        <Check className="w-4 h-4 text-white" />
                      </div>
                    </div>
                  )}
                  
                  <div className="pr-8">
                    <div className="font-semibold text-gray-900 mb-1">
                      {resource.name || resource.title}
                    </div>
                    
                    <div className="flex flex-wrap gap-1 mb-2">
                      <span className="px-2 py-0.5 bg-gray-100 text-gray-700 text-xs rounded">
                        {resource.id.toUpperCase()}
                      </span>
                      {isRecommended && (
                        <span className="px-2 py-0.5 bg-green-100 text-green-700 text-xs rounded font-medium">
                          Recommended
                        </span>
                      )}
                    </div>
                    
                    <div className="text-xs text-gray-500 space-y-0.5">
                      <div>{resource.owner}</div>
                      <div>{resource.subject}</div>
                      <div>Version {resource.version}</div>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-4 bg-gray-50 border border-gray-200 rounded-lg">
        <div className="font-medium text-gray-900 mb-2">Selection Summary:</div>
        <div className="space-y-1 text-sm">
          {selectedGreek.length > 0 ? (
            <div className="text-green-700">
              ✓ Greek: {selectedGreek.map(r => r.id.toUpperCase()).join(', ')}
            </div>
          ) : (
            <div className="text-gray-500">○ No Greek resource selected</div>
          )}
          
          {selectedHebrew.length > 0 ? (
            <div className="text-green-700">
              ✓ Hebrew: {selectedHebrew.map(r => r.id.toUpperCase()).join(', ')}
            </div>
          ) : (
            <div className="text-gray-500">○ No Hebrew resource selected</div>
          )}
        </div>
        
        {(selectedGreek.length === 0 && selectedHebrew.length === 0) && (
          <div className="mt-3 p-2 bg-yellow-50 border border-yellow-200 rounded text-xs text-yellow-800">
            ⚠️ No original language resources selected. Aligned Bible features may be limited.
          </div>
        )}
      </div>
    </div>
  )
}