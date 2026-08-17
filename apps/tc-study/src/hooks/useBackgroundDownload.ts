/**
 * useBackgroundDownload Hook
 *
 * Thin React adapter over the module-level download session. Remounts
 * (Read route / mode-toggle trees) subscribe to the same worker.
 */

import { useEffect, useState } from 'react'
import {
  backgroundDownloadSession,
  type BackgroundDownloadStats,
} from '../features/download/backgroundDownloadSession'
import type { DownloadProgress } from '../lib/services/BackgroundDownloadManager'

export type { DownloadProgress, BackgroundDownloadStats }

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
 * startDownload(['unfoldingWord/en/ult', 'unfoldingWord/en/tw'])
 * ```
 */
export function useBackgroundDownload(
  options: UseBackgroundDownloadOptions = {}
): UseBackgroundDownloadReturn {
  const { autoStart: _autoStart = false, skipExisting = true, debug = false } = options

  backgroundDownloadSession.configure({ skipExisting, debug })

  const [stats, setStats] = useState<BackgroundDownloadStats>(() =>
    backgroundDownloadSession.getStats()
  )

  useEffect(() => {
    backgroundDownloadSession.configure({ skipExisting, debug })
    return backgroundDownloadSession.subscribe(setStats)
  }, [skipExisting, debug])

  return {
    startDownload: backgroundDownloadSession.startDownload,
    stopDownload: backgroundDownloadSession.stopDownload,
    stats,
    isDownloading: stats.isDownloading,
    queue: stats.queue,
  }
}
