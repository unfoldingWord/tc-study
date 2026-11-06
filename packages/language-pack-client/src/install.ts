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
    // By id, from the stored files: the `published` pointer of that name may already be a newer common catalog.
    const stored = await readStored(store, trust, { name: rname, publisher: lang.publisher, revision, id, origin: 'published' })
    const found = stored?.name === rname ? stored : undefined
    if (found !== undefined) catalogs.push(found)
    else missing ??= { name: rname, revision, id }
  }
  return { lang, catalogs, ...(missing !== undefined ? { missing } : {}) }
}

/**
 * Of the segments the plan names, the ones stored that still read as the segment their id says (`readSegment` with the class
 * tables and `expectedId`). A blob that does not is left out, so it counts as missing and is fetched again. Nothing else in the
 * store is read; the result is also the only `have` the activation sees, so an install activates what it asked for.
 */
export async function verifiedHave(store: BlobStore, steps: Step[], stored: ReadonlySet<string>): Promise<Set<string>> {
  const have = new Set<string>()
  const tables = KNOWN as Record<string, Record<string, number[]> | undefined>
  const checked = new Set<string>()
  for (const step of steps) {
    for (const seg of step.segments) {
      if (!stored.has(seg.id) || checked.has(seg.id)) continue
      checked.add(seg.id)
      const known = tables[seg.class]
      const bytes = await st(() => store.get(seg.id))
      if (bytes === undefined || known === undefined) continue
      try {
        await readSegment(bytes, { known, expectedId: seg.id })
        have.add(seg.id)
      } catch (e) {
        if (!(e instanceof FormatError)) throw e
      }
    }
  }
  return have
}

export type InstallOptions = {
  signal?: AbortSignal
  onProgress?: (p: Progress) => void
  /** How many segment requests run at once (default 4). `1` asks in plan order, one after the other. */
  concurrency?: number
}

export const DEFAULT_CONCURRENCY = 4

/** `E_ARG` unless `n` is absent or a whole number from 1 up. */
export function checkConcurrency(n: number | undefined): void {
  if (n !== undefined && !(Number.isInteger(n) && n >= 1)) throw new ClientError('E_ARG', `concurrency must be a whole number from 1 up, not ${n}`)
}

/**
 * Fetches and verifies the segments the plan lacks, each once, with up to `concurrency` requests at once (workers take the next
 * segment in plan order). A unit is activated, and the state saved, as soon as a stored segment completes it.
 */
export async function runSteps(
  env: { store: BlobStore; source: PackSource },
  catalogs: VerifiedCatalog[],
  state0: InstalledState,
  have: Set<string>,
  steps: Step[],
  unknown: string[],
  o: InstallOptions = {},
): Promise<InstallReport> {
  const { store, source } = env
  checkConcurrency(o.concurrency)
  const width = o.concurrency ?? DEFAULT_CONCURRENCY
  const tables = KNOWN as Record<string, Record<string, number[]> | undefined>

  // The segments to fetch, in plan order and once each (units can share a segment), with the steps that use each.
  const queue: { id: string; class: string; key: string; users: number[] }[] = []
  const byId = new Map<string, (typeof queue)[number]>()
  steps.forEach((step, i) => {
    for (const s of step.segments) {
      if (have.has(s.id)) continue
      let q = byId.get(s.id)
      if (q === undefined) {
        q = { id: s.id, class: s.class, key: step.key, users: [] }
        byId.set(s.id, q)
        queue.push(q)
      }
      if (!q.users.includes(i)) q.users.push(i)
    }
  })
  const total = queue.length
  // Steps with a segment that was not stored (404, or bytes that are not the segment): they cannot be complete, so their other
  // segments are not fetched now (unless a step still wanted needs them too); they wait.
  const blocked = new Set<number>()
  const fetched: string[] = []
  const activated: string[] = []
  let bytes = 0
  let state = state0
  let next = 0
  // A network failure other than a 404 (429, 5xx, a dropped connection) stops the install: no new request starts (the next ones
  // would fail the same way, and after a 429 they would go against Retry-After), the ones running settle and what they verify is
  // stored, then what is complete is activated and saved once, and the first such error is thrown.
  let stopped: ClientError | undefined
  // An abort is handled the same way: what is complete is activated and saved once, then the abort is thrown (unless a network
  // failure came first: the first error wins).
  let aborted: { error: unknown } | undefined
  // Anything else a worker throws (a store failure, a bug): no new request starts, nothing more is activated, and it is thrown
  // once all have settled.
  let halt: { error: unknown } | undefined

  const activateNow = async (): Promise<ReturnType<typeof activate>> => {
    const r = activate(state, catalogs, have)
    if (r.activated.length > 0) {
      await st(() => store.setState(r.state))
      state = r.state
      activated.push(...r.activated)
    }
    return r
  }
  // Activations run one after the other, each from the state the one before saved; once the install is stopping they are left to
  // the single activation at the end.
  let saving: Promise<unknown> = Promise.resolve()
  const activateSoon = (): Promise<unknown> => {
    const run = saving.then(() => (stopped === undefined && aborted === undefined && halt === undefined ? activateNow() : undefined))
    saving = run.catch(() => {})
    return run
  }

  const worker = async (): Promise<void> => {
    while (stopped === undefined && aborted === undefined && halt === undefined && next < queue.length) {
      o.signal?.throwIfAborted()
      const seg = queue[next++]!
      if (seg.users.every((i) => blocked.has(i))) continue
      let body: Uint8Array
      try {
        const known = tables[seg.class]
        if (known === undefined) throw new FormatError('E_BODY', `unknown segment class ${seg.class}`)
        body = await source.segment(seg.id, o.signal)
        await readSegment(body, { known, expectedId: seg.id })
      } catch (e) {
        if (o.signal?.aborted) throw e
        if (e instanceof ClientError && e.code === 'E_NETWORK' && e.status !== 404) {
          stopped ??= e
          return
        }
        if (e instanceof FormatError || (e instanceof ClientError && e.code === 'E_NETWORK')) {
          for (const i of seg.users) blocked.add(i)
          continue
        }
        throw e
      }
      await st(() => store.put(seg.id, body))
      have.add(seg.id)
      fetched.push(seg.id)
      bytes += body.length
      try {
        o.onProgress?.({ done: fetched.length, total, bytes, key: seg.key })
      } catch {
        // a progress callback must not break an install
      }
      if (seg.users.some((i) => steps[i]!.segments.every((s) => have.has(s.id)))) await activateSoon()
    }
  }

  let waiting: InstallReport['waiting'] = []
  try {
    const workers = Array.from({ length: Math.min(width, queue.length) }, () =>
      worker().catch((error: unknown) => {
        const storeFailed = error instanceof ClientError && error.code === 'E_STORE'
        if (o.signal?.aborted === true && !storeFailed) aborted ??= { error }
        else halt ??= { error }
      }),
    )
    await Promise.all(workers)
    await saving
    if (halt !== undefined) throw halt.error
    waiting = (await activateNow()).waiting
  } catch (e) {
    // The store failed: the installed state is the one the call started from. The segments written stay, so the retry activates
    // what they complete without fetching it again. (An abort keeps the units already complete.)
    if (e instanceof ClientError && e.code === 'E_STORE' && state !== state0) await store.setState(state0).catch(() => {})
    throw e
  }
  if (stopped !== undefined) throw stopped
  if (aborted !== undefined) throw aborted.error

  const wanted = new Set(steps.map((s) => s.key))
  return { activated, waiting: waiting.filter((w) => wanted.has(w.key)), fetched, bytes, unknown }
}
