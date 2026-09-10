/**
 * Shared original-language (UGNT/UHB) chapter load.
 * Dedupes concurrent TN + TWL quote hooks loading the same book.
 */

import type { OptimizedChapter } from '@bt-synergy/resource-parsers'
import {
  ScriptureLoader,
  viewModelChapterToOptimized,
} from '@bt-synergy/scripture-loader'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { getSoT, type SoTCache } from '../sot/getSoT'
import { fetchDcsViaLoader } from '../sot/fetchDcsSoT'
import { isUsjViewModel, publishSoTDebug } from '../sot/sotDebug'

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
  /** Lane 1: IDB first, else one DCS book file. Warm must omit this + allowDcs. */
  cache?: SoTCache
  allowDcs?: boolean
}): Promise<OptimizedChapter[]> {
  const { loader, olKey, bookId, startChapter, endChapter, cache, allowDcs } = args
  const key = olLoadCacheKey(olKey, bookId, startChapter, endChapter)
  const existing = inflight.get(key)
  if (existing) return existing

  const promise = (async (): Promise<OptimizedChapter[]> => {
    let viewModel: Parameters<typeof viewModelChapterToOptimized>[0] | null = null
    if (cache) {
      const sot = await getSoT({
        resourceKey: olKey,
        book: bookId,
        chapter: startChapter,
        typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
        cache,
        allowDcs: allowDcs === true,
        fetchDcs: fetchDcsViaLoader(loader),
      })
      publishSoTDebug({
        source: sot.status === 'hit' ? sot.source : 'missing',
        typeId: RESOURCE_TYPE_IDS.SCRIPTURE,
        book: bookId,
        chapter: startChapter,
      })
      if (sot.status === 'hit' && isUsjViewModel(sot.payload)) {
        viewModel = sot.payload as Parameters<typeof viewModelChapterToOptimized>[0]
      } else if (sot.status === 'hit') {
        viewModel = await loader.loadViewModel(olKey, bookId)
      } else if (allowDcs) {
        viewModel = await loader.loadViewModel(olKey, bookId)
      }
    } else {
      viewModel = await loader.loadViewModel(olKey, bookId)
    }
    if (!viewModel) return []
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
