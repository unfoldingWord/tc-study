/**
 * Catalog Background Download Hook
 * 
 * Reactively checks the catalog for resources and automatically downloads
 * any that are not fully cached. Reacts to catalog state changes.
 * 
 * How it works:
 * 1. Waits for UI to be ready (controlled by 'enabled' prop)
 * 2. Watches catalog for available resources (via catalogTrigger)
 * 3. DETERMINISTIC WAIT: When expectedResources is provided, checks on each change
 *    if ALL expected resources have metadata (no time-based debounce needed!)
 * 4. FALLBACK: If no expectedResources, uses short 1s debounce to wait for stabilization
 * 5. Verifies ALL resources have complete metadata before proceeding
 * 6. Checks each resource for cache completeness
 * 7. Automatically downloads incomplete resources in a SINGLE batch
 * 8. Can be manually triggered via checkNow()
 * 
 * IMPORTANT: Set enabled=false during resource loading to avoid blocking UI rendering!
 * BEST PRACTICE: Pass expectedResources from catalog search for deterministic waiting
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { CatalogManager } from '@bt-synergy/catalog-manager'
import type { ResourceCompletenessChecker } from '../lib/services/ResourceCompletenessChecker'

export interface UseCatalogBackgroundDownloadOptions {
  /** Catalog manager instance */
  catalogManager: CatalogManager
  
  /** Completeness checker instance */
  completenessChecker: ResourceCompletenessChecker
  
  /** Callback to start downloads with total ingredients count */
  onStartDownload: (resourceKeys: string[], totalIngredients: number) => void
  
  /** Trigger for when to check - pass a value that changes when catalog updates */
  catalogTrigger?: any
  
  /**
   * Expected resource keys from catalog search (optional)
   * When provided, the hook will wait until ALL expected resources have metadata
   * before starting downloads. This is more deterministic than time-based debouncing.
   */
  expectedResources?: string[]
  
  /** Enable the check. Typically controlled by UI loading state to avoid blocking rendering. */
  enabled?: boolean
  
  /** Enable debug logging */
  debug?: boolean
}

export interface UseCatalogBackgroundDownloadReturn {
  /** Number of resources being monitored */
  monitoredCount: number
  
  /** Number of resources fully cached */
  cachedCount: number
  
  /** Number of resources pending download */
  pendingCount: number
  
  /** Is currently checking */
  isChecking: boolean
  
  /** Manually trigger a check */
  checkNow: () => Promise<void>
}

export function useCatalogBackgroundDownload(
  options: UseCatalogBackgroundDownloadOptions
): UseCatalogBackgroundDownloadReturn {
  const {
    catalogManager,
    completenessChecker,
    onStartDownload,
    catalogTrigger,
    expectedResources,
    enabled = true,
    debug = false,
  } = options
  
  // Track which resources we've already processed
  const processedResourcesRef = useRef<Set<string>>(new Set())
  
  // Track resources that are currently being downloaded
  const downloadingResourcesRef = useRef<Set<string>>(new Set())
  
  // Unused ref to maintain hook count (React Rules of Hooks requirement)
  useRef(false)
  
  // State
  const [monitoredCount, setMonitoredCount] = useState(0)
  const [cachedCount, setCachedCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [isChecking, setIsChecking] = useState(false)
  
  /**
   * Check catalog for new resources and download if incomplete
   */
  const checkCatalogAndDownload = useCallback(async () => {
    if (!enabled || !catalogManager || !completenessChecker) {
      return
    }
    
    setIsChecking(true)
    
    try {
      // Get all resources currently in catalog
      const allResourceKeys = await catalogManager.getAllResourceKeys()
      
      // ✅ CRITICAL: Verify ALL resources have metadata loaded before proceeding
      // This prevents starting downloads before UGNT/UHB metadata is available
      
      // If expectedResources is provided, ensure ALL expected resources are in catalog and have metadata
      if (expectedResources && expectedResources.length > 0) {
        console.log(`[BG-DL] 🔍 Monitor Checking ${expectedResources.length} expected resources against ${allResourceKeys.length} in catalog`)
        
        const missing = expectedResources.filter(key => !allResourceKeys.includes(key))
        if (missing.length > 0) {
          console.log(`[BG-DL] 🔍 Monitor ⏸️ Waiting for ${missing.length} resources to be added to catalog:`, missing)
          console.log(`[BG-DL] 🔍 Monitor Current catalog keys:`, allResourceKeys)
          setIsChecking(false)
          return
        }
        
        console.log(`[BG-DL] 🔍 Monitor ✅ All resources in catalog, now checking metadata...`)
        
        // Check that all expected resources have metadata
        const missingMetadata: string[] = []
        for (const resourceKey of expectedResources) {
          const metadata = await catalogManager.getResourceMetadata(resourceKey)
          if (!metadata || !metadata.contentMetadata) {
            missingMetadata.push(resourceKey)
          }
        }
        
        if (missingMetadata.length > 0) {
          console.log(`[BG-DL] 🔍 Monitor ⏸️ Waiting for metadata on ${missingMetadata.length} resources:`, missingMetadata)
          setIsChecking(false)
          return
        }
        
        console.log(`[BG-DL] 🔍 Monitor ✅ All ${expectedResources.length} expected resources have metadata!`)
      } else {
        // Fallback: Check all resources in catalog if no expected list provided
        let allMetadataLoaded = true
        for (const resourceKey of allResourceKeys) {
          const metadata = await catalogManager.getResourceMetadata(resourceKey)
          if (!metadata || !metadata.contentMetadata) {
            allMetadataLoaded = false
            if (debug) {
              console.log(`[BG-DL] 🔍 Monitor ⏸️ Waiting for metadata: ${resourceKey}`)
            }
            break
          }
        }
        
        if (!allMetadataLoaded) {
          if (debug) {
            console.log(`[BG-DL] 🔍 Monitor ⏸️ Not all resources have metadata yet, waiting...`)
          }
          setIsChecking(false)
          return
        }
      }
      
      // Find resources we haven't checked yet
      const uncheckedResources = allResourceKeys.filter(
        key => !processedResourcesRef.current.has(key) && !downloadingResourcesRef.current.has(key)
      )
      
      if (debug) {
        console.log(`[BG-DL] 🔍 Monitor ✅ All ${allResourceKeys.length} resources have metadata (${uncheckedResources.length} uncached)`)
      }
      
      if (uncheckedResources.length === 0) {
        setMonitoredCount(allResourceKeys.length)
        setIsChecking(false)
        return
      }
      
      // Check completeness for each unchecked resource AND count total ingredients
      const incompleteResources: string[] = []
      const completeResources: string[] = []
      let totalIngredientsToDownload = 0
      
      for (const resourceKey of uncheckedResources) {
        try {
          const status = await completenessChecker.checkResource(resourceKey)
          
          if (status.isComplete) {
            completeResources.push(resourceKey)
            processedResourcesRef.current.add(resourceKey) // Mark as processed
          } else {
            incompleteResources.push(resourceKey)
            downloadingResourcesRef.current.add(resourceKey) // Mark as downloading
            
            // ✅ Count ingredients for this resource
            const metadata = await catalogManager.getResourceMetadata(resourceKey)
            if (metadata?.contentMetadata?.ingredients) {
              const ingredientsCount = metadata.contentMetadata.ingredients.length
              totalIngredientsToDownload += ingredientsCount
              if (debug) {
                console.log(`[BG-DL] 🔍 Monitor 📊 ${resourceKey}: ${ingredientsCount} ingredients`)
              }
            } else {
              // Default to 1 if no ingredients metadata
              totalIngredientsToDownload += 1
              if (debug) {
                console.log(`[BG-DL] 🔍 Monitor 📊 ${resourceKey}: 1 ingredient (no metadata)`)
              }
            }
          }
        } catch (error) {
          console.error(`[BG-DL] 🔍 Monitor Error checking ${resourceKey}:`, error)
          // Skip this resource, can be checked manually via checkNow()
        }
      }
      
      // Update stats
      setMonitoredCount(allResourceKeys.length)
      setCachedCount(processedResourcesRef.current.size)
      setPendingCount(downloadingResourcesRef.current.size)
      
      // Trigger downloads for incomplete resources with ingredient count
      if (incompleteResources.length > 0) {
        console.log(`[BG-DL] 🔍 Monitor 📥 Starting downloads: ${incompleteResources.length} resources, ${totalIngredientsToDownload} total ingredients`)
        console.log(`[BG-DL] 🔍 Monitor 📋 Resources to download:`, incompleteResources)
        
        // Call the download callback with total ingredients count
        onStartDownload(incompleteResources, totalIngredientsToDownload)
      } else if (debug && allResourceKeys.length > 0) {
        console.log(`[BG-DL] 🔍 Monitor ✅ All ${allResourceKeys.length} resources are cached`)
      }
      
    } catch (error) {
      console.error('[BG-DL] 🔍 Monitor Error checking catalog:', error)
    } finally {
      setIsChecking(false)
    }
  }, [enabled, catalogManager, completenessChecker, onStartDownload, debug])
  
  /**
   * Manually trigger a check
   */
  const checkNow = useCallback(async () => {
    await checkCatalogAndDownload()
  }, [checkCatalogAndDownload])
  
  /**
   * Listen for download completion to update our tracking
   */
  useEffect(() => {
    // When downloads complete, move resources from downloading to processed
    const handleDownloadComplete = (resourceKey: string) => {
      downloadingResourcesRef.current.delete(resourceKey)
      processedResourcesRef.current.add(resourceKey)
      
      // Update stats
      setCachedCount(processedResourcesRef.current.size)
      setPendingCount(downloadingResourcesRef.current.size)
      
      if (debug) {
        console.log(`[BG-DL] 🔍 Monitor ✅ ${resourceKey} download complete, marked as cached`)
      }
    }
    
    // Note: This would ideally listen to an event from the download system
    // For now, we rely on periodic checks to verify completeness
    
    return () => {
      // Cleanup if needed
    }
  }, [debug])
  
  /**
   * React to catalog changes - check whenever catalogTrigger changes
   * The 'enabled' prop should be controlled by UI loading state to avoid blocking rendering
   * 
   * DETERMINISTIC MODE: When expectedResources is provided, we check immediately on each change
   * since we know exactly which resources to wait for.
   * 
   * FALLBACK MODE: When expectedResources is NOT provided, we use a short debounce to wait
   * for the resource list to stabilize.
   */
  useEffect(() => {
    if (!enabled) {
      return
    }
    
    if (debug) {
      const mode = expectedResources && expectedResources.length > 0 ? 'deterministic (with expected resources)' : 'fallback (no expected resources)'
      console.log(`[BG-DL] 🔍 Monitor 📡 Catalog changed (${catalogTrigger} resources), mode: ${mode}`)
    }
    
    // Track cleanup handles
    let idleHandle: number | undefined
    let fallbackTimer: number | undefined
    let debounceTimer: number | undefined
    
    const scheduleCheck = () => {
      // Wait for browser to finish rendering UI before starting heavy background processing
      // Use requestIdleCallback for best performance, fallback to setTimeout
      if (typeof requestIdleCallback !== 'undefined') {
        idleHandle = requestIdleCallback(() => {
          checkCatalogAndDownload()
        }, { timeout: 1000 })
      } else {
        // Fallback for browsers without requestIdleCallback
        fallbackTimer = window.setTimeout(() => {
          checkCatalogAndDownload()
        }, 500)
      }
    }
    
    if (expectedResources && expectedResources.length > 0) {
      // DETERMINISTIC MODE: We have expected resources, check immediately on each change
      if (debug) {
        console.log(`[BG-DL] 🔍 Monitor ✅ Checking if all ${expectedResources.length} expected resources are ready...`)
      }
      scheduleCheck()
    } else {
      // FALLBACK MODE: No expected resources list, use debounce to wait for stabilization
      if (debug) {
        console.log(`[BG-DL] 🔍 Monitor ⏱️ No expected resources list, waiting 1s for catalog to stabilize...`)
      }
      debounceTimer = window.setTimeout(() => {
        scheduleCheck()
      }, 1000) // Short 1-second debounce as fallback
    }
    
    return () => {
      if (debounceTimer !== undefined) {
        clearTimeout(debounceTimer)
      }
      if (idleHandle !== undefined) {
        cancelIdleCallback(idleHandle)
      }
      if (fallbackTimer !== undefined) {
        clearTimeout(fallbackTimer)
      }
    }
  }, [enabled, catalogTrigger, expectedResources, checkCatalogAndDownload, debug])
  
  return {
    monitoredCount,
    cachedCount,
    pendingCount,
    isChecking,
    checkNow,
  }
}
