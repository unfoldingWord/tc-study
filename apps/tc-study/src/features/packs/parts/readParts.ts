/**
 * Read's use of the packs server: when Read opens a language, the current book and the shared unit come as parts,
 * prepared on the server, instead of the background download of every resource whole from Door43 and its preparing
 * here (`partsMode.ts` keeps that download off meanwhile). Read does not wait for them: it loads as before, and the
 * rows land when they come. The book first (small, and what the screen shows), then the shared unit (articles,
 * lexicons, titles: tens of MB unpacked). A language the server does not serve goes on to Door43 as before.
 */

import { IndexedDBByteStore } from '@bt-synergy/cache-adapter-indexeddb'
import {
  PARTS_FORMAT_VERSION,
  compatKeyOf,
  packTargetFrom,
  stagingFrom,
  type CatalogStore,
  type PartsStaging,
  type RawCacheStore,
} from '@bt-synergy/language-pack'
import { PACK_VERSIONS } from '@bt-synergy/resource-pipeline/language/packVersions'
import { syncLanguageParts, type SyncDeps, type SyncResult } from './languageParts'
import { modeAfter, usePartsModeStore } from './partsMode'

const env = (import.meta as { env?: Record<string, string | undefined> }).env ?? {}

/** The packs server; `VITE_PACKS_SERVER` overrides it (ends with `/`). */
export const PACKS_SERVER = env.VITE_PACKS_SERVER || 'https://tc-helps.mcp.servant.bible/v2/packs/'
export const PARTS_COMPAT = compatKeyOf(PARTS_FORMAT_VERSION, PACK_VERSIONS)

export type ReadPartsStores = { cache: RawCacheStore; catalog: CatalogStore }

let staging: PartsStaging | null = null
const stagingStore = () => (staging ??= stagingFrom(new IndexedDBByteStore({ dbName: 'tc-study-parts' })))

const inFlight = new Map<string, Promise<SyncResult>>()
/** One sync at a time per language: two `applyParts` on the same register must not interleave. */
const lastOfLanguage = new Map<string, Promise<unknown>>()

/** One language's shared unit and book, once at a time for the same pair; its mode follows the result. */
export function syncLanguageForRead(language: string, book: string, stores: ReadPartsStores, overrides: Partial<SyncDeps> = {}): Promise<SyncResult> {
  const id = `${language}|${book.toLowerCase()}`
  const running = inFlight.get(id)
  if (running) return running
  const { modes, setMode } = usePartsModeStore.getState()
  if (modes[language] === undefined) setMode(language, 'checking')
  const deps: SyncDeps = {
    server: PACKS_SERVER,
    compat: PARTS_COMPAT,
    target: packTargetFrom(stores),
    registerRows: (prefix) => stores.cache.getByPrefix(prefix),
    staging: stagingStore(),
    versions: PACK_VERSIONS,
    ...overrides,
  }
  const books = book ? [book] : []
  const before = lastOfLanguage.get(language) ?? Promise.resolve()
  const run = (async () => {
    await before.catch(() => {})
    // The book alone first; a language the server does not serve says so here, and the shared unit is not asked for.
    const first = books.length ? await syncLanguageParts(language, books, deps, { withShared: false }) : null
    if (first && first.kind !== 'applied' && first.kind !== 'up-to-date') return first
    const all = await syncLanguageParts(language, books, deps)
    return all.kind === 'up-to-date' && first?.kind === 'applied' ? first : all
  })()
    .catch((error): SyncResult => {
      console.warn('[parts] sync threw', error)
      return { kind: 'failed', why: error instanceof Error ? error.message : String(error) }
    })
    .then((result) => {
      if (result.kind === 'failed' || result.kind === 'update-app') {
        console.warn(`[parts] ${language} ${book}: ${result.kind}${'why' in result ? ` (${result.why})` : ''}`)
      }
      const store = usePartsModeStore.getState()
      store.setMode(language, modeAfter(store.modes[language], result))
      return result
    })
    .finally(() => inFlight.delete(id))
  inFlight.set(id, run)
  lastOfLanguage.set(language, run)
  return run
}

/** Read's languages for a book, started and not waited for. */
export function startLanguagesForRead(
  languages: readonly (string | null | undefined)[],
  book: string,
  stores: ReadPartsStores,
  overrides: Partial<SyncDeps> = {}
): Promise<SyncResult[]> {
  const unique = [...new Set(languages.filter((l): l is string => !!l))]
  return Promise.all(unique.map((l) => syncLanguageForRead(l, book, stores, overrides)))
}
