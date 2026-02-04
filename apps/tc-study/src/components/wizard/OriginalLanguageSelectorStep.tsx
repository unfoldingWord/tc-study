/**
 * Original Language Selector Step
 * 
 * Allows users to select Greek and Hebrew resources for Aligned Bible texts.
 * This step is only shown when users have selected Aligned Bible resources.
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import { Book, Check, Database, Info, Loader2, Package, Wifi } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import { useCatalog } from '../../contexts/CatalogContext'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { ResourceInfoModal } from '../studio/ResourceInfoModal'

interface OriginalLanguageResource extends ResourceMetadata {
  isCached: boolean
  isInWorkspace: boolean
  isSupported: boolean
  viewerName?: string
}

export function OriginalLanguageSelectorStep() {
  const { catalogManager, viewerRegistry, resourceTypeRegistry } = useCatalog()
  
  const selectedResourceKeys = useWorkspaceStore((state) => state.selectedResourceKeys)
  const toggleResource = useWorkspaceStore((state) => state.toggleResource)
  const availableResources = useWorkspaceStore((state) => state.availableResources)
  const hasResourceInPackage = useWorkspaceStore((state) => state.hasResourceInPackage)

  const [greekResources, setGreekResources] = useState<OriginalLanguageResource[]>([])
  const [hebrewResources, setHebrewResources] = useState<OriginalLanguageResource[]>([])
  const [loading, setLoading] = useState(false)
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [selectedInfoResource, setSelectedInfoResource] = useState<any>(null)
  const [fetchingInfo, setFetchingInfo] = useState(false)
  const autoSelectionDoneRef = useRef(false) // Use ref to persist across StrictMode re-renders

  useEffect(() => {
    loadOriginalLanguageResources()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const loadOriginalLanguageResources = async () => {
    setLoading(true)
    
    try {
      // Get all Aligned Bible resources from selected resources
      const alignedBibleResources = Array.from(selectedResourceKeys)
        .map(key => availableResources.get(key))
        .filter(r => r && (r.category === 'Aligned Bible' || r.type === 'scripture'))
      
      // Determine recommended resources (defaults)
      const recommendedGreek = new Set<string>(['ugnt'])
      const recommendedHebrew = new Set<string>(['uhb'])
      
      console.log('📜 Loading original language resources...')
      console.log('   Aligned Bible resources:', alignedBibleResources.length)
      
      const door43Client = getDoor43ApiClient({ debug: true })
      
      // Load Greek resources (Koine Greek)
      console.log('📜 Loading Greek resources (el-x-koine)...')
      const greekDoor43 = await door43Client.getResourcesByOrgAndLanguage(
        'unfoldingWord',
        'el-x-koine',
        {
          subjects: ['Greek New Testament'], // Only request Greek NT resources
          stage: 'prod',
          // Note: NOT using topic:'tc-ready' filter as it may exclude original language resources
        }
      )
      
      console.log(`   Found ${greekDoor43.length} Greek resources`)
      
      // Convert to OriginalLanguageResource format and filter to only Greek language
      const greekConverted: OriginalLanguageResource[] = await Promise.all(
        greekDoor43
          .filter(resource => resource.language === 'el-x-koine') // Only keep Greek language resources
          .map(async (resource) => {
            const resourceKey = `${resource.owner}/${resource.language}/${resource.id}`
            const metadata: ResourceMetadata = {
              resourceKey,
              resourceId: resource.id,
              server: 'git.door43.org',
              owner: resource.owner,
              language: resource.language,
              title: resource.title || resource.name,
              subject: resource.subject || 'Greek New Testament',
              type: 'scripture',
              format: 'usfm',
              location: 'network',
              ingredients: resource.ingredients, // ⭐ Preserve ingredients!
              version: resource.metadata_version || resource.version || '1.0.0',
            }
            
            const viewer = viewerRegistry.getViewer(metadata)
            const isCached = await catalogManager.isResourceCached(resourceKey)
            const isInWorkspace = hasResourceInPackage(resourceKey)
            
            // Get viewer definition to access displayName
            const viewerDef = viewerRegistry.getAllViewers().find(v => v.component === viewer)
            
            return {
              ...metadata,
              isCached,
              isInWorkspace,
              isSupported: !!viewer,
              viewerName: viewerDef?.displayName,
            }
          })
      )
      
      console.log(`   ✅ Filtered to ${greekConverted.length} Greek language resources`)
      setGreekResources(greekConverted)
      
      // Load Hebrew resources
      console.log('📜 Loading Hebrew resources (hbo)...')
      const hebrewDoor43 = await door43Client.getResourcesByOrgAndLanguage(
        'unfoldingWord',
        'hbo',
        {
          subjects: ['Hebrew Old Testament'], // Only request Hebrew OT resources
          stage: 'prod',
          // Note: NOT using topic:'tc-ready' filter as it may exclude original language resources
        }
      )
      
      console.log(`   Found ${hebrewDoor43.length} Hebrew resources`)
      
      // Convert to OriginalLanguageResource format and filter to only Hebrew language
      const hebrewConverted: OriginalLanguageResource[] = await Promise.all(
        hebrewDoor43
          .filter(resource => resource.language === 'hbo') // Only keep Hebrew language resources
          .map(async (resource) => {
            const resourceKey = `${resource.owner}/${resource.language}/${resource.id}`
            const metadata: ResourceMetadata = {
              resourceKey,
              resourceId: resource.id,
              server: 'git.door43.org',
              owner: resource.owner,
              language: resource.language,
              title: resource.title || resource.name,
              subject: resource.subject || 'Hebrew Old Testament',
              type: 'scripture',
              format: 'usfm',
              location: 'network',
              ingredients: resource.ingredients, // ⭐ Preserve ingredients!
              version: resource.metadata_version || resource.version || '1.0.0',
            }
            
            const viewer = viewerRegistry.getViewer(metadata)
            const isCached = await catalogManager.isResourceCached(resourceKey)
            const isInWorkspace = hasResourceInPackage(resourceKey)
            
            // Get viewer definition to access displayName
            const viewerDef = viewerRegistry.getAllViewers().find(v => v.component === viewer)
            
            return {
              ...metadata,
              isCached,
              isInWorkspace,
              isSupported: !!viewer,
              viewerName: viewerDef?.displayName,
            }
          })
      )
      
      console.log(`   ✅ Filtered to ${hebrewConverted.length} Hebrew language resources`)
      setHebrewResources(hebrewConverted)
      
      // Auto-select recommended resources and cached resources (only once)
      if (!autoSelectionDoneRef.current) {
        console.log('\n🔄 Auto-selecting recommended and cached original language resources...')
        console.log('   autoSelectionDone:', autoSelectionDoneRef.current)
        console.log('   selectedResourceKeys:', selectedResourceKeys)
        
        const allOriginalLangResources = [...greekConverted, ...hebrewConverted]
        console.log('   Total original language resources:', allOriginalLangResources.length)
        
        let autoSelectedCount = 0
        allOriginalLangResources.forEach(resource => {
          const isRecommended = recommendedGreek.has(resource.resourceId) || 
                               recommendedHebrew.has(resource.resourceId)
          const alreadySelected = selectedResourceKeys.has(resource.resourceKey)
          
          console.log(`   Checking ${resource.resourceId}:`, {
            isRecommended,
            isCached: resource.isCached,
            isInWorkspace: resource.isInWorkspace,
            alreadySelected,
            isSupported: resource.isSupported,
          })
          
          // Auto-select if: (recommended OR cached OR in workspace) AND not already selected AND supported
          if ((isRecommended || resource.isCached || resource.isInWorkspace) && !alreadySelected && resource.isSupported) {
            const reason = resource.isInWorkspace ? 'in collection' : resource.isCached ? 'cached' : 'recommended'
            console.log(`   ✅ Auto-selecting (${reason}): ${resource.title} (${resource.resourceId})`)
            toggleResource(resource.resourceKey, {
              id: resource.resourceId,
              key: resource.resourceKey,
              title: resource.title,
              type: 'scripture',
              category: resource.subject,
              language: resource.language,
              languageCode: resource.language,
              languageName: (resource as any).language_title,
              owner: resource.owner,
              server: resource.server,
              subject: resource.subject,
              format: resource.format,
              location: resource.location,
              resourceId: resource.resourceId,
              ingredients: (resource as any).ingredients,
              version: (resource as any).version || '1.0.0',
              description: (resource as any).description,
              readme: (resource as any).readme,
              license: (resource as any).license,
            })
            autoSelectedCount++
          }
        })
        
        autoSelectionDoneRef.current = true
        console.log(`✅ Auto-selected ${autoSelectedCount} resources`)
        console.log(`✅ Loaded ${greekConverted.length} Greek and ${hebrewConverted.length} Hebrew resources`)
      }
    } catch (error) {
      console.error('❌ Failed to load original language resources:', error)
    } finally {
      setLoading(false)
    }
  }

  // Function to fetch and show resource info
  const handleShowInfo = async (e: React.MouseEvent, resource: any) => {
    e.stopPropagation() // Prevent card selection
    setFetchingInfo(true)
    
    try {
      const door43Client = getDoor43ApiClient({ debug: true })
      
      // Construct metadata_url if missing
      let metadataUrl = resource.metadata_url
      if (!metadataUrl && resource.owner && resource.language && resource.id) {
        const repoName = `${resource.language}_${resource.id}`
        metadataUrl = `https://git.door43.org/${resource.owner}/${repoName}/raw/branch/master/manifest.yaml`
      }
      
      let enrichedData = { readme: undefined, license: undefined }
      if (metadataUrl) {
        const tempResource = { ...resource, metadata_url: metadataUrl }
        enrichedData = await door43Client.enrichResourceMetadata(tempResource)
      }
      
      setSelectedInfoResource({
        key: resource.resourceKey,
        title: resource.title,
        owner: resource.owner,
        languageCode: resource.language,
        subject: resource.subject,
        description: resource.description,
        readme: enrichedData.readme,
        license: enrichedData.license,
      })
      setShowInfoModal(true)
    } catch (error) {
      console.error('Failed to fetch resource info:', error)
    } finally {
      setFetchingInfo(false)
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }


  return (
    <div>
      {/* Resources by Language */}
      <div className="space-y-4">
        {/* Greek Resources */}
        {greekResources.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Book className="w-4 h-4 text-blue-600" />
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                {greekResources.length}
              </span>
            </div>
          
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
            {greekResources.map((resource) => {
              const isSelected = selectedResourceKeys.has(resource.resourceKey)
              const isCached = resource.isCached
              const isInWorkspace = resource.isInWorkspace
              const isLocked = isInWorkspace // Workspace resources are locked (selected, can't deselect)
              
              return (
                <button
                  key={resource.resourceKey}
                  onClick={() => {
                    if (isLocked) return // Don't allow deselecting workspace resources
                    toggleResource(resource.resourceKey, {
                      id: resource.resourceId,
                      key: resource.resourceKey,
                      title: resource.title,
                      type: 'scripture',
                      category: resource.subject,
                      language: resource.language,
                      languageCode: resource.language,
                      languageName: (resource as any).language_title,
                      owner: resource.owner,
                      server: resource.server,
                      subject: resource.subject,
                      format: resource.format,
                      location: resource.location,
                      resourceId: resource.resourceId,
                      ingredients: (resource as any).ingredients,
                      version: (resource as any).version || '1.0.0',
                      description: (resource as any).description,
                      readme: (resource as any).readme,
                      license: (resource as any).license,
                    })
                  }}
                  disabled={isLocked}
                  className={`
                    relative p-3 rounded-lg border-2 transition-all text-left
                    ${
                      isLocked
                        ? 'border-green-500 bg-green-50 cursor-default'
                        : isSelected
                          ? 'border-blue-500 bg-blue-50'
                          : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                    }
                  `}
                >
                  {isSelected && (
                    <Check className={`absolute top-1.5 ${isSelected ? 'right-8' : 'right-1.5'} w-4 h-4 ${isLocked ? 'text-green-600' : 'text-blue-600'}`} />
                  )}
                  
                  {/* Info button - top right */}
                  <button
                    onClick={(e) => handleShowInfo(e, resource)}
                    className="absolute top-1.5 right-1.5 p-1 hover:bg-blue-100 rounded transition-colors z-10"
                    title="Resource information"
                    aria-label="Resource information"
                  >
                    <Info className="w-3.5 h-3.5 text-blue-600" />
                  </button>
                  
                  <div className="font-semibold text-gray-900 text-sm mb-0.5">
                    {resource.title}
                  </div>
                  
                  <div className="text-xs text-gray-500 pb-5">
                    <div className="truncate">{resource.owner}</div>
                  </div>
                  
                  {/* Status icon - bottom left (priority: In Collection > Cached > Online) */}
                  {isInWorkspace ? (
                    <Package className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-purple-600" title="Already in collection" />
                  ) : isCached ? (
                    <Database className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-green-600" title="Cached offline" />
                  ) : (
                    <Wifi className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-blue-500" title="Available online" />
                  )}
                  
                  {/* Subject icon - bottom right */}
                  <Book className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-gray-400" />
                </button>
              )
            })}
          </div>
        </div>
      )}

        {/* Hebrew Resources */}
        {hebrewResources.length > 0 && (
          <div>
            <div className="mb-2 flex items-center gap-2">
              <Book className="w-4 h-4 text-blue-600" />
              <span className="px-2 py-0.5 bg-gray-100 text-gray-700 rounded-full text-xs font-semibold">
                {hebrewResources.length}
              </span>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
              {hebrewResources.map((resource) => {
                const isSelected = selectedResourceKeys.has(resource.resourceKey)
                const isCached = resource.isCached
                const isInWorkspace = resource.isInWorkspace
                const isLocked = isInWorkspace // Workspace resources are locked (selected, can't deselect)
                
                return (
                  <button
                    key={resource.resourceKey}
                    onClick={() => {
                      if (isLocked) return // Don't allow deselecting workspace resources
                      toggleResource(resource.resourceKey, {
                        id: resource.resourceId,
                        key: resource.resourceKey,
                        title: resource.title,
                        type: 'scripture',
                        category: resource.subject,
                        language: resource.language,
                        owner: resource.owner,
                        server: resource.server,
                        subject: resource.subject,
                        format: resource.format,
                        location: resource.location,
                        resourceId: resource.resourceId,
                        ingredients: (resource as any).ingredients,
                        version: (resource as any).version || '1.0.0',
                      })
                    }}
                    disabled={isLocked}
                    className={`
                      relative p-3 rounded-lg border-2 transition-all text-left
                      ${
                        isLocked
                          ? 'border-green-500 bg-green-50 cursor-default'
                          : isSelected
                            ? 'border-blue-500 bg-blue-50'
                            : 'border-gray-200 hover:border-blue-300 hover:bg-blue-50'
                      }
                    `}
                  >
                    {isSelected && (
                      <Check className={`absolute top-1.5 ${isSelected ? 'right-8' : 'right-1.5'} w-4 h-4 ${isLocked ? 'text-green-600' : 'text-blue-600'}`} />
                    )}
                    
                    {/* Info button - top right */}
                    <button
                      onClick={(e) => handleShowInfo(e, resource)}
                      className="absolute top-1.5 right-1.5 p-1 hover:bg-blue-100 rounded transition-colors z-10"
                      title="Resource information"
                      aria-label="Resource information"
                    >
                      <Info className="w-3.5 h-3.5 text-blue-600" />
                    </button>
                    
                    <div className="font-semibold text-gray-900 text-sm mb-0.5">
                      {resource.title}
                    </div>
                    
                    <div className="text-xs text-gray-500 pb-5">
                      <div className="truncate">{resource.owner}</div>
                    </div>
                    
                    {/* Status icon - bottom left (priority: In Collection > Cached > Online) */}
                    {isInWorkspace ? (
                      <Package className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-purple-600" title="Already in collection" />
                    ) : isCached ? (
                      <Database className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-green-600" title="Cached offline" />
                    ) : (
                      <Wifi className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-blue-500" title="Available online" />
                    )}
                    
                    {/* Subject icon - bottom right */}
                    <Book className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-gray-400" />
                  </button>
                )
              })}
            </div>
          </div>
        )}
      </div>
      
      {/* Resource Info Modal */}
      {selectedInfoResource && (
        <ResourceInfoModal
          isOpen={showInfoModal}
          onClose={() => {
            setShowInfoModal(false)
            setSelectedInfoResource(null)
          }}
          resource={selectedInfoResource}
        />
      )}
    </div>
  )
}
