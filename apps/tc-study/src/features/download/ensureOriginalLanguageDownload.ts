/**
 * Enqueue UGNT/UHB when TN quote-build needs original-language USFM.
 * Completeness for gateway panes often omits hbo / el-x-koine.
 */

import { backgroundDownloadSession } from './backgroundDownloadSession'

export function shouldEnqueueOriginalLanguageDownload(args: {
  resourceKey: string
  alreadyEnqueuedKey?: string
  completedKeys?: readonly string[]
  queuedKeys?: readonly string[]
  isDownloading?: boolean
}): boolean {
  const key = args.resourceKey
  if (!key) return false
  if (args.alreadyEnqueuedKey === key) return false
  if (args.completedKeys?.includes(key)) return false
  if (args.queuedKeys?.includes(key)) return false
  if (args.isDownloading) return false
  return true
}

/** Start a one-key OL zip when the session is idle. Returns whether start was accepted. */
export function enqueueOriginalLanguageDownload(resourceKey: string): boolean {
  const stats = backgroundDownloadSession.getStats()
  if (
    !shouldEnqueueOriginalLanguageDownload({
      resourceKey,
      completedKeys: stats.completedResourceKeys,
      queuedKeys: stats.queue,
      isDownloading: stats.isDownloading,
    })
  ) {
    return false
  }
  return backgroundDownloadSession.startDownload([resourceKey])
}
