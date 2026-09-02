/**
 * Ensure a chapter’s full (token) prepare row is in memory — enqueue if missing.
 * On worker source-missing (stale/absent scripture-usj:), heal via main-thread
 * loadViewModel + prepareBookWithPreparer instead of re-enqueueing forever.
 */

import type { UsjScriptureViewModel } from '@bt-synergy/scripture-loader'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import type { PrepareCacheAdapter } from '../prepare/prepareRegistry'
import {
  enqueuePrepareJob,
  subscribePrepareReadyFailed,
} from '../../workers/prepareClient'
import {
  fetchPreparedChapterTiers,
  peekPreparedChapter,
  seedPreparedChapter,
} from './preparedChapterCache'
import type { ScriptureFullChapter } from './scripturePreparer'

export type EnsureFullChapterStatus = 'ready' | 'pending' | 'source-missing'

export interface EnsureFullChapterResult {
  full: ScriptureFullChapter | null
  status: EnsureFullChapterStatus
}

/** Books we already know have no readable USJ SoT — skip re-enqueue. */
const sourceMissingBooks = new Set<string>()

function bookMissKey(resourceKey: string, bookId: string): string {
  return `${resourceKey}|${bookId.toLowerCase()}`
}

export function isPreparedSourceMissing(resourceKey: string, bookId: string): boolean {
  return sourceMissingBooks.has(bookMissKey(resourceKey, bookId))
}

export function markPreparedSourceMissing(resourceKey: string, bookId: string): void {
  sourceMissingBooks.add(bookMissKey(resourceKey, bookId))
}

export function clearPreparedSourceMissing(resourceKey: string, bookId: string): void {
  sourceMissingBooks.delete(bookMissKey(resourceKey, bookId))
}

/** Test-only. */
export function resetPreparedSourceMissingForTests(): void {
  sourceMissingBooks.clear()
}

let sourceMissingSubActive = false

/** Ensure one global listener marks books that the worker cannot read. */
export function watchPrepareSourceMissing(): () => void {
  if (sourceMissingSubActive) return () => undefined
  sourceMissingSubActive = true
  const unsub = subscribePrepareReadyFailed((msg) => {
    if (msg.reason !== 'source-missing') return
    if (msg.typeId !== RESOURCE_TYPE_IDS.SCRIPTURE) return
    markPreparedSourceMissing(msg.resourceKey, msg.bookId)
  })
  return () => {
    sourceMissingSubActive = false
    unsub()
  }
}

export function hasPreparedFullChapter(
  resourceKey: string,
  bookId: string,
  chapter: number
): boolean {
  const peeked = peekPreparedChapter(resourceKey, bookId, chapter)
  return !!(peeked?.full && peeked.full.blocks?.length)
}

export type LoadScriptureViewModel = (
  resourceKey: string,
  bookId: string
) => Promise<UsjScriptureViewModel>

/**
 * Read full from IDB/memory; if absent, enqueue an interactive full-tier prepare
 * (unless the worker already reported source-missing for this book).
 */
export async function ensurePreparedFullChapter(
  cache: PrepareCacheAdapter,
  resourceKey: string,
  bookId: string,
  chapter: number
): Promise<EnsureFullChapterResult> {
  if (!resourceKey || !bookId || chapter < 1) {
    return { full: null, status: 'pending' }
  }
  if (hasPreparedFullChapter(resourceKey, bookId, chapter)) {
    return {
      full: peekPreparedChapter(resourceKey, bookId, chapter)?.full ?? null,
      status: 'ready',
    }
  }

  const entry = await fetchPreparedChapterTiers(cache, resourceKey, bookId, chapter, [
    'light',
    'full',
  ])
  if (entry.full?.blocks?.length) {
    return { full: entry.full, status: 'ready' }
  }

  if (isPreparedSourceMissing(resourceKey, bookId)) {
    return { full: null, status: 'source-missing' }
  }

  await enqueuePrepareJob({
    typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
    resourceKey,
    bookId,
    units: [chapter],
    tier: 'full',
    priority: 'interactive',
  }).catch(() => undefined)

  // Worker may reply ready-failed asynchronously; callers should also watch
  // subscribePrepareReadyFailed / isPreparedSourceMissing.
  return { full: null, status: 'pending' }
}

/**
 * Main-thread heal: rewrite scripture-usj: via loadViewModel, then prepare
 * light+full for the open chapter (and neighbors optional via enqueue).
 */
export async function healPreparedFullChapter(args: {
  cache: PrepareCacheAdapter
  resourceKey: string
  bookId: string
  chapter: number
  loadViewModel: LoadScriptureViewModel
}): Promise<EnsureFullChapterResult> {
  const { cache, resourceKey, bookId, chapter, loadViewModel } = args
  if (!resourceKey || !bookId || chapter < 1) {
    return { full: null, status: 'pending' }
  }

  try {
    const viewModel = await loadViewModel(resourceKey, bookId)
    clearPreparedSourceMissing(resourceKey, bookId)

    // Side-effect register scripture preparer only (avoid pulling notes/markdown
    // into the main-thread ensure path). prepareBookWithPreparer needs it.
    await import('./scripturePreparer')
    const { prepareBookWithPreparer } = await import('../prepare/runPrepare')

    await prepareBookWithPreparer({
      typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
      resourceKey,
      bookId,
      cacheAdapter: cache,
      source: { resourceKey, bookId, viewModel },
      units: [chapter],
      tiers: ['light', 'full'],
    })

    const entry = await fetchPreparedChapterTiers(cache, resourceKey, bookId, chapter, [
      'light',
      'full',
    ])
    seedPreparedChapter(resourceKey, bookId, chapter, entry)

    if (entry.full?.blocks?.length) {
      return { full: entry.full, status: 'ready' }
    }
    return { full: null, status: 'pending' }
  } catch (err) {
    console.error(
      `[healPreparedFullChapter] failed for ${resourceKey}/${bookId}:${chapter}`,
      err
    )
    markPreparedSourceMissing(resourceKey, bookId)
    return { full: null, status: 'source-missing' }
  }
}
