/**
 * Main-thread client for prepare.worker.ts
 */

import type { OptimizedChapter, TranslationWordsLink } from '@bt-synergy/resource-parsers'
import { markScripturePerfEnd, markScripturePerfStart } from '../features/perf/scripturePerf'
import type { PrepareJob, PreparePriority } from './prepare.worker'
import type { PrepareTier } from '../features/prepare/prepareKeys'

type OkMsg = { id: string; type: 'ok'; result: unknown }
type ErrMsg = { id: string; type: 'error'; message: string }
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

let worker: Worker | null = null
let seq = 0
const pending = new Map<
  string,
  { resolve: (value: unknown) => void; reject: (err: Error) => void }
>()
const readyListeners = new Set<PrepareReadyListener>()
const readyFailedListeners = new Set<PrepareReadyFailedListener>()

function getWorker(): Worker | null {
  if (typeof Worker === 'undefined') return null
  if (worker) return worker
  try {
    worker = new Worker(new URL('./prepare.worker.ts', import.meta.url), {
      type: 'module',
    })
    worker.onmessage = (event: MessageEvent<OkMsg | ErrMsg | ReadyMsg | ReadyFailedMsg>) => {
      const msg = event.data
      if (msg.type === 'ready') {
        for (const listener of readyListeners) listener(msg)
        return
      }
      if (msg.type === 'ready-failed') {
        for (const listener of readyFailedListeners) listener(msg)
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
    }
  } catch (err) {
    console.warn('[prepareClient] failed to start worker', err)
    worker = null
  }
  return worker
}

function callWorker<T>(payload: Record<string, unknown>): Promise<T> {
  const w = getWorker()
  if (!w) return Promise.reject(new Error('Worker unavailable'))
  const id = `prep-${++seq}`
  return new Promise<T>((resolve, reject) => {
    pending.set(id, {
      resolve: (v) => resolve(v as T),
      reject,
    })
    w.postMessage({ ...payload, id })
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
}): Promise<void> {
  const typeId = args.typeId ?? 'scripture'
  const { openChapter, lastChapter } = args
  const neighbors = [openChapter - 1, openChapter + 1].filter(
    (c) => c >= 1 && c <= lastChapter
  )
  const rest: number[] = []
  for (let c = 1; c <= lastChapter; c++) {
    if (c === openChapter || neighbors.includes(c)) continue
    rest.push(c)
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
    return await callWorker({
      type: 'batch-quotes',
      bookCode: args.bookCode,
      links: args.links,
      originalChapters: args.originalChapters,
    })
  } finally {
    markScripturePerfEnd('quote-build', args.bookCode)
  }
}

export async function batchAlignInWorker(
  args: import('../features/helps/batchAlignLinks').BatchAlignLinksArgs
): Promise<import('../features/helps/batchAlignLinks').AlignLinkResult[]> {
  markScripturePerfStart('align-tokens', args.bookCode)
  try {
    return await callWorker({
      type: 'batch-align',
      ...args,
    })
  } finally {
    markScripturePerfEnd('align-tokens', args.bookCode)
  }
}

// Backward-compatible re-exports for any leftover scripturePrepClient imports.
export { batchQuotesInWorker as batchQuotesInScripturePrepWorker }
