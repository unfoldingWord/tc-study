/**
 * Module-level background-download session. Survives React remounts
 * (Read route pattern changes, StrictMode, mode-toggle panel trees)
 * so the worker and in-flight zip queue are not torn down.
 */

import {
  createInitialDownloadProgress,
  keysForDownloadRetry,
  pulseInFlightDownloadProgress,
  shouldAcceptStartDownload,
  shouldAcceptWorkerMessage,
  shouldRecreateWorkerBeforeStart,
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
const listeners = new Set<StatsListener>()

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
    (type === 'error' &&
      isDownloading &&
      runId > 0 &&
      (messageRunId === undefined || messageRunId === null))
  if (!accept) return

  switch (type) {
    case 'progress':
      if (!isDownloading) return
      emit({
        ...stats,
        isDownloading: true,
        progress: payload as DownloadProgress,
        error: null,
      })
      break
    case 'complete':
      isDownloading = false
      emit({
        ...stats,
        isDownloading: false,
        progress: (payload as DownloadProgress | null) ?? null,
        queue: [],
      })
      break
    case 'error':
      failSession(
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message?: string }).message ?? 'Worker error')
          : 'Worker error'
      )
      console.error('[BG-DL] 🔌 Session Worker error:', payload)
      break
    case 'resource-complete': {
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
    case 'queue-updated':
      emit({
        ...stats,
        queue:
          payload && typeof payload === 'object' && 'queue' in payload
            ? ((payload as { queue?: string[] }).queue ?? stats.queue)
            : stats.queue,
      })
      break
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
  disposeWorker()
  emit({
    ...stats,
    isDownloading: false,
    queue: [],
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
      console.error('[BG-DL] 🔌 Session Worker error:', error)
      failSession(error.message || 'Worker error')
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
    const nextWorker = ensureWorker()
    if (!nextWorker) {
      console.error('[BG-DL] 🔌 Session Worker not available')
      return false
    }
    runId += 1
    isDownloading = true
    nextWorker.postMessage({
      type: 'start',
      payload: {
        resourceKeys,
        skipExisting,
        totalIngredients,
        runId,
      },
    })
    emit({
      isDownloading: true,
      progress: createInitialDownloadProgress(resourceKeys, totalIngredients),
      queue: resourceKeys,
      error: null,
      completedResourceKeys: [],
    })
    return true
  },

  retryLastRun(): boolean {
    const keys = keysForDownloadRetry({
      queue: stats.queue,
      currentResource: stats.progress?.currentResource,
    })
    if (keys.length === 0) return false
    disposeWorker()
    isDownloading = false
    const total = stats.progress?.totalIngredients
    return backgroundDownloadSession.startDownload(
      keys,
      typeof total === 'number' && total > 0 ? total : undefined
    )
  },

  stopDownload(): void {
    runId += 1
    isDownloading = false
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
