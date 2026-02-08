/**
 * useBackgroundDownload Hook
 * 
 * Manages background resource downloads using a Web Worker for non-blocking operations.
 * Provides:
 * - Automatic download triggering when resources are loaded
 * - Progress monitoring
 * - Download control (start, stop, resume)
 * - Stats and queue visibility
 */

import { useEffect, useRef, useState, useCallback } from 'react'
import type { DownloadProgress } from '../lib/services/BackgroundDownloadManager'

export type { DownloadProgress }

export interface BackgroundDownloadStats {
  isDownloading: boolean
  progress: DownloadProgress | null
  queue: string[]
  error: string | null
}

export interface UseBackgroundDownloadReturn {
  /** Start downloading specific resources */
  startDownload: (resourceKeys: string[]) => void
  /** Stop all downloads */
  stopDownload: () => void
  /** Current download statistics */
  stats: BackgroundDownloadStats
  /** Whether downloads are currently active */
  isDownloading: boolean
  /** Current queue of resources to download */
  queue: string[]
}

export interface UseBackgroundDownloadOptions {
  /** Auto-start downloads when resources are added to catalog */
  autoStart?: boolean
  /** Skip resources that are already cached */
  skipExisting?: boolean
  /** Enable debug logging */
  debug?: boolean
}

/**
 * Hook for managing background resource downloads
 * 
 * @example
 * ```typescript
 * const { startDownload, stopDownload, stats, isDownloading } = useBackgroundDownload({
 *   autoStart: true,
 *   skipExisting: true
 * })
 * 
 * // Start downloads manually
 * startDownload(['unfoldingWord/en/ult', 'unfoldingWord/en/tw'])
 * 
 * // Monitor progress
 * console.log('Progress:', stats.progress)
 * console.log('Downloading:', isDownloading)
 * ```
 */
export function useBackgroundDownload(
  options: UseBackgroundDownloadOptions = {}
): UseBackgroundDownloadReturn {
  const {
    autoStart = false,
    skipExisting = true,
    debug = false,
  } = options

  // State
  const [stats, setStats] = useState<BackgroundDownloadStats>({
    isDownloading: false,
    progress: null,
    queue: [],
    error: null,
  })

  // Worker reference
  const workerRef = useRef<Worker | null>(null)
  const isInitialized = useRef(false)

  /**
   * Initialize the Web Worker
   */
  const initializeWorker = useCallback(() => {
    if (isInitialized.current) return
    
    try {
      // Create worker
      workerRef.current = new Worker(
        new URL('../workers/backgroundDownload.worker.ts', import.meta.url),
        { type: 'module' }
      )

      // Handle messages from worker
      workerRef.current.onmessage = (event) => {
        const { type, payload } = event.data

        // Only log non-progress messages or significant progress milestones to avoid console spam
        if (debug && type !== 'progress') {
          console.log('[BG-DL] 🔌 Hook Worker message:', type, payload)
        } else if (debug && type === 'progress' && payload.overallProgress % 10 === 0) {
          // Only log progress at 0%, 10%, 20%, ... 100% milestones (overall progress, not per-resource)
          const completed = payload.completedIngredients || 0
          const total = payload.totalIngredients || 0
          console.log(`[BG-DL] 🔌 Hook Progress: ${completed}/${total} ingredients (${payload.overallProgress}%)`)
        }

        switch (type) {
          case 'progress':
            setStats((prev) => ({
              ...prev,
              isDownloading: true,
              progress: payload,
              error: null,
            }))
            break

          case 'complete':
            console.log('[BG-DL] 🔌 Hook ✅ Downloads complete:', {
              completed: payload.completedIngredients,
              total: payload.totalIngredients,
              failed: payload.failedIngredients
            })
            setStats((prev) => ({
              ...prev,
              isDownloading: false,
              progress: payload,
              queue: [],
            }))
            break

          case 'error':
            setStats((prev) => ({
              ...prev,
              isDownloading: false,
              error: payload.message,
            }))
            console.error('[BG-DL] 🔌 Hook Worker error:', payload)
            break

          case 'queue-updated':
            setStats((prev) => ({
              ...prev,
              queue: payload.queue,
            }))
            break

          default:
            if (debug) {
              console.warn('[BG-DL] 🔌 Hook Unknown message type:', type)
            }
        }
      }

      // Handle worker errors
      workerRef.current.onerror = (error) => {
        console.error('[BG-DL] 🔌 Hook Worker error:', error)
        setStats((prev) => ({
          ...prev,
          isDownloading: false,
          error: error.message,
        }))
      }

      isInitialized.current = true
      
      if (debug) {
        console.log('[BG-DL] 🔌 Hook Worker initialized')
      }
    } catch (error) {
      console.error('[BG-DL] 🔌 Hook Failed to initialize worker:', error)
      setStats((prev) => ({
        ...prev,
        error: error instanceof Error ? error.message : String(error),
      }))
    }
  }, [debug])

  /**
   * Start downloading specific resources
   * @param resourceKeys - List of resources to download
   * @param totalIngredients - Pre-calculated total number of ingredients across all resources
   */
  const startDownload = useCallback(
    (resourceKeys: string[], totalIngredients?: number) => {
      // ⚠️ Prevent starting new downloads if already downloading
      if (stats.isDownloading) {
        if (debug) {
          console.log('[BG-DL] 🔌 Hook Skipping download request - already downloading')
        }
        return
      }

      if (!workerRef.current) {
        initializeWorker()
      }

      if (!workerRef.current) {
        console.error('[BG-DL] 🔌 Hook Worker not available')
        return
      }

      if (debug) {
        console.log('[BG-DL] 🔌 Hook Starting downloads:', resourceKeys, totalIngredients ? `(${totalIngredients} total ingredients)` : '')
      }

      workerRef.current.postMessage({
        type: 'start',
        payload: {
          resourceKeys,
          skipExisting,
          totalIngredients, // ✅ Pass pre-calculated total to worker
        },
      })

      setStats((prev) => ({
        ...prev,
        isDownloading: true,
        queue: resourceKeys,
        error: null,
      }))
    },
    [initializeWorker, skipExisting, debug, stats.isDownloading]
  )

  /**
   * Stop all downloads
   */
  const stopDownload = useCallback(() => {
    if (!workerRef.current) return

    if (debug) {
      console.log('[BG-DL] 🔌 Hook Stopping downloads')
    }

    workerRef.current.postMessage({
      type: 'stop',
    })

    setStats((prev) => ({
      ...prev,
      isDownloading: false,
      queue: [],
    }))
  }, [debug])

  /**
   * Initialize worker on mount
   */
  useEffect(() => {
    initializeWorker()

    return () => {
      // Cleanup worker on unmount
      if (workerRef.current) {
        if (debug) {
          console.log('[BG-DL] 🔌 Hook Cleaning up worker')
        }
        workerRef.current.terminate()
        workerRef.current = null
        isInitialized.current = false
      }
    }
  }, [initializeWorker, debug])

  return {
    startDownload,
    stopDownload,
    stats,
    isDownloading: stats.isDownloading,
    queue: stats.queue,
  }
}
