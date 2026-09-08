/**
 * Chapter-scoped persistent cache for helps quote tokens.
 *
 * helps-quote:{helpsKey}@{helpsStamp}:{olKey}@{olStamp}:{book}:{chapter}
 *
 * OL stamp includes USJ_PROCESSING_VERSION so processing bumps invalidate.
 * This stores only the clone-safe quote token subset (helps × OL).
 * Align positions live in helps-align: (helps × OL × target scripture).
 */

import { USJ_PROCESSING_VERSION } from '@bt-synergy/usj-processor'
import { unwrapVersioned, wrapVersioned } from '../cache/versionedEnvelope'
import { resourceContentStamp, type ResourceStampSource } from './resourceContentStamp'

export const HELPS_QUOTE_PREFIX = 'helps-quote:'
/** Bump when QuoteMatcher / buildQuoteTokens output shape changes. */
export const HELPS_QUOTE_VERSION = 1
/** Bound growth for abandoned book/chapter combos; stamps handle correctness. */
export const HELPS_QUOTE_TTL_MS = 30 * 24 * 60 * 60 * 1000

export type CachedQuoteToken = {
  id: number
  text: string
  type: string
  occurrence: number
  content: string
}

/** linkId → clone-safe quote tokens (empty array = settled miss). */
export type CachedQuoteTokens = Record<string, CachedQuoteToken[]>

export type HelpsQuoteCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  delete?(key: string): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
}

export function olContentStamp(
  metadata: ResourceStampSource | null | undefined,
  usjProcessingVersion: string = USJ_PROCESSING_VERSION
): string {
  const base = resourceContentStamp(metadata)
  const usj = usjProcessingVersion.replace(/[:|@]/g, '_')
  return `${base}+${usj}`
}

export function helpsQuoteKey(args: {
  helpsKey: string
  helpsStamp: string
  olKey: string
  olStamp: string
  book: string
  chapter: number
}): string {
  return [
    HELPS_QUOTE_PREFIX + args.helpsKey,
    `@${args.helpsStamp}`,
    `:${args.olKey}`,
    `@${args.olStamp}`,
    `:${args.book.toLowerCase()}`,
    `:${args.chapter}`,
  ].join('')
}

export function toCachedQuoteTokens(
  tokens: ReadonlyArray<{
    id?: number
    text?: string
    type?: string
    occurrence?: number
    content?: string
  }> | null | undefined
): CachedQuoteToken[] {
  if (!tokens?.length) return []
  return tokens.map((t) => ({
    id: t.id ?? 0,
    text: t.text ?? '',
    type: t.type ?? 'word',
    occurrence: t.occurrence ?? 1,
    content: t.content ?? t.text ?? '',
  }))
}

export async function readCachedQuoteTokens(
  cache: HelpsQuoteCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    book: string
    chapter: number
  }
): Promise<CachedQuoteTokens | null> {
  const entry = await cache.get(helpsQuoteKey(args))
  // Support CacheEntry wrappers: prefer .content when present without version at top.
  const payload =
    entry &&
    typeof entry === 'object' &&
    'content' in entry &&
    typeof (entry as { version?: number }).version !== 'number'
      ? (entry as { content: unknown }).content
      : entry
  return unwrapVersioned<CachedQuoteTokens>(payload ?? entry, HELPS_QUOTE_VERSION)
}

export async function writeCachedQuoteTokens(
  cache: HelpsQuoteCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    book: string
    chapter: number
  },
  tokensByLinkId: CachedQuoteTokens
): Promise<void> {
  const envelope = wrapVersioned(tokensByLinkId, HELPS_QUOTE_VERSION)
  await cache.set(helpsQuoteKey(args), {
    ...envelope,
    expiresAt: new Date(Date.now() + HELPS_QUOTE_TTL_MS).toISOString(),
  })
}

/**
 * Merge chapter rows for a passage span. Missing chapters contribute nothing
 * (caller treats absent ids as misses).
 */
export async function readCachedQuoteTokensForSpan(
  cache: HelpsQuoteCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    book: string
    startChapter: number
    endChapter: number
  }
): Promise<CachedQuoteTokens> {
  const chapters: number[] = []
  for (let chapter = args.startChapter; chapter <= args.endChapter; chapter++) {
    chapters.push(chapter)
  }
  return readCachedQuoteTokensForChapters(cache, { ...args, chapters })
}

/** Merge quote-token rows for an arbitrary (sparse) chapter set. */
export async function readCachedQuoteTokensForChapters(
  cache: HelpsQuoteCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    book: string
    chapters: readonly number[]
  }
): Promise<CachedQuoteTokens> {
  const merged: CachedQuoteTokens = {}
  const seen = new Set<number>()
  for (const chapter of args.chapters) {
    if (!Number.isFinite(chapter) || chapter < 1 || seen.has(chapter)) continue
    seen.add(chapter)
    const row = await readCachedQuoteTokens(cache, { ...args, chapter })
    if (!row) continue
    Object.assign(merged, row)
  }
  return merged
}

/**
 * Merge built tokens into existing chapter rows and write each chapter touched.
 * Links are grouped by chapter from `chapterOfLinkId`.
 */
export async function mergeAndWriteCachedQuoteTokens(
  cache: HelpsQuoteCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    book: string
  },
  built: CachedQuoteTokens,
  chapterOfLinkId: (linkId: string) => number
): Promise<void> {
  const byChapter = new Map<number, CachedQuoteTokens>()
  for (const [linkId, tokens] of Object.entries(built)) {
    const chapter = chapterOfLinkId(linkId)
    if (!Number.isFinite(chapter) || chapter < 1) continue
    const row = byChapter.get(chapter) ?? {}
    row[linkId] = tokens
    byChapter.set(chapter, row)
  }

  for (const [chapter, partial] of byChapter) {
    const existing =
      (await readCachedQuoteTokens(cache, { ...args, chapter })) ?? {}
    await writeCachedQuoteTokens(cache, { ...args, chapter }, { ...existing, ...partial })
  }
}

/** Subtract cache hits from a needs-build list. */
export function subtractCachedQuoteHits<T extends { id: string }>(
  needsBuild: readonly T[],
  cached: CachedQuoteTokens
): { hits: Map<string, CachedQuoteToken[]>; misses: T[] } {
  const hits = new Map<string, CachedQuoteToken[]>()
  const misses: T[] = []
  for (const link of needsBuild) {
    if (Object.prototype.hasOwnProperty.call(cached, link.id)) {
      hits.set(link.id, cached[link.id]!)
    } else {
      misses.push(link)
    }
  }
  return { hits, misses }
}
