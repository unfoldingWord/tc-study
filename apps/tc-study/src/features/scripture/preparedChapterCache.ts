/**
 * In-memory LRU over prepared light/full chapter rows, plus a book-scoped
 * light map that can hold every chapter of the open book (Psalms-scale).
 * IndexedDB remains the durable store; these avoid re-awaiting IDB on paint.
 */

import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { readPreparedUnit } from '../prepare/prepareCache'
import type { PrepareCacheAdapter } from '../prepare/prepareRegistry'
import type { PrepareTier } from '../prepare/prepareKeys'
import {
  SCRIPTURE_PREPARE_VERSION,
  type ScriptureFullChapter,
  type ScriptureLightChapter,
} from './scripturePreparer'

export interface PreparedChapterCacheStats {
  hits: number
  misses: number
  fetches: number
}

const MAX_ENTRIES = 48
/** Yield to the event loop every N light IDB reads during book prefetch. */
const PREFETCH_YIELD_EVERY = 8

interface CacheEntry {
  light: ScriptureLightChapter | null
  full: ScriptureFullChapter | null
}

const memory = new Map<string, CacheEntry>()
let stats: PreparedChapterCacheStats = { hits: 0, misses: 0, fetches: 0 }

/** One open book’s light chapters — not subject to the combined LRU cap. */
let bookLightKey: string | null = null
let bookLightMap: Map<number, ScriptureLightChapter> = new Map()

function cacheKey(
  resourceKey: string,
  bookId: string,
  chapter: number
): string {
  return `${resourceKey}|${bookId.toLowerCase()}|${chapter}`
}

function bookKey(resourceKey: string, bookId: string): string {
  return `${resourceKey}|${bookId.toLowerCase()}`
}

function touch(key: string, entry: CacheEntry): void {
  memory.delete(key)
  memory.set(key, entry)
  while (memory.size > MAX_ENTRIES) {
    const oldest = memory.keys().next().value
    if (oldest === undefined) break
    memory.delete(oldest)
  }
}

function ensureBookLightStore(resourceKey: string, bookId: string): Map<number, ScriptureLightChapter> {
  const key = bookKey(resourceKey, bookId)
  if (bookLightKey !== key) {
    bookLightKey = key
    bookLightMap = new Map()
    // Drop LRU rows from other books so peeks cannot resurrect stale light.
    const prefix = `${key}|`
    for (const cacheEntryKey of [...memory.keys()]) {
      if (!cacheEntryKey.startsWith(prefix)) memory.delete(cacheEntryKey)
    }
  }
  return bookLightMap
}

function putBookLight(
  resourceKey: string,
  bookId: string,
  chapter: number,
  light: ScriptureLightChapter | null | undefined
): void {
  if (!light?.blocks?.length) return
  ensureBookLightStore(resourceKey, bookId).set(chapter, light)
}

export function getPreparedChapterCacheStats(): PreparedChapterCacheStats {
  return { ...stats }
}

export function resetPreparedChapterCacheStats(): void {
  stats = { hits: 0, misses: 0, fetches: 0 }
}

export function clearPreparedChapterCache(): void {
  memory.clear()
  bookLightKey = null
  bookLightMap = new Map()
}

/** Test helper: how many light chapters are held for the open book. */
export function getBookLightChapterCount(
  resourceKey?: string,
  bookId?: string
): number {
  if (resourceKey != null && bookId != null) {
    if (bookLightKey !== bookKey(resourceKey, bookId)) return 0
  }
  return bookLightMap.size
}

export function peekPreparedChapter(
  resourceKey: string,
  bookId: string,
  chapter: number
): CacheEntry | null {
  const key = cacheKey(resourceKey, bookId, chapter)
  const entry = memory.get(key)
  const bookLight =
    bookLightKey === bookKey(resourceKey, bookId)
      ? bookLightMap.get(chapter) ?? null
      : null

  if (!entry && !bookLight) {
    stats.misses += 1
    return null
  }

  stats.hits += 1
  const merged: CacheEntry = {
    light: entry?.light ?? bookLight,
    full: entry?.full ?? null,
  }
  if (entry) touch(key, merged)
  else if (merged.light) {
    // Promote book-light hit into the LRU so subsequent peeks stay hot for the window.
    touch(key, merged)
  }
  return merged
}

export function seedPreparedChapter(
  resourceKey: string,
  bookId: string,
  chapter: number,
  patch: Partial<CacheEntry>
): CacheEntry {
  const key = cacheKey(resourceKey, bookId, chapter)
  const prev = memory.get(key) ?? { light: null, full: null }
  const next: CacheEntry = {
    light: patch.light !== undefined ? patch.light : prev.light,
    full: patch.full !== undefined ? patch.full : prev.full,
  }
  if (next.light) putBookLight(resourceKey, bookId, chapter, next.light)
  touch(key, next)
  return next
}

export async function fetchPreparedChapterTiers(
  cache: PrepareCacheAdapter,
  resourceKey: string,
  bookId: string,
  chapter: number,
  tiers: readonly PrepareTier[] = ['light', 'full'] as const
): Promise<CacheEntry> {
  stats.fetches += 1
  const key = cacheKey(resourceKey, bookId, chapter)
  const prev = memory.get(key) ?? { light: null, full: null }
  const bookLight =
    bookLightKey === bookKey(resourceKey, bookId)
      ? bookLightMap.get(chapter) ?? null
      : null
  let light = prev.light ?? bookLight
  let full = prev.full

  for (const tier of tiers) {
    if (tier === 'light' && light) continue
    if (tier === 'full' && full) continue
    const row = await readPreparedUnit(
      cache,
      RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey,
      bookId,
      chapter,
      tier,
      SCRIPTURE_PREPARE_VERSION
    )
    if (tier === 'light') {
      light = (row as ScriptureLightChapter | null) ?? null
    } else {
      full = (row as ScriptureFullChapter | null) ?? null
    }
  }

  const next: CacheEntry = { light, full }
  if (light) putBookLight(resourceKey, bookId, chapter, light)
  touch(key, next)
  return next
}

/**
 * Warm light-only rows for an entire book into the book-scoped map.
 * Yields periodically so large books (Psalms) do not block the main thread.
 */
export async function prefetchPreparedBookLight(
  cache: PrepareCacheAdapter,
  resourceKey: string,
  bookId: string,
  chapters: readonly number[]
): Promise<number> {
  const store = ensureBookLightStore(resourceKey, bookId)
  let loaded = 0
  let sinceYield = 0

  for (const chapter of chapters) {
    if (!Number.isFinite(chapter) || chapter < 1) continue
    if (store.has(chapter)) continue

    stats.fetches += 1
    const row = await readPreparedUnit(
      cache,
      RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey,
      bookId,
      chapter,
      'light',
      SCRIPTURE_PREPARE_VERSION
    )
    const light = (row as ScriptureLightChapter | null) ?? null
    if (light?.blocks?.length) {
      putBookLight(resourceKey, bookId, chapter, light)
      const key = cacheKey(resourceKey, bookId, chapter)
      const prev = memory.get(key) ?? { light: null, full: null }
      touch(key, { light, full: prev.full })
      loaded += 1
    }

    sinceYield += 1
    if (sinceYield >= PREFETCH_YIELD_EVERY) {
      sinceYield = 0
      await Promise.resolve()
    }
  }

  return loaded
}

/** Plain paragraph strings from a light chapter (one string per layout block). */
export function paragraphsFromLightChapter(
  light: ScriptureLightChapter | null | undefined
): string[] {
  if (!light?.blocks?.length) return []
  const out: string[] = []
  for (const block of light.blocks) {
    const parts: string[] = []
    for (const item of block.inline) {
      if (item.kind === 'verse') {
        if (parts.length > 0 && !/\s$/.test(parts[parts.length - 1]!)) parts.push(' ')
        parts.push(`${item.verseNumber} `)
      } else if (item.kind === 'text' || item.kind === 'heading') {
        parts.push(item.text)
      } else if (item.kind === 'note' || item.kind === 'xref') {
        parts.push(item.text)
      }
    }
    const text = parts.join('').trim()
    if (text) out.push(text)
  }
  return out
}
