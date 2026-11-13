import { useEffect, useReducer } from 'react'
import { useCatalogManager } from '../../contexts'
import { packsV3 } from './client'
import { packsFormat } from './packsFormat'
import { ensureLanguageV3, readV3Mode, readV3Progress, subscribeReadV3, type ReadV3Deps, type ReadV3Mode } from './readV3'
import type { CacheAdapter, CatalogAdapter, SyncProgress } from './syncV3'

export { keysForDoor43, readV3Mode } from './readV3'
export type { ReadV3Mode } from './readV3'

/** The format 3 sync's view of the app: the one client and the adapters the catalog manager already holds. */
export function readV3DepsOf(catalogManager: { getAdapters(): { catalog: unknown; cache: unknown } }): ReadV3Deps {
  const { catalog, cache } = catalogManager.getAdapters()
  return { client: () => packsV3(), cache: cache as CacheAdapter, catalog: catalog as CatalogAdapter }
}

export type ReadV3State = { mode: ReadV3Mode; helpsMode: ReadV3Mode; progress?: SyncProgress }

/**
 * Format 3 for Read: with the packs server on staging, the text language syncs its current book first (then its other books
 * and articles in the background) and the helps language syncs the same book. `mode` is the text language's; `helpsMode` the
 * helps language's (`door43` for one with no pack: its helps come from Door43 as today). Format 2: does nothing.
 */
export function useReadV3({ lang, book, helpsLang }: { lang: string | null; book: string; helpsLang: string | null }): ReadV3State {
  const catalogManager = useCatalogManager()
  const [, rerender] = useReducer((n: number) => n + 1, 0)
  useEffect(() => subscribeReadV3(rerender), [])
  useEffect(() => {
    if (packsFormat() === 2 || !lang) return
    const deps = readV3DepsOf(catalogManager)
    void ensureLanguageV3(lang, book, deps)
    if (helpsLang && helpsLang !== lang) void ensureLanguageV3(helpsLang, book, deps)
  }, [lang, book, helpsLang, catalogManager])
  const progress = readV3Progress()
  return {
    mode: lang ? readV3Mode(lang) : 'door43',
    helpsMode: helpsLang ? readV3Mode(helpsLang) : 'door43',
    ...(progress ? { progress } : {}),
  }
}
