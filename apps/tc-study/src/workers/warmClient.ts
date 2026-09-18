/**
 * Main-thread client for warm.worker.ts.
 * Falls back to prepare.worker warm-job messages when hardwareConcurrency < 4.
 */

import type { WarmJob, WarmJobOutcome, WarmLane } from '../features/warm/warmTypes'

type OkMsg = { id: string; type: 'ok'; result?: unknown }
type ErrMsg = { id: string; type: 'error'; message: string }
type DoneMsg = {
  id: string
  type: 'done'
  jobKey: string
  kind: string
  lane: WarmLane
  outcome?: WarmJobOutcome
}
type StatsMsg = {
  id: string
  type: 'stats'
  queueDepth: number
  byLane: { 1: number; 2: number; 3: number }
  currentJobKey?: string | null
  currentKind?: string | null
  currentLane?: WarmLane | null
  currentResourceKey?: string | null
  currentBookId?: string | null
  pending?: Array<{
    jobKey: string
    kind: string
    lane: WarmLane
    resourceKey: string
    bookId: string
    chapter?: number
  }>
}

export type WarmDoneListener = (msg: DoneMsg) => void

/** Live batch-quotes/align must not hang forever if the worker wedges. */
export const WARM_RPC_TIMEOUT_MS = 8_000

let worker: Worker | null = null
let useDedicated = false
let seq = 0
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>()
const doneListeners = new Set<WarmDoneListener>()

function hardwareOk(): boolean {
  if (typeof navigator === 'undefined') return false
  return (navigator.hardwareConcurrency ?? 0) >= 4
}

function rejectAllPending(reason: string) {
  const err = new Error(reason)
  for (const [, entry] of pending) entry.reject(err)
  pending.clear()
}

/** Terminate a wedged worker so the next RPC can construct a fresh one. */
function recycleDedicatedWorker(reason: string) {
  rejectAllPending(reason)
  try {
    worker?.terminate()
  } catch {
    /* ignore */
  }
  worker = null
  useDedicated = false
}

function getDedicatedWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./warm.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<OkMsg | ErrMsg | DoneMsg | StatsMsg>) => {
      const msg = event.data
      if (msg.type === 'done') {
        for (const listener of doneListeners) listener(msg)
        return
      }
      if (msg.type === 'stats') {
        const entry = pending.get(msg.id)
        if (!entry) return
        pending.delete(msg.id)
        entry.resolve(msg)
        return
      }
      const entry = pending.get(msg.id)
      if (!entry) return
      pending.delete(msg.id)
      if (msg.type === 'ok') entry.resolve(msg.result)
      else entry.reject(new Error(msg.message))
    }
    worker.onerror = (err) => {
      console.warn('[warmClient] worker error', err)
      recycleDedicatedWorker('Warm worker error')
    }
    useDedicated = true
  } catch (err) {
    console.warn('[warmClient] failed to start warm worker', err)
    worker = null
    useDedicated = false
  }
  return worker
}

async function callDedicated<T>(
  payload: Record<string, unknown>,
  timeoutMs: number = WARM_RPC_TIMEOUT_MS
): Promise<T> {
  const w = getDedicatedWorker()
  if (!w) return Promise.reject(new Error('Warm worker unavailable'))
  const id = `warm-${++seq}`
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => {
      if (!pending.has(id)) return
      // Rejects this RPC (and any siblings), then terminates the wedged worker.
      recycleDedicatedWorker(`Warm worker RPC timeout (${timeoutMs}ms)`)
    }, timeoutMs)
    pending.set(id, {
      resolve: (v) => {
        clearTimeout(timer)
        resolve(v as T)
      },
      reject: (err) => {
        clearTimeout(timer)
        reject(err)
      },
    })
    try {
      w.postMessage({ ...payload, id })
    } catch (err) {
      clearTimeout(timer)
      pending.delete(id)
      recycleDedicatedWorker('Warm worker postMessage failed')
      reject(err instanceof Error ? err : new Error(String(err)))
    }
  })
}

/** Lazy import to avoid circular deps with prepareClient. */
async function enqueueViaPrepareWorker(job: WarmJob): Promise<void> {
  const { enqueueWarmJobOnPrepareWorker } = await import('./prepareClient')
  await enqueueWarmJobOnPrepareWorker(job)
}

async function cancelViaPrepareWorker(args: {
  resourceKey?: string
  bookId?: string
  languageCode?: string
}): Promise<void> {
  const { cancelWarmJobsOnPrepareWorker } = await import('./prepareClient')
  await cancelWarmJobsOnPrepareWorker(args)
}

export function subscribeWarmDone(listener: WarmDoneListener): () => void {
  doneListeners.add(listener)
  if (hardwareOk()) getDedicatedWorker()
  return () => {
    doneListeners.delete(listener)
  }
}

/**
 * Live lane-1 quote build — always prefers dedicated warm.worker so scripture
 * prepare on prepare.worker cannot starve chips. Falls back only if Worker
 * construction fails (caller may then use prepare.worker).
 */
export async function batchQuotesOnWarmWorker(args: {
  bookCode: string
  links: unknown[]
  originalChapters: unknown[]
}): Promise<Array<{ index: number; tokens: unknown[] }>> {
  const w = getDedicatedWorker()
  if (!w || !useDedicated) throw new Error('Warm worker unavailable')
  return callDedicated({
    type: 'batch-quotes',
    bookCode: args.bookCode,
    links: args.links,
    originalChapters: args.originalChapters,
  })
}

/** Live lane-1 align — same dedicated-warm preference as batchQuotesOnWarmWorker. */
export async function batchAlignOnWarmWorker(
  args: import('../features/helps/batchAlignLinks').BatchAlignLinksArgs
): Promise<import('../features/helps/batchAlignLinks').AlignLinkResult[]> {
  const w = getDedicatedWorker()
  if (!w || !useDedicated) throw new Error('Warm worker unavailable')
  return callDedicated({
    type: 'batch-align',
    ...args,
  })
}

export async function enqueueWarmJob(job: WarmJob): Promise<void> {
  if (hardwareOk()) {
    const w = getDedicatedWorker()
    if (w && useDedicated) {
      await callDedicated({ type: 'enqueue', job })
      return
    }
  }
  await enqueueViaPrepareWorker(job)
}

export async function cancelWarmJobs(args: {
  resourceKey?: string
  bookId?: string
  languageCode?: string
}): Promise<void> {
  if (hardwareOk() && useDedicated && worker) {
    await callDedicated({ type: 'cancel', ...args }).catch(() => undefined)
    return
  }
  await cancelViaPrepareWorker(args).catch(() => undefined)
}

export async function getWarmQueueStats(): Promise<{
  queueDepth: number
  byLane: { 1: number; 2: number; 3: number }
  currentJobKey?: string | null
  currentKind?: string | null
  currentLane?: WarmLane | null
  currentResourceKey?: string | null
  currentBookId?: string | null
  pending?: Array<{
    jobKey: string
    kind: string
    lane: WarmLane
    resourceKey: string
    bookId: string
    chapter?: number
  }>
} | null> {
  if (hardwareOk() && useDedicated && worker) {
    try {
      const stats = await callDedicated<StatsMsg>({ type: 'stats' })
      return {
        queueDepth: stats.queueDepth,
        byLane: stats.byLane,
        currentJobKey: stats.currentJobKey ?? null,
        currentKind: stats.currentKind ?? null,
        currentLane: stats.currentLane ?? null,
        currentResourceKey: stats.currentResourceKey ?? null,
        currentBookId: stats.currentBookId ?? null,
        pending: stats.pending ?? [],
      }
    } catch {
      return null
    }
  }
  return null
}

export function isDedicatedWarmWorkerActive(): boolean {
  return useDedicated && hardwareOk()
}
