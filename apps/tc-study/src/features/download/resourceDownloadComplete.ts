/**
 * Cheap "zip extracted / marked complete" probe — one cache get.
 * Used to refuse quote/align admit until UGNT/UHB is on disk.
 */

import { CACHE_METADATA_KEYS } from '../../lib/services/ResourceCompletenessChecker'

export function isDownloadCompleteMetadata(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const meta = (entry as { metadata?: Record<string, unknown> }).metadata
  return meta?.[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE] === true
}

export async function isResourceMarkedComplete(
  cache: { get: (key: string) => Promise<unknown> },
  resourceKey: string
): Promise<boolean> {
  if (!resourceKey) return false
  try {
    const entry = await cache.get(`resource:${resourceKey}`)
    return isDownloadCompleteMetadata(entry)
  } catch {
    return false
  }
}
