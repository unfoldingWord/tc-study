/**
 * Idle GC for warm/helps caches: TTL prune, stamp mismatch delete, quota shed.
 */

import { HELPS_ALIGN_PREFIX } from '../helps/helpsAlignCache'
import { HELPS_QUOTE_PREFIX } from '../helps/helpsQuoteCache'
import { readWarmCoverage, writeWarmCoverage } from './warmCoverage'

export type WarmGcCacheAdapter = {
  get(key: string): Promise<unknown>
  set(key: string, entry: unknown): Promise<void>
  delete?(key: string): Promise<void>
  getByPrefix?(prefix: string): Promise<Array<{ key: string; entry: unknown }>>
  prune?(): Promise<void>
}

export type WarmGcStamps = {
  helpsStampByKey?: Record<string, string>
  olKey?: string
  olStamp?: string
  targetStampByKey?: Record<string, string>
}

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

function quoteStampMismatch(
  parsed: NonNullable<ReturnType<typeof parseQuoteWarmKey>>,
  stamps: WarmGcStamps
): boolean {
  const currentHelps = stamps.helpsStampByKey?.[parsed.helpsKey]
  if (currentHelps && parsed.helpsStamp !== currentHelps) return true
  if (
    stamps.olKey &&
    stamps.olStamp &&
    parsed.olKey === stamps.olKey &&
    parsed.olStamp !== stamps.olStamp
  ) {
    return true
  }
  return false
}

function alignStampMismatch(
  parsed: NonNullable<ReturnType<typeof parseAlignWarmKey>>,
  stamps: WarmGcStamps
): boolean {
  if (quoteStampMismatch(parsed, stamps)) return true
  const currentTarget = stamps.targetStampByKey?.[parsed.targetKey]
  return Boolean(currentTarget && parsed.targetStamp !== currentTarget)
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
    for (const [id, entry] of Object.entries(coverage)) {
      const parts = id.split('|')
      if (id.startsWith('quote:')) {
        const helpsKey = parts[0]?.replace(/^quote:/, '') ?? ''
        const current = stamps.helpsStampByKey?.[helpsKey]
        const stampHelps = entry.stamp.split('|')[0]
        if (current && stampHelps && stampHelps !== current) {
          delete coverage[id]
          changed = true
        }
      } else if (id.startsWith('align:')) {
        const helpsKey = parts[0]?.replace(/^align:/, '') ?? ''
        const targetKey = parts[2] ?? ''
        const [hs, , ts] = entry.stamp.split('|')
        if (stamps.helpsStampByKey?.[helpsKey] && hs !== stamps.helpsStampByKey[helpsKey]) {
          delete coverage[id]
          changed = true
        } else if (stamps.targetStampByKey?.[targetKey] && ts !== stamps.targetStampByKey[targetKey]) {
          delete coverage[id]
          changed = true
        }
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
