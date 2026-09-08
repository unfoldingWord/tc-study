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
}

export type WarmDoneListener = (msg: DoneMsg) => void

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
    }
    useDedicated = true
  } catch (err) {
    console.warn('[warmClient] failed to start warm worker', err)
    worker = null
    useDedicated = false
  }
  return worker
}

async function callDedicated<T>(payload: Record<string, unknown>): Promise<T> {
  const w = getDedicatedWorker()
  if (!w) return Promise.reject(new Error('Warm worker unavailable'))
  const id = `warm-${++seq}`
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (v) => resolve(v as T),
      reject,
    })
    w.postMessage({ ...payload, id })
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
} | null> {
  if (hardwareOk() && useDedicated && worker) {
    try {
      const stats = await callDedicated<StatsMsg>({ type: 'stats' })
      return { queueDepth: stats.queueDepth, byLane: stats.byLane }
    } catch {
      return null
    }
  }
  return null
}

export function isDedicatedWarmWorkerActive(): boolean {
  return useDedicated && hardwareOk()
}
