/**
 * Comprehensive Dependency Search
 * 
 * Searches for resource dependencies across all layers:
 * 1. Workspace (already loaded resources)
 * 2. Catalog (locally cached resources)
 * 3. Door43 (fetch from API)
 */

import type { CatalogManager } from '@bt-synergy/catalog-manager'
import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { ResourceDependency, ResourceTypeRegistry } from '@bt-synergy/resource-types'

export interface DependencySearchResult {
  found: boolean
  location: 'workspace' | 'catalog' | 'door43' | 'not-found'
  resourceKey?: string
  resource?: any
  message?: string
}

/**
 * Normalize dependency to ResourceDependency format
 */
function normalizeDependency(dep: string | ResourceDependency): ResourceDependency {
  if (typeof dep === 'string') {
    return { resourceType: dep }
  }
  return dep
}

/**
 * Get target language and owner based on dependency rules
 */
function getTargetCriteria(
  dependency: ResourceDependency,
  resourceLanguage: string,
  resourceOwner: string
): { language: string; owner: string } {
  const targetLanguage = dependency.language || (dependency.sameLanguage ? resourceLanguage : undefined)
  const targetOwner = dependency.owner || (dependency.sameOwner ? resourceOwner : undefined)
  
  return {
    language: targetLanguage || resourceLanguage,
    owner: targetOwner || resourceOwner
  }
}

/**
 * Check if a resource matches the dependency criteria
 */
function matchesDependency(
  resource: any,
  dependency: ResourceDependency,
  targetLanguage: string,
  targetOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry
): boolean {
  // Determine resource type from subject if not set
  let resourceType = resource.type
  
  if (!resourceType || resourceType === 'undefined' || resourceType === undefined) {
    const subject = resource.subject || resource.category
    if (subject) {
      const allTypes = resourceTypeRegistry.getAll()
      for (const type of allTypes) {
        if (type.subjects.some(s => s.toLowerCase() === subject.toLowerCase())) {
          resourceType = type.id
          break
        }
      }
    }
  }
  
  // Check type match
  if (resourceType !== dependency.resourceType) {
    return false
  }
  
  // Check language match
  if (dependency.sameLanguage && resource.language !== targetLanguage) {
    return false
  }
  if (dependency.language && resource.language !== dependency.language) {
    return false
  }
  
  // Check owner match
  if (dependency.sameOwner && resource.owner !== targetOwner) {
    return false
  }
  if (dependency.owner && resource.owner !== dependency.owner) {
    return false
  }
  
  return true
}

/**
 * Search for dependency in workspace
 */
function searchInWorkspace(
  workspaceResources: Map<string, any>,
  dependency: ResourceDependency,
  targetLanguage: string,
  targetOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry
): DependencySearchResult {
  for (const [key, resource] of workspaceResources.entries()) {
    if (matchesDependency(resource, dependency, targetLanguage, targetOwner, resourceTypeRegistry)) {
      return {
        found: true,
        location: 'workspace',
        resourceKey: key,
        resource,
        message: 'Found in workspace'
      }
    }
  }
  
  return { found: false, location: 'not-found' }
}

/**
 * Search for dependency in catalog (locally cached)
 */
async function searchInCatalog(
  catalogManager: CatalogManager,
  dependency: ResourceDependency,
  targetLanguage: string,
  targetOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry
): Promise<DependencySearchResult> {
  // Catalog search not implemented - the catalog manager doesn't expose a getAllResources method
  // Dependencies are primarily found in workspace or fetched from Door43
  console.log('   ⏭️  Skipping catalog search (not implemented)')
  return { found: false, location: 'not-found' }
}

/**
 * Search for dependency on Door43
 */
async function searchInDoor43(
  dependency: ResourceDependency,
  targetLanguage: string,
  targetOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry
): Promise<DependencySearchResult> {
  try {
    const door43Client = getDoor43ApiClient()
    const depType = resourceTypeRegistry.get(dependency.resourceType)
    
    if (!depType) {
      return { found: false, location: 'not-found', message: 'Unknown resource type' }
    }
    
    console.log(`   🌐 Searching Door43 for ${dependency.resourceType} from ${targetOwner}/${targetLanguage}...`)
    
    // Use getResourcesByOrgAndLanguage to fetch resources from the specific org/language
    const results = await door43Client.getResourcesByOrgAndLanguage(targetOwner, targetLanguage)
    
    if (results && results.length > 0) {
      // Filter for resources matching the dependency type (by subject)
      const matchingResource = results.find((resource: any) => {
        return depType.subjects.some(subject => 
          subject.toLowerCase() === (resource.subject || '').toLowerCase()
        )
      })
      
      if (matchingResource) {
        const resourceKey = `${matchingResource.owner}/${matchingResource.language}/${matchingResource.id || matchingResource.abbreviation}`
        
        console.log(`      ✓ Found on Door43: ${resourceKey}`)
        
        return {
          found: true,
          location: 'door43',
          resourceKey,
          resource: matchingResource,
          message: 'Found on Door43 (will be fetched)'
        }
      } else {
        console.log(`      ✗ No matching ${dependency.resourceType} found`)
      }
    } else {
      console.log(`      ✗ No resources found for ${targetOwner}/${targetLanguage}`)
    }
  } catch (error) {
    console.error('Error searching Door43:', error)
  }
  
  return { found: false, location: 'not-found' }
}

/**
 * Comprehensive search for a dependency across all layers
 */
export async function searchForDependency(
  dependencySpec: string | ResourceDependency,
  resourceLanguage: string,
  resourceOwner: string,
  workspaceResources: Map<string, any>,
  catalogManager: CatalogManager,
  resourceTypeRegistry: ResourceTypeRegistry,
  availableResources?: Map<string, any> // NEW: current list of resources being displayed
): Promise<DependencySearchResult> {
  const dependency = normalizeDependency(dependencySpec)
  const { language: targetLanguage, owner: targetOwner } = getTargetCriteria(
    dependency,
    resourceLanguage,
    resourceOwner
  )
  
  console.log(`🔍 Searching for dependency: ${dependency.resourceType}`)
  console.log(`   Target: ${targetOwner}/${targetLanguage}`)
  
  // Step 1: Check workspace (already loaded)
  const workspaceResult = searchInWorkspace(
    workspaceResources,
    dependency,
    targetLanguage,
    targetOwner,
    resourceTypeRegistry
  )
  
  if (workspaceResult.found) {
    console.log(`   ✓ Found in workspace: ${workspaceResult.resourceKey}`)
    return workspaceResult
  }
  
  // Step 2: Check available resources (currently displayed in wizard)
  if (availableResources && availableResources.size > 0) {
    const availableResult = searchInWorkspace( // Reuse same logic
      availableResources,
      dependency,
      targetLanguage,
      targetOwner,
      resourceTypeRegistry
    )
    
    if (availableResult.found) {
      console.log(`   ✓ Found in available resources list: ${availableResult.resourceKey}`)
      return {
        ...availableResult,
        location: 'catalog', // Mark as catalog since it's similar to a local cache
        message: 'Found in current resource list'
      }
    }
  }
  
  // Step 3: Check catalog (locally cached)
  const catalogResult = await searchInCatalog(
    catalogManager,
    dependency,
    targetLanguage,
    targetOwner,
    resourceTypeRegistry
  )
  
  if (catalogResult.found) {
    console.log(`   ✓ Found in catalog: ${catalogResult.resourceKey}`)
    return catalogResult
  }
  
  // Step 4: Check Door43 (fetch from API)
  const door43Result = await searchInDoor43(
    dependency,
    targetLanguage,
    targetOwner,
    resourceTypeRegistry
  )
  
  if (door43Result.found) {
    console.log(`   ✓ Found on Door43: ${door43Result.resourceKey}`)
    return door43Result
  }
  
  console.warn(`   ✗ Not found anywhere`)
  return { 
    found: false, 
    location: 'not-found',
    message: `${dependency.resourceType} not found for ${targetOwner}/${targetLanguage}`
  }
}

/**
 * Check all dependencies for a resource
 */
export async function checkAllDependencies(
  resourceTypeId: string,
  resourceLanguage: string,
  resourceOwner: string,
  workspaceResources: Map<string, any>,
  catalogManager: CatalogManager,
  resourceTypeRegistry: ResourceTypeRegistry,
  availableResources?: Map<string, any> // NEW: current list of resources being displayed
): Promise<{
  allAvailable: boolean
  results: Array<{
    dependency: ResourceDependency
    searchResult: DependencySearchResult
    displayName: string
  }>
}> {
  const resourceType = resourceTypeRegistry.get(resourceTypeId)
  
  if (!resourceType?.dependencies || resourceType.dependencies.length === 0) {
    return { allAvailable: true, results: [] }
  }
  
  const results = await Promise.all(
    resourceType.dependencies.map(async (dep) => {
      const normalized = normalizeDependency(dep)
      const depType = resourceTypeRegistry.get(normalized.resourceType)
      
      return {
        dependency: normalized,
        searchResult: await searchForDependency(
          dep,
          resourceLanguage,
          resourceOwner,
          workspaceResources,
          catalogManager,
          resourceTypeRegistry,
          availableResources // Pass through available resources
        ),
        displayName: depType?.displayName || normalized.resourceType
      }
    })
  )
  
  const allAvailable = results.every(r => r.searchResult.found)
  
  return { allAvailable, results }
}
