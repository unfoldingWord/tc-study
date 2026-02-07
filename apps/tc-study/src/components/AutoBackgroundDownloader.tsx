/**
 * AutoBackgroundDownloader
 * 
 * Automatically triggers background downloads when resources are loaded into the catalog.
 * This component should be mounted at the app level to enable automatic background downloading.
 * 
 * Features:
 * - Monitors catalog for new resources
 * - Automatically starts background downloads after a short delay
 * - Respects user preferences (can be disabled via settings)
 * - Provides visual feedback during downloads
 */

import { useEffect, useRef, useState } from 'react'
import { useCatalogManager } from '../contexts'
import { useBackgroundDownload } from '../hooks'

export interface AutoBackgroundDownloaderProps {
  /** Whether to enable automatic downloads (default: true) */
  enabled?: boolean
  /** Delay before starting downloads after resources are added (ms, default: 2000) */
  delayMs?: number
  /** Skip resources that are already cached (default: true) */
  skipExisting?: boolean
  /** Show a toast/notification when downloads start (default: false) */
  showNotification?: boolean
  /** Enable debug logging (default: false) */
  debug?: boolean
}

/**
 * Component that automatically triggers background downloads when resources are loaded
 * 
 * @example
 * ```tsx
 * // In your App.tsx or root component:
 * <AutoBackgroundDownloader 
 *   enabled={true} 
 *   delayMs={2000}
 *   skipExisting={true}
 *   showNotification={true}
 * />
 * ```
 */
export function AutoBackgroundDownloader({
  enabled = true,
  delayMs = 2000,
  skipExisting = true,
  showNotification = false,
  debug = false
}: AutoBackgroundDownloaderProps) {
  const catalogManager = useCatalogManager()
  const { startDownload, isDownloading } = useBackgroundDownload({
    autoStart: false,
    skipExisting,
    debug
  })

  const [lastResourceCount, setLastResourceCount] = useState(0)
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)

  useEffect(() => {
    if (!enabled) {
      if (debug) {
        console.log('[AutoBackgroundDownloader] Disabled')
      }
      return
    }

    // Poll for catalog changes every 5 seconds
    const intervalId = setInterval(async () => {
      try {
        const resourceKeys = await catalogManager.getAllResourceKeys()
        const currentCount = resourceKeys.length

        // If resources were added and we're not already downloading
        if (currentCount > lastResourceCount && !isDownloading) {
          if (debug) {
            console.log('[AutoBackgroundDownloader] New resources detected:', {
              previous: lastResourceCount,
              current: currentCount,
              new: currentCount - lastResourceCount
            })
          }

          // Clear any existing timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current)
          }

          // Schedule download after delay
          timeoutRef.current = setTimeout(() => {
            
            if (debug) {
              console.log('[AutoBackgroundDownloader] Starting background downloads for:', resourceKeys)
            }

            if (showNotification) {
              // You can implement a toast notification here if you have a toast system
              console.log('🔄 Starting background downloads for offline access...')
            }

            startDownload(resourceKeys)
            setLastResourceCount(currentCount)
          }, delayMs)
        } else if (currentCount === lastResourceCount && debug) {
          // No change, skip
        } else if (isDownloading && debug) {
          console.log('[AutoBackgroundDownloader] Downloads already in progress, skipping')
        }

        // Update count if it decreased (resources were removed)
        if (currentCount < lastResourceCount) {
          setLastResourceCount(currentCount)
        }
      } catch (error) {
        console.error('[AutoBackgroundDownloader] Error checking catalog:', error)
      }
    }, 5000) // Check every 5 seconds

    return () => {
      clearInterval(intervalId)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current)
      }
    }
  }, [
    enabled,
    catalogManager,
    startDownload,
    isDownloading,
    lastResourceCount,
    delayMs,
    showNotification,
    debug
  ])

  // This component doesn't render anything
  return null
}
