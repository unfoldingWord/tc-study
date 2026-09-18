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
  DOWNLOAD_WORKER_STUCK_STARTING_MESSAGE,
  createInitialDownloadProgress,
  downloadBlockedReason,
  inferDownloadPhase,
  keysForDownloadRetry,
  pulseInFlightDownloadProgress,
  shouldAcceptStartDownload,
  shouldAcceptWorkerMessage,
  shouldFallbackOnWorkerError,
  shouldFallbackStuckStarting,
  shouldRecreateWorkerBeforeStart,
  shouldRunExtractOnThisThread,
  applyDiscoveredIngredientTotal,
  totalIngredientsForResourceKeys,
} from './backgroundDownloadRun'
import type { DownloadProgress } from '../../lib/services/BackgroundDownloadManager'
import {
  createProcessStepRing,
  listProcessSteps,
  pushProcessStep,
  type ProcessStepEvent,
} from '../debug/processStepRing'

export interface BackgroundDownloadStats {
  isDownloading: boolean
  progress: DownloadProgress | null
  queue: string[]
  error: string | null
  /** Keys whose zip finished extracting in the current/last run (warm handoff). */
  completedResourceKeys: string[]
  /** Epoch ms of last accepted progress/ready/queue pulse. */
  lastActivityAt: number | null
  /** Why the UI may look frozen (error, stall, or quiet phase). */
  blockedReason: string | null
  /** Recent step events for the process debug console (newest last). */
  recentSteps: ProcessStepEvent[]
}

type StatsListener = (stats: BackgroundDownloadStats) => void

const IDLE_STATS: BackgroundDownloadStats = {
  isDownloading: false,
  progress: null,
  queue: [],
  error: null,
  completedResourceKeys: [],
  lastActivityAt: null,
  blockedReason: null,
  recentSteps: [],
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
/** Progress / queue / resource-complete / step — excludes `ready`. */
let workerProgressCount = 0
let runStartedAt = 0
let lastResourceKeys: string[] = []
let lastTotalIngredients: number | undefined
let lastActivityAt: number | null = null
const stepRing = createProcessStepRing()
const listeners = new Set<StatsListener>()

function touchActivity(): void {
  lastActivityAt = Date.now()
}

function recordStep(
  step: string,
  detail?: string,
  workerId: ProcessStepEvent['worker'] = 'catalog-download'
): void {
  pushProcessStep(stepRing, { worker: workerId, step, detail })
}

function withDebugFields(
  next: Omit<BackgroundDownloadStats, 'lastActivityAt' | 'blockedReason' | 'recentSteps'> &
    Partial<Pick<BackgroundDownloadStats, 'lastActivityAt' | 'blockedReason' | 'recentSteps'>>
): BackgroundDownloadStats {
  const activity = next.lastActivityAt ?? lastActivityAt
  const progress = next.progress
    ? {
        ...next.progress,
        phase: inferDownloadPhase({
          phase: next.progress.phase,
          isDownloading: next.isDownloading,
          error: next.error,
          currentIngredient: next.progress.currentIngredient,
        }),
        lastActivityAt: activity ?? next.progress.lastActivityAt,
      }
    : next.progress
  return {
    ...next,
    progress,
    lastActivityAt: activity,
    blockedReason: downloadBlockedReason({
      isDownloading: next.isDownloading,
      error: next.error,
      phase: progress?.phase,
      lastActivityAt: activity,
      now: Date.now(),
    }),
    recentSteps: next.recentSteps ?? listProcessSteps(stepRing),
  }
}

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
    recordStep('stall-timeout', DOWNLOAD_STALL_MESSAGE, 'session')
    failSession(DOWNLOAD_STALL_MESSAGE)
  }, DOWNLOAD_STALL_TIMEOUT_MS)
}

/**
 * No progress after start — fall back even if the isolate posted `ready`.
 * Ready alone used to clear this timer and leave phase at `starting` for minutes.
 */
function bumpReadyWatchdog(
  startedRunId: number,
  resourceKeys: string[],
  totalIngredients?: number
): void {
  clearReadyWatchdog()
  readyTimer = setTimeout(() => {
    if (!isDownloading || startedRunId !== runId) return
    const phase = stats.progress?.phase ?? 'starting'
    if (
      !shouldFallbackStuckStarting({
        isDownloading: true,
        workerProgressCount,
        phase,
        startedAt: runStartedAt,
        now: Date.now(),
      })
    ) {
      return
    }
    const detail =
      workerMessageCount > 0
        ? `ready+no-progress · ${phase}`
        : `no-worker-messages · ${phase}`
    recordStep('worker-silent-fallback', detail, 'session')
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
  const silenceMsg =
    workerProgressCount === 0 && workerMessageCount > 0
      ? DOWNLOAD_WORKER_STUCK_STARTING_MESSAGE
      : DOWNLOAD_WORKER_SILENCE_MESSAGE
  recordStep('main-thread-fallback', silenceMsg, 'session')
  emit({
    ...stats,
    isDownloading: true,
    error: silenceMsg,
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

function emit(
  next: Omit<BackgroundDownloadStats, 'lastActivityAt' | 'blockedReason' | 'recentSteps'> &
    Partial<Pick<BackgroundDownloadStats, 'lastActivityAt' | 'blockedReason' | 'recentSteps'>>
): void {
  stats = withDebugFields(next)
  for (const listener of listeners) listener(stats)
}

function handleWorkerMessage(event: MessageEvent): void {
  const { type, payload, runId: messageRunId } = event.data as {
    type: string
    payload:
      | DownloadProgress
      | { message?: string; queue?: string[]; step?: string; detail?: string }
      | null
    runId?: unknown
  }

  const accept =
    shouldAcceptWorkerMessage(runId, messageRunId) ||
    (type === 'ready' && isDownloading) ||
    (type === 'step' && isDownloading) ||
    (type === 'error' &&
      isDownloading &&
      runId > 0 &&
      (messageRunId === undefined || messageRunId === null))
  if (!accept) return

  switch (type) {
    case 'ready':
      workerMessageCount += 1
      touchActivity()
      // Do NOT clear ready watchdog — wait for first progress (see stuck-starting).
      recordStep('worker-ready', `msgs=${workerMessageCount}`)
      bumpStallWatchdog()
      break
    case 'step': {
      workerMessageCount += 1
      workerProgressCount += 1
      touchActivity()
      clearReadyWatchdog()
      bumpStallWatchdog()
      const stepPayload =
        payload && typeof payload === 'object'
          ? (payload as { step?: string; detail?: string })
          : {}
      if (stepPayload.step) {
        recordStep(stepPayload.step, stepPayload.detail)
        emit({ ...stats, lastActivityAt })
      }
      break
    }
    case 'progress':
      if (!isDownloading) return
      workerMessageCount += 1
      workerProgressCount += 1
      touchActivity()
      clearReadyWatchdog()
      bumpStallWatchdog()
      {
        const progress = payload as DownloadProgress
        const phase = inferDownloadPhase({
          phase: progress?.phase,
          isDownloading: true,
          currentIngredient: progress?.currentIngredient,
        })
        const detailParts = [
          phase,
          progress?.currentResource,
          progress?.currentIngredient,
          typeof progress?.completedIngredients === 'number' &&
          typeof progress?.totalIngredients === 'number'
            ? `${progress.completedIngredients}/${progress.totalIngredients}`
            : null,
        ].filter(Boolean)
        recordStep('progress', detailParts.join(' · ') || undefined)
        emit({
          ...stats,
          isDownloading: true,
          progress,
          error: null,
          lastActivityAt,
        })
      }
      break
    case 'complete':
      isDownloading = false
      touchActivity()
      clearReadyWatchdog()
      clearStallWatchdog()
      recordStep('complete')
      emit({
        ...stats,
        isDownloading: false,
        progress: (payload as DownloadProgress | null) ?? null,
        queue: [],
        lastActivityAt,
      })
      break
    case 'error': {
      const message =
        payload && typeof payload === 'object' && 'message' in payload
          ? String((payload as { message?: string }).message ?? 'Worker error')
          : 'Worker error'
      recordStep('error', message)
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
      workerProgressCount += 1
      touchActivity()
      clearReadyWatchdog()
      const key =
        payload && typeof payload === 'object' && 'resourceKey' in payload
          ? String((payload as { resourceKey?: string }).resourceKey ?? '')
          : ''
      if (!key) break
      recordStep('resource-complete', key)
      const nextKeys = stats.completedResourceKeys.includes(key)
        ? stats.completedResourceKeys
        : [...stats.completedResourceKeys, key]
      emit({
        ...stats,
        completedResourceKeys: nextKeys,
        lastActivityAt,
      })
      break
    }
    case 'queue-updated': {
      workerMessageCount += 1
      workerProgressCount += 1
      touchActivity()
      clearReadyWatchdog()
      const q =
        payload && typeof payload === 'object'
          ? (payload as { queue?: string[]; totalIngredients?: number })
          : {}
      const discoveredTotal = applyDiscoveredIngredientTotal(
        stats.progress?.totalIngredients,
        q.totalIngredients
      )
      recordStep(
        'queue-updated',
        `${(q.queue ?? []).length} keys · ingredients=${discoveredTotal}`
      )
      emit({
        ...stats,
        queue: q.queue ?? stats.queue,
        progress: stats.progress
          ? { ...stats.progress, totalIngredients: discoveredTotal }
          : stats.progress,
        lastActivityAt,
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
    lastActivityAt,
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
    workerProgressCount = 0
    runStartedAt = Date.now()
    lastResourceKeys = [...resourceKeys]
    lastTotalIngredients = totalIngredients
    touchActivity()
    recordStep(
      'start',
      `${resourceKeys.length} keys · seedIngredients=${totalIngredients ?? '?'}`,
      'session'
    )
    emit({
      isDownloading: true,
      progress: createInitialDownloadProgress(resourceKeys, totalIngredients),
      queue: resourceKeys,
      error: null,
      completedResourceKeys: [],
      lastActivityAt,
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
    recordStep('post-start', `runId=${runId}`, 'session')
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
    recordStep('stop', undefined, 'session')
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
      lastActivityAt,
    })
  },

  subscribe(listener: StatsListener): () => void {
    listeners.add(listener)
    const live = isDownloading
      ? withDebugFields({
          ...stats,
          progress: pulseInFlightDownloadProgress(stats.progress, true),
          lastActivityAt,
        })
      : withDebugFields({ ...stats, lastActivityAt })
    listener(live)
    return () => {
      listeners.delete(listener)
    }
  },
}
