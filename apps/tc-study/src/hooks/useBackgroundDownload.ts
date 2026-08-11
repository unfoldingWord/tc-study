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
import {
  createInitialDownloadProgress,
  shouldAcceptWorkerMessage,
} from '../features/download/backgroundDownloadRun'
import type { DownloadProgress } from '../lib/services/BackgroundDownloadManager'

export type { DownloadProgress }

export interface BackgroundDownloadStats {
  isDownloading: boolean
  progress: DownloadProgress | null
  queue: string[]
  error: string | null
}

export interface UseBackgroundDownloadReturn {
  /** Start downloading specific resources; false if skipped (already downloading / no worker) */
  startDownload: (resourceKeys: string[], totalIngredients?: number) => boolean
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
 * // Monitor progress via stats / isDownloading
 * ```
 */
export function useBackgroundDownload(
  options: UseBackgroundDownloadOptions = {}
): UseBackgroundDownloadReturn {
  const {
    autoStart: _autoStart = false,
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
  /** Avoid stale closure blocking start right after stopDownload (language switch). */
  const isDownloadingRef = useRef(false)
  /**
   * Monotonic run id shared with the worker. Bumped on start/stop/unmount so
   * in-flight progress/complete from a cancelled run cannot re-arm the UI.
   */
  const runIdRef = useRef(0)

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
        const { type, payload, runId } = event.data as {
          type: string
          payload: DownloadProgress | { message?: string; queue?: string[] } | null
          runId?: unknown
        }

        // Drop superseded runs (language-switch stop/start overlap, unmount).
        if (!shouldAcceptWorkerMessage(runIdRef.current, runId)) {
          return
        }

        switch (type) {
          case 'progress':
            // stopDownload clears the ref first; ignore cancel-time notifies
            if (!isDownloadingRef.current) return
            setStats((prev) => ({
              ...prev,
              isDownloading: true,
              progress: payload as DownloadProgress,
              error: null,
            }))
            break

          case 'complete':
            isDownloadingRef.current = false
            setStats((prev) => ({
              ...prev,
              isDownloading: false,
              progress: (payload as DownloadProgress | null) ?? null,
              queue: [],
            }))
            break

          case 'error':
            isDownloadingRef.current = false
            setStats((prev) => ({
              ...prev,
              isDownloading: false,
              error:
                payload && typeof payload === 'object' && 'message' in payload
                  ? String((payload as { message?: string }).message ?? 'Worker error')
                  : 'Worker error',
            }))
            console.error('[BG-DL] 🔌 Hook Worker error:', payload)
            break

          case 'queue-updated':
            setStats((prev) => ({
              ...prev,
              queue:
                payload && typeof payload === 'object' && 'queue' in payload
                  ? ((payload as { queue?: string[] }).queue ?? prev.queue)
                  : prev.queue,
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
        runIdRef.current += 1
        isDownloadingRef.current = false
        setStats((prev) => ({
          ...prev,
          isDownloading: false,
          error: error.message,
        }))
      }

      isInitialized.current = true


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
   * @returns false when skipped (already downloading or worker unavailable)
   */
  const startDownload = useCallback(
    (resourceKeys: string[], totalIngredients?: number): boolean => {
      // ⚠️ Prevent starting new downloads if already downloading
      if (isDownloadingRef.current) {
        return false
      }

      if (!workerRef.current) {
        initializeWorker()
      }

      if (!workerRef.current) {
        console.error('[BG-DL] 🔌 Hook Worker not available')
        return false
      }

      runIdRef.current += 1
      const runId = runIdRef.current
      isDownloadingRef.current = true
      workerRef.current.postMessage({
        type: 'start',
        payload: {
          resourceKeys,
          skipExisting,
          totalIngredients,
          runId,
        },
      })

      setStats({
        isDownloading: true,
        progress: createInitialDownloadProgress(resourceKeys, totalIngredients),
        queue: resourceKeys,
        error: null,
      })
      return true
    },
    [initializeWorker, skipExisting]
  )

  /**
   * Stop all downloads
   */
  const stopDownload = useCallback(() => {
    // Invalidate in-flight progress/complete before the worker replies
    runIdRef.current += 1
    const runId = runIdRef.current
    isDownloadingRef.current = false

    if (workerRef.current) {
      workerRef.current.postMessage({
        type: 'stop',
        payload: { runId },
      })
    }

    setStats({
      isDownloading: false,
      progress: null,
      queue: [],
      error: null,
    })
  }, [])

  /**
   * Initialize worker on mount
   */
  useEffect(() => {
    initializeWorker()

    return () => {
      // Invalidate + clear so StrictMode/HMR terminate cannot leave a stuck 0% UI
      runIdRef.current += 1
      isDownloadingRef.current = false
      setStats({
        isDownloading: false,
        progress: null,
        queue: [],
        error: null,
      })
      if (workerRef.current) {
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
