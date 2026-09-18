/**
 * Chapter-scoped persistent cache for helps → scripture alignment positions.
 *
 * helps-align:{helpsKey}@{helpsStamp}:{olKey}@{olStamp}:{targetKey}@{targetStamp}:{book}:{chapter}
 *
 * Quotes stay in helps-quote (helps × OL only). Align is the 3-way relation
 * (helps × OL × target scripture). Rows store compact word positions; reconstruct
 * against prepared:scripture full tokens only.
 */

import { unwrapVersioned, wrapVersioned } from '../cache/versionedEnvelope'
import { SCRIPTURE_PREPARE_VERSION } from '../scripture/scripturePreparer'
import { resourceContentStamp, type ResourceStampSource } from './resourceContentStamp'

export const HELPS_ALIGN_PREFIX = 'helps-align:'
/** Bump when compact row shape, reconstruct rules, or align match-key fold change.
 *  6: live/warm align keeps quote-token verse stamps (sbh4 four-hit chips). */
export const HELPS_ALIGN_VERSION = 6
/** Bound growth for abandoned book/chapter combos; stamps handle correctness. */
export const HELPS_ALIGN_TTL_MS = 30 * 24 * 60 * 60 * 1000

/** 0 = settled miss, 1 = semantic-id / zaln, 2 = quote-text fallback */
export type AlignMatchMethod = 0 | 1 | 2
/**
 * Compact align row. `p` = word positions in prepared full chapter.
 * Optional `t` = word display texts so chips can paint on refresh before
 * prepared:scripture / SCRIPTURE_TOKENS are ready (reconstruct still preferred).
 */
export type CachedAlignRow = { p: number[]; m: AlignMatchMethod; t?: string[] }
/** linkId → compact align row (p:[] + m:0 = settled miss). */
export type CachedAlignments = Record<string, CachedAlignRow>

/** True when a hit row can paint a ULT chip without target tokens. */
export function alignRowHasDisplayText(row: CachedAlignRow | null | undefined): boolean {
  return Boolean(row && row.m !== 0 && row.t && row.t.length > 0)
}

export type HelpsAlignCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  delete?(key: string): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
}

export function targetContentStamp(
  metadata: ResourceStampSource | null | undefined,
  prepareVersion: number = SCRIPTURE_PREPARE_VERSION
): string {
  const base = resourceContentStamp(metadata)
  return `${base}+${prepareVersion}`
}

export function helpsAlignKey(args: {
  helpsKey: string
  helpsStamp: string
  olKey: string
  olStamp: string
  targetKey: string
  targetStamp: string
  book: string
  chapter: number
}): string {
  return [
    HELPS_ALIGN_PREFIX + args.helpsKey,
    `@${args.helpsStamp}`,
    `:${args.olKey}`,
    `@${args.olStamp}`,
    `:${args.targetKey}`,
    `@${args.targetStamp}`,
    `:${args.book.toLowerCase()}`,
    `:${args.chapter}`,
  ].join('')
}

export function helpsAlignBookPrefix(args: {
  helpsKey: string
  helpsStamp: string
  olKey: string
  olStamp: string
  targetKey: string
  targetStamp: string
  book: string
}): string {
  return [
    HELPS_ALIGN_PREFIX + args.helpsKey,
    `@${args.helpsStamp}`,
    `:${args.olKey}`,
    `@${args.olStamp}`,
    `:${args.targetKey}`,
    `@${args.targetStamp}`,
    `:${args.book.toLowerCase()}`,
    `:`,
  ].join('')
}

export function helpsAlignTargetsPrefix(args: {
  helpsKey: string
  helpsStamp: string
  olKey: string
  olStamp: string
}): string {
  return [
    HELPS_ALIGN_PREFIX + args.helpsKey,
    `@${args.helpsStamp}`,
    `:${args.olKey}`,
    `@${args.olStamp}`,
    `:`,
  ].join('')
}

export function alignRelationId(args: {
  helpsKey: string
  olKey: string
  targetKey: string
  book: string
}): string {
  return `align:${args.helpsKey}|${args.olKey}|${args.targetKey}|${args.book.toLowerCase()}`
}

export function quoteRelationId(args: {
  helpsKey: string
  olKey: string
  book: string
}): string {
  return `quote:${args.helpsKey}|${args.olKey}|${args.book.toLowerCase()}`
}

export async function readCachedAlignments(
  cache: HelpsAlignCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    targetKey: string
    targetStamp: string
    book: string
    chapter: number
  }
): Promise<CachedAlignments | null> {
  const entry = await cache.get(helpsAlignKey(args))
  const payload =
    entry &&
    typeof entry === 'object' &&
    'content' in entry &&
    typeof (entry as { version?: number }).version !== 'number'
      ? (entry as { content: unknown }).content
      : entry
  return unwrapVersioned<CachedAlignments>(payload ?? entry, HELPS_ALIGN_VERSION)
}

export async function writeCachedAlignments(
  cache: HelpsAlignCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    targetKey: string
    targetStamp: string
    book: string
    chapter: number
  },
  alignmentsByLinkId: CachedAlignments
): Promise<void> {
  const envelope = wrapVersioned(alignmentsByLinkId, HELPS_ALIGN_VERSION)
  await cache.set(helpsAlignKey(args), {
    ...envelope,
    expiresAt: new Date(Date.now() + HELPS_ALIGN_TTL_MS).toISOString(),
  })
}

export async function readCachedAlignmentsForSpan(
  cache: HelpsAlignCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    targetKey: string
    targetStamp: string
    book: string
    startChapter: number
    endChapter: number
  }
): Promise<CachedAlignments> {
  const chapters: number[] = []
  for (let chapter = args.startChapter; chapter <= args.endChapter; chapter++) {
    chapters.push(chapter)
  }
  return readCachedAlignmentsForChapters(cache, { ...args, chapters })
}

export async function readCachedAlignmentsForChapters(
  cache: HelpsAlignCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    targetKey: string
    targetStamp: string
    book: string
    chapters: readonly number[]
  }
): Promise<CachedAlignments> {
  const merged: CachedAlignments = {}
  const seen = new Set<number>()
  for (const chapter of args.chapters) {
    if (!Number.isFinite(chapter) || chapter < 1 || seen.has(chapter)) continue
    seen.add(chapter)
    const row = await readCachedAlignments(cache, { ...args, chapter })
    if (!row) continue
    Object.assign(merged, row)
  }
  return merged
}

export async function mergeAndWriteCachedAlignments(
  cache: HelpsAlignCacheAdapter,
  args: {
    helpsKey: string
    helpsStamp: string
    olKey: string
    olStamp: string
    targetKey: string
    targetStamp: string
    book: string
  },
  built: CachedAlignments,
  chapterOfLinkId: (linkId: string) => number
): Promise<void> {
  const byChapter = new Map<number, CachedAlignments>()
  for (const [linkId, row] of Object.entries(built)) {
    const chapter = chapterOfLinkId(linkId)
    if (!Number.isFinite(chapter) || chapter < 1) continue
    const partial = byChapter.get(chapter) ?? {}
    partial[linkId] = row
    byChapter.set(chapter, partial)
  }

  for (const [chapter, partial] of byChapter) {
    const existing = (await readCachedAlignments(cache, { ...args, chapter })) ?? {}
    await writeCachedAlignments(cache, { ...args, chapter }, { ...existing, ...partial })
  }
}

/**
 * Split links into cache hits vs misses.
 *
 * `retrySettledMisses`: treat `m:0` (settled empty align) as misses so lane-1 can
 * re-live-align once target tokens are align-ready. Premature m:0 rows (align
 * before zaln / prepared tokens) must not permanently paint ol-fallback.
 */
export function subtractCachedAlignHits<T extends { id: string }>(
  needsBuild: readonly T[],
  cached: CachedAlignments,
  options?: { retrySettledMisses?: boolean }
): { hits: Map<string, CachedAlignRow>; misses: T[] } {
  const hits = new Map<string, CachedAlignRow>()
  const misses: T[] = []
  for (const link of needsBuild) {
    if (Object.prototype.hasOwnProperty.call(cached, link.id)) {
      const row = cached[link.id]!
      if (options?.retrySettledMisses && row.m === 0) {
        misses.push(link)
      } else {
        hits.set(link.id, row)
      }
    } else {
      misses.push(link)
    }
  }
  return { hits, misses }
}
