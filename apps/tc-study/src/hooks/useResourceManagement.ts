/**
 * Shared hook for managing resources across workspace and app stores
 * Ensures DRY principle by centralizing resource addition logic
 * Supports multiple instances of the same resource with unique IDs
 */

import { useCallback } from 'react'
import { useWorkspaceStore } from '../lib/stores/workspaceStore'
import { useAppStore } from '../contexts/AppContext'
import type { ResourceInfo } from '../contexts/types'

/**
 * Generate a unique instance ID for a resource
 * Format: resourceKey#instanceNumber (e.g., "unfoldingWord/en/ult#2")
 */
function generateInstanceId(baseResourceKey: string, existingIds: string[]): string {
  // Find all existing instances of this resource
  const instancePattern = new RegExp(`^${baseResourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}(#\\d+)?$`)
  const existingInstances = existingIds.filter(id => instancePattern.test(id))
  
  // If this is the first instance, use the base key without suffix
  if (existingInstances.length === 0) {
    return baseResourceKey
  }
  
  // Otherwise, generate next instance number
  const instanceNumbers = existingInstances
    .map(id => {
      const match = id.match(/#(\d+)$/)
      return match ? parseInt(match[1], 10) : 1
    })
  
  const nextNumber = Math.max(...instanceNumbers) + 1
  return `${baseResourceKey}#${nextNumber}`
}

/**
 * Extract the base resource key from an instance ID
 * "unfoldingWord/en/ult#2" -> "unfoldingWord/en/ult"
 * "unfoldingWord/en/ult" -> "unfoldingWord/en/ult"
 */
export function getBaseResourceKey(instanceId: string): string {
  return instanceId.replace(/#\d+$/, '')
}

export function useResourceManagement() {
  const addResourceToPackage = useWorkspaceStore((s) => s.addResourceToPackage)
  const hasResourceInPackage = useWorkspaceStore((s) => s.hasResourceInPackage)
  const addResourceToApp = useAppStore((s) => s.addResource)
  const loadedResources = useAppStore((s) => s.loadedResources)

  /**
   * Add a resource to both workspace collection and loaded resources
   * This ensures the resource is available in the sidebar AND can be rendered in panels
   * 
   * @param resource - Resource metadata
   * @param allowMultipleInstances - If true, generates unique instance ID (default: false)
   * @returns The instance ID that was created
   */
  const addResource = useCallback((resource: ResourceInfo, allowMultipleInstances = false): string => {
    let instanceId = resource.key
    
    // Generate unique instance ID if allowing multiple instances
    if (allowMultipleInstances) {
      const existingIds = Object.keys(loadedResources)
      instanceId = generateInstanceId(resource.key, existingIds)
    }
    
    // Create resource with instance ID
    const resourceInstance = {
      ...resource,
      id: instanceId,
      key: resource.key, // Keep original key for content loading
    }
    
    // ✅ Always add to workspace package if not already there (for persistence across reloads)
    // Check the workspace package, not loadedResources (which gets cleared on reload)
    if (!hasResourceInPackage(resource.key)) {
      addResourceToPackage(resource)
      // Added to package (removed verbose logging)
    }
    
    // Add to app store (for panel rendering) - add each instance
    addResourceToApp(resourceInstance)
    
    if (instanceId !== resource.key) {
      console.log(`📦 Added resource instance to app: ${instanceId} (base: ${resource.key})`)
    } else {
      console.log(`📦 Added resource to app: ${resource.key}`)
    }
    
    return instanceId
  }, [addResourceToPackage, addResourceToApp, hasResourceInPackage, loadedResources])

  /**
   * Get count of how many times a resource is used in panels
   * Counts both the base resource and all instances with #N suffix
   */
  const getResourceUsageCount = useCallback((baseResourceKey: string): number => {
    // Match both base key and instances: "ugnt", "ugnt#2", "ugnt#3"
    const escapedKey = baseResourceKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    const instancePattern = new RegExp(`^${escapedKey}(#\\d+)?$`)
    return Object.keys(loadedResources).filter(id => instancePattern.test(id)).length
  }, [loadedResources])

  return {
    addResource,
    getResourceUsageCount,
  }
}

/**
 * Static version for use outside React components  
 * Only adds to workspace collection, NOT to loadedResources
 * (resources are only added to loadedResources when actually used in panels)
 */
export function addResourceToWorkspace(resource: ResourceInfo) {
  const { addResourceToPackage } = useWorkspaceStore.getState()
  
  // Add to workspace collection (for sidebar) - NOT to loadedResources
  addResourceToPackage(resource)
  
  // Added to collection (removed verbose logging)
}
