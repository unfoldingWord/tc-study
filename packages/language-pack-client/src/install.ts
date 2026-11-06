/**
 * The download-and-verify loop of `install`, and the helpers the client shares: reading the stored catalogs and mapping store
 * failures to `E_STORE`. No Node module here: the client runs in a browser, a WebView, a Worker and Bun.
 */
import { FormatError, KNOWN, readSegment } from '@bt-synergy/language-pack-v3'
import { activate, type Step } from './plan'
import { ClientError } from './errors'
import { emptyState, hex, type InstalledCatalog, type InstalledState } from './state'
import type { PackSource } from './source/http'
import type { BlobStore } from './store/types'
import { type TrustPolicy, type VerifiedCatalog, verifyCatalogFile } from './verify'

export type Progress = { done: number; total: number; bytes: number; key: string }
export type InstallReport = {
  activated: string[]
  waiting: { key: string; missing: string[] }[]
  fetched: string[]
  bytes: number
  /** Names the plan could not find in any catalog (a book the pack does not have, a unit that needs a missing common catalog). */
  unknown: string[]
}
export type MissingCommon = { name: string; revision: number; id: string }

/** Runs a store call; whatever it throws that is not already a client error becomes `E_STORE` (quota included). */
export async function st<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (e) {
    if (e instanceof ClientError) throw e
    throw new ClientError('E_STORE', e instanceof Error ? e.message : String(e))
  }
}

export async function loadState(store: BlobStore): Promise<InstalledState> {
  return (await st(() => store.getState())) ?? emptyState()
}

/** A stored catalog file, read again with the same rules; `undefined` when it is gone or no longer verifies. */
export async function readStored(store: BlobStore, trust: TrustPolicy, entry: InstalledCatalog | undefined): Promise<VerifiedCatalog | undefined> {
  if (entry === undefined) return undefined
  const bytes = await st(() => store.get(entry.id))
  if (bytes === undefined) return undefined
  try {
    return await verifyCatalogFile(bytes, trust, { from: 'store', expectedId: entry.id })
  } catch (e) {
    if (e instanceof FormatError) return undefined
    throw e
  }
}

/**
 * The published catalog of `name` and the catalogs it requires that are the ones it names (by id). A required catalog that is
 * absent, other or unreadable is `missing`: the units that need it wait.
 */
export async function catalogsOf(
  store: BlobStore,
  trust: TrustPolicy,
  state: InstalledState,
  name: string,
): Promise<{ lang?: VerifiedCatalog; catalogs: VerifiedCatalog[]; missing?: MissingCommon }> {
  const lang = await readStored(store, trust, state.published[name])
  if (lang === undefined) return { catalogs: [] }
  const catalogs = [lang]
  let missing: MissingCommon | undefined
  for (const [rname, revision, rid] of lang.catalog.requires ?? []) {
    const id = hex(rid)
    const entry = state.published[rname]
    const found = entry?.id === id ? await readStored(store, trust, entry) : undefined
    if (found !== undefined) catalogs.push(found)
    else missing ??= { name: rname, revision, id }
  }
  return { lang, catalogs, ...(missing !== undefined ? { missing } : {}) }
}

/** Fetches and verifies the segments the plan lacks, a unit at a time; after each unit it activates what is complete and saves. */
export async function runSteps(
  env: { store: BlobStore; source: PackSource },
  catalogs: VerifiedCatalog[],
  state0: InstalledState,
  steps: Step[],
  unknown: string[],
  o: { signal?: AbortSignal; onProgress?: (p: Progress) => void } = {},
): Promise<InstallReport> {
  const { store, source } = env
  const have = new Set(await st(() => store.ids()))
  const missing = new Set<string>()
  for (const step of steps) for (const s of step.segments) if (!have.has(s.id)) missing.add(s.id)
  const total = missing.size
  const failed = new Set<string>()
  const fetched: string[] = []
  const activated: string[] = []
  let bytes = 0
  let state = state0

  try {
    for (const step of steps) {
      for (const seg of step.segments) {
        if (have.has(seg.id)) continue
        if (failed.has(seg.id)) break
        o.signal?.throwIfAborted()
        let body: Uint8Array
        try {
          const known = (KNOWN as Record<string, Record<string, number[]> | undefined>)[seg.class]
          if (known === undefined) throw new FormatError('E_BODY', `unknown segment class ${seg.class}`)
          body = await source.segment(seg.id, o.signal)
          await readSegment(body, { known, expectedId: seg.id })
        } catch (e) {
          if (o.signal?.aborted) throw e
          if (e instanceof FormatError || (e instanceof ClientError && e.code === 'E_NETWORK')) {
            // Not stored. The unit cannot be complete, so its other segments are not fetched now.
            failed.add(seg.id)
            break
          }
          throw e
        }
        await st(() => store.put(seg.id, body))
        have.add(seg.id)
        fetched.push(seg.id)
        bytes += body.length
        try {
          o.onProgress?.({ done: fetched.length, total, bytes, key: step.key })
        } catch {
          // a progress callback must not break an install
        }
      }
      const r = activate(state, catalogs, have)
      if (r.activated.length > 0) {
        await st(() => store.setState(r.state))
        state = r.state
        activated.push(...r.activated)
      }
    }
  } catch (e) {
    // The store failed: the installed state is the one the call started from. The segments written stay, so the retry activates
    // what they complete without fetching it again. (An abort keeps the units already complete.)
    if (e instanceof ClientError && e.code === 'E_STORE' && state !== state0) await store.setState(state0).catch(() => {})
    throw e
  }

  const last = activate(state, catalogs, have)
  if (last.activated.length > 0) {
    await st(() => store.setState(last.state))
    activated.push(...last.activated)
  }
  const wanted = new Set(steps.map((s) => s.key))
  return { activated, waiting: last.waiting.filter((w) => wanted.has(w.key)), fetched, bytes, unknown }
}
