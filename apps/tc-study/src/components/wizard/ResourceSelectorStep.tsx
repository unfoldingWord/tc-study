/**
 * Resource Selector Step - Refactored with DRY principles
 * 
 * Second step in the resource addition wizard.
 * Searches catalog and Door43 for resources in selected languages.
 * Filters by supported resource types (ViewerRegistry).
 */

import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import type { ResourceDependency } from '@bt-synergy/resource-types'
import { AlertCircle, Book, CheckCircle, Database, Info, Languages, Loader2, Package, Wifi } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useCatalogManager, useResourceTypeRegistry, useViewerRegistry } from '../../contexts'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { checkAllDependencies, type DependencySearchResult } from '../../utils/comprehensiveDependencySearch'
import { excludeOriginalLanguageSubjects, getSubjectIcon, isOriginalLanguageResource } from '../../utils/resourceHelpers'
import { SelectableGrid } from '../shared/SelectableGrid'
import { ResourceInfoModal } from '../studio/ResourceInfoModal'

interface ResourceWithStatus extends ResourceMetadata {
  isCached: boolean
  isInWorkspace: boolean
  isSupported: boolean
  viewerName?: string
  hasDependencies?: boolean
  dependenciesAvailable?: boolean
  missingDependencies?: Array<{
    dependency: ResourceDependency
    searchResult: DependencySearchResult
    displayName: string
  }>
  autoAddedDependencies?: string[] // Keys of dependencies that will be auto-added
  isAutoIncluded?: boolean // Whether this resource is an auto-included dependency
  ingredients?: any[] // Ingredients from Door43 catalog API
}

export function ResourceSelectorStep() {
  const [isLoading, setIsLoading] = useState(false)
  const loadingRef = useRef(false) // Prevent duplicate calls
  const lastLoadKey = useRef<string>('') // Track last load to prevent re-fetch
  const [showInfoModal, setShowInfoModal] = useState(false)
  const [selectedInfoResource, setSelectedInfoResource] = useState<any>(null)
  const [fetchingInfo, setFetchingInfo] = useState(false) // Loading state for fetching resource info
  
  const catalogManager = useCatalogManager()
  const viewerRegistry = useViewerRegistry()
  const resourceTypeRegistry = useResourceTypeRegistry()
  
  const selectedLanguages = useWorkspaceStore((state) => state.selectedLanguages)
  const selectedOrganizations = useWorkspaceStore((state) => state.selectedOrganizations)
  const availableLanguages = useWorkspaceStore((state) => state.availableLanguages)
  const availableOrganizations = useWorkspaceStore((state) => state.availableOrganizations)
  const availableResources = useWorkspaceStore((state) => state.availableResources)
  const selectedResourceKeys = useWorkspaceStore((state) => state.selectedResourceKeys)
  const toggleResource = useWorkspaceStore((state) => state.toggleResource)
  const setAvailableResources = useWorkspaceStore((state) => state.setAvailableResources)
  const hasResourceInPackage = useWorkspaceStore((state) => state.hasResourceInPackage)
  
  // Create lookup maps for organization and language names
  const orgNameMap = new Map(
    availableOrganizations.map(org => [org.username, org.name])
  )
  const langNameMap = new Map(
    availableLanguages.map(lang => [lang.code, lang.name])
  )

  // Create stable dependency key to prevent unnecessary re-fetches
  const loadKey = useMemo(() => {
    const langs = Array.from(selectedLanguages).sort().join(',')
    const orgs = Array.from(selectedOrganizations).sort().join(',')
    return `${langs}|${orgs}`
  }, [selectedLanguages, selectedOrganizations])

  useEffect(() => {
    // Skip if already loading or if the same data was just loaded
    if (loadingRef.current) {
      console.log('⏭️  Skipping duplicate load (already loading)')
      return
    }
    
    if (lastLoadKey.current === loadKey) {
      console.log('⏭️  Skipping duplicate load (same data)', loadKey)
      return
    }
    
    if (selectedLanguages.size > 0 && selectedOrganizations.size > 0) {
      console.log('🔄 Loading resources for key:', loadKey)
      lastLoadKey.current = loadKey
      loadResources()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadKey])

  const loadResources = async () => {
    loadingRef.current = true
    setIsLoading(true)
    try {
      // Get supported subjects but EXCLUDE original language subjects
      // Original language subjects (Greek NT, Hebrew OT) should only appear in the OriginalLanguageSelectorStep
      const allSupportedSubjects = resourceTypeRegistry.getSupportedSubjects()
      const supportedSubjects = excludeOriginalLanguageSubjects(allSupportedSubjects)
      
      console.log('🔍 Loading resources for languages:', Array.from(selectedLanguages))
      console.log('   For organizations:', selectedOrganizations)
      console.log('   Filtering by supported subjects:', supportedSubjects)
      console.log('   Excluded original language subjects: Greek New Testament, Hebrew Old Testament')
      
      const allResources = new Map<string, ResourceWithStatus>()
      
      // ⚡ MEGA OPTIMIZATION: Single API call for all languages and organizations
      const door43Client = getDoor43ApiClient({ debug: false })
      
      // 1. Fetch catalog resources for all languages in parallel
      const catalogPromises = Array.from(selectedLanguages).map(async (languageCode) => {
        const catalogResults = await catalogManager.searchCatalog({
          language: languageCode,
        })
        console.log(`📚 Found ${catalogResults.length} resources in catalog for ${languageCode}`)
        
        // Check if supported, cached, and in workspace
        for (const metadata of catalogResults) {
          const viewer = viewerRegistry.getViewer(metadata)
          const isCached = await catalogManager.isResourceCached(metadata.resourceKey)
          const isInWorkspace = hasResourceInPackage(metadata.resourceKey)
          
          allResources.set(metadata.resourceKey, {
            ...metadata,
            isCached,
            isInWorkspace,
            isSupported: !!viewer,
            viewerName: viewer?.displayName,
          })
        }
      })
      
      // 2. Fetch Door43 resources - SINGLE API CALL for all orgs and languages!
      const door43Promise = (async () => {
        try {
          const catalogResults = await door43Client.searchCatalog({
            owner: Array.from(selectedOrganizations), // Comma-separated in API
            language: Array.from(selectedLanguages), // Multiple lang params
            subjects: supportedSubjects,
            stage: 'prod',
            topic: 'tc-ready',
          })
          
          console.log(`🌐 Found ${catalogResults.length} resources from Door43 in single call`)
          
          // Process Door43 catalog results
          for (const result of catalogResults) {
            // Extract resource info from catalog result
            // The API response has release at top level, and resource data in result.language or result.door43_metadata
            const resource = result.language ? result : result.door43_metadata
            if (!resource) continue
            
            // Preserve release object from top-level result (API response structure)
            const release = result.release || resource.release
            
            // Debug: Log release object if present
            if (release) {
              console.log(`🔍 Found release object for ${resource.owner}/${resource.language}/${resource.abbreviation || resource.id}:`, {
                tag_name: release.tag_name,
                published_at: release.published_at
              })
            } else {
              console.log(`⚠️ No release object for ${resource.owner}/${resource.language}/${resource.abbreviation || resource.id}`)
            }
            
            const resourceKey = `${resource.owner}/${resource.language}/${resource.abbreviation || resource.id}`
            
            if (!allResources.has(resourceKey)) {
              // Determine resource type and format based on subject
              let resourceType: ResourceType = ResourceType.UNKNOWN
              let resourceFormat: ResourceFormat = ResourceFormat.UNKNOWN
              
              const subject = (resource.subject || '').toLowerCase()
              if (subject.includes('bible')) {
                resourceType = ResourceType.SCRIPTURE
                resourceFormat = ResourceFormat.USFM
              } else if (subject.includes('words')) {
                resourceType = ResourceType.WORDS
                resourceFormat = ResourceFormat.MARKDOWN
              } else if (subject.includes('notes')) {
                resourceType = ResourceType.NOTES
                resourceFormat = ResourceFormat.TSV
              }
              
              // Convert Door43 catalog result to ResourceMetadata format
              const metadata: Partial<ResourceMetadata> & Pick<ResourceMetadata, 'resourceKey' | 'server' | 'owner' | 'language' | 'resourceId' | 'title' | 'subject' | 'version'> = {
                resourceKey,
                resourceId: resource.abbreviation || resource.id || resource.name,
                server: 'git.door43.org',
                owner: resource.owner,
                language: resource.language,
                title: resource.title || resource.name,
                subject: resource.subject || 'Unknown',
                type: resourceType,
                format: resourceFormat,
                contentType: 'text/plain',
                contentStructure: (resourceType === ResourceType.SCRIPTURE || resourceType === ResourceType.NOTES) ? 'book' as const : 'entry' as const,
                availability: {
                  online: true,
                  offline: false,
                  bundled: false,
                  partial: false,
                },
                locations: [],
                catalogedAt: new Date().toISOString(),
                version: resource.metadata_version || resource.version || '1.0.0',
              }
              
              // Check if resource subject is supported and if in workspace
              const isSupported = supportedSubjects.includes(metadata.subject)
              const isInWorkspace = hasResourceInPackage(resourceKey)
              
              allResources.set(resourceKey, {
                ...(metadata as ResourceMetadata),
                isCached: false,
                isInWorkspace,
                isSupported,
                viewerName: isSupported ? metadata.subject : undefined,
                ingredients: resource.ingredients, // Preserve ingredients from Door43
                release: release, // Preserve release object from Door43 API (at top level of result)
              } as any)
            }
          }
        } catch (error) {
          console.error(`❌ Failed to fetch Door43 resources:`, error)
        }
      })()
      
      // ⚡ Execute all fetches in parallel
      await Promise.all([...catalogPromises, door43Promise])
      
      // Filter to only supported resources AND exclude original language resources
      // Original language resources (Greek el-x-koine, Hebrew hbo) should only appear in OriginalLanguageSelectorStep
      const supportedResources = new Map(
        Array.from(allResources.entries()).filter(([_, res]) => {
          return res.isSupported && !isOriginalLanguageResource(res.language, res.subject || '')
        })
      )
      
      // Keep track of original language resources for dependency checking
      const originalLanguageResources = new Map(
        Array.from(allResources.entries()).filter(([_, res]) => {
          return res.isSupported && isOriginalLanguageResource(res.language, res.subject || '')
        })
      )
      
      console.log(`✅ Total: ${allResources.size} resources, ${supportedResources.size} supported (excluding original languages)`)
      console.log(`   Original language resources: ${originalLanguageResources.size}`)
      
      // ⭐ NEW: Check dependencies for all resources
      console.log('🔍 Checking dependencies for all resources...')
      const workspaceResources = useWorkspaceStore.getState().currentPackage?.resources || new Map()
      console.log(`📦 Workspace has ${workspaceResources.size} resources:`)
      for (const [key, res] of Array.from(workspaceResources.entries()).slice(0, 10)) {
        console.log(`   - ${key}: ${(res as any).title || (res as any).name} (${(res as any).subject})`)
      }
      
      // ⭐ Add workspace original language resources to originalLanguageResources for dependency checking
      for (const [key, wsRes] of workspaceResources.entries()) {
        const resource = wsRes as any
        if (isOriginalLanguageResource(resource.languageCode || resource.language, resource.subject || '')) {
          if (!originalLanguageResources.has(key)) {
            console.log(`   📦 Adding workspace original language resource to list: ${key}`)
            originalLanguageResources.set(key, {
              resourceKey: key,
              resourceId: resource.resourceId || resource.id,
              server: resource.server || 'git.door43.org',
              owner: resource.owner,
              language: resource.languageCode || resource.language,
              title: resource.title || resource.name,
              subject: resource.subject || resource.category,
              type: resource.type,
              format: resource.format,
              contentType: resource.contentType || 'text/plain',
              contentStructure: resource.contentStructure || 'entry',
              availability: resource.availability || {
                online: false,
                offline: true,
                bundled: false,
                partial: false,
              },
              locations: resource.locations || [],
              catalogedAt: resource.catalogedAt || new Date().toISOString(),
              version: resource.version || '1.0.0',
              isCached: true,
              isInWorkspace: true,
              isSupported: true,
              viewerName: resource.viewerName,
            } as any)
          }
        }
      }
      
      // Check dependencies for each resource
      for (const [, resource] of supportedResources.entries()) {
        // Determine resource type from subject
        const allTypes = resourceTypeRegistry.getAll()
        let resourceTypeId: string | undefined
        
        for (const type of allTypes) {
          if (type.subjects.some(s => s.toLowerCase() === (resource.subject || '').toLowerCase())) {
            resourceTypeId = type.id
            break
          }
        }
        
        if (!resourceTypeId) {
          console.log(`⚠️ Skipping resource (no type found): ${resource.title} (${resource.subject})`)
          continue // Skip if we can't determine type
        }
        
        console.log(`🔍 Checking dependencies for: ${resource.title} (${resourceTypeId})`)
        
        // Check all dependencies
        // Pass supportedResources AND originalLanguageResources so it can find all dependencies
        // Merge both maps for comprehensive dependency search
        const allAvailableResources = new Map([...supportedResources, ...originalLanguageResources])
        const depCheck = await checkAllDependencies(
          resourceTypeId,
          resource.language,
          resource.owner,
          workspaceResources,
          catalogManager,
          resourceTypeRegistry,
          allAvailableResources // Check in ALL available resources (including original languages)
        )
        
        if (depCheck.results.length > 0) {
          resource.hasDependencies = true
          resource.dependenciesAvailable = depCheck.allAvailable
          resource.missingDependencies = depCheck.results.filter(r => !r.searchResult.found)
          
          // Auto-add dependencies found on Door43, in catalog, workspace, or as original language resources
          const autoAddKeys: string[] = []
          for (const result of depCheck.results) {
            if (result.searchResult.found && result.searchResult.resourceKey) {
              const depKey = result.searchResult.resourceKey
              
              // Add to autoAddKeys if:
              // 1. Found on Door43 (always add cross-org/cross-language dependencies)
              // 2. Found in workspace (including original language resources)
              // 3. Found in available resources but is an original language resource
              // 4. Found in catalog (which includes current resources list)
              const isInWorkspace = result.searchResult.location === 'workspace'
              const isOriginalLang = originalLanguageResources.has(depKey)
              const isInCatalog = result.searchResult.location === 'catalog' && supportedResources.has(depKey)
              const needsAutoAdd = 
                (result.searchResult.location === 'door43') || // Always include Door43 dependencies
                isInWorkspace ||
                isOriginalLang ||
                isInCatalog
              
              if (needsAutoAdd) {
                autoAddKeys.push(depKey)
              }
              
              // If dependency is on Door43 but not in our current list, add it to supportedResources
              console.log(`   📝 Checking if should add Door43 dependency: ${depKey}`)
              console.log(`      location: ${result.searchResult.location}`)
              console.log(`      in supportedResources: ${supportedResources.has(depKey)}`)
              console.log(`      isOriginalLang: ${isOriginalLang}`)
              console.log(`      isInWorkspace: ${isInWorkspace}`)
              
              if (result.searchResult.location === 'door43' && !supportedResources.has(depKey) && !isOriginalLang) {
                console.log(`   ✅ Adding Door43 dependency to resource list: ${depKey}`)
                const depResource = result.searchResult.resource
                if (depResource) {
                  // Determine viewer for this dependency
                  const depViewer = viewerRegistry.getViewer({
                    subject: depResource.subject,
                    format: depResource.format || 'markdown',
                  } as any)
                  
                  // Determine resource type and format for dependency using registry
                  let depType = ResourceType.UNKNOWN
                  let depFormat = ResourceFormat.UNKNOWN
                  const depSubject = (depResource.subject || '').toLowerCase()
                  
                  // Try to determine type from registry first
                  const allTypeDefs = resourceTypeRegistry.getAll()
                  let registeredTypeId: string | undefined
                  
                  for (const typeDef of allTypeDefs) {
                    if (typeDef.subjects.some(s => s.toLowerCase() === depSubject)) {
                      registeredTypeId = typeDef.id
                      depType = typeDef.id as any
                      break
                    }
                  }
                  
                  if (registeredTypeId) {
                    // Determine format based on type
                    if (depSubject.includes('words')) {
                      depFormat = ResourceFormat.MARKDOWN
                    } else if (depSubject.includes('notes') || depSubject.includes('links')) {
                      depFormat = ResourceFormat.TSV
                    } else if (depSubject.includes('bible')) {
                      depFormat = ResourceFormat.USFM
                    } else {
                      depFormat = ResourceFormat.MARKDOWN
                    }
                  } else {
                    // Fallback to legacy logic if not found in registry
                    if (depSubject.includes('words')) {
                      depType = ResourceType.WORDS
                      depFormat = ResourceFormat.MARKDOWN
                    } else if (depSubject.includes('notes')) {
                      depType = ResourceType.NOTES
                      depFormat = ResourceFormat.TSV
                    } else if (depSubject.includes('bible')) {
                      depType = ResourceType.SCRIPTURE
                      depFormat = ResourceFormat.USFM
                    }
                  }
                  
                  supportedResources.set(depKey, {
                    resourceKey: depKey,
                    resourceId: depResource.abbreviation || depResource.id,
                    server: 'git.door43.org',
                    owner: depResource.owner,
                    language: depResource.language,
                    title: depResource.title || depResource.name,
                    subject: depResource.subject,
                    type: depType,
                    format: depFormat,
                    contentType: 'text/plain',
                    contentStructure: 'entry' as const,
                    availability: {
                      online: true,
                      offline: false,
                      bundled: false,
                      partial: false,
                    },
                    locations: [],
                    catalogedAt: new Date().toISOString(),
                    version: depResource.version || '1.0.0',
                    isCached: false,
                    isInWorkspace: false,
                    isSupported: !!depViewer,
                    viewerName: depViewer?.displayName,
                    isAutoIncluded: true, // Mark as auto-included dependency
                    ingredients: depResource.ingredients, // Preserve ingredients from Door43!
                    release: depResource.release, // Preserve release object from Door43 API if available
                  })
                  
                  console.log(`   ✓ Auto-added dependency to list: ${depKey}`)
                }
              } else if (isOriginalLang && !supportedResources.has(depKey)) {
                // Add original language dependency to supported resources for display
                const origResource = originalLanguageResources.get(depKey)
                if (origResource) {
                  supportedResources.set(depKey, {
                    ...origResource,
                    isAutoIncluded: true, // Mark as auto-included
                  } as any)
                  console.log(`   ✓ Auto-included original language dependency: ${depKey}`)
                }
              } else if (isInWorkspace && !supportedResources.has(depKey)) {
                // Add workspace dependency to supported resources for display
                console.log(`   🔍 Looking for workspace dependency: ${depKey}`)
                console.log(`      Workspace resources keys:`, Array.from(workspaceResources.keys()))
                
                // Try to find it directly by key first
                let workspaceResource = workspaceResources.get(depKey)
                
                if (!workspaceResource) {
                  // If not found by key, try constructing the key
                  console.log(`      Not found by key, trying to construct from properties...`)
                  workspaceResource = Array.from(workspaceResources.values()).find(
                    (r: any) => {
                      const constructedKey = `${r.owner}/${r.languageCode || r.language}/${r.resourceId || r.id}`
                      console.log(`         Checking: ${constructedKey} === ${depKey}?`)
                      return constructedKey === depKey
                    }
                  )
                }
                
                if (workspaceResource) {
                  const resourceToAdd = {
                    ...workspaceResource,
                    resourceKey: depKey,
                    key: depKey,
                    title: (workspaceResource as any).title || (workspaceResource as any).name,
                    subject: (workspaceResource as any).subject || (workspaceResource as any).category,
                    isAutoIncluded: true,
                    isInWorkspace: true,
                  } as any
                  supportedResources.set(depKey, resourceToAdd)
                  console.log(`   ✓ Auto-included workspace dependency: ${depKey}`)
                  console.log(`      Title: ${resourceToAdd.title}`)
                  console.log(`      Subject: ${resourceToAdd.subject}`)
                  console.log(`      isAutoIncluded: ${resourceToAdd.isAutoIncluded}`)
                  console.log(`      isInWorkspace: ${resourceToAdd.isInWorkspace}`)
                  console.log(`      supportedResources.size after add: ${supportedResources.size}`)
                  console.log(`      supportedResources now has:`, Array.from(supportedResources.keys()))
                }
              }
            }
          }
          
          if (autoAddKeys.length > 0) {
            resource.autoAddedDependencies = autoAddKeys
            console.log(`   📝 Set autoAddedDependencies for ${(resource as any).key || resource.resourceKey}:`, autoAddKeys)
          }
          
          console.log(`   ${resource.title}: ${depCheck.allAvailable ? '✓ All dependencies available' : '✗ Missing dependencies'}`)
        }
      }
      
      // Convert to ResourceInfo format for store (keeping all metadata for later use)
      const resourceInfoMap = new Map(
        Array.from(supportedResources.entries()).map(([resourceKey, res]) => [
          resourceKey,
          {
            id: res.resourceId,
            key: resourceKey, // Use the key from the loop, not res.resourceKey
            title: res.title,
            // Set type to empty string - let getResourceTypeFromSubjectUsingRegistry determine it from subject
            type: '',
            category: res.subject || 'unknown',
            language: res.language,
            owner: res.owner,
            server: res.server,
            subject: res.subject,
            format: res.format as any,
            resourceId: res.resourceId,
            ingredients: (res as any).ingredients, // Preserve ingredients from Door43
            version: res.version,
            release: (res as any).release, // Preserve release object from Door43 API (contains tag_name)
            hasDependencies: res.hasDependencies,
            dependenciesAvailable: res.dependenciesAvailable,
            missingDependencies: res.missingDependencies as any,
            autoAddedDependencies: res.autoAddedDependencies,
            isAutoIncluded: (res as any).isAutoIncluded || false, // Preserve auto-included flag
            isInWorkspace: hasResourceInPackage(resourceKey), // Always check current workspace state (not stale data)
          }
        ])
      )
      
      console.log(`📋 Creating resourceInfoMap from ${supportedResources.size} supportedResources:`)
      console.log(`   Keys:`, Array.from(supportedResources.keys()))
      console.log(`   Auto-included in supportedResources:`, Array.from(supportedResources.entries()).filter(([_, r]: any) => r.isAutoIncluded).map(([k]) => k))
      
      console.log(`📋 Setting ${resourceInfoMap.size} resources in availableResources`)
      console.log(`   Auto-included count: ${Array.from(resourceInfoMap.values()).filter((r: any) => r.isAutoIncluded).length}`)
      console.log(`   Auto-included resources:`, Array.from(resourceInfoMap.entries()).filter(([_, r]: any) => r.isAutoIncluded).map(([k]) => k))
      
      setAvailableResources(resourceInfoMap)
      
      // Auto-select resources that are already in the workspace
      const resourcesInWorkspace = Array.from(supportedResources.entries())
        .filter(([key]) => hasResourceInPackage(key))
        .map(([key]) => key)
      
      if (resourcesInWorkspace.length > 0) {
        console.log(`🔄 Auto-selecting ${resourcesInWorkspace.length} resources already in workspace`)
        resourcesInWorkspace.forEach(key => {
          const resource = supportedResources.get(key)
          if (resource && !selectedResourceKeys.has(key)) {
            toggleResource(key, resource as any)
          }
        })
      }
    } catch (error) {
      console.error('❌ Failed to load resources:', error)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
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
      
      let enrichedData: { readme?: string; license?: string } = {}
      if (metadataUrl) {
        const tempResource = { ...resource, metadata_url: metadataUrl }
        const result = await door43Client.enrichResourceMetadata(tempResource)
        enrichedData = result || {}
      }
      
      setSelectedInfoResource({
        key: resource.key,
        title: resource.title,
        owner: resource.owner,
        languageCode: resource.language,
        subject: resource.category || resource.subject,
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

  // Convert to array for SelectableGrid - show all resources together
  const resourcesArray = Array.from(availableResources.entries()).map(([, resource]) => resource)

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="w-8 h-8 animate-spin text-blue-500" />
      </div>
    )
  }

  if (selectedLanguages.size === 0) {
    return (
      <div className="text-center py-20">
        <Languages className="w-16 h-16 mx-auto text-gray-300" />
      </div>
    )
  }

  return (
    <div>
      {/* All Resources Grid */}
      {resourcesArray.length === 0 ? (
        <div className="text-center py-12">
          <Book className="w-12 h-12 mx-auto text-gray-300" />
        </div>
      ) : (
        <SelectableGrid
          items={resourcesArray}
          selected={selectedResourceKeys}
          isLocked={(resource) => {
            // Lock resources that are already in the workspace (selected, can't deselect)
            const fullResource = availableResources.get(resource.key) as any
            return fullResource?.isInWorkspace || false
          }}
          isDisabled={(resource) => {
            // Disable resources with unmet dependencies
            const fullResource = availableResources.get(resource.key) as any
            return fullResource?.hasDependencies && !fullResource?.dependenciesAvailable
          }}
          onToggle={(key) => {
            console.log(`🔘 Resource clicked: ${key}`)
            const resource = availableResources.get(key)
            console.log(`   Resource object:`, resource)
            console.log(`   autoAddedDependencies:`, (resource as any)?.autoAddedDependencies)
            const isCurrentlySelected = selectedResourceKeys.has(key)
            
            // If deselecting, check if any selected resources depend on this one
            if (isCurrentlySelected) {
              // Find all selected resources that depend on this resource
              const dependentResources: string[] = []
              
              for (const [selectedKey, selectedResource] of availableResources.entries()) {
                if (!selectedResourceKeys.has(selectedKey)) continue
                
                const autoAddKeys = (selectedResource as any)?.autoAddedDependencies || []
                if (autoAddKeys.includes(key)) {
                  dependentResources.push(selectedKey)
                }
              }
              
              // Cascade deselect: remove dependents first
              if (dependentResources.length > 0) {
                console.log(`   ⛓️  Cascade deselecting dependents of ${key}:`)
                for (const depKey of dependentResources) {
                  console.log(`      - ${depKey}`)
                  const depResource = availableResources.get(depKey)
                  toggleResource(depKey, depResource)
                }
              }
            }
            
            // Toggle the main resource
            toggleResource(key, resource)
            
            // If selecting, auto-select dependencies
            if (!isCurrentlySelected) {
              const autoAddKeys = (resource as any)?.autoAddedDependencies || []
              for (const depKey of autoAddKeys) {
                const depResource = availableResources.get(depKey)
                if (depResource && !selectedResourceKeys.has(depKey)) {
                  console.log(`   🔗 Auto-selecting dependency: ${depKey}`)
                  toggleResource(depKey, depResource)
                }
              }
            }
          }}
          getKey={(resource) => resource.key}
          className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3"
          renderItem={(resource, _isSelected, isResourceDisabled) => {
            const Icon = getSubjectIcon(resource.category || 'Other')
            // Get status from availableResources
            const fullResource = availableResources.get(resource.key) as any
            const isCached = fullResource?.isCached || false
            const isInWorkspace = fullResource?.isInWorkspace || false
            const hasDependencies = fullResource?.hasDependencies || false
            const dependenciesAvailable = fullResource?.dependenciesAvailable !== false
            const missingDeps = fullResource?.missingDependencies || []
            
            // Get organization and language full names
            const orgName = orgNameMap.get(resource.owner || '') || resource.owner || 'Unknown'
            const langName = langNameMap.get(resource.language || '') || resource.language || 'Unknown'
            
            return (
              <>
                <div className={`font-semibold text-sm mb-0.5 ${isResourceDisabled ? 'text-gray-400' : 'text-gray-900'}`}>
                  {resource.title}
                </div>
                
                <div className="text-xs text-gray-500 pb-2">
                  <div className="truncate">{orgName}</div>
                  <div className="text-gray-400">{langName}</div>
                </div>
                
                {/* Dependency status */}
                {hasDependencies && (
                  <div className="text-xs mb-4">
                    {dependenciesAvailable ? (
                      <div className="flex items-center gap-1 text-green-600">
                        <CheckCircle className="w-3 h-3 flex-shrink-0" />
                        <span>Dependencies OK</span>
                      </div>
                    ) : (
                      <div className="text-red-600">
                        <div className="flex items-center gap-1 mb-1">
                          <AlertCircle className="w-3 h-3 flex-shrink-0" />
                          <span className="font-semibold">Missing:</span>
                        </div>
                        {missingDeps.map((dep: any) => (
                          <div key={dep.dependency.resourceType} className="ml-4 text-xs">
                            • {dep.displayName}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}
                
                {/* Info button - top right */}
                <button
                  onClick={(e) => handleShowInfo(e, resource)}
                  disabled={fetchingInfo}
                  className="absolute top-1.5 right-1.5 p-1 hover:bg-blue-100 rounded transition-colors disabled:opacity-50"
                  title="Resource information"
                  aria-label="Resource information"
                >
                  {fetchingInfo ? (
                    <Loader2 className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                  ) : (
                    <Info className="w-3.5 h-3.5 text-blue-600" />
                  )}
                </button>
                
                {/* Status icon - bottom left (priority: In Collection > Cached > Online) */}
                {isInWorkspace ? (
                  <div title="Already in collection">
                    <Package className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-purple-600" />
                  </div>
                ) : isCached ? (
                  <div title="Cached offline">
                    <Database className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-green-600" />
                  </div>
                ) : (
                  <div title="Available online">
                    <Wifi className="absolute bottom-1.5 left-1.5 w-3.5 h-3.5 text-blue-500" />
                  </div>
                )}
                
                {/* Subject icon - bottom right */}
                <Icon className="absolute bottom-1.5 right-1.5 w-3.5 h-3.5 text-gray-400" />
              </>
            )
          }}
        />
      )}
      
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
