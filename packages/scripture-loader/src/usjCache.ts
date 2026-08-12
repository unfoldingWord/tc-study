/**
 * Helpers for USJ SoT cache dual-read / migrate.
 *
 * Primary cache namespace: scripture-usj:{resourceKey}:{book}
 * Payload: UsjScriptureCacheContent (USJ document + AlignmentMap).
 */

import {
  USJProcessor,
  isUsjCacheVersionCompatible,
  type ProcessedScripture,
  type USJProcessResult,
  type UsjScriptureCacheContent,
  type UsjScriptureViewModel,
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
 * Rebuild full USJ process result from cache SoT, or null if version/tools mismatch.
 */
export function usjResultFromCache(
  content: unknown,
  bookId: string,
  usjProcessor: USJProcessor
): USJProcessResult | null {
  if (!isUsjScriptureCacheContent(content)) return null
  if (!isUsjCacheVersionCompatible(content.metadata)) return null
  try {
    return usjProcessor.fromUsjCacheContentFull(content, bookId, content.book || bookId)
  } catch {
    return null
  }
}

/** View model from scripture-usj: cache entry, or null on mismatch. */
export function viewModelFromUsjCache(
  content: unknown,
  bookId: string,
  usjProcessor: USJProcessor
): UsjScriptureViewModel | null {
  return usjResultFromCache(content, bookId, usjProcessor)?.viewModel ?? null
}

/**
 * Adapt a USJ cache entry to ProcessedScripture, or null if version/tools mismatch.
 * Transitional — prefer viewModelFromUsjCache for new consumers.
 */
export function processedFromUsjCache(
  content: unknown,
  bookId: string,
  usjProcessor: USJProcessor
): ProcessedScripture | null {
  return usjResultFromCache(content, bookId, usjProcessor)?.scripture ?? null
}
