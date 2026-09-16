/**
 * Dedicated warm worker — lanes 2/3 (and optional lane-1 overflow).
 * Also owns live lane-1 `batch-quotes` / `batch-align` so scripture prepare
 * on prepare.worker cannot starve on-screen TN/TWL chips.
 *
 * Warm jobs read SoT from IndexedDB (keys/stamps on the wire). Live batch-*
 * still posts links + chapters for the open passage (same as prepare.worker).
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import '../features/prepare/registerPreparers'
import { runWarmJob } from '../features/warm/warmJobs'
import type { WarmInMsg, WarmJob, WarmLane } from '../features/warm/warmTypes'

/** Lazy — keep worker boot light so stats/enqueue respond before quote/align deps load. */
async function runBatchQuotes(msg: Extract<WarmInMsg, { type: 'batch-quotes' }>) {
  const { batchBuildQuoteTokens } = await import('../features/scripture/scripturePrepCore')
  return batchBuildQuoteTokens({
    links: msg.links as Parameters<typeof batchBuildQuoteTokens>[0]['links'],
    originalChapters: msg.originalChapters as Parameters<
      typeof batchBuildQuoteTokens
    >[0]['originalChapters'],
    bookCode: msg.bookCode,
  })
}

async function runBatchAlign(msg: Extract<WarmInMsg, { type: 'batch-align' }>) {
  const { batchAlignLinks } = await import('../features/helps/batchAlignLinks')
  const { id: _id, type: _type, ...args } = msg
  return batchAlignLinks(args as unknown as Parameters<typeof batchAlignLinks>[0])
}

const WorkerScope = (globalThis as typeof globalThis & {
  WorkerGlobalScope?: new () => object
}).WorkerGlobalScope
if (typeof WorkerScope === 'undefined' || !(self instanceof WorkerScope)) {
  console.error('[warm] This file should only run in a Web Worker')
}

const cacheAdapter = new IndexedDBCacheAdapter({
  dbName: 'tc-study-cache',
  storeName: 'cache-entries',
  version: 1,
})

const queue: WarmJob[] = []
let running = false
let cancelToken = 0
let currentJob: WarmJob | null = null

function reply(payload: Record<string, unknown>) {
  ;(self as unknown as { postMessage: (data: unknown) => void }).postMessage(payload)
}

function laneSortKey(lane: WarmLane): number {
  return lane
}

function jobMatchesCancel(
  j: WarmJob,
  args: { resourceKey?: string; bookId?: string; languageCode?: string }
): boolean {
  if (!args.resourceKey && !args.bookId && !args.languageCode) return false
  if (args.resourceKey && j.resourceKey !== args.resourceKey) return false
  if (args.bookId && j.bookId.toLowerCase() !== args.bookId.toLowerCase()) return false
  if (
    args.languageCode &&
    j.languageCode?.toLowerCase() !== args.languageCode.toLowerCase()
  ) {
    return false
  }
  return true
}

function enqueue(job: WarmJob) {
  // Dedupe by jobKey — keep the lower lane (higher priority).
  const existing = queue.findIndex((j) => j.jobKey === job.jobKey)
  if (existing >= 0) {
    if (laneSortKey(job.lane) < laneSortKey(queue[existing]!.lane)) {
      queue[existing] = job
    }
  } else {
    queue.push(job)
  }
  queue.sort((a, b) => laneSortKey(a.lane) - laneSortKey(b.lane))
}

function cancelJobs(args: {
  resourceKey?: string
  bookId?: string
  languageCode?: string
}) {
  for (let i = queue.length - 1; i >= 0; i--) {
    if (!jobMatchesCancel(queue[i]!, args)) continue
    queue.splice(i, 1)
  }
  // Only abort the in-flight job when it matches — avoid killing other langs.
  if (currentJob && jobMatchesCancel(currentJob, args)) {
    cancelToken += 1
  }
}

function queueStats() {
  const byLane: { 1: number; 2: number; 3: number } = { 1: 0, 2: 0, 3: 0 }
  const pending: Array<{
    jobKey: string
    kind: string
    lane: WarmLane
    resourceKey: string
    bookId: string
    chapter?: number
  }> = []
  for (const j of queue) {
    const lane = j.lane as WarmLane
    byLane[lane] += 1
    if (pending.length < 24) {
      pending.push({
        jobKey: j.jobKey,
        kind: j.kind,
        lane: j.lane,
        resourceKey: j.resourceKey,
        bookId: j.bookId,
        chapter:
          j.kind === 'quote-chapter' || j.kind === 'align-chapter'
            ? j.chapter
            : j.kind === 'prepare-unit'
              ? j.unit
              : undefined,
      })
    }
  }
  return {
    queueDepth: queue.length,
    byLane,
    currentJobKey: currentJob?.jobKey ?? null,
    currentKind: currentJob?.kind ?? null,
    currentLane: currentJob?.lane ?? null,
    currentResourceKey: currentJob?.resourceKey ?? null,
    currentBookId: currentJob?.bookId ?? null,
    pending,
  }
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length > 0) {
      const job = queue.shift()!
      currentJob = job
      const token = cancelToken
      try {
        const outcome = await runWarmJob(cacheAdapter, job, () => token !== cancelToken)
        if (token === cancelToken) {
          reply({
            id: 'warm',
            type: 'done',
            jobKey: job.jobKey,
            kind: job.kind,
            lane: job.lane,
            outcome,
          })
        }
      } catch (err) {
        reply({
          id: 'warm',
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        currentJob = null
      }
      // Macrotask yield so live batch-quotes / batch-align can interleave.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    running = false
  }
}

self.onmessage = (event: MessageEvent<WarmInMsg>) => {
  const msg = event.data
  try {
    // Live lane-1: handle immediately (do not queue behind lane 2/3).
    // Async so a wedged sync QuoteMatcher cannot block stats/enqueue forever.
    if (msg.type === 'batch-quotes') {
      void runBatchQuotes(msg)
        .then((result) => reply({ id: msg.id, type: 'ok', result }))
        .catch((err) =>
          reply({
            id: msg.id,
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        )
      return
    }
    if (msg.type === 'batch-align') {
      void runBatchAlign(msg)
        .then((result) => reply({ id: msg.id, type: 'ok', result }))
        .catch((err) =>
          reply({
            id: msg.id,
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        )
      return
    }
    if (msg.type === 'enqueue') {
      enqueue(msg.job)
      reply({ id: msg.id, type: 'ok', result: { queued: true } })
      void pump()
      return
    }
    if (msg.type === 'cancel') {
      cancelJobs(msg)
      reply({ id: msg.id, type: 'ok', result: { cancelled: true } })
      return
    }
    if (msg.type === 'stats') {
      reply({ id: msg.id, type: 'stats', ...queueStats() })
      return
    }
    reply({
      id: (msg as { id: string }).id,
      type: 'error',
      message: 'Unknown warm message type',
    })
  } catch (err) {
    reply({
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
