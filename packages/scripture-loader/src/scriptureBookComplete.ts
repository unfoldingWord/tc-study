/**
 * Shared “is this scripture book fully cached?” rule.
 *
 * Used by ScriptureLoader skip/fill and ResourceCompletenessChecker so a
 * thin `{ chapterNumbers }` stub or chapter-1-only warm cannot credit a book.
 */

import { isUsjCacheVersionCompatible } from '@bt-synergy/usj-processor'

import {
  usjScriptureChapterKey,
  usjScriptureKey,
} from './scriptureCacheKeys'
import { unwrapUsjEntry } from './usjChapterStore'

export type ScriptureBookCache = {
  get(key: string): Promise<unknown>
  getMany?(keys: string[]): Promise<Map<string, unknown>>
}

function unwrapCachePayload(entry: unknown): Record<string, unknown> | null {
  const inner = unwrapUsjEntry(entry)
  if (!inner || typeof inner !== 'object') return null
  return inner as Record<string, unknown>
}

/** Thin book index written next to chapter keys — not a downloaded book blob. */
export function scriptureChapterNumbers(entry: unknown): number[] {
  const payload = unwrapCachePayload(entry)
  if (!payload || !Array.isArray(payload.chapterNumbers)) return []
  return payload.chapterNumbers.filter((n): n is number => typeof n === 'number')
}

/**
 * True when a cached scripture entry has usable USJ/chapters payload.
 * Thin `{ chapterNumbers }` indexes are not payload.
 */
export function hasScripturePayload(entry: unknown): boolean {
  const payload = unwrapCachePayload(entry)
  if (!payload) return false
  const chapters = payload.chapters
  const hasChapters = Array.isArray(chapters) && chapters.length > 0
  const hasUsj =
    payload.usj != null &&
    typeof payload.usj === 'object' &&
    Array.isArray((payload.usj as { content?: unknown }).content)
  return hasUsj || hasChapters
}

/** Usable payload whose processing version/tools still match (if stamped). */
export function hasUsableScriptureChapter(entry: unknown): boolean {
  if (!hasScripturePayload(entry)) return false
  const payload = unwrapCachePayload(entry)
  const metadata = payload?.metadata as
    | { version?: string; toolVersions?: { parser?: string; usjCore?: string } }
    | undefined
  if (!metadata?.version) return true
  return isUsjCacheVersionCompatible(metadata)
}

/** Canon books that are one chapter — a `[1]` index can be complete for these. */
const SINGLE_CHAPTER_BOOKS = new Set(['oba', 'phm', '2jn', '3jn', 'jud'])

function isSingleChapterBook(bookId?: string): boolean {
  if (!bookId) return false
  return SINGLE_CHAPTER_BOOKS.has(bookId.toLowerCase())
}

/**
 * True when a book is fully cached: USJ/chapters blob, or a thin index whose
 * first and last chapter keys have real payloads. A `{ chapterNumbers }` stub
 * or chapter-1 alone is not enough (warm PSA 1 must not credit all of ULT).
 * A one-number index (only psa:119 or only ch1) is incomplete unless the book
 * is a known single-chapter book (Obadiah, Philemon, 2–3 John, Jude).
 */
export function isScriptureBookComplete(input: {
  bookEntry: unknown
  firstChapter: unknown
  lastChapter: unknown
  bookId?: string
}): boolean {
  if (hasUsableScriptureChapter(input.bookEntry)) return true
  const nums = scriptureChapterNumbers(input.bookEntry)
  if (nums.length === 0) return false
  if (!hasUsableScriptureChapter(input.firstChapter)) return false
  const first = nums[0]
  const last = nums[nums.length - 1]
  if (first === last) {
    return isSingleChapterBook(input.bookId)
  }
  return hasUsableScriptureChapter(input.lastChapter)
}

async function readCacheKeys(
  cache: ScriptureBookCache,
  keys: string[]
): Promise<Map<string, unknown>> {
  if (keys.length === 0) return new Map()
  if (cache.getMany) return cache.getMany(keys)
  const out = new Map<string, unknown>()
  for (const key of keys) {
    out.set(key, await cache.get(key))
  }
  return out
}

/** Load book index + first/last chapter rows used by {@link isScriptureBookComplete}. */
export async function readScriptureBookCompleteInputs(
  cache: ScriptureBookCache,
  resourceKey: string,
  bookId: string
): Promise<{ bookEntry: unknown; firstChapter: unknown; lastChapter: unknown }> {
  const bookCode = bookId.toLowerCase()
  const bookEntry = await cache.get(usjScriptureKey(resourceKey, bookCode))
  if (hasScripturePayload(bookEntry)) {
    return { bookEntry, firstChapter: null, lastChapter: null }
  }
  const nums = scriptureChapterNumbers(bookEntry)
  if (nums.length === 0) {
    return { bookEntry, firstChapter: null, lastChapter: null }
  }
  const first = nums[0]!
  const last = nums[nums.length - 1]!
  const chapterKeys = [usjScriptureChapterKey(resourceKey, bookCode, first)]
  if (last !== first) {
    chapterKeys.push(usjScriptureChapterKey(resourceKey, bookCode, last))
  }
  const rows = await readCacheKeys(cache, chapterKeys)
  return {
    bookEntry,
    firstChapter: rows.get(chapterKeys[0]!),
    lastChapter: rows.get(chapterKeys[chapterKeys.length - 1]!),
  }
}

/** Cache-backed skip predicate — same rule as ResourceCompletenessChecker. */
export async function isCachedScriptureBookComplete(
  cache: ScriptureBookCache,
  resourceKey: string,
  bookId: string
): Promise<boolean> {
  try {
    return isScriptureBookComplete({
      ...(await readScriptureBookCompleteInputs(cache, resourceKey, bookId)),
      bookId,
    })
  } catch {
    return false
  }
}
