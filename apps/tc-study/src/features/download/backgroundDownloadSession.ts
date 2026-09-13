/**
 * Module-level background-download session. Survives React remounts
 * (Read route pattern changes, StrictMode, mode-toggle panel trees)
 * so the worker and in-flight zip queue are not torn down.
 */

import {
  DOWNLOAD_STALL_MESSAGE,
  DOWNLOAD_STALL_TIMEOUT_MS,
  DOWNLOAD_WORKER_READY_TIMEOUT_MS,
  DOWNLOAD_WORKER_SILENCE_MESSAGE,
  createInitialDownloadProgress,
  keysForDownloadRetry,
  pulseInFlightDownloadProgress,
  shouldAcceptStartDownload,
  shouldAcceptWorkerMessage,
  shouldFallbackOnWorkerError,
  shouldRecreateWorkerBeforeStart,
  shouldRunExtractOnThisThread,
  applyDiscoveredIngredientTotal,
  totalIngredientsForResourceKeys,
} from './backgroundDownloadRun'
import type { DownloadProgress } from '../../lib/services/BackgroundDownloadManager'

export interface BackgroundDownloadStats {
  isDownloading: boolean
  progress: DownloadProgress | null
  queue: string[]
  error: string | null
  /** Keys whose zip finished extracting in the current/last run (warm handoff). */
  completedResourceKeys: string[]
}

type StatsListener = (stats: BackgroundDownloadStats) => void

const IDLE_STATS: BackgroundDownloadStats = {
  isDownloading: false,
  progress: null,
  queue: [],
  error: null,
  completedResourceKeys: [],
}

let worker: Worker | null = null
let workerConstructCount = 0
let isDownloading = false
let runId = 0
let skipExisting = true
let debug = false
let stats: BackgroundDownloadStats = IDLE_STATS
let stallTimer: ReturnType<typeof setTimeout> | null = null
let readyTimer: ReturnType<typeof setTimeout> | null = null
let workerMessageCount = 0
let lastResourceKeys: string[] = []
let lastTotalIngredients: number | undefined
const listeners = new Set<StatsListener>()

function clearStallWatchdog(): void {
  if (stallTimer == null) return
  clearTimeout(stallTimer)
  stallTimer = null
}

function clearReadyWatchdog(): void {
  if (readyTimer == null) return
  clearTimeout(readyTimer)
  readyTimer = null
}

/** Main-thread timer — survives a dead or blocked download worker. */
function bumpStallWatchdog(): void {
  clearStallWatchdog()
  stallTimer = setTimeout(() => {
    if (!isDownloading) return
    failSession(DOWNLOAD_STALL_MESSAGE)
  }, DOWNLOAD_STALL_TIMEOUT_MS)
}

/** Worker never posted — run extract on this thread instead of sitting at 1%. */
function bumpReadyWatchdog(
  startedRunId: number,
  resourceKeys: string[],
  totalIngredients?: number
): void {
  clearReadyWatchdog()
  readyTimer = setTimeout(() => {
    if (!isDownloading || startedRunId !== runId) return
    if (workerMessageCount > 0) return
    // Chrome: isolate is alive — do not kill it for a slow first post.
    // Embedded browsers that never construct a worker already fail in startDownload.
    if (worker) return
    void startMainThreadFallback(startedRunId, resourceKeys, totalIngredients)
  }, DOWNLOAD_WORKER_READY_TIMEOUT_MS)
}

async function startMainThreadFallback(
  startedRunId: number,
  resourceKeys: string[],
  totalIngredients?: number
): Promise<void> {
  if (!isDownloading || startedRunId !== runId) return
  disposeWorker()
  emit({
    ...stats,
    isDownloading: true,
    error: DOWNLOAD_WORKER_SILENCE_MESSAGE,
  })
  try {
    const { runBackgroundDownloadOnThisThread } = await import(
      './runBackgroundDownloadOnThisThread'
    )
    await runBackgroundDownloadOnThisThread({
      resourceKeys,
      skipExisting,
      totalIngredients,
      runId: startedRunId,
      post: (message) => {
        handleWorkerMessage({ data: message } as MessageEvent)
      },
      isCurrentRun: () => isDownloading && runId === startedRunId,
    })
  } catch (error) {
    if (runId !== startedRunId) return
    failSession(error instanceof Error ? error.message : String(error))
  }
}

function emit(next: BackgroundDownloadStats): void {
  stats = next
  for (const listener of listeners) listener(stats)
}

function handleWorkerMessage(event: MessageEvent): void {
  const { type, payload, runId: messageRunId } = event.data as {
    type: string
    payload: DownloadProgress | { message?: string; queue?: string[] } | null
    runId?: unknown
  }

  const accept =
    shouldAcceptWorkerMessage(runId, messageRunId) ||
    (type === 'ready' && isDownloading) ||
    (type === 'error' &&
      isDownloading &&
      runId > 0 &&
      (messageRunId === undefined || messageRunId === null))
  if (!accept) return

  switch (type) {
    case 'ready':
      workerMessageCount += 1
      clearReadyWatchdog()
      bumpStallWatchdog()
      break
    case 'progress':
      if (!isDownloading) return
      workerMessageCount += 1
      clearReadyWatchdog()
      bumpStallWatchdog()
      emit({
        ...stats,
        isDownloading: true,
        progress: payload as DownloadProgress,
        error: null,
      })
      break
    case 'complete':
      isDownloading = false
      clearReadyWatchdog()
      clearStallWatchdog()
      emit({
        ...stats,
        isDownloading: false,
        progress: (payload as DownloadProgress | null) ?? null,
        queue: [],
      })
      break
    case 'error': {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message?: string }).message ?? 'Worker error')
          : 'Worker error'
      if (
        shouldFallbackOnWorkerError({ isDownloading, message }) &&
        lastResourceKeys.length > 0
      ) {
        void startMainThreadFallback(runId, lastResourceKeys, lastTotalIngredients)
        break
      }
      failSession(message)
      console.error('[BG-DL] 🔌 Session Worker error:', payload)
      break
    }
    case 'resource-complete': {
      workerMessageCount += 1
      clearReadyWatchdog()
      const key =
        payload && typeof payload === 'object' && 'resourceKey' in payload
          ? String((payload as { resourceKey?: string }).resourceKey ?? '')
          : ''
      if (!key) break
      const nextKeys = stats.completedResourceKeys.includes(key)
        ? stats.completedResourceKeys
        : [...stats.completedResourceKeys, key]
      emit({
        ...stats,
        completedResourceKeys: nextKeys,
      })
      break
    }
    case 'queue-updated': {
      workerMessageCount += 1
      clearReadyWatchdog()
      const q =
        payload && typeof payload === 'object'
          ? (payload as { queue?: string[]; totalIngredients?: number })
          : {}
      const discoveredTotal = applyDiscoveredIngredientTotal(
        stats.progress?.totalIngredients,
        q.totalIngredients
      )
      emit({
        ...stats,
        queue: q.queue ?? stats.queue,
        progress: stats.progress
          ? { ...stats.progress, totalIngredients: discoveredTotal }
          : stats.progress,
      })
      break
    }
    default:
      if (debug) console.warn('[BG-DL] 🔌 Session Unknown message type:', type)
  }
}

function disposeWorker(): void {
  if (!worker) return
  worker.onmessage = null
  worker.onerror = null
  try {
    worker.terminate()
  } catch {
    /* already dead */
  }
  worker = null
}

function failSession(message: string): void {
  runId += 1
  isDownloading = false
  clearReadyWatchdog()
  clearStallWatchdog()
  disposeWorker()
  emit({
    ...stats,
    isDownloading: false,
    error: message,
  })
}

function ensureWorker(): Worker | null {
  if (worker) return worker
  try {
    worker = new Worker(new URL('../../workers/backgroundDownload.worker.ts', import.meta.url), {
      type: 'module',
    })
    workerConstructCount += 1
    worker.onmessage = handleWorkerMessage
    worker.onerror = (error) => {
      const message = error.message || 'Worker error'
      console.error('[BG-DL] 🔌 Session Worker error:', error)
      if (
        shouldFallbackOnWorkerError({ isDownloading, message }) &&
        lastResourceKeys.length > 0
      ) {
        void startMainThreadFallback(runId, lastResourceKeys, lastTotalIngredients)
        return
      }
      failSession(message)
    }
    worker.onmessageerror = () => {
      if (
        shouldFallbackOnWorkerError({
          isDownloading,
          message: 'window is not defined',
        }) &&
        lastResourceKeys.length > 0
      ) {
        void startMainThreadFallback(runId, lastResourceKeys, lastTotalIngredients)
        return
      }
      failSession('Worker message error')
    }
    return worker
  } catch (error) {
    console.error('[BG-DL] 🔌 Session Failed to initialize worker:', error)
    emit({
      ...stats,
      error: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

export function getBackgroundDownloadWorkerConstructCount(): number {
  return workerConstructCount
}

export function getBackgroundDownloadSession() {
  return backgroundDownloadSession
}

export const backgroundDownloadSession = {
  getStats(): BackgroundDownloadStats {
    return stats
  },

  isBusy(): boolean {
    return isDownloading
  },

  configure(options: { skipExisting?: boolean; debug?: boolean }): void {
    if (options.skipExisting !== undefined) skipExisting = options.skipExisting
    if (options.debug !== undefined) debug = options.debug
  },

  startDownload(resourceKeys: string[], totalIngredients?: number): boolean {
    if (shouldRecreateWorkerBeforeStart({ error: stats.error, isDownloading })) {
      disposeWorker()
    }
    if (!shouldAcceptStartDownload(isDownloading)) return false
    runId += 1
    isDownloading = true
    workerMessageCount = 0
    lastResourceKeys = [...resourceKeys]
    lastTotalIngredients = totalIngredients
    emit({
      isDownloading: true,
      progress: createInitialDownloadProgress(resourceKeys, totalIngredients),
      queue: resourceKeys,
      error: null,
      completedResourceKeys: [],
    })
    bumpStallWatchdog()
    // Always try a Worker first. A prior isolate `window` crash must not
    // skip construct — Chrome can host a new isolate after dispose.
    if (shouldRunExtractOnThisThread({ workerConstructed: Boolean(ensureWorker()) })) {
      void startMainThreadFallback(runId, resourceKeys, totalIngredients)
      return true
    }
    const nextWorker = worker
    if (!nextWorker) {
      void startMainThreadFallback(runId, resourceKeys, totalIngredients)
      return true
    }
    nextWorker.postMessage({
      type: 'start',
      payload: {
        resourceKeys,
        skipExisting,
        totalIngredients,
        runId,
      },
    })
    bumpReadyWatchdog(runId, resourceKeys, totalIngredients)
    return true
  },

  retryLastRun(): boolean {
    const keys = keysForDownloadRetry({
      queue: stats.queue.length > 0 ? stats.queue : lastResourceKeys,
      currentResource: stats.progress?.currentResource,
    })
    if (keys.length === 0) return false
    disposeWorker()
    isDownloading = false
    const listed = stats.progress?.totalIngredients
    const inferred = totalIngredientsForResourceKeys(keys)
    return backgroundDownloadSession.startDownload(
      keys,
      Math.max(typeof listed === 'number' && listed > 0 ? listed : 0, inferred)
    )
  },

  stopDownload(): void {
    runId += 1
    isDownloading = false
    clearReadyWatchdog()
    clearStallWatchdog()
    if (worker) {
      worker.postMessage({
        type: 'stop',
        payload: { runId },
      })
    }
    emit({
      isDownloading: false,
      progress: null,
      queue: [],
      error: null,
      completedResourceKeys: stats.completedResourceKeys,
    })
  },

  subscribe(listener: StatsListener): () => void {
    listeners.add(listener)
    const live = isDownloading
      ? {
          ...stats,
          progress: pulseInFlightDownloadProgress(stats.progress, true),
        }
      : stats
    listener(live)
    return () => {
      listeners.delete(listener)
    }
  },
}
