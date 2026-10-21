import { inferDoor43ResourceTypeId } from '@bt-synergy/resource-catalog'
import { downloadItemFromResourceKey } from './downloadIndicatorVisibility'

export type DownloadQueueRowStatus =
  | 'checking'
  | 'downloading'
  | 'queued'
  | 'completed'
  | 'failed'

/** Map session phase → current-row status (avoid "downloading" for pure validation). */
export function downloadQueueStatusForPhase(
  phase: string | null | undefined,
  fallback: Extract<DownloadQueueRowStatus, 'downloading' | 'failed'> = 'downloading'
): DownloadQueueRowStatus {
  if (
    phase === 'checking' ||
    phase === 'metadata' ||
    phase === 'init' ||
    phase === 'starting'
  ) {
    return 'checking'
  }
  return fallback
}

export interface DownloadQueueRow {
  resourceKey: string
  owner: string
  languageCode: string
  resourceId: string
  /** Canonical short type id when known (`scripture`, `notes`, …); null if unknown. */
  typeId: string | null
  status: DownloadQueueRowStatus
}

export interface DownloadQueueDetailsModel {
  current: DownloadQueueRow | null
  queued: DownloadQueueRow[]
  completed: DownloadQueueRow[]
  /** Full ordered rows for the run (completed + current + queued). */
  rows: DownloadQueueRow[]
  totalCount: number
  queuedCount: number
  completedCount: number
}

function typeIdForResourceId(resourceId: string): string | null {
  const inferred = inferDoor43ResourceTypeId(resourceId)
  return inferred === 'unknown' ? null : inferred
}

export function downloadQueueRowFromKey(
  resourceKey: string,
  status: DownloadQueueRowStatus
): DownloadQueueRow {
  const parsed = downloadItemFromResourceKey(resourceKey)
  if (parsed) {
    return {
      resourceKey,
      owner: parsed.owner,
      languageCode: parsed.languageCode,
      resourceId: parsed.resourceId,
      typeId: typeIdForResourceId(parsed.resourceId),
      status,
    }
  }
  const fallbackId = resourceKey.split('/').pop() || resourceKey
  return {
    resourceKey,
    owner: '',
    languageCode: '',
    resourceId: fallbackId,
    typeId: typeIdForResourceId(fallbackId),
    status,
  }
}

/**
 * Shape session queue + progress into current / queued / completed rows.
 * Queue from the session is the full run order; completion is inferred from
 * `completedResourceKeys` and `currentResource`.
 */
export function buildDownloadQueueDetails(input: {
  queue: readonly string[]
  currentResource?: string | null
  completedResourceKeys?: readonly string[]
  isDownloading?: boolean
  error?: string | null
  /** Coarse run phase — used so completeness checks are not labeled downloading. */
  phase?: string | null
}): DownloadQueueDetailsModel {
  const completedSet = new Set(input.completedResourceKeys ?? [])
  const currentKey = input.currentResource?.trim() || null
  const queue =
    input.queue.length > 0
      ? input.queue
      : currentKey
        ? [currentKey]
        : []

  const activeStatus = (fallback: Extract<DownloadQueueRowStatus, 'downloading' | 'failed'>) =>
    downloadQueueStatusForPhase(input.phase, fallback)

  const rows: DownloadQueueRow[] = queue.map((resourceKey) => {
    let status: DownloadQueueRowStatus = 'queued'
    if (completedSet.has(resourceKey)) {
      status = 'completed'
    } else if (currentKey && resourceKey === currentKey) {
      status =
        input.error && !input.isDownloading
          ? 'failed'
          : activeStatus('downloading')
    } else if (
      input.error &&
      !input.isDownloading &&
      currentKey == null &&
      !completedSet.has(resourceKey)
    ) {
      // Idle failure with no current pointer — leave remaining as queued.
      status = 'queued'
    }
    return downloadQueueRowFromKey(resourceKey, status)
  })

  // Current may be set before queue-updated arrives.
  if (currentKey && !rows.some((row) => row.resourceKey === currentKey)) {
    const status: DownloadQueueRowStatus =
      input.error && !input.isDownloading
        ? 'failed'
        : activeStatus('downloading')
    rows.unshift(downloadQueueRowFromKey(currentKey, status))
  }

  const current =
    rows.find(
      (row) =>
        row.status === 'downloading' ||
        row.status === 'checking' ||
        row.status === 'failed'
    ) ?? null
  const queued = rows.filter((row) => row.status === 'queued')
  const completed = rows.filter((row) => row.status === 'completed')

  return {
    current,
    queued,
    completed,
    rows,
    totalCount: rows.length,
    queuedCount: queued.length,
    completedCount: completed.length,
  }
}

/** Compact primary label: `lang resourceId` (or resourceId alone). */
export function formatDownloadQueueRowLabel(row: Pick<DownloadQueueRow, 'languageCode' | 'resourceId'>): string {
  if (row.languageCode) return `${row.languageCode} ${row.resourceId}`
  return row.resourceId
}

/**
 * Window a long queue for virtualized rendering.
 * Prefer browsing the full list over a hard cap; callers render only [start, end).
 */
export function windowDownloadQueueSlice(input: {
  itemCount: number
  scrollTop: number
  viewportHeight: number
  rowHeight: number
  overscan?: number
}): {
  start: number
  end: number
  offsetY: number
  totalHeight: number
} {
  const rowHeight = Math.max(1, input.rowHeight)
  const overscan = Math.max(0, input.overscan ?? 6)
  const totalHeight = input.itemCount * rowHeight
  if (input.itemCount <= 0) {
    return { start: 0, end: 0, offsetY: 0, totalHeight: 0 }
  }
  const rawStart = Math.floor(Math.max(0, input.scrollTop) / rowHeight)
  const visible = Math.ceil(Math.max(0, input.viewportHeight) / rowHeight)
  const start = Math.max(0, rawStart - overscan)
  const end = Math.min(input.itemCount, rawStart + visible + overscan)
  return {
    start,
    end,
    offsetY: start * rowHeight,
    totalHeight,
  }
}
