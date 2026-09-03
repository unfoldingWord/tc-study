/**
 * Shared original-language (UGNT/UHB) chapter load.
 * Dedupes concurrent TN + TWL quote hooks loading the same book.
 */

import type { OptimizedChapter } from '@bt-synergy/resource-parsers'
import {
  ScriptureLoader,
  viewModelChapterToOptimized,
} from '@bt-synergy/scripture-loader'

const inflight = new Map<string, Promise<OptimizedChapter[]>>()

const NT_BOOKS = new Set([
  'MAT',
  'MRK',
  'LUK',
  'JHN',
  'ACT',
  'ROM',
  '1CO',
  '2CO',
  'GAL',
  'EPH',
  'PHP',
  'COL',
  '1TH',
  '2TH',
  '1TI',
  '2TI',
  'TIT',
  'PHM',
  'HEB',
  'JAS',
  '1PE',
  '2PE',
  '1JN',
  '2JN',
  '3JN',
  'JUD',
  'REV',
])

export interface OriginalLanguageResource {
  resourceKey: string
  language: string
  bookCode: string
}

export function resolveOriginalLanguageKey(bookCode: string): OriginalLanguageResource | null {
  const upper = bookCode.toUpperCase()
  if (!upper || upper === 'OBS') return null
  if (NT_BOOKS.has(upper)) {
    return {
      resourceKey: 'unfoldingWord/el-x-koine/ugnt',
      language: 'el-x-koine',
      bookCode: upper,
    }
  }
  return {
    resourceKey: 'unfoldingWord/hbo/uhb',
    language: 'hbo',
    bookCode: upper,
  }
}

export function olLoadCacheKey(
  olKey: string,
  bookId: string,
  startChapter: number,
  endChapter: number
): string {
  return `${olKey}|${bookId.toLowerCase()}|${startChapter}|${endChapter}`
}

/** Test-only. */
export function clearOlLoadCacheForTests(): void {
  inflight.clear()
}

/**
 * Load OptimizedChapter[] for an OL resource + chapter span.
 * Concurrent callers with the same key share one promise.
 */
export function loadOriginalLanguageChapters(args: {
  loader: ScriptureLoader
  olKey: string
  bookId: string
  startChapter: number
  endChapter: number
}): Promise<OptimizedChapter[]> {
  const { loader, olKey, bookId, startChapter, endChapter } = args
  const key = olLoadCacheKey(olKey, bookId, startChapter, endChapter)
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async (): Promise<OptimizedChapter[]> => {
    const viewModel = await loader.loadViewModel(olKey, bookId)
    const optimized: OptimizedChapter[] = []
    for (let chapter = startChapter; chapter <= endChapter; chapter++) {
      const row = viewModelChapterToOptimized(viewModel, chapter)
      if (row) optimized.push(row)
    }
    return optimized
  })()

  inflight.set(key, promise)
  void promise.finally(() => {
    if (inflight.get(key) === promise) inflight.delete(key)
  })
  return promise
}
