import type { DownloadProgress } from '../../hooks/useBackgroundDownload'

/** Failed items on the last progress snapshot (ingredients if tracked, else resources). */
export function downloadFailureCount(progress?: DownloadProgress | null): number {
  if (!progress) return 0
  const useIngredients = progress.totalIngredients !== undefined && progress.totalIngredients > 0
  return useIngredients
    ? (progress.failedIngredients || 0)
    : (progress.failedResources || 0)
}

/**
 * Show the Read chrome download button while work is in-flight or a failure
 * is still on the snapshot. Hide leftover success / idle complete.
 */
export function shouldShowDownloadIndicator(input: {
  isDownloading: boolean
  progress?: DownloadProgress | null
  error?: string | null
  queue?: readonly string[] | null
}): boolean {
  if (input.isDownloading) return true
  if (input.queue && input.queue.length > 0) return true
  if (input.error) return true
  return downloadFailureCount(input.progress) > 0
}
