/**
 * One language's parts on this device, from the packs server: the shared unit (articles, lexicons, titles) and the
 * books asked for, already prepared (texts, notes on their words, alignments), instead of downloading every resource
 * whole from Door43 and preparing it here. The same steps as Servos (`src/resources/online/`), for one call:
 *
 * the list (and the originals list it names) → the register → `planParts` → the parts not staged yet → `applyParts`.
 *
 * A part the server no longer has asks for the list again, once (a newer build replaced it). A plan whose parts did not
 * all reach staging applies nothing and says `failed`; the next call downloads what is missing.
 */

import {
  REGISTER_PREFIX,
  applyParts,
  planParts,
  readRegister,
  type CacheRow,
  type PackTarget,
  type PackVersions,
  type PartsList,
  type PartsPlan,
  type PartsStaging,
} from '@bt-synergy/language-pack'
import { fetchList, fetchOriginals, fetchPart, type ClientOptions } from './packsClient'

export const SHARED_UNIT = 'shared'
export const bookUnit = (book: string) => `book ${book.toLowerCase()}`

export type SyncDeps = {
  server: string
  compat: string
  target: PackTarget
  /** The register rows (`REGISTER_PREFIX`) as the cache store holds them now. */
  registerRows: (prefix: string) => Promise<CacheRow[]>
  staging: PartsStaging
  versions: PackVersions
  client?: ClientOptions
  /** Told after each part is staged. */
  onProgress?: (p: { done: number; total: number; bytes: number }) => void
  now?: () => number
}

export type SyncResult =
  | { kind: 'applied'; units: string[]; parts: number; bytes: number }
  | { kind: 'up-to-date' }
  | { kind: 'preparing' | 'unavailable' | 'wait'; retryAfter: number }
  | { kind: 'no-language' | 'update-app' }
  | { kind: 'failed'; why: string }

/** The last list of each language, with its ETag: asked again with If-None-Match. In memory, for this session. */
const lists = new Map<string, { list: PartsList; etag: string | null }>()
const originalsBySha = new Map<string, PartsList>()

/** For tests: forget what was kept. */
export function forgetKeptLists(): void {
  lists.clear()
  originalsBySha.clear()
}

async function listOf(language: string, deps: SyncDeps, fresh = false): Promise<SyncResult | { list: PartsList }> {
  const kept = fresh ? undefined : lists.get(language)
  const answer = await fetchList(deps.server, deps.compat, language, kept?.etag ?? null, deps.client)
  if (answer.kind === 'same' && kept) return { list: kept.list }
  if (answer.kind === 'ready') {
    lists.set(language, { list: answer.list, etag: answer.etag })
    return { list: answer.list }
  }
  if (answer.kind === 'same') return listOf(language, deps, true)
  if (answer.kind === 'preparing' || answer.kind === 'unavailable' || answer.kind === 'wait') return { kind: answer.kind, retryAfter: answer.retryAfter }
  return { kind: answer.kind }
}

async function originalsOf(list: PartsList, deps: SyncDeps): Promise<PartsList | undefined | SyncResult> {
  const ref = list.originals
  if (!ref) return undefined
  const kept = originalsBySha.get(ref.sha256)
  if (kept) return kept
  const answer = await fetchOriginals(deps.server, deps.compat, ref.sha256, deps.client)
  if (answer.kind === 'ready') {
    originalsBySha.set(ref.sha256, answer.list)
    return answer.list
  }
  if (answer.kind === 'wait') return { kind: 'wait', retryAfter: answer.retryAfter }
  return { kind: 'failed', why: `originals list ${answer.kind}` }
}

const isResult = (v: unknown): v is SyncResult => !!v && typeof v === 'object' && 'kind' in (v as object)

/** Downloads into staging the plan's parts not there yet. `gone` when the server no longer has one. */
async function stage(plan: PartsPlan, deps: SyncDeps): Promise<'staged' | 'gone' | SyncResult> {
  const staged = new Set((await deps.staging.list().catch(() => [])).map((s) => s.sha))
  const todo = plan.download.filter((p) => !staged.has(p.sha256))
  let done = 0
  let bytes = 0
  for (const entry of todo) {
    const answer = await fetchPart(deps.server, entry.sha256, deps.client)
    if (answer.kind === 'gone') return 'gone'
    if (answer.kind === 'wait') return { kind: 'wait', retryAfter: answer.retryAfter }
    if (answer.kind === 'failed') return { kind: 'failed', why: `part ${entry.sha256.slice(0, 12)} failed` }
    await deps.staging.put(entry.sha256, answer.bytes)
    done++
    bytes += answer.bytes.byteLength
    deps.onProgress?.({ done, total: todo.length, bytes })
  }
  return 'staged'
}

export async function syncLanguageParts(language: string, books: readonly string[], deps: SyncDeps): Promise<SyncResult> {
  const chosen = [SHARED_UNIT, ...books.map(bookUnit)]
  for (let attempt = 0; attempt < 2; attempt++) {
    const got = await listOf(language, deps, attempt > 0)
    if (isResult(got)) return got
    const { list } = got
    const originals = await originalsOf(list, deps)
    if (isResult(originals)) return originals

    const register = readRegister(await deps.registerRows(REGISTER_PREFIX))
    const plan = planParts({ list, originals, register, chosen, versions: deps.versions })
    if (plan.download.length === 0 && plan.remove.length === 0) return { kind: 'up-to-date' }

    const staged = await stage(plan, deps)
    if (staged === 'gone') continue
    if (isResult(staged)) return staged

    const result = await applyParts({
      target: deps.target,
      staging: deps.staging,
      plan,
      list,
      originals,
      register,
      chosen,
      versions: deps.versions,
      ...(deps.now ? { now: deps.now } : {}),
    })
    if (result.refused?.reason === 'versions') return { kind: 'update-app' }
    if (result.refused) return { kind: 'failed', why: `apply refused: ${result.refused.reason}` }
    const unitFailed = result.failed.find((f) => f.scope === 'unit')
    if (unitFailed) return { kind: 'failed', why: `${unitFailed.unit}: ${unitFailed.reason}` }
    // Applied: their staged parts are no longer needed.
    for (const p of plan.download) await deps.staging.delete(p.sha256).catch(() => {})
    return { kind: 'applied', units: result.applied, parts: plan.download.length, bytes: plan.bytes }
  }
  return { kind: 'failed', why: 'a part was gone twice' }
}
