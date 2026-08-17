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
import {
  filterUncheckedResourceKeys,
  findMissingExpectedResources,
  keysToEnqueueForDownload,
  shouldResetDownloadTracking,
} from '../features/read/catalogBackgroundDownloadPolicy'

export interface UseCatalogBackgroundDownloadOptions {
  /** Catalog manager instance */
  catalogManager: CatalogManager

  /** Completeness checker instance */
  completenessChecker: ResourceCompletenessChecker

  /** Callback to start downloads with total ingredients count; return false if start was skipped */
  onStartDownload: (resourceKeys: string[], totalIngredients: number) => boolean | void

  /** Trigger for when to check - pass a value that changes when catalog updates */
  catalogTrigger?: unknown

  /**
   * Expected resource keys from catalog search (optional)
   * When provided, the hook will wait until ALL expected resources have metadata
   * before starting downloads. This is more deterministic than time-based debouncing.
   */
  expectedResources?: string[]

  /**
   * Gateway language (or other scope id). When this changes, processed/downloading
   * tracking resets so language switch / deep-link loads can enqueue again.
   */
  resetToken?: string | null

  /**
   * Mirror of the download worker busy flag. When it falls false, release sticky
   * `downloading` marks so a later check can re-queue incomplete work.
   */
  isDownloading?: boolean

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
    resetToken = null,
    isDownloading = false,
    enabled = true,
    debug: _debug = false,
  } = options

  // Track which resources we've already processed
  const processedResourcesRef = useRef<Set<string>>(new Set())

  // Track resources that are currently being downloaded
  const downloadingResourcesRef = useRef<Set<string>>(new Set())

  const resetTokenRef = useRef('')
  const wasDownloadingRef = useRef(false)

  // Unused ref to maintain hook count (React Rules of Hooks requirement)
  useRef(false)

  // State
  const [monitoredCount, setMonitoredCount] = useState(0)
  const [cachedCount, setCachedCount] = useState(0)
  const [pendingCount, setPendingCount] = useState(0)
  const [isChecking, setIsChecking] = useState(false)

  // Language switch / deep-link: clear sticky downloading/processed keys for the new scope
  useEffect(() => {
    const next = resetToken ?? ''
    if (shouldResetDownloadTracking(resetTokenRef.current, next)) {
      processedResourcesRef.current.clear()
      downloadingResourcesRef.current.clear()
      setCachedCount(0)
      setPendingCount(0)
    }
    resetTokenRef.current = next
  }, [resetToken])

  /**
   * Check catalog for new resources and download if incomplete
   */
  const checkCatalogAndDownload = useCallback(async () => {
    if (!enabled || !catalogManager || !completenessChecker) {
      return
    }

    setIsChecking(true)

    try {
      // Persistent catalog may still hold leftover languages. Queue only the
      // resources for languages currently on the two Read panels.
      const allResourceKeys = await catalogManager.getAllResourceKeys()
      const candidateKeys = keysToEnqueueForDownload(allResourceKeys, expectedResources)

      // If expectedResources is provided, wait until those keys are in catalog
      // (Phase 2 narrows keys that never arrive). Do not wait forever for
      // contentMetadata on one hung OL/TA entry — completeness check skips those.
      if (expectedResources && expectedResources.length > 0) {
        const missing = findMissingExpectedResources(expectedResources, allResourceKeys)
        if (missing.length > 0) {
          setIsChecking(false)
          return
        }
      }

      // Find resources we haven't checked yet
      const uncheckedResources = filterUncheckedResourceKeys(
        candidateKeys,
        processedResourcesRef.current,
        downloadingResourcesRef.current
      )

      if (uncheckedResources.length === 0) {
        setMonitoredCount(candidateKeys.length)
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

            // ✅ Count ingredients for this resource
            const metadata = await catalogManager.getResourceMetadata(resourceKey)
            if (metadata?.contentMetadata?.ingredients) {
              const ingredientsCount = metadata.contentMetadata.ingredients.length
              totalIngredientsToDownload += ingredientsCount
            } else {
              // Default to 1 if no ingredients metadata
              totalIngredientsToDownload += 1
            }
          }
        } catch (error) {
          console.error(`[BG-DL] 🔍 Monitor Error checking ${resourceKey}:`, error)
          // Skip this resource, can be checked manually via checkNow()
        }
      }

      // Update stats
      setMonitoredCount(candidateKeys.length)
      setCachedCount(processedResourcesRef.current.size)
      setPendingCount(downloadingResourcesRef.current.size)

      // Trigger downloads for incomplete resources with ingredient count
      if (incompleteResources.length > 0) {
        // Mark downloading only when start is accepted — avoids sticky keys if start no-ops
        for (const key of incompleteResources) {
          downloadingResourcesRef.current.add(key)
        }
        setPendingCount(downloadingResourcesRef.current.size)

        const started = onStartDownload(incompleteResources, totalIngredientsToDownload)
        if (started === false) {
          for (const key of incompleteResources) {
            downloadingResourcesRef.current.delete(key)
          }
          setPendingCount(downloadingResourcesRef.current.size)
        }
      }
    } catch (error) {
      console.error('[BG-DL] 🔍 Monitor Error checking catalog:', error)
    } finally {
      setIsChecking(false)
    }
  }, [enabled, catalogManager, completenessChecker, onStartDownload, expectedResources])

  // Worker finished or was cancelled — free sticky downloading marks for re-check
  useEffect(() => {
    if (isDownloading) {
      wasDownloadingRef.current = true
      return
    }
    if (!wasDownloadingRef.current) return
    wasDownloadingRef.current = false
    if (downloadingResourcesRef.current.size === 0) return
    downloadingResourcesRef.current.clear()
    setPendingCount(0)
    // Re-run completeness so finished keys become `processed` (or incomplete retry)
    if (enabled) {
      void checkCatalogAndDownload()
    }
  }, [isDownloading, enabled, checkCatalogAndDownload])

  /**
   * Manually trigger a check
   */
  const checkNow = useCallback(async () => {
    await checkCatalogAndDownload()
  }, [checkCatalogAndDownload])

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
      scheduleCheck()
    } else {
      // FALLBACK MODE: No expected resources list, use debounce to wait for stabilization
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
  }, [enabled, catalogTrigger, expectedResources, checkCatalogAndDownload])

  return {
    monitoredCount,
    cachedCount,
    pendingCount,
    isChecking,
    checkNow,
  }
}
