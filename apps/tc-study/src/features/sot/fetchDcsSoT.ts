/**
 * DCS single-file hydrate via existing Door43 / resource loaders.
 * Do not invent a new HTTP client — reuse ScriptureLoader / TSV loaders.
 */

import type { FetchDcsFile } from './getSoT'

export type DcsLoader = {
  loadViewModel?: (resourceKey: string, bookId: string) => Promise<unknown>
  loadScriptureResult?: (
    resourceKey: string,
    bookId: string
  ) => Promise<{ viewModel?: unknown }>
  loadContent?: (resourceKey: string, bookId: string) => Promise<unknown>
}

/**
 * One book file (USFM / TSV / article). Chapter-split of whole-book USJ is deferred.
 */
export function fetchDcsViaLoader(loader: DcsLoader | null | undefined): FetchDcsFile {
  return async ({ resourceKey, book }) => {
    if (!loader) return null
    if (typeof loader.loadViewModel === 'function') {
      return loader.loadViewModel(resourceKey, book)
    }
    if (typeof loader.loadScriptureResult === 'function') {
      const result = await loader.loadScriptureResult(resourceKey, book)
      return result?.viewModel ?? result
    }
    if (typeof loader.loadContent === 'function') {
      return loader.loadContent(resourceKey, book)
    }
    return null
  }
}
