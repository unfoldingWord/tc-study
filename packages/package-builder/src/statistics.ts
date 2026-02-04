/**
 * Package statistics calculation
 */

import type { ResourceManifestEntry, PackageStats } from './types'

/**
 * Calculate package statistics
 * Only includes essential stats needed for UI (e.g., progress bars)
 * All other stats can be derived from the resources array by the consuming app
 */
export function calculatePackageStats(
  resources: ResourceManifestEntry[]
): PackageStats {
  // Estimate total download size
  // Use actual sizes if available, otherwise estimate 2MB per resource
  const estimatedSize = resources.reduce((total, resource) => {
    return total + (resource.download.size || 2 * 1024 * 1024)
  }, 0)
  
  return {
    estimatedSize,
  }
}

/**
 * Get the most common item from an array
 */
export function getMostCommon<T>(items: T[]): T | undefined {
  if (items.length === 0) return undefined
  
  const counts = new Map<T, number>()
  for (const item of items) {
    counts.set(item, (counts.get(item) || 0) + 1)
  }
  
  let maxCount = 0
  let mostCommon = items[0]
  for (const [item, count] of counts) {
    if (count > maxCount) {
      maxCount = count
      mostCommon = item
    }
  }
  
  return mostCommon
}
