/**
 * DCS single-file hydrate via existing Door43 / resource loaders.
 * Do not invent a new HTTP client — reuse ScriptureLoader / TSV loaders.
 */

import type { FetchDcsFile } from './getSoT'

export type DcsLoader = {
  loadViewModel?: (resourceKey: string, bookId: string) => Promise<unknown>
  loadScriptureResult?: (
    resourceKey: string,
    bookId: string,
    options?: { prioritizeChapter?: number; deferRest?: boolean }
  ) => Promise<{ viewModel?: unknown }>
  loadContent?: (resourceKey: string, bookId: string) => Promise<unknown>
}

/**
 * One book file (USFM / TSV / article). Door43 has no single-chapter USFM HTTP.
 * ScriptureLoader writes chapter keys as soon as the book file is processed.
 */
export function fetchDcsViaLoader(loader: DcsLoader | null | undefined): FetchDcsFile {
  return async ({ resourceKey, book, chapter }) => {
    if (!loader) return null
    if (typeof loader.loadScriptureResult === 'function') {
      const result = await loader.loadScriptureResult(resourceKey, book, {
        prioritizeChapter: chapter,
        deferRest: typeof chapter === 'number',
      })
      return result?.viewModel ?? result
    }
    if (typeof loader.loadViewModel === 'function') {
      return loader.loadViewModel(resourceKey, book)
    }
    if (typeof loader.loadContent === 'function') {
      return loader.loadContent(resourceKey, book)
    }
    return null
  }
}
