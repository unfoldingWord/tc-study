/**
 * Read's side of format 3: which languages the packs server serves, and the sync that brings them into the rows the panels
 * read. With format 2 (the default) nothing here opens anything: no client, no `tc-study-packs-v3` database.
 *
 * Per language the mode is `v3` (its rows come from format 3), `door43` (no pack, a book the pack lacks, or a failure with no
 * rows to read: Read runs as it does without format 3) or `checking` (not known yet; Door43 leaves the language alone).
 */
import type { LanguagePackClient } from '@bt-synergy/language-pack-client'
import { packsFormat } from './packsFormat'
import { type CacheAdapter, type CatalogAdapter, syncLanguageV3, syncRecordKey, type SyncProgress } from './syncV3'

export type ReadV3Mode = 'v3' | 'door43' | 'checking'

export type ReadV3Deps = { client: () => Promise<LanguagePackClient>; cache: CacheAdapter; catalog: CatalogAdapter }

const modes = new Map<string, ReadV3Mode>()
const runs = new Map<string, Promise<ReadV3Mode>>()
const backgrounds = new Map<string, AbortController>()
const listeners = new Set<() => void>()
let progress: SyncProgress | undefined

const emit = (): void => listeners.forEach((l) => l())
const setMode = (lang: string, mode: ReadV3Mode): void => {
  if (modes.get(lang) === mode) return
  modes.set(lang, mode)
  emit()
}

/** The mode of a language now. Format 2: always `door43`. Format 3 and not looked at yet: `checking`. */
export function readV3Mode(lang: string): ReadV3Mode {
  if (packsFormat() === 2) return 'door43'
  return modes.get(lang) ?? 'checking'
}
export const readV3Progress = (): SyncProgress | undefined => progress
export function subscribeReadV3(listener: () => void): () => void {
  listeners.add(listener)
  return () => void listeners.delete(listener)
}

/** For tests: forgets what a run learned. */
export function resetReadV3(): void {
  for (const c of backgrounds.values()) c.abort()
  backgrounds.clear()
  modes.clear()
  runs.clear()
  progress = undefined
}

const onProgress = (p: SyncProgress): void => {
  progress = p.unit === 'rows' && p.done >= p.total ? undefined : p
  emit()
}

const originalLanguages = new Set(['el-x-koine', 'hbo'])

/**
 * The keys Door43's background download may fetch: those of a language that is `v3` or `checking` stay out, and so do the
 * original-language resources while the text language is one of them (its pack brings the original of the books it has).
 *
 * Accepted (ruling): a book the pack lacks switches the language to `door43` mode, so the Door43 background download may
 * then cover that language's other resources too (same keys and shapes as format 2). Not redesigned.
 */
export function keysForDoor43(keys: string[], textLang: string | null, modeOf: (lang: string) => ReadV3Mode = readV3Mode): string[] {
  const textMode = textLang ? modeOf(textLang) : 'door43'
  return keys.filter((key) => {
    const lang = key.split('/')[1] ?? ''
    if (originalLanguages.has(lang)) return textMode === 'door43'
    return modeOf(lang) === 'door43'
  })
}

type FirstSync = { mode: ReadV3Mode; retry: boolean }

/** `retry`: a transient failure that left Door43 as the answer; the next call tries again. */
async function firstSync(lang: string, book: string, deps: ReadV3Deps): Promise<FirstSync> {
  let client: LanguagePackClient
  try {
    client = await deps.client()
  } catch {
    return { mode: 'door43', retry: true }
  }
  const books = book ? [book] : []
  const out = await syncLanguageV3(lang, { books }, { client, cache: deps.cache, catalog: deps.catalog, onProgress }).catch(() => ({ kind: 'failed' as const }))
  if (out.kind === 'done') return { mode: !book || out.books.includes(book.toLowerCase()) ? 'v3' : 'door43', retry: false }
  if (out.kind === 'no-pack') return { mode: 'door43', retry: false }
  // A cut network or a failure: rows written earlier for this book still serve Read.
  const record = (await deps.cache.get(syncRecordKey(lang)).catch(() => null)) as { content?: { units?: Record<string, string> } } | null
  return book && record?.content?.units?.[`book:${book.toLowerCase()}`] !== undefined ? { mode: 'v3', retry: false } : { mode: 'door43', retry: true }
}

/** After the current book: the other books of the pack and its article groups. A newer book change cancels it. */
async function background(lang: string, deps: ReadV3Deps): Promise<void> {
  backgrounds.get(lang)?.abort()
  const ctl = new AbortController()
  backgrounds.set(lang, ctl)
  try {
    const client = await deps.client()
    const status = await client.status(lang)
    const books = status.units.map((u) => u.key.slice(u.key.indexOf('/') + 1)).filter((id) => id.startsWith('book:')).map((id) => id.slice('book:'.length))
    await syncLanguageV3(lang, { books, articles: 'all' }, { client, cache: deps.cache, catalog: deps.catalog, signal: ctl.signal, onProgress })
  } catch {
    /* an abort or a failure: what was activated has its rows; the next run fetches the rest */
  } finally {
    if (backgrounds.get(lang) === ctl) backgrounds.delete(lang)
    progress = undefined
    emit()
  }
}

/**
 * Makes sure a language is served: the current `book` syncs first (so Read can open it), then, when the language is `v3`,
 * its other books and articles in the background. One run per language and book; a failure with nothing to read is tried
 * again next call. Format 2: `door43`, and nothing is opened.
 */
export function ensureLanguageV3(lang: string, book: string, deps: ReadV3Deps): Promise<ReadV3Mode> {
  if (packsFormat() === 2 || !lang) return Promise.resolve('door43')
  const id = `${lang}|${book.toLowerCase()}`
  const have = runs.get(id)
  if (have) {
    return have.then((mode) => {
      setMode(lang, mode)
      // A book change aborted the background sync: coming back to a served book restarts it.
      if (mode === 'v3' && !backgrounds.has(lang)) void background(lang, deps)
      return mode
    })
  }
  backgrounds.get(lang)?.abort()
  setMode(lang, 'checking')
  const run = firstSync(lang, book, deps).then(({ mode, retry }) => {
    if (retry && runs.get(id) === run) runs.delete(id)
    setMode(lang, mode)
    if (mode === 'v3') void background(lang, deps)
    return mode
  })
  runs.set(id, run)
  return run
}
