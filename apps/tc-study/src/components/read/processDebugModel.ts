/**
 * Pure shaping for the process/debug panel (catalog download + warm + prepare).
 */

import {
  displayDownloadPercent,
  displayIngredientCounts,
  inferDownloadPhase,
  type DownloadRunPhase,
} from '../../features/download/backgroundDownloadRun'
import type { DownloadProgress } from '../../lib/services/BackgroundDownloadManager'
import type { WarmSchedulerStats } from '../../features/warm/warmScheduler'
import type { PrepareQueueStats } from '../../workers/prepareClient'
import {
  explainWarmLaneGate,
  formatProcessStepLine,
  type ProcessStepEvent,
} from '../../features/debug/processStepRing'
import {
  buildDownloadQueueDetails,
  type DownloadQueueDetailsModel,
} from './downloadQueueDetails'

export type ProcessWorkerId = 'catalog-download' | 'warm' | 'prepare'

export interface ProcessWorkerSection {
  id: ProcessWorkerId
  /** Compact mono badge: pending / depth / phase. */
  badge: string
  /** Active step or blocked reason. */
  active: string | null
  /** Ordered detail lines (jobKey, lane, resource…). */
  lines: string[]
}

export interface ProcessDebugModel {
  download: DownloadQueueDetailsModel
  phase: DownloadRunPhase
  completed: number
  total: number
  percent: number
  blockedReason: string | null
  lastActivityLabel: string | null
  sections: ProcessWorkerSection[]
  /** Newest-last step log for the scrollable console. */
  eventLog: string[]
}

export type WarmWorkerQueueStats = {
  queueDepth: number
  byLane: { 1: number; 2: number; 3: number }
  currentJobKey?: string | null
  currentKind?: string | null
  currentLane?: number | null
  currentResourceKey?: string | null
  currentBookId?: string | null
  pending?: Array<{
    jobKey: string
    kind: string
    lane: number
    resourceKey: string
    bookId: string
    chapter?: number
  }>
}

export function formatActivityAge(lastActivityAt: number | null | undefined, now = Date.now()): string | null {
  if (lastActivityAt == null || lastActivityAt <= 0) return null
  const sec = Math.max(0, Math.floor((now - lastActivityAt) / 1000))
  if (sec < 60) return `${sec}s`
  const min = Math.floor(sec / 60)
  return `${min}m ${sec % 60}s`
}

export function buildCatalogDownloadSection(input: {
  queue: readonly string[]
  completedResourceKeys: readonly string[]
  isDownloading: boolean
  error: string | null
  progress?: DownloadProgress | null
  blockedReason?: string | null
  lastActivityAt?: number | null
  recentSteps?: readonly ProcessStepEvent[]
  now?: number
}): ProcessWorkerSection {
  const phase = inferDownloadPhase({
    phase: input.progress?.phase,
    isDownloading: input.isDownloading,
    error: input.error,
    currentIngredient: input.progress?.currentIngredient,
  })
  const useIngredients =
    input.progress?.totalIngredients !== undefined && input.progress.totalIngredients > 0
  const rawCompleted = useIngredients
    ? (input.progress?.completedIngredients || 0)
    : (input.progress?.completedResources || 0)
  const rawTotal = useIngredients
    ? (input.progress?.totalIngredients || 0)
    : (input.progress?.totalResources || 0)
  const { completed, total } = displayIngredientCounts({
    completed: rawCompleted,
    total: rawTotal,
  })
  const percent = displayDownloadPercent({
    isDownloading: input.isDownloading,
    completed,
    total,
    reportedOverall: input.progress?.overallProgress,
    currentIngredient: input.progress?.currentIngredient,
  })
  const age = formatActivityAge(input.lastActivityAt ?? input.progress?.lastActivityAt, input.now)
  const lines: string[] = []
  if (input.progress?.currentResource) {
    lines.push(`key ${input.progress.currentResource}`)
  }
  lines.push(`phase ${phase}`)
  if (input.progress?.currentIngredient) {
    lines.push(`ingredient ${input.progress.currentIngredient}`)
  }
  lines.push(`ingredients ${completed}/${total} · ${percent}%`)
  if (input.blockedReason) lines.push(`blocked ${input.blockedReason}`)
  else if (input.error) lines.push(`error ${input.error}`)
  if (age) lines.push(`since-progress ${age}`)

  const remaining = input.queue.filter((k) => !input.completedResourceKeys.includes(k))
  for (const key of remaining.slice(0, 16)) {
    const status =
      key === input.progress?.currentResource
        ? 'run'
        : input.completedResourceKeys.includes(key)
          ? 'done'
          : 'pending'
    lines.push(`${status} ${key}`)
  }
  if (remaining.length > 16) lines.push(`… +${remaining.length - 16}`)

  const catalogSteps = (input.recentSteps ?? []).filter(
    (e) => e.worker === 'catalog-download' || e.worker === 'session'
  )
  for (const event of catalogSteps.slice(-12)) {
    lines.push(formatProcessStepLine(event, input.now))
  }

  return {
    id: 'catalog-download',
    badge: `${completed}/${total} · ${percent}% · ${phase}`,
    active: input.blockedReason || (input.isDownloading ? phase : input.error ? 'error' : null),
    lines,
  }
}

export function buildWarmSection(input: {
  scheduler: WarmSchedulerStats
  workerQueue?: WarmWorkerQueueStats | null
  now?: number
}): ProcessWorkerSection {
  const s = input.scheduler
  const w = input.workerQueue
  const lines: string[] = []
  if (w?.currentJobKey) {
    lines.push(
      `run L${w.currentLane ?? '?'} ${w.currentKind ?? '?'} ${w.currentJobKey}`
    )
    if (w.currentResourceKey) {
      lines.push(
        `  ${w.currentResourceKey}${w.currentBookId ? ` / ${w.currentBookId}` : ''}`
      )
    }
  }
  const l2 = explainWarmLaneGate(s.lane2Blocked)
  const l3 = explainWarmLaneGate(s.lane3Blocked)
  if (l2) lines.push(l2)
  else if (s.lane2Blocked) lines.push(`L2 ${s.lane2Blocked}`)
  if (l3) lines.push(l3)
  else if (s.lane3Blocked) lines.push(`L3 ${s.lane3Blocked}`)
  if (!s.lane1Drained) {
    const owners = s.lane1BusyOwnerSample?.length
      ? s.lane1BusyOwnerSample.join(',')
      : '?'
    lines.push(`L1 busy owners=[${owners}]`)
  }
  if (w) {
    lines.push(`q ${w.queueDepth} · L1:${w.byLane[1]} L2:${w.byLane[2]} L3:${w.byLane[3]}`)
  }
  const pendingJobs = w?.pending?.length
    ? w.pending
    : s.pendingJobKeySample.map((jobKey) => ({
        jobKey,
        kind: '?',
        lane: 0,
        resourceKey: '',
        bookId: '',
      }))
  for (const job of pendingJobs.slice(0, 20)) {
    const chap =
      typeof job.chapter === 'number' ? ` c${job.chapter}` : job.bookId ? ` ${job.bookId}` : ''
    lines.push(
      `pend L${job.lane || '?'} ${job.kind} ${job.resourceKey || job.jobKey}${chap}`
    )
  }
  if ((w?.pending?.length ?? s.pendingJobKeys) > pendingJobs.length) {
    lines.push(`… +${(w?.pending?.length ?? s.pendingJobKeys) - pendingJobs.length}`)
  }
  for (const o of (s.recentOutcomes ?? []).slice(-10)) {
    const age = formatActivityAge(o.t, input.now) ?? '?'
    lines.push(`out -${age} ${o.outcome} ${o.jobKey}`)
  }
  const gate = s.lane2Blocked || s.lane3Blocked
  return {
    id: 'warm',
    badge: `pending ${s.pendingJobKeys} · ${s.dedicatedWorker ? 'dedicated' : 'prepare'} · L1 ${
      s.lane1Drained ? 'ok' : 'busy'
    }`,
    active: w?.currentJobKey ?? gate,
    lines,
  }
}

export function buildPrepareSection(
  stats: PrepareQueueStats | null,
  now = Date.now()
): ProcessWorkerSection {
  if (!stats) {
    return {
      id: 'prepare',
      badge: 'idle',
      active: null,
      lines: [],
    }
  }
  const lines: string[] = []
  if (stats.currentPrepare) {
    const p = stats.currentPrepare
    lines.push(
      `run ${p.priority} ${p.typeId} ${p.resourceKey} ${p.bookId} [${p.units.join(',')}] ${p.tier}`
    )
  }
  if (stats.currentWarmJobKey) {
    lines.push(
      `warm ${stats.currentWarmKind ?? '?'} L${stats.currentWarmLane ?? '?'} ${stats.currentWarmJobKey}`
    )
  }
  for (const p of stats.preparePending ?? []) {
    lines.push(
      `prepQ ${p.priority} ${p.typeId} ${p.resourceKey} ${p.bookId} [${p.units.join(',')}]`
    )
  }
  for (const w of stats.warmPending ?? []) {
    lines.push(`warmQ L${w.lane} ${w.kind} ${w.resourceKey} ${w.bookId}`)
  }
  for (const o of (stats.recentOutcomes ?? []).slice(-10)) {
    const age = formatActivityAge(o.t, now) ?? '?'
    lines.push(`out -${age} ${o.step} ${o.detail}`)
  }
  return {
    id: 'prepare',
    badge: `prep ${stats.prepareDepth} · warm ${stats.warmDepth}`,
    active: stats.currentPrepare
      ? `${stats.currentPrepare.resourceKey} ${stats.currentPrepare.bookId}`
      : stats.currentWarmJobKey,
    lines,
  }
}

export function buildProcessEventLog(
  events: readonly ProcessStepEvent[],
  now = Date.now(),
  limit = 60
): string[] {
  const slice = events.length > limit ? events.slice(-limit) : events
  return slice.map((e) => formatProcessStepLine(e, now))
}

export function buildProcessDebugModel(input: {
  queue: readonly string[]
  completedResourceKeys: readonly string[]
  isDownloading: boolean
  error: string | null
  progress?: DownloadProgress | null
  blockedReason?: string | null
  lastActivityAt?: number | null
  recentSteps?: readonly ProcessStepEvent[]
  warm: WarmSchedulerStats
  warmWorkerQueue?: WarmWorkerQueueStats | null
  prepare: PrepareQueueStats | null
  now?: number
}): ProcessDebugModel {
  const now = input.now ?? Date.now()
  const phase = inferDownloadPhase({
    phase: input.progress?.phase,
    isDownloading: input.isDownloading,
    error: input.error,
    currentIngredient: input.progress?.currentIngredient,
  })
  const download = buildDownloadQueueDetails({
    queue: input.queue,
    currentResource: input.progress?.currentResource,
    completedResourceKeys: input.completedResourceKeys,
    isDownloading: input.isDownloading,
    error: input.error,
    phase,
  })
  const useIngredients =
    input.progress?.totalIngredients !== undefined && input.progress.totalIngredients > 0
  const rawCompleted = useIngredients
    ? (input.progress?.completedIngredients || 0)
    : (input.progress?.completedResources || 0)
  const rawTotal = useIngredients
    ? (input.progress?.totalIngredients || 0)
    : (input.progress?.totalResources || 0)
  const { completed, total } = displayIngredientCounts({
    completed: rawCompleted,
    total: rawTotal,
  })
  const percent = displayDownloadPercent({
    isDownloading: input.isDownloading,
    completed,
    total,
    reportedOverall: input.progress?.overallProgress,
    currentIngredient: input.progress?.currentIngredient,
  })
  const catalog = buildCatalogDownloadSection({ ...input, now })
  const warm = buildWarmSection({
    scheduler: input.warm,
    workerQueue: input.warmWorkerQueue,
    now,
  })
  const prepare = buildPrepareSection(input.prepare, now)

  return {
    download,
    phase,
    completed,
    total,
    percent,
    blockedReason: input.blockedReason ?? null,
    lastActivityLabel: formatActivityAge(
      input.lastActivityAt ?? input.progress?.lastActivityAt,
      now
    ),
    sections: [catalog, warm, prepare],
    eventLog: buildProcessEventLog(input.recentSteps ?? [], now),
  }
}
