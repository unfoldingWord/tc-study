/**
 * Helpers for P2 USJ SoT cache dual-read / migrate.
 */

import type { ProcessedScripture } from '@bt-synergy/usfm-processor'
import {
  USJProcessor,
  isUsjCacheVersionCompatible,
  type UsjScriptureCacheContent,
} from '@bt-synergy/usj-processor'

export function isUsjScriptureCacheContent(content: unknown): content is UsjScriptureCacheContent {
  if (!content || typeof content !== 'object') return false
  const c = content as UsjScriptureCacheContent
  return Boolean(c.metadata?.version && (c.usj || c.chapters?.length))
}

export function isProcessedScriptureContent(content: unknown): content is ProcessedScripture {
  if (!content || typeof content !== 'object') return false
  const c = content as ProcessedScripture
  return Boolean(c.metadata && Array.isArray(c.chapters))
}

/**
 * Adapt a USJ cache entry to ProcessedScripture, or null if version/tools mismatch.
 */
export function processedFromUsjCache(
  content: unknown,
  bookId: string,
  usjProcessor: USJProcessor
): ProcessedScripture | null {
  if (!isUsjScriptureCacheContent(content)) return null
  if (!isUsjCacheVersionCompatible(content.metadata)) return null
  try {
    return usjProcessor.fromUsjCacheContent(content, bookId, content.book || bookId)
  } catch {
    return null
  }
}
