/**
 * Main-thread client for prepare.worker.ts
 */

import type { OptimizedChapter, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { markScripturePerfEnd, markScripturePerfStart } from '../features/perf/scripturePerf'
import type { WarmJobOutcome } from '../features/warm/warmTypes'
import type { PrepareJob, PreparePriority } from './prepare.worker'
import type { PrepareTier } from '../features/prepare/prepareKeys'

export type PrepareQueueStats = {
  prepareDepth: number
  warmDepth: number
  currentPrepare: {
    typeId: string
    resourceKey: string
    bookId: string
    units: number[]
    priority: PreparePriority
    tier: PrepareTier | 'both'
  } | null
  currentWarmJobKey: string | null
  currentWarmKind: string | null
  currentWarmLane: 1 | 2 | 3 | null
  preparePending?: Array<{
    typeId: string
    resourceKey: string
    bookId: string
    units: number[]
    priority: PreparePriority
    tier: PrepareTier | 'both'
  }>
  warmPending?: Array<{
    jobKey: string
    kind: string
    lane: 1 | 2 | 3
    resourceKey: string
    bookId: string
  }>
  recentOutcomes?: Array<{ t: number; step: string; detail: string }>
}

type OkMsg = { id: string; type: 'ok'; result: unknown }
type ErrMsg = { id: string; type: 'error'; message: string }
type StatsMsg = { id: string; type: 'stats' } & PrepareQueueStats
type ReadyMsg = {
  id: string
  type: 'ready'
  typeId: string
  resourceKey: string
  bookId: string
  unit: number
  tier: PrepareTier
}
type ReadyFailedMsg = {
  id: string
  type: 'ready-failed'
  typeId: string
  resourceKey: string
  bookId: string
  unit: number
  tier: PrepareTier
  reason: 'source-missing'
}

export type PrepareReadyListener = (msg: ReadyMsg) => void
export type PrepareReadyFailedListener = (msg: ReadyFailedMsg) => void
export type PrepareWarmDoneListener = (msg: {
  id: string
  type: 'done'
  jobKey: string
  kind: string
  lane: 1 | 2 | 3
  outcome?: WarmJobOutcome
}) => void

/** batch-quotes / batch-align must not hang forever if prepare.worker wedges. */
export const PREPARE_RPC_TIMEOUT_MS = 8_000

let worker: Worker | null = null
let seq = 0
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>()
const readyListeners = new Set<PrepareReadyListener>()
const readyFailedListeners = new Set<PrepareReadyFailedListener>()
const warmDoneListeners = new Set<PrepareWarmDoneListener>()

function rejectAllPending(reason: string) {
  const err = new Error(reason)
  for (const [, entry] of pending) entry.reject(err)
  pending.clear()
}

function recyclePrepareWorker(reason: string) {
  rejectAllPending(reason)
  try {
    worker?.terminate()
  } catch {
    /* ignore */
  }
  worker = null
}

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./prepare.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (
      event: MessageEvent<
        | OkMsg
        | ErrMsg
        | StatsMsg
        | ReadyMsg
        | ReadyFailedMsg
        | {
            id: string
            type: 'done'
            jobKey: string
            kind: string
            lane: 1 | 2 | 3
            outcome?: WarmJobOutcome
          }
      >
    ) => {
      const msg = event.data
      if (msg.type === 'ready') {
        for (const listener of readyListeners) listener(msg)
        return
      }
      if (msg.type === 'ready-failed') {
        for (const listener of readyFailedListeners) listener(msg)
        return
      }
      if (msg.type === 'done') {
        for (const listener of warmDoneListeners) listener(msg)
        return
      }
      if (msg.type === 'stats') {
        const entry = pending.get(msg.id)
        if (!entry) return
        pending.delete(msg.id)
        const { id: _id, type: _type, ...stats } = msg
        entry.resolve(stats)
        return
      }
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.type === 'ok') entry.resolve(msg.result)
      else entry.reject(new Error(msg.message))
    }
    worker.onerror = (err) => {
      console.warn('[prepareClient] worker error', err)
      recyclePrepareWorker('Prepare worker error')
    }
  } catch (err) {
    console.warn('[prepareClient] failed to start worker', err)
    worker = null
  }
  return worker
}

function callWorker<T>(
  payload: Record<string, unknown>,
  timeoutMs?: number
): Promise<T> {
  const w = getWorker()
  if (!w) return Promise.reject(new Error('Worker unavailable'))
  const id = `prep-${++seq}`
  const liveBatch =
    payload.type === 'batch-quotes' || payload.type === 'batch-align'
  const budget =
    timeoutMs ?? (liveBatch ? PREPARE_RPC_TIMEOUT_MS : 0)
  return new Promise<T>((resolve, reject) => {
    const timer =
      budget > 0
        ? setTimeout(() => {
            if (!pending.has(id)) return
            recyclePrepareWorker(`Prepare worker RPC timeout (${budget}ms)`)
          }, budget)
        : null
    pending.set(id, {
      resolve: (v) => {
        if (timer) clearTimeout(timer)
        resolve(v as T)
      },
      reject: (err) => {
        if (timer) clearTimeout(timer)
        reject(err)
      },
    })
    try {
      w.postMessage({ ...payload, id })
    } catch (err) {
      if (timer) clearTimeout(timer)
      pending.delete(id)
      recyclePrepareWorker('Prepare worker postMessage failed')
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

export function subscribePrepareReady(listener: PrepareReadyListener): () => void {
  readyListeners.add(listener)
  getWorker()
  return () => {
    readyListeners.delete(listener)
  }
}

export function subscribePrepareReadyFailed(
  listener: PrepareReadyFailedListener
): () => void {
  readyFailedListeners.add(listener)
  getWorker()
  return () => {
    readyFailedListeners.delete(listener)
  }
}

export function subscribePrepareWarmDone(listener: PrepareWarmDoneListener): () => void {
  warmDoneListeners.add(listener)
  getWorker()
  return () => {
    warmDoneListeners.delete(listener)
  }
}

export async function enqueuePrepareJob(job: PrepareJob): Promise<void> {
  await callWorker({ type: 'enqueue', job })
}

export async function cancelPrepareBook(args: {
  typeId: string
  resourceKey: string
  bookId: string
}): Promise<void> {
  await callWorker({ type: 'cancel-book', ...args })
}

/** Prioritize open chapter, then neighbors, then the rest of the book. */
export async function enqueueScriptureBookPriority(args: {
  resourceKey: string
  bookId: string
  openChapter: number
  lastChapter: number
  typeId?: string
  /** When false, only open + adjacent (chapter change). Rest waits for lane 2. */
  includeRest?: boolean
}): Promise<void> {
  const typeId = args.typeId ?? 'scripture'
  const { openChapter, lastChapter } = args
  const includeRest = args.includeRest !== false
  const neighbors = [openChapter - 1, openChapter + 1].filter(
    (c) => c >= 1 && c <= lastChapter
  )
  const rest: number[] = []
  if (includeRest) {
    for (let c = 1; c <= lastChapter; c++) {
      if (c === openChapter || neighbors.includes(c)) continue
      rest.push(c)
    }
  }

  const jobs: Array<{ units: number[]; priority: PreparePriority }> = [
    { units: [openChapter], priority: 'interactive' },
    { units: neighbors, priority: 'interactive' },
    { units: rest, priority: 'background' },
  ]

  await cancelPrepareBook({
    typeId,
    resourceKey: args.resourceKey,
    bookId: args.bookId,
  }).catch(() => undefined)

  for (const j of jobs) {
    if (j.units.length === 0) continue
    await enqueuePrepareJob({
      typeId,
      resourceKey: args.resourceKey,
      bookId: args.bookId,
      units: j.units,
      tier: 'both',
      priority: j.priority,
    })
  }
}

export async function batchQuotesInWorker(args: {
  bookCode: string
  links: TranslationWordsLink[]
  originalChapters: OptimizedChapter[]
}): Promise<Array<{ index: number; tokens: unknown[] }>> {
  markScripturePerfStart('quote-build', args.bookCode)
  try {
    // Prefer dedicated warm.worker — never share prepare.worker's scripture queue.
    // On hang/reject, fall back to prepare.worker (not main-thread chapter builds).
    try {
      const { batchQuotesOnWarmWorker } = await import('./warmClient')
      return await batchQuotesOnWarmWorker(args)
    } catch (warmErr) {
      console.warn('[prepareClient] warm batch-quotes failed; using prepare.worker', warmErr)
      return await callWorker({
        type: 'batch-quotes',
        bookCode: args.bookCode,
        links: args.links,
        originalChapters: args.originalChapters,
      })
    }
  } finally {
    markScripturePerfEnd('quote-build', args.bookCode)
  }
}

export async function batchAlignInWorker(
  args: import('../features/helps/batchAlignLinks').BatchAlignLinksArgs
): Promise<import('../features/helps/batchAlignLinks').AlignLinkResult[]> {
  markScripturePerfStart('align-tokens', args.bookCode)
  try {
    try {
      const { batchAlignOnWarmWorker } = await import('./warmClient')
      return await batchAlignOnWarmWorker(args)
    } catch (warmErr) {
      console.warn('[prepareClient] warm batch-align failed; using prepare.worker', warmErr)
      return await callWorker({
        type: 'batch-align',
        ...args,
      })
    }
  } finally {
    markScripturePerfEnd('align-tokens', args.bookCode)
  }
}

/** Fallback path when dedicated warm.worker is unavailable (hardwareConcurrency < 4). */
export async function enqueueWarmJobOnPrepareWorker(
  job: import('../features/warm/warmTypes').WarmJob
): Promise<void> {
  await callWorker({ type: 'warm-job', job })
}

export async function cancelWarmJobsOnPrepareWorker(args: {
  resourceKey?: string
  bookId?: string
  languageCode?: string
}): Promise<void> {
  await callWorker({ type: 'warm-cancel', ...args })
}

export async function getPrepareQueueStats(): Promise<PrepareQueueStats | null> {
  try {
    return await callWorker<PrepareQueueStats>({ type: 'stats' })
  } catch {
    return null
  }
}

// Backward-compatible re-exports for any leftover scripturePrepClient imports.
export { batchQuotesInWorker as batchQuotesInScripturePrepWorker }
