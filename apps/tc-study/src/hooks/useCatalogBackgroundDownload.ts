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
import { totalIngredientsForResourceKeys } from '../features/download/backgroundDownloadRun'
import {
  filterUncheckedResourceKeys,
  keysToEnqueueForDownload,
  shouldResetDownloadTracking,
  shouldWalkUiIdbDuringExtract,
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
  const scheduleRef = useRef<number | null>(null)

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
    if (typeof window !== 'undefined') {
      ;(window as unknown as { __bgdlLast?: unknown }).__bgdlLast = {
        phase: !enabled ? 'disabled' : !catalogManager || !completenessChecker ? 'no-services' : 'start',
        enabled,
      }
    }
    if (!enabled || !catalogManager || !completenessChecker) {
      return
    }
    if (!shouldWalkUiIdbDuringExtract(isDownloading)) {
      return
    }

    setIsChecking(true)

    try {
      // Persistent catalog may still hold leftover languages. Queue only the
      // resources for languages currently on the two Read panels.
      // IDB getAll can hang while catalog writes hold the store — don't
      // block enqueue forever; fall back to expected keys.
      let allResourceKeys: string[] = []
      try {
        allResourceKeys = await Promise.race([
          catalogManager.getAllResourceKeys(),
          new Promise<string[]>((_, reject) => {
            window.setTimeout(() => reject(new Error('catalog-keys-timeout')), 2500)
          }),
        ])
      } catch {
        allResourceKeys = []
      }
      // Queue cataloged expected keys + OL extras. Do not wait for every
      // expected key to land — one hung TA/UGNT entry used to block UHB.
      const candidateKeys =
        allResourceKeys.length > 0
          ? keysToEnqueueForDownload(allResourceKeys, expectedResources)
          : [...(expectedResources ?? [])]

      if (typeof window !== 'undefined') {
        ;(window as unknown as { __bgdlLast?: unknown }).__bgdlLast = {
          phase: 'keys',
          enabled: true,
          catalog: allResourceKeys.length,
          candidate: candidateKeys.length,
          expected: expectedResources?.length ?? 0,
        }
      }

      // Find resources we haven't checked yet
      const uncheckedResources = filterUncheckedResourceKeys(
        candidateKeys,
        processedResourcesRef.current,
        downloadingResourcesRef.current
      )

      if (uncheckedResources.length === 0) {
        if (typeof window !== 'undefined') {
          ;(window as unknown as { __bgdlLast?: unknown }).__bgdlLast = {
            candidate: candidateKeys.length,
            unchecked: 0,
            expected: expectedResources?.length ?? 0,
            incomplete: 0,
            started: false,
          }
        }
        setMonitoredCount(candidateKeys.length)
        setIsChecking(false)
        return
      }

      // Check completeness for each unchecked resource AND count total ingredients
      const incompleteResources: string[] = []
      const completeResources: string[] = []
      const listedCountByKey: Record<string, number> = {}

      const rememberListedCount = async (resourceKey: string) => {
        try {
          const metadata = await catalogManager.getResourceMetadata(resourceKey)
          const n = metadata?.contentMetadata?.ingredients?.length
          if (typeof n === 'number' && n > 0) listedCountByKey[resourceKey] = n
        } catch {
          /* totalIngredientsForResourceKeys still covers UHB/UGNT */
        }
      }

      // Catalog IDB timed out — don't probe each key (same lock). Queue them.
      if (allResourceKeys.length === 0 && uncheckedResources.length > 0) {
        for (const resourceKey of uncheckedResources) {
          incompleteResources.push(resourceKey)
        }
      } else {
      for (const resourceKey of uncheckedResources) {
        try {
          const status = await Promise.race([
            completenessChecker.checkResource(resourceKey, { failFast: true }),
            new Promise<never>((_, reject) => {
              window.setTimeout(() => reject(new Error('complete-check-timeout')), 1500)
            }),
          ])

          if (status.isComplete) {
            completeResources.push(resourceKey)
            processedResourcesRef.current.add(resourceKey) // Mark as processed
          } else {
            incompleteResources.push(resourceKey)
            await rememberListedCount(resourceKey)
          }
        } catch (error) {
          console.error(`[BG-DL] 🔍 Monitor Error checking ${resourceKey}:`, error)
          incompleteResources.push(resourceKey)
        }
      }
      }

      const totalIngredientsToDownload = totalIngredientsForResourceKeys(
        incompleteResources,
        listedCountByKey
      )

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
        if (typeof window !== 'undefined') {
          ;(window as unknown as { __bgdlLast?: unknown }).__bgdlLast = {
            candidate: candidateKeys.length,
            unchecked: uncheckedResources.length,
            expected: expectedResources?.length ?? 0,
            incomplete: incompleteResources.length,
            started: started !== false,
            keys: incompleteResources.slice(0, 12),
          }
        }
        if (started === false) {
          for (const key of incompleteResources) {
            downloadingResourcesRef.current.delete(key)
          }
          setPendingCount(downloadingResourcesRef.current.size)
        }
      }
    } catch (error) {
      console.error('[BG-DL] 🔍 Monitor Error checking catalog:', error)
      if (typeof window !== 'undefined') {
        ;(window as unknown as { __bgdlLast?: unknown }).__bgdlLast = {
          phase: 'error',
          error: error instanceof Error ? error.message : String(error),
        }
      }
    } finally {
      setIsChecking(false)
    }
  }, [enabled, catalogManager, completenessChecker, onStartDownload, expectedResources, isDownloading])

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
   * Catalog trigger / expected-key drips must not reset the timer — that
   * cancelled every requestIdleCallback and the download never enqueued.
   * One scheduled check survives metadata bursts; a new one is armed after it fires.
   */
  useEffect(() => {
    if (!enabled) return
    if (scheduleRef.current != null) return
    scheduleRef.current = window.setTimeout(() => {
      scheduleRef.current = null
      void checkCatalogAndDownload()
    }, 500)
  }, [enabled, catalogTrigger, expectedResources, checkCatalogAndDownload])

  useEffect(() => {
    return () => {
      if (scheduleRef.current != null) {
        window.clearTimeout(scheduleRef.current)
        scheduleRef.current = null
      }
    }
  }, [])

  return {
    monitoredCount,
    cachedCount,
    pendingCount,
    isChecking,
    checkNow,
  }
}
