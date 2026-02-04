/**
 * Add to Catalog Wizard
 * 
 * Simplified wizard for adding resources directly to the catalog
 * without workspace/panel concerns.
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import { LocationType, ResourceFormat, ResourceType } from '@bt-synergy/resource-catalog'
import { BookOpen, Building2, CheckCircle, ChevronLeft, ChevronRight, Download, Languages, Package, Plus, X } from 'lucide-react'
import { useEffect, useState } from 'react'
import { useCatalogManager, useResourceTypeRegistry } from '../../contexts/CatalogContext'
import { createResourceMetadata } from '../../lib/services/ResourceMetadataFactory'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { checkResourceDependencies, getRequiredDependencyResources } from '../../utils/resourceDependencies'

// Import wizard steps (reuse existing ones)
import { LanguageSelectorStep } from '../wizard/LanguageSelectorStep'
import { OrganizationSelectorStep } from '../wizard/OrganizationSelectorStep'
import { OriginalLanguageSelectorStep } from '../wizard/OriginalLanguageSelectorStep'
import { ResourceSelectorStep } from '../wizard/ResourceSelectorStep'

type WizardStep = 'languages' | 'organizations' | 'resources' | 'original-languages' | 'review'

interface AddToCatalogWizardProps {
  onClose: () => void
  onComplete?: () => void
  isEmbedded?: boolean
  targetPanel?: 'panel-1' | 'panel-2' | null  // If specified, auto-add resources to this panel
}

// Helper function moved outside component to be stable
function getResourceTypeFromSubjectUsingRegistry(
  subject: string | undefined, 
  resourceType: string | undefined,
  registry: ReturnType<typeof useResourceTypeRegistry>
): string {
  console.log(`🔎 getResourceTypeFromSubjectUsingRegistry called:`)
  console.log(`   subject: "${subject}"`)
  console.log(`   resourceType: "${resourceType}"`)
  
  // If resource.type is already set, use it directly
  if (resourceType) {
    console.log(`   ✓ Using provided resourceType: ${resourceType}`)
    return resourceType
  }
  
  // Otherwise, look up by subject in the registry
  if (!subject) {
    console.log(`   ✗ No subject provided, returning 'unknown'`)
    return 'unknown'
  }
  
  // Get all registered resource types
  const allTypes = registry.getAll()
  console.log(`   📚 Found ${allTypes.length} registered resource types:`)
  allTypes.forEach(type => {
    console.log(`      - ${type.id}: ${type.subjects.join(', ')}`)
  })
  
  // Find the resource type that handles this subject
  // Sort by specificity (more specific subjects first)
  const sortedTypes = allTypes.sort((a, b) => {
    // Longer subject strings are usually more specific
    const maxLenA = Math.max(...a.subjects.map(s => s.length))
    const maxLenB = Math.max(...b.subjects.map(s => s.length))
    return maxLenB - maxLenA
  })
  
  console.log(`   🔍 Trying exact match for: "${subject}"`)
  for (const type of sortedTypes) {
    for (const typeSubject of type.subjects) {
      if (typeSubject.toLowerCase() === subject.toLowerCase()) {
        // Exact match - highest priority
        console.log(`   ✓ EXACT MATCH: "${typeSubject}" -> ${type.id}`)
        return type.id
      }
    }
  }
  
  // If no exact match, try partial match
  console.log(`   🔍 No exact match, trying partial match...`)
  for (const type of sortedTypes) {
    for (const typeSubject of type.subjects) {
      const subjectLower = subject.toLowerCase()
      const typeSubjectLower = typeSubject.toLowerCase()
      
      if (subjectLower.includes(typeSubjectLower) || typeSubjectLower.includes(subjectLower)) {
        console.log(`   ✓ PARTIAL MATCH: "${typeSubject}" matches "${subject}" -> ${type.id}`)
        return type.id
      }
    }
  }
  
  console.warn(`⚠️  No resource type found for subject: "${subject}"`)
  return 'unknown'
}

export function AddToCatalogWizard({ onClose, onComplete, isEmbedded = false, targetPanel = null }: AddToCatalogWizardProps) {
  const catalogManager = useCatalogManager()
  const resourceTypeRegistry = useResourceTypeRegistry()
  
  // Use workspace store for selection state (it handles all the selection logic)
  const selectedLanguages = useWorkspaceStore((state) => state.selectedLanguages)
  const selectedOrganizations = useWorkspaceStore((state) => state.selectedOrganizations)
  const selectedResourceKeys = useWorkspaceStore((state) => state.selectedResourceKeys)
  const availableResources = useWorkspaceStore((state) => state.availableResources)
  const currentPackage = useWorkspaceStore((state) => state.currentPackage)
  
  const startWizard = useWorkspaceStore((state) => state.startWizard)
  const closeWizard = useWorkspaceStore((state) => state.closeWizard)
  const storeSetWizardStep = useWorkspaceStore((state) => state.setWizardStep)
  const addResourceToPackage = useWorkspaceStore((state) => state.addResourceToPackage)
  const assignResourceToPanel = useWorkspaceStore((state) => state.assignResourceToPanel)
  
  // Local state for wizard step (includes 'review' which isn't in workspace store)
  const [wizardStep, setWizardStep] = useState<WizardStep>('languages')
  const [isProcessing, setIsProcessing] = useState(false)
  const [reviewResources, setReviewResources] = useState<Map<string, any>>(new Map())
  const [selectedForDownload, setSelectedForDownload] = useState<Set<string>>(new Set())
  
  // Initialize wizard on mount
  useEffect(() => {
    startWizard('edit-workspace')
    storeSetWizardStep('languages')
  }, [startWizard, storeSetWizardStep])
  
  // Define steps (no panel assignment!)
  const steps: WizardStep[] = ['languages', 'organizations', 'resources', 'original-languages', 'review']
  const currentStepIndex = steps.indexOf(wizardStep)
  
  // Check if user selected aligned bible resources
  const hasAlignedBibleResources = Array.from(selectedResourceKeys).some(key => {
    const resource = availableResources.get(key)
    return resource?.subject?.toLowerCase().includes('aligned')
  })
  
  // Should show original languages step?
  const shouldShowOriginalLanguages = hasAlignedBibleResources
  
  // Can proceed to next step?
  const canProceed = () => {
    switch (wizardStep) {
      case 'languages':
        return selectedLanguages.size > 0
      case 'organizations':
        return selectedOrganizations.size > 0
      case 'resources':
        return selectedResourceKeys.size > 0
      case 'original-languages':
        return true // Optional step
      case 'review':
        return selectedForDownload.size > 0
      default:
        return false
    }
  }
  
  const handleNext = async () => {
    const nextIndex = currentStepIndex + 1
    if (nextIndex >= steps.length) return
    
    const nextStep: WizardStep = steps[nextIndex]
    
    // Skip original languages if no aligned bibles
    if (nextStep === 'original-languages' && !shouldShowOriginalLanguages) {
      // Skip to review
      await prepareReviewStep()
      setWizardStep('review')
      return
    }
    
    // Prepare review data when entering review step
    if (nextStep === 'review') {
      await prepareReviewStep()
    }
    
    setWizardStep(nextStep)
    // Also update workspace store for non-review steps
    if (nextStep !== 'review') {
      storeSetWizardStep(nextStep as any)
    }
  }
  
  // Prepare review step by filtering out already downloaded resources and workspace resources
  const prepareReviewStep = async () => {
    const filteredResources = new Map<string, any>()
    const toDownload = new Set<string>()
    
    for (const resourceKey of selectedResourceKeys) {
      const resource = availableResources.get(resourceKey) as any
      if (!resource) continue
      
      // Skip resources that are already in the workspace
      if (resource.isInWorkspace) {
        continue
      }
      
      // Check if resource is already downloaded
      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      const isAlreadyDownloaded = metadata?.availability?.offline === true
      
      if (!isAlreadyDownloaded) {
        filteredResources.set(resourceKey, resource)
        toDownload.add(resourceKey)
      }
    }
    
    setReviewResources(filteredResources)
    setSelectedForDownload(toDownload)
  }
  
  const handleBack = () => {
    const prevIndex = currentStepIndex - 1
    
    // Going back from review
    if (wizardStep === 'review') {
      const prevStep = shouldShowOriginalLanguages ? 'original-languages' : 'resources'
      setWizardStep(prevStep)
      storeSetWizardStep(prevStep as any)
      return
    }
    
    // Skip original languages going back if no aligned bibles
    if (steps[prevIndex] === 'original-languages' && !shouldShowOriginalLanguages) {
      const targetStep: WizardStep = steps[prevIndex - 1]
      setWizardStep(targetStep)
      if (targetStep !== 'review') {
        storeSetWizardStep(targetStep as any)
      }
      return
    }
    
    if (prevIndex >= 0) {
      const prevStep: WizardStep = steps[prevIndex]
      setWizardStep(prevStep)
      if (prevStep !== 'review') {
        storeSetWizardStep(prevStep as any)
      }
    }
  }
  
  const handleCancel = () => {
    if (isProcessing) {
      if (!confirm('Processing in progress. Are you sure you want to cancel?')) {
        return
      }
    }
    closeWizard()
    onClose()
  }
  
  const isLastStep = () => {
    return wizardStep === 'review'
  }
  
  const handleAddOnly = async () => {
    setIsProcessing(true)
    
    try {
      console.log('➕ Adding', selectedForDownload.size, 'resources to catalog (metadata only)...')
      
      // ===== CHECK DEPENDENCIES =====
      // Collect all resources that need to be added (including dependencies)
      const resourcesToAdd = new Set<string>(selectedForDownload)
      const dependencyMessages: string[] = []
      
      for (const resourceKey of selectedForDownload) {
        const resource = reviewResources.get(resourceKey)
        if (!resource) continue
        
        const resourceType = getResourceTypeFromSubjectUsingRegistry(resource.subject || resource.category, resource.type, resourceTypeRegistry)
        
        console.log(`🔍 Checking dependencies for: ${resource.title}`)
        console.log(`   Resource type: ${resourceType}`)
        console.log(`   Language: ${resource.language}`)
        console.log(`   Owner: ${resource.owner}`)
        console.log(`   Subject: ${resource.subject}`)
        
        // Check if this resource has dependencies
        const depCheck = checkResourceDependencies(
          resourceType,
          resource.language || 'en',
          resource.owner || 'unfoldingWord',
          resourceTypeRegistry,
          currentPackage?.resources || new Map()
        )
        
        console.log(`   Dependency check result:`, depCheck)
        
        if (!depCheck.canAdd) {
          console.warn(`⚠️  ${resource.title} requires: ${depCheck.missingDependencies.map(d => d.displayName).join(', ')}`)
          
          console.log(`   Available resources in wizard: ${availableResources.size}`)
          console.log(`   Available resource keys:`, Array.from(availableResources.keys()))
          
          // Find required dependency resources to auto-add
          const requiredResourceKeys = getRequiredDependencyResources(
            resourceType,
            resource.language || 'en',
            resource.owner || 'unfoldingWord',
            resourceTypeRegistry,
            currentPackage?.resources || new Map(),
            availableResources
          )
          
          if (requiredResourceKeys.length > 0) {
            console.log(`   🔗 Auto-adding dependencies:`, requiredResourceKeys)
            requiredResourceKeys.forEach(key => resourcesToAdd.add(key))
            
            const depNames = depCheck.missingDependencies.map(d => d.displayName).join(', ')
            dependencyMessages.push(`${resource.title} → will also add ${depNames}`)
          } else {
            console.error(`   ❌ Could not find required dependencies for ${resource.title}`)
            dependencyMessages.push(`${resource.title} → missing required ${depCheck.missingDependencies.map(d => d.displayName).join(', ')} (not found in selections)`)
          }
        }
      }
      
      // Show dependency info to user if any were found
      if (dependencyMessages.length > 0) {
        console.log('📋 Dependency Resolution:')
        dependencyMessages.forEach(msg => console.log(`   ${msg}`))
      }
      
      const total = resourcesToAdd.size
      let current = 0
      
      // Add resources to catalog (metadata only, no download)
      for (const resourceKey of resourcesToAdd) {
        const resource = reviewResources.get(resourceKey)
        if (!resource) {
          console.warn(`⚠️ Resource not found: ${resourceKey}`)
          continue
        }
        
        current++
        console.log(`➕ [${current}/${total}] Adding: ${resource.title}`)
        
        try {
          // Check if resource is already in catalog
          const existingMetadata = await catalogManager.getResourceMetadata(resourceKey)
          
          if (!existingMetadata) {
            // 🌟 Use unified metadata factory (includes enrichment by default)
            let resourceData = resource as any
            
            // Debug: Log release object if present
            if (resourceData.release) {
              console.log(`   🔍 Release object found for ${resourceData.owner}/${resourceData.language}/${resource.id}:`, {
                tag_name: resourceData.release.tag_name,
                published_at: resourceData.release.published_at
              })
            } else {
              console.log(`   ⚠️ No release object for ${resourceData.owner}/${resourceData.language}/${resource.id}`)
              console.log(`   📋 Resource keys:`, Object.keys(resourceData))
            }
            
            // Always reconstruct metadata_url to use release tag when available
            // This ensures enrichResourceMetadata uses the correct release tag, not master
            if (resourceData.owner && resourceData.language && resource.id) {
              const repoName = `${resourceData.language}_${resource.id}`
              // Use release tag if available, otherwise use master branch
              const ref = resourceData.release?.tag_name || 'master'
              const refType = resourceData.release?.tag_name ? 'tag' : 'branch'
              const metadata_url = `https://git.door43.org/${resourceData.owner}/${repoName}/raw/${refType}/${ref}/manifest.yaml`
              resourceData = { ...resourceData, metadata_url }
              console.log(`   🔧 Constructed metadata_url: ${metadata_url} (using ${refType} ${ref})`)
            }
            
            // Create complete metadata with enrichment in one step!
            const resourceMetadata = await createResourceMetadata(resourceData, {
              includeEnrichment: true,
              getResourceType: (subject, format) => 
                getResourceTypeFromSubjectUsingRegistry(subject || resource.category, resource.type, resourceTypeRegistry),
              resourceTypeRegistry: resourceTypeRegistry,
              debug: true,
            })
            
            // Save to catalog
            await catalogManager.addResourceToCatalog(resourceMetadata)
            
            // Also add to workspace collection
            addResourceToPackage({
              id: resourceKey,
              key: resourceKey,
              title: resourceMetadata.title,
              type: resourceMetadata.type,
              category: String(resourceMetadata.type).toLowerCase(),
              subject: resourceMetadata.subject,
              language: resourceMetadata.language,
              languageCode: resourceMetadata.language,
              languageName: resourceMetadata.languageName || resourceData.language_title,
              owner: resourceMetadata.owner,
              server: resourceMetadata.server,
              format: resourceData.format || resourceData.content_format,
              location: 'network',
              resourceId: resourceMetadata.resourceId,
              ingredients: resourceMetadata.contentMetadata?.ingredients,
              version: resourceMetadata.version,
              description: resourceMetadata.description,
              readme: resourceMetadata.readme,  // ✅ Always present now!
              license: resourceMetadata.license, // ✅ Always present now!
            })
            
            console.log(`   ✅ Added: ${resource.title}`)
          } else {
            console.log(`   ⊙ Already in catalog: ${resource.title}`)
            
            // Still need to add to workspace package even if already in catalog
            const existingMetadata = await catalogManager.getResourceMetadata(resourceKey)
            if (existingMetadata) {
              addResourceToPackage({
                id: resourceKey,
                key: resourceKey,
                title: resource.title || existingMetadata.title,
                type: existingMetadata.type,
                category: String(existingMetadata.type).toLowerCase(),
                subject: existingMetadata.subject,
                language: existingMetadata.language,
                languageCode: existingMetadata.language,
                languageName: existingMetadata.languageName || (resource as any).language_title,
                owner: existingMetadata.owner,
                server: existingMetadata.server,
                format: existingMetadata.format,
                location: 'network',
                resourceId: existingMetadata.resourceId,
                ingredients: existingMetadata.contentMetadata?.ingredients,
                version: existingMetadata.version,
                description: existingMetadata.description,
                readme: existingMetadata.readme || '', // ✅ Standardized field name
                license: existingMetadata.license || '', // ✅ Standardized field name
                metadata_url: existingMetadata.urls?.metadata,
              })
              console.log(`   ✅ Added to workspace: ${resource.title}`)
            }
          }
        } catch (error) {
          console.error(`   ❌ Failed to add ${resource.title}:`, error)
        }
      }
      
      console.log('✅ All resources added to catalog (metadata only)')
      
      // If targetPanel is specified, assign all resources to that panel
      if (targetPanel) {
        console.log(`📍 Auto-assigning ${selectedForDownload.size} resources to ${targetPanel}`)
        for (const resourceKey of selectedForDownload) {
          assignResourceToPanel(resourceKey, targetPanel)
        }
      }
      
      setIsProcessing(false)
      closeWizard()
      onComplete?.()
      onClose()
    } catch (error) {
      console.error('❌ Failed to add resources:', error)
      setIsProcessing(false)
      alert('Some resources failed to add. Check console for details.')
      closeWizard()
      onComplete?.()
      onClose()
    }
  }
  
  const handleDownload = async () => {
    setIsProcessing(true)
    
    try {
      console.log('📥 Adding', selectedForDownload.size, 'resources to catalog and starting background downloads...')
      
      // ===== STEP 1: Add metadata to catalog (fast) =====
      const resourcesToDownload: string[] = []
      
      for (const resourceKey of selectedForDownload) {
        const resource = reviewResources.get(resourceKey)
        if (!resource) {
          console.warn(`⚠️ Resource not found: ${resourceKey}`)
          continue
        }
        
        console.log(`➕ Adding metadata for: ${resource.title}`)
        
        try {
          // Check if resource is already in catalog
          let metadata = await catalogManager.getResourceMetadata(resourceKey)
          
          if (!metadata) {
            // Add to catalog with full ingredients
            const resourceData = resource as any
            
            // Parse ingredients to extract path information
            const ingredients = resourceData.ingredients?.map((ing: any) => ({
              identifier: ing.identifier,
              title: ing.title || ing.identifier,
              path: ing.path || '',
              size: ing.size,
              categories: ing.categories,
              sort: ing.sort,
              alignmentCount: ing.alignment_count,
              versification: ing.versification,
              exists: ing.exists,
              isDir: ing.is_dir,
            }))
            
            // Enrich metadata with license and README
            let enrichedData: { license?: string; readme?: string; licenseFile?: string; ingredients?: any[] } = {}
            try {
              const door43Client = getDoor43ApiClient({ debug: false })
              
              // If metadata_url is missing, construct it
              let metadataUrl = resourceData.metadata_url
              if (!metadataUrl && resourceData.owner && resourceData.language && resource.id) {
                const repoName = `${resourceData.language}_${resource.id}`
                metadataUrl = `https://git.door43.org/${resourceData.owner}/${repoName}/raw/branch/master/manifest.yaml`
              }
              
              if (metadataUrl) {
                const enrichedResource = { ...resourceData, metadata_url: metadataUrl }
                enrichedData = await door43Client.enrichResourceMetadata(enrichedResource)
              }
            } catch (err) {
              console.warn(`   ⚠️  Failed to enrich metadata:`, err)
            }
            
            // Use enriched ingredients if resource doesn't have them
            const finalIngredients = ingredients || enrichedData?.ingredients
            
            await catalogManager.addResourceToCatalog({
              // Identity
              resourceKey,
              resourceId: resourceData.resourceId || resource.id,
              server: resourceData.server || 'git.door43.org',
              owner: resourceData.owner || 'unknown',
              language: resourceData.language || 'en',
              
              // Basic info
              title: resource.title,
              subject: resourceData.subject || resource.category || 'Unknown',
              version: resourceData.version || '1.0.0',
              description: resourceData.description,
              license: enrichedData?.license ? { id: enrichedData.license } : undefined,
              
              // Type & format - determine from subject
              type: getResourceTypeFromSubjectUsingRegistry(resourceData.subject || resource.category, resource.type, resourceTypeRegistry) as ResourceType,
              format: ResourceFormat.USFM,
              contentType: 'text/usfm',
              contentStructure: 'book' as const,
              
              // Availability
              availability: {
                online: true,
                offline: false,
                bundled: false,
                partial: false,
              },
              
              // Locations
              locations: [{
                type: LocationType.NETWORK,
                path: `${resourceData.server || 'git.door43.org'}/${resourceData.owner}/${resourceData.language}_${resource.id}`,
                priority: 1,
              }],
              
              // Release information (for ZIP downloads)
              release: resourceData.zipball_url ? {
                tag_name: resourceData.version || resourceData.release?.tag_name || '1.0.0',
                zipball_url: resourceData.zipball_url,
                tarball_url: resourceData.tarball_url,
                published_at: resourceData.released || resourceData.release?.published_at,
                html_url: resourceData.html_url || resourceData.release?.html_url,
              } : undefined,
              
              // Content metadata with full ingredients
              contentMetadata: {
                ingredients: finalIngredients,
                books: finalIngredients?.map((i: any) => i.identifier),
              },
              
              // Catalog tracking
              catalogedAt: new Date().toISOString(),
            })
            
            console.log(`   ✅ Added to catalog: ${resource.title}`)
            
            // Fetch the newly added metadata
            metadata = await catalogManager.getResourceMetadata(resourceKey)
          } else {
            console.log(`   ⊙ Already in catalog: ${resource.title}`)
          }
          
          // Add to workspace package (metadata is now guaranteed to exist)
          if (metadata) {
            const resourceType = getResourceTypeFromSubjectUsingRegistry(metadata.subject, metadata.type, resourceTypeRegistry)
            addResourceToPackage({
              id: resourceKey,
              key: resourceKey,
              title: resource.title || metadata.title,
              type: resourceType,
              category: String(resourceType).toLowerCase(),
              subject: metadata.subject,
              language: metadata.language,
              languageCode: metadata.language,
              languageName: (resource as any).language_title,
              owner: metadata.owner,
              server: metadata.server,
              format: metadata.format,
              location: 'network',
              resourceId: metadata.resourceId,
              ingredients: metadata.contentMetadata?.ingredients,
              version: metadata.version,
              description: metadata.description,
              readme: metadata.description,
              license: metadata.license?.id,
            })
          }
          
          // Add to download list
          resourcesToDownload.push(resourceKey)
          
        } catch (error) {
          console.error(`   ❌ Failed to add ${resource.title}:`, error)
          // Continue with other resources even if one fails
        }
      }
      
      // ===== STEP 2: Trigger downloads asynchronously (don't await) =====
      if (resourcesToDownload.length > 0) {
        console.log(`🔄 Starting background downloads for ${resourcesToDownload.length} resources...`)
        
        // Fire and forget - downloads will continue after wizard closes
        Promise.all(
          resourcesToDownload.map(async (resourceKey) => {
            try {
              console.log(`📥 Downloading ${resourceKey}...`)
              await catalogManager.downloadResource(
                resourceKey,
                { method: 'zip' },
                (progress) => {
                  console.log(`📥 ${resourceKey}: ${progress.percentage}%`)
                }
              )
              console.log(`✅ Downloaded ${resourceKey}`)
            } catch (error) {
              console.error(`❌ Failed to download ${resourceKey}:`, error)
            }
          })
        ).then(() => {
          console.log('✅ All background downloads complete!')
        }).catch((error) => {
          console.error('❌ Some downloads failed:', error)
        })
        
        console.log('✅ Downloads started in background!')
      }
      
      // ===== STEP 3: Assign to panel if specified =====
      if (targetPanel) {
        console.log(`📍 Auto-assigning ${selectedForDownload.size} resources to ${targetPanel}`)
        for (const resourceKey of selectedForDownload) {
          assignResourceToPanel(resourceKey, targetPanel)
        }
      }
      
      // ===== STEP 4: Close wizard immediately =====
      setIsProcessing(false)
      closeWizard()
      onComplete?.()
      onClose()
      
    } catch (error) {
      console.error('❌ Failed to add resources:', error)
      setIsProcessing(false)
      alert('Some resources failed to be added. Check console for details.')
      closeWizard()
      onComplete?.()
      onClose()
    }
  }
  
  const content = (
    <>
        {/* Header */}
        <div className="px-4 py-2 border-b border-gray-200 flex items-center justify-between bg-gray-50">
          <div className="flex items-center gap-2">
            <Download className="w-5 h-5 text-blue-600" />
            {selectedResourceKeys.size > 0 && (
              <span className="text-sm font-medium text-gray-900">{selectedResourceKeys.size}</span>
            )}
          </div>
          <button
            onClick={handleCancel}
            disabled={isProcessing}
            className="p-1 hover:bg-gray-100 rounded transition-colors disabled:opacity-50"
            title="Close"
            aria-label="Close"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
        
        {/* Progress indicator */}
        <div className="px-4 py-2 border-b border-gray-200 bg-white">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              {steps.map((step, index) => {
                if (step === 'original-languages' && !shouldShowOriginalLanguages) {
                  return null
                }
                const isActive = wizardStep === step
                const isComplete = index < currentStepIndex
                
                // Get icon for step
                const getStepIcon = () => {
                  switch (step) {
                    case 'languages': return Languages
                    case 'organizations': return Building2
                    case 'resources': return Package
                    case 'original-languages': return BookOpen
                    case 'review': return CheckCircle
                    default: return Package
                  }
                }
                const StepIcon = getStepIcon()
                
                return (
                  <div key={step} className="flex items-center">
                    <div className={`
                      p-1.5 rounded-full transition-colors
                      ${isActive ? 'bg-blue-600 text-white' : ''}
                      ${isComplete ? 'bg-green-600 text-white' : ''}
                      ${!isActive && !isComplete ? 'bg-gray-200 text-gray-600' : ''}
                    `} title={step.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase())}>
                      <StepIcon className="w-3.5 h-3.5" />
                    </div>
                    {index < steps.length - 1 && (step !== 'original-languages' || shouldShowOriginalLanguages) && (
                      <ChevronRight className="w-3 h-3 mx-0.5 text-gray-400" />
                    )}
                  </div>
                )
              })}
            </div>
            
            <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 rounded-full">
              <Package className="w-3.5 h-3.5 text-gray-600" />
              <span className="text-xs font-medium text-gray-900">
                {wizardStep === 'review' ? selectedForDownload.size : selectedResourceKeys.size}
              </span>
            </div>
          </div>
        </div>
        
        {/* Processing banner */}
        {isProcessing && (
          <div className="px-4 py-2 border-b bg-blue-50 border-blue-200">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-blue-600 animate-pulse" />
              <span className="text-sm font-medium text-blue-900">
                Processing resources...
              </span>
            </div>
          </div>
        )}
        
        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {wizardStep === 'languages' && <LanguageSelectorStep />}
          {wizardStep === 'organizations' && <OrganizationSelectorStep />}
          {wizardStep === 'resources' && <ResourceSelectorStep />}
          {wizardStep === 'original-languages' && shouldShowOriginalLanguages && (
            <OriginalLanguageSelectorStep />
          )}
          {wizardStep === 'review' && (
            <div className="space-y-2">
              {reviewResources.size === 0 && (
                <div className="bg-green-50 border border-green-200 rounded-lg p-3 flex items-center gap-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <span className="text-xs text-green-800">All resources already in catalog</span>
                </div>
              )}
              
              {reviewResources.size > 0 ? (
                <div className="space-y-1.5">
                  {Array.from(reviewResources.entries()).map(([resourceKey, resource]) => {
                    const isSelected = selectedForDownload.has(resourceKey)
                    return (
                      <div
                        key={resourceKey}
                        className="flex items-center gap-2 p-3 border border-gray-200 rounded-lg hover:bg-gray-50 transition-colors"
                      >
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={(e) => {
                            const newSelection = new Set(selectedForDownload)
                            if (e.target.checked) {
                              newSelection.add(resourceKey)
                            } else {
                              newSelection.delete(resourceKey)
                            }
                            setSelectedForDownload(newSelection)
                          }}
                          className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 cursor-pointer"
                        />
                        <div className="flex-1 min-w-0">
                          <h4 className="font-medium text-gray-900 text-sm truncate">{resource.title}</h4>
                          <div className="flex items-center gap-1.5 mt-0.5">
                            <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-700 rounded font-mono">
                              {resource.language || '??'}
                            </span>
                            {resource.ingredients && (
                              <span className="flex items-center gap-0.5 text-xs text-gray-500">
                                <BookOpen className="w-3 h-3" />
                                {resource.ingredients.length}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    )
                  })}
                </div>
              ) : null}
            </div>
          )}
        </div>
        
        {/* Footer */}
        <div className="px-4 py-2 border-t border-gray-200 bg-gray-50">
          <div className="flex items-center justify-between">
            <button
              onClick={handleBack}
              disabled={currentStepIndex === 0 || isProcessing}
              className="p-1.5 border border-gray-300 rounded hover:bg-gray-100 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              title="Back"
              aria-label="Go back"
              data-testid="wizard-back-btn"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCancel}
                disabled={isProcessing}
                className="p-1.5 text-gray-700 hover:bg-gray-100 rounded disabled:opacity-50 transition-colors"
                title="Cancel"
                aria-label="Cancel wizard"
                data-testid="wizard-cancel-btn"
              >
                <X className="w-4 h-4" />
              </button>
              
              {!isLastStep() ? (
                <button
                  onClick={handleNext}
                  disabled={!canProceed() || isProcessing}
                  className="p-1.5 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  title="Next"
                  aria-label="Next step"
                  data-testid="wizard-next-btn"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              ) : (
                <div className="flex items-center gap-1.5">
                  {/* Add to Catalog (metadata only) */}
                  <button
                    onClick={handleAddOnly}
                    disabled={!canProceed() || isProcessing}
                    className="p-2 bg-gray-600 text-white rounded hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Add to catalog (metadata only)"
                    aria-label="Add to catalog"
                  >
                    <Plus className="w-4 h-4" />
                  </button>
                  
                  {/* Download Resources (background) */}
                  <button
                    onClick={handleDownload}
                    disabled={!canProceed() || isProcessing}
                    className="p-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    title="Add to catalog and download content (continues in background)"
                    aria-label="Download resources"
                  >
                    <Download className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
    </>
  )

  if (isEmbedded) {
    return content
  }

  // Render as a modal overlay (for Library page and standalone use)
  return (
    <div className="fixed inset-0 bg-black/50 backdrop-blur-sm flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl max-h-[90vh] flex flex-col overflow-hidden">
        {content}
      </div>
    </div>
  )
}
