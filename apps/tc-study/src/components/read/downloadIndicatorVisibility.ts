import type { DownloadProgress } from '../../hooks/useBackgroundDownload'

/** Language + resource from `owner/languageCode/resourceId`. Null if the key is not that shape. */
export function downloadItemFromResourceKey(
  resourceKey: string | null | undefined
): { owner: string; languageCode: string; resourceId: string } | null {
  if (!resourceKey) return null
  const parts = resourceKey.split('/')
  if (parts.length !== 3) return null
  const [owner, languageCode, resourceId] = parts
  if (!owner || !languageCode || !resourceId) return null
  return { owner, languageCode, resourceId }
}

/**
 * Compact current-item label: language code + resource id from the queue key.
 * Does not invent a language from a bare resource id (e.g. `ult`).
 */
export function formatDownloadCurrentItemLabel(
  currentResource: string | null | undefined
): string {
  const item = downloadItemFromResourceKey(currentResource)
  if (item) return `${item.languageCode} ${item.resourceId}`
  if (!currentResource) return ''
  return currentResource.split('/').pop() || currentResource
}

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
