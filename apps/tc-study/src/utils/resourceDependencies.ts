/**
 * Resource Dependencies Utility
 * 
 * Checks if a resource's dependencies are met before adding it to the workspace
 */

import type { ResourceDependency, ResourceTypeRegistry } from '@bt-synergy/resource-types'

export interface DependencyCheckResult {
  canAdd: boolean
  missingDependencies: Array<{
    typeId: string
    displayName: string
    requirement?: string // Human-readable description of the requirement
  }>
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
 * Check if a resource matches dependency requirements
 */
function resourceMatchesDependency(
  resource: any,
  dependency: ResourceDependency,
  targetLanguage: string,
  targetOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry
): boolean {
  // Determine resource type from subject if not set or invalid
  let resourceType = resource.type
  
  // If not set, is "undefined" string, or doesn't match a known type ID, determine from subject
  if (!resourceType || resourceType === 'undefined' || resourceType === undefined) {
    const subject = resource.subject || resource.category
    if (subject) {
      // Find matching resource type by subject
      const allTypes = resourceTypeRegistry.getAll()
      for (const type of allTypes) {
        if (type.subjects.some(s => s.toLowerCase() === subject.toLowerCase())) {
          resourceType = type.id
          console.log(`      → Determined type from subject: "${subject}" -> ${type.id}`)
          break
        }
      }
    }
  }
  
  console.log(`      → Final resourceType: ${resourceType}, looking for: ${dependency.resourceType}`)
  
  if (resourceType !== dependency.resourceType) {
    return false
  }
  
  // Check language requirements
  if (dependency.sameLanguage && resource.language !== targetLanguage) {
    return false
  }
  if (dependency.language && resource.language !== dependency.language) {
    return false
  }
  
  // Check owner requirements
  if (dependency.sameOwner && resource.owner !== targetOwner) {
    return false
  }
  if (dependency.owner && resource.owner !== dependency.owner) {
    return false
  }
  
  return true
}

/**
 * Get human-readable description of dependency requirements
 */
function getDependencyRequirement(dep: ResourceDependency, resourceTypeRegistry: ResourceTypeRegistry): string {
  const depType = resourceTypeRegistry.get(dep.resourceType)
  const typeName = depType?.displayName || dep.resourceType
  
  const parts = [typeName]
  
  if (dep.sameLanguage && dep.sameOwner) {
    parts.push('(same language & org)')
  } else if (dep.sameLanguage) {
    parts.push('(same language)')
  } else if (dep.sameOwner) {
    parts.push('(same org)')
  }
  
  if (dep.language) {
    parts.push(`(${dep.language})`)
  }
  if (dep.owner) {
    parts.push(`(${dep.owner})`)
  }
  
  return parts.join(' ')
}

/**
 * Check if a resource can be added based on its dependencies
 * 
 * @param resourceTypeId - The resource type ID (e.g., 'words-links')
 * @param resourceLanguage - The language of the resource being added
 * @param resourceOwner - The owner/org of the resource being added
 * @param resourceTypeRegistry - The resource type registry
 * @param workspaceResources - Map of currently available resources in workspace
 * @returns Check result with list of missing dependencies
 */
export function checkResourceDependencies(
  resourceTypeId: string,
  resourceLanguage: string,
  resourceOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry,
  workspaceResources: Map<string, any>
): DependencyCheckResult {
  // Get the resource type definition
  const resourceType = resourceTypeRegistry.get(resourceTypeId)
  
  if (!resourceType) {
    return {
      canAdd: true,
      missingDependencies: [],
      message: 'Resource type not found in registry'
    }
  }
  
  // Check if it has dependencies
  if (!resourceType.dependencies || resourceType.dependencies.length === 0) {
    return {
      canAdd: true,
      missingDependencies: []
    }
  }
  
  // Check each dependency
  const missingDependencies: Array<{ typeId: string; displayName: string; requirement?: string }> = []
  
  for (const dep of resourceType.dependencies) {
    const normalizedDep = normalizeDependency(dep)
    
    // Check if a matching resource exists in workspace
    const hasMatchingResource = Array.from(workspaceResources.values()).some(
      resource => resourceMatchesDependency(resource, normalizedDep, resourceLanguage, resourceOwner, resourceTypeRegistry)
    )
    
    if (!hasMatchingResource) {
      const depType = resourceTypeRegistry.get(normalizedDep.resourceType)
      missingDependencies.push({
        typeId: normalizedDep.resourceType,
        displayName: depType?.displayName || normalizedDep.resourceType,
        requirement: getDependencyRequirement(normalizedDep, resourceTypeRegistry)
      })
    }
  }
  
  // Build result
  if (missingDependencies.length > 0) {
    const depDescriptions = missingDependencies.map(d => d.requirement || d.displayName).join(', ')
    return {
      canAdd: false,
      missingDependencies,
      message: `${resourceType.displayName} requires: ${depDescriptions}`
    }
  }
  
  return {
    canAdd: true,
    missingDependencies: []
  }
}

/**
 * Check if all dependencies for a resource are ready (have metadata loaded)
 * 
 * @param resourceTypeId - The resource type ID
 * @param resourceLanguage - The language of the resource
 * @param resourceOwner - The owner/org of the resource
 * @param resourceTypeRegistry - The resource type registry
 * @param catalogManager - The catalog manager (to check if dependencies have metadata)
 * @returns Promise resolving to true if all dependencies are ready, false otherwise
 */
export async function checkDependenciesReady(
  resourceTypeId: string,
  resourceLanguage: string,
  resourceOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry,
  catalogManager: any,
  debug: boolean = true
): Promise<boolean> {
  const resourceType = resourceTypeRegistry.get(resourceTypeId)
  
  if (!resourceType?.dependencies || resourceType.dependencies.length === 0) {
    if (debug) console.log(`[Deps] ${resourceTypeId} has no dependencies, ready`)
    return true // No dependencies = always ready
  }
  
  if (debug) {
    console.log(`[Deps] Checking ${resourceType.dependencies.length} dependencies for ${resourceTypeId}:`, {
      resourceLanguage,
      resourceOwner,
    })
  }
  
  // Check each dependency
  for (const dep of resourceType.dependencies) {
    const normalizedDep = normalizeDependency(dep)
    
    if (debug) console.log(`[Deps] Looking for dependency type: ${normalizedDep.resourceType}`, { sameLanguage: normalizedDep.sameLanguage, sameOwner: normalizedDep.sameOwner, language: normalizedDep.language, owner: normalizedDep.owner })
    
    // Get all resources from catalog
    const allResourceKeys = await catalogManager.getAllResourceKeys()
    if (debug) console.log(`[Deps] Searching ${allResourceKeys.length} catalog resources`)
    
    // Find matching resource by checking each one's metadata
    let foundMatch = false
    
    for (const resourceKey of allResourceKeys) {
      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      if (!metadata) continue
      
      // Check if this resource matches the dependency requirements
      const parts = resourceKey.split('/')
      if (parts.length < 3) continue
      
      const [resOwner, resLanguage, resId] = parts
      
      // Check if resource type matches
      if (metadata.type !== normalizedDep.resourceType) continue
      
      // Check language requirements
      if (normalizedDep.sameLanguage && resLanguage !== resourceLanguage) continue
      if (normalizedDep.language && resLanguage !== normalizedDep.language) continue
      
      // Check owner requirements
      if (normalizedDep.sameOwner && resOwner !== resourceOwner) continue
      if (normalizedDep.owner && resOwner !== normalizedDep.owner) continue
      
      // This resource matches! Check if it has ingredients
      if (!metadata.contentMetadata?.ingredients) {
        if (debug) console.log(`[Deps] ❌ Found matching resource but not ready: ${resourceKey}`, { hasMetadata: true, hasContentMetadata: !!metadata.contentMetadata, hasIngredients: false })
        return false
      }
      
      if (debug) console.log(`[Deps] ✅ Dependency ready: ${resourceKey} (type: ${metadata.type})`)
      foundMatch = true
      break
    }
    
    if (!foundMatch) {
      if (debug) console.log(`[Deps] ❌ No matching resource found for dependency type: ${normalizedDep.resourceType}`)
      return false
    }
  }
  
  if (debug) console.log(`[Deps] ✅ All dependencies ready for ${resourceTypeId}`)
  return true // All dependencies are ready
}

/**
 * Get all dependencies that need to be downloaded for a resource
 * 
 * @param resourceTypeId - The resource type ID
 * @param resourceLanguage - The language of the resource being added
 * @param resourceOwner - The owner/org of the resource being added
 * @param resourceTypeRegistry - The resource type registry
 * @param workspaceResources - Map of currently available resources
 * @param availableForSelection - Map of resources available for selection (from wizard)
 * @returns Array of resource keys that should be added along with this resource
 */
export function getRequiredDependencyResources(
  resourceTypeId: string,
  resourceLanguage: string,
  resourceOwner: string,
  resourceTypeRegistry: ResourceTypeRegistry,
  workspaceResources: Map<string, any>,
  availableForSelection: Map<string, any>
): string[] {
  const resourceType = resourceTypeRegistry.get(resourceTypeId)
  
  if (!resourceType?.dependencies || resourceType.dependencies.length === 0) {
    return []
  }
  
  const requiredResourceKeys: string[] = []
  
  for (const dep of resourceType.dependencies) {
    const normalizedDep = normalizeDependency(dep)
    
    // Check if a matching dependency is already in workspace
    const hasInWorkspace = Array.from(workspaceResources.values()).some(
      resource => resourceMatchesDependency(resource, normalizedDep, resourceLanguage, resourceOwner)
    )
    
    if (hasInWorkspace) {
      continue // Already have it
    }
    
    // Find a matching resource in available selections
    console.log(`   🔍 Looking for dependency: ${normalizedDep.resourceType}`)
    console.log(`      Matching rules: language=${resourceLanguage}, owner=${resourceOwner}, sameLanguage=${normalizedDep.sameLanguage}, sameOwner=${normalizedDep.sameOwner}`)
    
    const matchingResource = Array.from(availableForSelection.entries()).find(([key, resource]) => {
      const matches = resourceMatchesDependency(resource, normalizedDep, resourceLanguage, resourceOwner, resourceTypeRegistry)
      console.log(`      Checking ${key}: subject="${resource.subject}", type="${resource.type}", matches=${matches}`)
      return matches
    })
    
    if (matchingResource) {
      requiredResourceKeys.push(matchingResource[0])
      console.log(`✓ Found dependency: ${normalizedDep.resourceType} -> ${matchingResource[1].title || matchingResource[1].name}`)
    } else {
      // Log warning if we couldn't find a matching dependency
      const requirement = getDependencyRequirement(normalizedDep, resourceTypeRegistry)
      console.warn(`⚠️ Could not find dependency: ${requirement}`)
    }
  }
  
  return requiredResourceKeys
}
