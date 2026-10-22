/**
 * Idle GC for warm/helps caches: TTL prune, stamp mismatch delete, quota shed.
 */

import { HELPS_ALIGN_PREFIX } from '../helps/helpsAlignCache'
import { HELPS_QUOTE_PREFIX } from '../helps/helpsQuoteCache'
import { readWarmCoverage, writeWarmCoverage } from './warmCoverage'
import { NO_OL_STAMP, type WarmStampResolvers } from './warmStamps'

export type WarmGcCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  delete?(key: string): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
  prune?(): Promise<void>
}

/** The current stamps, asked per book: a row is collected when its book's stamp moved, not its resource's release. */
export type WarmGcStamps = Partial<WarmStampResolvers>

const QUOTA_BUDGET = 0.6

function languageFromResourceKey(key: string): string {
  return key.split('/')[1]?.split('_')[0]?.toLowerCase() ?? ''
}

function splitStampAndRest(segment: string): { stamp: string; rest: string } | null {
  const colon = segment.indexOf(':')
  if (colon < 0) return null
  return { stamp: segment.slice(0, colon), rest: segment.slice(colon + 1) }
}

/** Parse helps-quote:{helps}@{hs}:{ol}@{os}:{book}:{ch} without splitting resource keys on `/`. */
export function parseQuoteWarmKey(key: string): {
  helpsKey: string
  helpsStamp: string
  olKey: string
  olStamp: string
  book: string
  chapter: string
} | null {
  if (!key.startsWith(HELPS_QUOTE_PREFIX)) return null
  const rest = key.slice(HELPS_QUOTE_PREFIX.length)
  const atParts = rest.split('@')
  if (atParts.length < 3) return null
  const helpsKey = atParts[0] ?? ''
  const afterHelps = splitStampAndRest(atParts[1] ?? '')
  const afterOl = atParts.slice(2).join('@')
  if (!afterHelps || !afterOl) return null
  const lastColon = afterOl.lastIndexOf(':')
  if (lastColon < 0) return null
  const chapter = afterOl.slice(lastColon + 1)
  const beforeChapter = afterOl.slice(0, lastColon)
  const bookColon = beforeChapter.lastIndexOf(':')
  if (bookColon < 0) return null
  return {
    helpsKey,
    helpsStamp: afterHelps.stamp,
    olKey: afterHelps.rest,
    olStamp: beforeChapter.slice(0, bookColon),
    book: beforeChapter.slice(bookColon + 1),
    chapter,
  }
}

/** Parse helps-align:{helps}@{hs}:{ol}@{os}:{target}@{ts}:{book}:{ch}. */
export function parseAlignWarmKey(key: string): {
  helpsKey: string
  helpsStamp: string
  olKey: string
  olStamp: string
  targetKey: string
  targetStamp: string
  book: string
  chapter: string
} | null {
  if (!key.startsWith(HELPS_ALIGN_PREFIX)) return null
  const rest = key.slice(HELPS_ALIGN_PREFIX.length)
  const atParts = rest.split('@')
  if (atParts.length < 4) return null
  const helpsKey = atParts[0] ?? ''
  const afterHelps = splitStampAndRest(atParts[1] ?? '')
  const afterOl = splitStampAndRest(atParts[2] ?? '')
  const afterTarget = atParts.slice(3).join('@')
  if (!afterHelps || !afterOl || !afterTarget) return null
  const lastColon = afterTarget.lastIndexOf(':')
  if (lastColon < 0) return null
  const chapter = afterTarget.slice(lastColon + 1)
  const beforeChapter = afterTarget.slice(0, lastColon)
  const bookColon = beforeChapter.lastIndexOf(':')
  if (bookColon < 0) return null
  return {
    helpsKey,
    helpsStamp: afterHelps.stamp,
    olKey: afterHelps.rest,
    olStamp: afterOl.stamp,
    targetKey: afterOl.rest,
    targetStamp: beforeChapter.slice(0, bookColon),
    book: beforeChapter.slice(bookColon + 1),
    chapter,
  }
}

function targetKeyFromAlignKey(key: string): string | null {
  return parseAlignWarmKey(key)?.targetKey ?? null
}

/** A stamp that differs from the current one; an unknown current stamp (unread resource or original) collects nothing. */
function moved(stored: string | undefined, current: string | undefined): boolean {
  return Boolean(current && current !== NO_OL_STAMP && stored !== current)
}

type QuoteStamps = { helpsKey: string; helpsStamp: string; olKey: string; olStamp: string; book: string }
type AlignStamps = QuoteStamps & { targetKey: string; targetStamp: string }

function quoteStampMismatch(parsed: QuoteStamps, stamps: WarmGcStamps): boolean {
  return (
    moved(parsed.helpsStamp, stamps.helpsStampOf?.(parsed.helpsKey, parsed.book)) ||
    moved(parsed.olStamp, stamps.olStampOf?.(parsed.olKey, parsed.book))
  )
}

function alignStampMismatch(parsed: AlignStamps, stamps: WarmGcStamps): boolean {
  return (
    quoteStampMismatch(parsed, stamps) ||
    moved(parsed.targetStamp, stamps.targetStampOf?.(parsed.targetKey, parsed.book))
  )
}

async function deleteStampMismatches(
  cache: WarmGcCacheAdapter,
  stamps: WarmGcStamps
): Promise<number> {
  if (typeof cache.getByPrefix !== 'function' || !cache.delete) return 0
  let deleted = 0

  const quoteRows = await cache.getByPrefix(HELPS_QUOTE_PREFIX)
  for (const row of quoteRows) {
    const parsed = parseQuoteWarmKey(row.key)
    if (!parsed || !quoteStampMismatch(parsed, stamps)) continue
    await cache.delete(row.key)
    deleted += 1
  }

  const alignRows = await cache.getByPrefix(HELPS_ALIGN_PREFIX)
  for (const row of alignRows) {
    const parsed = parseAlignWarmKey(row.key)
    if (!parsed || !alignStampMismatch(parsed, stamps)) continue
    await cache.delete(row.key)
    deleted += 1
  }

  try {
    const coverage = await readWarmCoverage(cache)
    let changed = false
    // quote:{helps}|{ol}|{book} stamped "hs|os"; align:{helps}|{ol}|{target}|{book} stamped "hs|os|ts".
    for (const [id, entry] of Object.entries(coverage)) {
      const parts = id.split('|')
      const [hs = '', os = '', ts = ''] = entry.stamp.split('|')
      let stale = false
      if (id.startsWith('quote:') && parts.length === 3) {
        const [helpsKey, olKey, book] = [parts[0].slice('quote:'.length), parts[1], parts[2]]
        stale = quoteStampMismatch({ helpsKey, helpsStamp: hs, olKey, olStamp: os, book }, stamps)
      } else if (id.startsWith('align:') && parts.length === 4) {
        const [helpsKey, olKey, targetKey, book] = [parts[0].slice('align:'.length), parts[1], parts[2], parts[3]]
        stale = alignStampMismatch(
          { helpsKey, helpsStamp: hs, olKey, olStamp: os, targetKey, targetStamp: ts, book },
          stamps
        )
      }
      if (stale) {
        delete coverage[id]
        changed = true
      }
    }
    if (changed) await writeWarmCoverage(cache, coverage)
  } catch {
    /* ignore */
  }

  return deleted
}

export async function runWarmGc(args: {
  cache: WarmGcCacheAdapter
  sourceResourceId: string | null
  textLanguageCode: string
  helpsLanguageCode: string
  currentBook?: string
  stamps?: WarmGcStamps
}): Promise<{ pruned: boolean; deleted: number }> {
  const { cache, sourceResourceId, textLanguageCode, helpsLanguageCode, currentBook, stamps } = args
  let deleted = 0

  if (typeof cache.prune === 'function') {
    await cache.prune()
  }

  if (stamps) {
    deleted += await deleteStampMismatches(cache, stamps)
  }

  const liveLangs = new Set(
    [textLanguageCode, helpsLanguageCode]
      .map((l) => l.toLowerCase())
      .filter(Boolean)
  )

  let overBudget = false
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate()
      if (est.quota && est.usage != null && est.usage / est.quota > QUOTA_BUDGET) {
        overBudget = true
      }
    } catch {
      /* ignore */
    }
  }

  if (!overBudget || typeof cache.getByPrefix !== 'function' || !cache.delete) {
    return { pruned: true, deleted }
  }

  // 1. Align rows whose targetKey ≠ current sourceResourceId
  if (sourceResourceId) {
    const alignRows = await cache.getByPrefix(HELPS_ALIGN_PREFIX)
    for (const row of alignRows) {
      const target = targetKeyFromAlignKey(row.key)
      if (target && target !== sourceResourceId) {
        await cache.delete(row.key)
        deleted += 1
      }
    }
  }

  // Re-check budget
  if (typeof navigator !== 'undefined' && navigator.storage?.estimate) {
    try {
      const est = await navigator.storage.estimate()
      if (est.quota && est.usage != null && est.usage / est.quota <= QUOTA_BUDGET) {
        return { pruned: true, deleted }
      }
    } catch {
      /* ignore */
    }
  }

  // 2. Align/quote whose language ∉ live set
  for (const prefix of [HELPS_ALIGN_PREFIX, HELPS_QUOTE_PREFIX]) {
    const rows = await cache.getByPrefix(prefix)
    for (const row of rows) {
      const rest = row.key.slice(prefix.length)
      const resourceKey = rest.split('@')[0] ?? ''
      const lang = languageFromResourceKey(resourceKey)
      if (lang && !liveLangs.has(lang)) {
        await cache.delete(row.key)
        deleted += 1
      }
    }
  }

  // 3. Quote rows for non-current books
  if (currentBook && cache.getByPrefix && cache.delete) {
    const book = currentBook.toLowerCase()
    const rows = await cache.getByPrefix(HELPS_QUOTE_PREFIX)
    for (const row of rows) {
      const parsed = parseQuoteWarmKey(row.key)
      const bookPart = parsed?.book.toLowerCase()
      if (bookPart && bookPart !== book) {
        await cache.delete(row.key)
        deleted += 1
      }
    }
  }

  // Trim coverage index for deleted relations (best-effort)
  try {
    const coverage = await readWarmCoverage(cache)
    const next: typeof coverage = {}
    for (const [id, entry] of Object.entries(coverage)) {
      const lang = languageFromResourceKey(id.split('|')[0]?.replace(/^(quote|align|prep):/, '') ?? '')
      if (lang && !liveLangs.has(lang)) continue
      next[id] = entry
    }
    await writeWarmCoverage(cache, next)
  } catch {
    /* ignore */
  }

  return { pruned: true, deleted }
}
