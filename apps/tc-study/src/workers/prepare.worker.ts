/**
 * Generic prepare worker — priority queue over ResourcePreparer jobs.
 *
 * Reads source from IndexedDB inside the worker (no large postMessage payloads).
 *
 * IN:
 *  { id, type: 'enqueue', job: PrepareJob }
 *  { id, type: 'cancel-book', typeId, resourceKey, bookId }
 *  { id, type: 'batch-quotes', bookCode, links, originalChapters }
 *  { id, type: 'batch-align', …BatchAlignLinksArgs }
 *  { id, type: 'warm-job', job: WarmJob }
 *  { id, type: 'warm-cancel', resourceKey?, bookId?, languageCode? }
 *
 * OUT:
 *  { id, type: 'ok', result }
 *  { id, type: 'ready', typeId, resourceKey, bookId, unit, tier }
 *  { id, type: 'ready-failed', typeId, resourceKey, bookId, unit, tier, reason }
 *  { id, type: 'done', jobKey, kind, lane }  // warm job complete
 *  { id, type: 'error', message }
 */

import { IndexedDBCacheAdapter } from '@bt-synergy/cache-adapter-indexeddb'
import { batchAlignLinks, type BatchAlignLinksArgs } from '../features/helps/batchAlignLinks'
import { batchBuildQuoteTokens } from '../features/scripture/scripturePrepCore'
import '../features/prepare/registerPreparers'
import { preparedTiersExist, writePreparedUnit } from '../features/prepare/prepareCache'
import { getPreparer } from '../features/prepare/prepareRegistry'
import type { PrepareTier } from '../features/prepare/prepareKeys'
import { runWarmJob } from '../features/warm/warmJobs'
import type { WarmJob } from '../features/warm/warmTypes'

const WorkerScope = (globalThis as typeof globalThis & {
  WorkerGlobalScope?: new () => object
}).WorkerGlobalScope
if (typeof WorkerScope === 'undefined' || !(self instanceof WorkerScope)) {
  console.error('[prepare] This file should only run in a Web Worker')
}

export type PreparePriority = 'interactive' | 'background'

export interface PrepareJob {
  typeId: string
  resourceKey: string
  bookId: string
  units: number[]
  tier: PrepareTier | 'both'
  priority: PreparePriority
}

type InMsg =
  | { id: string; type: 'enqueue'; job: PrepareJob }
  | {
      id: string
      type: 'cancel-book'
      typeId: string
      resourceKey: string
      bookId: string
    }
  | {
      id: string
      type: 'batch-quotes'
      bookCode: string
      links: Parameters<typeof batchBuildQuoteTokens>[0]['links']
      originalChapters: Parameters<typeof batchBuildQuoteTokens>[0]['originalChapters']
    }
  | ({ id: string; type: 'batch-align' } & BatchAlignLinksArgs)
  | { id: string; type: 'warm-job'; job: WarmJob }
  | {
      id: string
      type: 'warm-cancel'
      resourceKey?: string
      bookId?: string
      languageCode?: string
    }

const cacheAdapter = new IndexedDBCacheAdapter({
  dbName: 'tc-study-cache',
  storeName: 'cache-entries',
  version: 1,
})

const queue: PrepareJob[] = []
const warmQueue: WarmJob[] = []
let running = false
let cancelToken = 0
let warmCancelToken = 0
let currentWarmJob: WarmJob | null = null

function warmJobMatchesCancel(
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

function reply(payload: Record<string, unknown>) {
  ;(self as unknown as { postMessage: (data: unknown) => void }).postMessage(payload)
}

function jobSortKey(j: PrepareJob): number {
  return j.priority === 'interactive' ? 0 : 1
}

function enqueue(job: PrepareJob) {
  if (job.priority === 'interactive') {
    queue.unshift(job)
  } else {
    queue.push(job)
  }
  queue.sort((a, b) => jobSortKey(a) - jobSortKey(b))
}

function cancelBook(typeId: string, resourceKey: string, bookId: string) {
  const book = bookId.toLowerCase()
  for (let i = queue.length - 1; i >= 0; i--) {
    const j = queue[i]!
    if (
      j.typeId === typeId &&
      j.resourceKey === resourceKey &&
      j.bookId.toLowerCase() === book
    ) {
      queue.splice(i, 1)
    }
  }
  cancelToken += 1
}

async function runOne(job: PrepareJob, token: number): Promise<void> {
  const preparer = getPreparer(job.typeId)
  if (!preparer) {
    reply({
      id: 'prep',
      type: 'error',
      message: `No preparer for ${job.typeId}`,
    })
    return
  }
  const ctx = { cacheAdapter }
  const source = await preparer.readSource(ctx, job.resourceKey, job.bookId)
  if (token !== cancelToken) return
  if (source == null) {
    // Never silently no-op — main thread must heal scripture-usj: (or other SoT)
    // before enqueueing again. Without this, light/nav stay warm and full never lands.
    reply({
      id: 'prep',
      type: 'ready-failed',
      typeId: job.typeId,
      resourceKey: job.resourceKey,
      bookId: job.bookId,
      unit: job.units[0] ?? 0,
      tier: job.tier === 'both' ? 'full' : job.tier,
      reason: 'source-missing',
    })
    return
  }

  const tiers: PrepareTier[] =
    job.tier === 'both' ? ['light', 'full'] : [job.tier]

  const replyReady = (unit: number, tier: PrepareTier) => {
    reply({
      id: 'prep',
      type: 'ready',
      typeId: job.typeId,
      resourceKey: job.resourceKey,
      bookId: job.bookId,
      unit,
      tier,
    })
  }

  let wroteNav = false
  for (const unit of job.units) {
    if (token !== cancelToken) return
    // Macrotask yield so live batch-align / batch-quotes can interleave.
    await new Promise<void>((resolve) => setTimeout(resolve, 0))
    const already = await preparedTiersExist(
      cacheAdapter,
      job.typeId,
      job.resourceKey,
      job.bookId,
      unit,
      tiers,
      preparer.version
    )
    if (already) {
      for (const tier of tiers) replyReady(unit, tier)
      continue
    }
    if (!wroteNav && preparer.prepareNav) {
      const { writePreparedNav } = await import('../features/prepare/prepareCache')
      await writePreparedNav(
        cacheAdapter,
        job.typeId,
        job.resourceKey,
        job.bookId,
        preparer.version,
        preparer.prepareNav(source)
      )
      wroteNav = true
    }
    for (const tier of tiers) {
      if (token !== cancelToken) return
      const payload =
        tier === 'light'
          ? preparer.prepareLight(source, unit)
          : preparer.prepareFull(source, unit)
      await writePreparedUnit(
        cacheAdapter,
        job.typeId,
        job.resourceKey,
        job.bookId,
        unit,
        tier,
        preparer.version,
        payload
      )
      replyReady(unit, tier)
    }
  }
}

async function pump() {
  if (running) return
  running = true
  try {
    while (queue.length > 0 || warmQueue.length > 0) {
      // Prefer interactive prepare jobs over warm fallbacks.
      if (queue.length > 0) {
        const job = queue.shift()!
        const token = cancelToken
        try {
          await runOne(job, token)
        } catch (err) {
          reply({
            id: 'prep',
            type: 'error',
            message: err instanceof Error ? err.message : String(err),
          })
        }
        continue
      }
      // Only one warm job per pump turn; macrotask yield so interactive
      // batch-align / batch-quotes posted while we were busy get handled.
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
      if (queue.length > 0) continue
      const warmJob = warmQueue.shift()!
      currentWarmJob = warmJob
      const token = warmCancelToken
      try {
        const outcome = await runWarmJob(cacheAdapter, warmJob, () => token !== warmCancelToken)
        if (token === warmCancelToken) {
          reply({
            id: 'warm',
            type: 'done',
            jobKey: warmJob.jobKey,
            kind: warmJob.kind,
            lane: warmJob.lane,
            outcome,
          })
        }
      } catch (err) {
        reply({
          id: 'prep',
          type: 'error',
          message: err instanceof Error ? err.message : String(err),
        })
      } finally {
        currentWarmJob = null
      }
      await new Promise<void>((resolve) => setTimeout(resolve, 0))
    }
  } finally {
    running = false
  }
}

self.onmessage = (event: MessageEvent<InMsg>) => {
  const msg = event.data
  try {
    if (msg.type === 'enqueue') {
      enqueue(msg.job)
      reply({ id: msg.id, type: 'ok', result: { queued: true } })
      void pump()
      return
    }
    if (msg.type === 'cancel-book') {
      cancelBook(msg.typeId, msg.resourceKey, msg.bookId)
      reply({ id: msg.id, type: 'ok', result: { cancelled: true } })
      return
    }
    if (msg.type === 'batch-quotes') {
      const result = batchBuildQuoteTokens({
        links: msg.links,
        originalChapters: msg.originalChapters,
        bookCode: msg.bookCode,
      })
      reply({ id: msg.id, type: 'ok', result })
      return
    }
    if (msg.type === 'batch-align') {
      const { id: _id, type: _type, ...args } = msg
      const result = batchAlignLinks(args)
      reply({ id: msg.id, type: 'ok', result })
      return
    }
    if (msg.type === 'warm-job') {
      warmQueue.push(msg.job)
      warmQueue.sort((a, b) => a.lane - b.lane)
      reply({ id: msg.id, type: 'ok', result: { queued: true } })
      void pump()
      return
    }
    if (msg.type === 'warm-cancel') {
      const filter = {
        resourceKey: msg.resourceKey,
        bookId: msg.bookId,
        languageCode: msg.languageCode,
      }
      for (let i = warmQueue.length - 1; i >= 0; i--) {
        if (!warmJobMatchesCancel(warmQueue[i]!, filter)) continue
        warmQueue.splice(i, 1)
      }
      // Only abort in-flight warm when it matches the filter.
      if (currentWarmJob && warmJobMatchesCancel(currentWarmJob, filter)) {
        warmCancelToken += 1
      }
      reply({ id: msg.id, type: 'ok', result: { cancelled: true } })
      return
    }
    reply({
      id: (msg as { id: string }).id,
      type: 'error',
      message: 'Unknown message type',
    })
  } catch (err) {
    reply({
      id: msg.id,
      type: 'error',
      message: err instanceof Error ? err.message : String(err),
    })
  }
}
