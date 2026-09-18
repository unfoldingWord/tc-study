/**
 * Cheap "zip extracted / marked complete" probe — one cache get.
 * Used to refuse quote/align admit until UGNT/UHB is on disk.
 *
 * Prefer a stamped ingest receipt when catalog metadata is available so a new
 * Door43 tag is not treated as complete. Without metadata, fall back to the
 * boolean flag so lane-1 quotes are not blocked.
 */

import {
  expectedIngestReleaseStamp,
  ingestSchemaForResourceType,
  isMatchingIngestReceipt,
  type ResourceStampSource,
} from '@bt-synergy/resource-catalog'
import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { CACHE_METADATA_KEYS } from '../../lib/services/ResourceCompletenessChecker'

export function isDownloadCompleteMetadata(entry: unknown): boolean {
  if (!entry || typeof entry !== 'object') return false
  const meta = (entry as { metadata?: Record<string, unknown> }).metadata
  return meta?.[CACHE_METADATA_KEYS.DOWNLOAD_COMPLETE] === true
}

export async function isResourceMarkedComplete(
  cache: { get: (key: string) => Promise<unknown> },
  resourceKey: string,
  catalogMetadata?: ResourceStampSource | null
): Promise<boolean> {
  if (!resourceKey) return false
  try {
    const entry = await cache.get(`resource:${resourceKey}`)
    if (!entry) return false

    if (catalogMetadata) {
      const releaseStamp = expectedIngestReleaseStamp(catalogMetadata)
      const schema = ingestSchemaForResourceType(
        catalogMetadata.type,
        USJ_PROCESSING_VERSION
      )
      if (releaseStamp) {
        return isMatchingIngestReceipt(entry, releaseStamp, schema)
      }
      // nostamp catalog — do not trust a stamped or unstamped flag as current
      return false
    }

    return isDownloadCompleteMetadata(entry)
  } catch {
    return false
  }
}
