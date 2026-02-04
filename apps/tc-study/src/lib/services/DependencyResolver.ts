/**
 * Dependency Resolver
 * 
 * Resolves resource dependencies and reorders download/load queues
 * to ensure dependencies are processed before dependent resources.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceDependency } from '@bt-synergy/resource-types'
import type { ResourceCompletenessChecker } from './ResourceCompletenessChecker'

export interface ResolvedResource {
  resourceKey: string
  metadata: ResourceMetadata
  dependencies: string[] // Resolved dependency resource keys
  priority: number
}

export class DependencyResolver {
  private catalogManager: any
  private resourceTypeRegistry: any
  private completenessChecker?: ResourceCompletenessChecker
  private debug: boolean

  constructor(
    catalogManager: any,
    resourceTypeRegistry: any,
    completenessChecker?: ResourceCompletenessChecker,
    debug = false
  ) {
    this.catalogManager = catalogManager
    this.resourceTypeRegistry = resourceTypeRegistry
    this.completenessChecker = completenessChecker
    this.debug = debug
  }

  /**
   * Resolve dependencies for a resource
   * Returns array of dependency resource keys that need to be loaded/downloaded first
   */
  async resolveDependencies(resourceKey: string): Promise<string[]> {
    try {
      // Get resource metadata
      const metadata = await this.catalogManager.getResourceMetadata(resourceKey)
      if (!metadata) {
        if (this.debug) {
          console.warn(`[DEP] Resource not found: ${resourceKey}`)
        }
        return []
      }

      // Get resource type definition
      const resourceType = this.resourceTypeRegistry.get(metadata.type)
      if (!resourceType?.dependencies || resourceType.dependencies.length === 0) {
        return [] // No dependencies
      }

      const resolvedDeps: string[] = []

      // Resolve each dependency
      for (const dep of resourceType.dependencies) {
        const depResourceKeys = await this.findDependencyResources(resourceKey, metadata, dep)
        resolvedDeps.push(...depResourceKeys)
      }

      // Remove duplicates
      return Array.from(new Set(resolvedDeps))
    } catch (error) {
      console.error(`[DEP] Error resolving dependencies for ${resourceKey}:`, error)
      return []
    }
  }

  /**
   * Find resources that match a dependency specification
   */
  private async findDependencyResources(
    sourceResourceKey: string,
    sourceMetadata: ResourceMetadata,
    dependency: string | ResourceDependency
  ): Promise<string[]> {
    // Simple string dependency (just resource type ID)
    if (typeof dependency === 'string') {
      dependency = { resourceType: dependency }
    }

    // Parse source resource key to extract owner/language
    const sourceParts = sourceResourceKey.split('/')
    const sourceOwner = sourceParts[0]
    const sourceLanguage = sourceParts.length >= 2 ? sourceParts[1].split('_')[0] : undefined

    // Determine target owner and language based on dependency spec
    const targetOwner = dependency.owner || (dependency.sameOwner !== false ? sourceOwner : undefined)
    const targetLanguage = dependency.language || (dependency.sameLanguage ? sourceLanguage : undefined)

    // Get all resources from catalog
    const allResources = await this.catalogManager.getAllResources()

    // Filter resources that match the dependency
    const matchingKeys: string[] = []

    for (const resource of allResources) {
      const resourceType = this.resourceTypeRegistry.get(resource.type)
      
      // Check if resource type matches
      if (resourceType?.id !== dependency.resourceType) {
        continue
      }

      // Parse resource key
      const parts = resource.resourceKey.split('/')
      const owner = parts[0]
      const language = parts.length >= 2 ? parts[1].split('_')[0] : undefined

      // Check owner constraint
      if (targetOwner && owner !== targetOwner) {
        continue
      }

      // Check language constraint
      if (targetLanguage && language !== targetLanguage) {
        continue
      }

      matchingKeys.push(resource.resourceKey)
    }

    if (this.debug && matchingKeys.length > 0) {
      console.log(`[DEP] Found ${matchingKeys.length} dependencies for ${sourceResourceKey}:`, matchingKeys)
    }

    return matchingKeys
  }

  /**
   * Reorder resources with dependency resolution
   * Ensures dependencies come before their dependents
   * Also filters out already-complete resources if checker is provided
   */
  async reorderWithDependencies(
    resources: ResolvedResource[],
    skipComplete = true
  ): Promise<ResolvedResource[]> {
    if (this.debug) {
      console.log(`[DEP] Reordering ${resources.length} resources with dependency resolution...`)
    }

    // Check which resources are already complete
    const completenessMap = new Map<string, boolean>()
    
    if (skipComplete && this.completenessChecker) {
      for (const resource of resources) {
        const status = await this.completenessChecker.checkResource(resource.resourceKey)
        completenessMap.set(resource.resourceKey, status.isComplete)
      }
    }

    // Filter out complete resources
    let pendingResources = resources
    if (skipComplete && this.completenessChecker) {
      const beforeCount = pendingResources.length
      pendingResources = pendingResources.filter(r => !completenessMap.get(r.resourceKey))
      const skipped = beforeCount - pendingResources.length
      
      if (this.debug && skipped > 0) {
        console.log(`[DEP] Skipped ${skipped} already-complete resources`)
      }
    }

    // Resolve dependencies for pending resources
    const dependencyMap = new Map<string, string[]>()
    
    for (const resource of pendingResources) {
      const deps = await this.resolveDependencies(resource.resourceKey)
      dependencyMap.set(resource.resourceKey, deps)
    }

    // Topological sort to resolve dependency order
    const ordered: ResolvedResource[] = []
    const visited = new Set<string>()
    const visiting = new Set<string>()

    const visit = (resourceKey: string) => {
      if (visited.has(resourceKey)) return
      if (visiting.has(resourceKey)) {
        // Circular dependency detected - just skip
        if (this.debug) {
          console.warn(`[DEP] Circular dependency detected for ${resourceKey}`)
        }
        return
      }

      visiting.add(resourceKey)

      // Visit dependencies first
      const deps = dependencyMap.get(resourceKey) || []
      for (const depKey of deps) {
        // Check if dependency is in our pending list
        const depResource = pendingResources.find(r => r.resourceKey === depKey)
        if (depResource && !visited.has(depKey)) {
          visit(depKey)
        } else if (!depResource && !completenessMap.has(depKey)) {
          // Dependency is not in pending list and not checked for completeness
          // This means it might need to be added to the queue
          if (this.debug) {
            console.log(`[DEP] Dependency ${depKey} not in queue, checking status...`)
          }
        }
      }

      // Add this resource
      const resource = pendingResources.find(r => r.resourceKey === resourceKey)
      if (resource) {
        ordered.push(resource)
      }

      visiting.delete(resourceKey)
      visited.add(resourceKey)
    }

    // Visit all pending resources
    for (const resource of pendingResources) {
      visit(resource.resourceKey)
    }

    // Sort by priority within dependency groups
    // Resources with same dependency depth should be ordered by priority
    const finalOrder = this.sortByPriorityPreservingDependencies(ordered)

    if (this.debug) {
      console.log(`[DEP] Reordering complete: ${finalOrder.length} resources in dependency order`)
      if (finalOrder.length <= 10) {
        console.log('[DEP] Order:', finalOrder.map(r => r.resourceKey))
      }
    }

    return finalOrder
  }

  /**
   * Sort resources by priority while preserving dependency constraints
   */
  private sortByPriorityPreservingDependencies(resources: ResolvedResource[]): ResolvedResource[] {
    // Create dependency depth map
    const depthMap = new Map<string, number>()
    
    const calculateDepth = (resource: ResolvedResource, visited = new Set<string>()): number => {
      if (depthMap.has(resource.resourceKey)) {
        return depthMap.get(resource.resourceKey)!
      }
      
      if (visited.has(resource.resourceKey)) {
        return 0 // Circular - treat as depth 0
      }
      
      visited.add(resource.resourceKey)
      
      if (resource.dependencies.length === 0) {
        depthMap.set(resource.resourceKey, 0)
        return 0
      }
      
      const maxDepth = Math.max(
        ...resource.dependencies.map(depKey => {
          const depResource = resources.find(r => r.resourceKey === depKey)
          return depResource ? calculateDepth(depResource, new Set(visited)) + 1 : 0
        })
      )
      
      depthMap.set(resource.resourceKey, maxDepth)
      return maxDepth
    }
    
    // Calculate depth for all resources
    resources.forEach(r => calculateDepth(r))
    
    // Sort by depth first (dependencies come first), then by priority
    return resources.sort((a, b) => {
      const depthA = depthMap.get(a.resourceKey) || 0
      const depthB = depthMap.get(b.resourceKey) || 0
      
      if (depthA !== depthB) {
        return depthA - depthB // Lower depth first (dependencies)
      }
      
      return a.priority - b.priority // Then by priority
    })
  }

  /**
   * Add missing dependencies to resource list
   * Returns an expanded list including dependencies not originally in the list
   */
  async expandWithDependencies(
    resources: ResolvedResource[],
    skipComplete = true
  ): Promise<ResolvedResource[]> {
    const expanded = new Map<string, ResolvedResource>()
    const toProcess = [...resources]
    
    // Add all original resources
    resources.forEach(r => expanded.set(r.resourceKey, r))
    
    while (toProcess.length > 0) {
      const current = toProcess.shift()!
      
      // Skip if already complete
      if (skipComplete && this.completenessChecker) {
        const status = await this.completenessChecker.checkResource(current.resourceKey)
        if (status.isComplete) {
          continue
        }
      }
      
      // Resolve dependencies
      const deps = await this.resolveDependencies(current.resourceKey)
      
      for (const depKey of deps) {
        // Skip if already in expanded list
        if (expanded.has(depKey)) continue
        
        // Skip if already complete
        if (skipComplete && this.completenessChecker) {
          const status = await this.completenessChecker.checkResource(depKey)
          if (status.isComplete) {
            if (this.debug) {
              console.log(`[DEP] Dependency ${depKey} already complete, skipping`)
            }
            continue
          }
        }
        
        // Get metadata for dependency
        const depMetadata = await this.catalogManager.getResourceMetadata(depKey)
        if (!depMetadata) continue
        
        // Get priority for dependency
        const depResourceType = this.resourceTypeRegistry.get(depMetadata.type)
        const depPriority = depResourceType?.downloadPriority ?? 50
        
        // Resolve dependencies of this dependency
        const depDeps = await this.resolveDependencies(depKey)
        
        const depResource: ResolvedResource = {
          resourceKey: depKey,
          metadata: depMetadata,
          dependencies: depDeps,
          priority: depPriority
        }
        
        expanded.set(depKey, depResource)
        toProcess.push(depResource)
        
        if (this.debug) {
          console.log(`[DEP] Added missing dependency: ${depKey}`)
        }
      }
    }
    
    return Array.from(expanded.values())
  }
}
