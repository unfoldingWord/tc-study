/**
 * Resource dependency resolution
 */

import type { Door43Resource } from '@bt-synergy/door43-api'

/**
 * Get dependencies for a resource
 * Some resources depend on others (e.g., TWL depends on TW)
 */
export function getDependencies(resource: Door43Resource): string[] {
  const dependencies: string[] = []
  
  // Translation Words Links depends on Translation Words
  if (resource.id === 'twl' && resource.subject?.includes('Translation Words')) {
    const twKey = `${resource.owner}_${resource.language}_tw`
    dependencies.push(twKey)
  }
  
  // Add more dependency rules as needed
  
  return dependencies
}

/**
 * Sort resources by dependencies (topological sort)
 * Resources with no dependencies come first
 */
export function sortByDependencies(
  resources: Array<{ id: string; dependencies: string[] }>
): Array<{ id: string; dependencies: string[] }> {
  const sorted: typeof resources = []
  const visited = new Set<string>()
  const visiting = new Set<string>()
  
  function visit(resource: typeof resources[0]) {
    if (visited.has(resource.id)) return
    if (visiting.has(resource.id)) {
      console.warn('Circular dependency detected:', resource.id)
      return
    }
    
    visiting.add(resource.id)
    
    // Visit dependencies first
    for (const depId of resource.dependencies) {
      const dep = resources.find(r => r.id === depId)
      if (dep) {
        visit(dep)
      }
    }
    
    visiting.delete(resource.id)
    visited.add(resource.id)
    sorted.push(resource)
  }
  
  for (const resource of resources) {
    visit(resource)
  }
  
  return sorted
}
