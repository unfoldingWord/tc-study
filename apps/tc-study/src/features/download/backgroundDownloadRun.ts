/**
 * Run-id fencing for background-download worker messages.
 * Language-switch stop/start can overlap async worker handlers; stale
 * `progress` must not re-arm UI isDownloading after the active run ends.
 */

import { OBS_STORY_COUNT, resolveObsStoryIds } from '../../lib/obs/obsStoryIds'

/** In-flight run: later completeness check can enqueue; startDownload would reseed 1%. */
export function shouldAcceptStartDownload(isDownloading: boolean): boolean {
  return !isDownloading
}

/** Recreate the worker after a crash so start/retry is not posted to a dead isolate. */
export function shouldRecreateWorkerBeforeStart(input: {
  error: string | null | undefined
  isDownloading: boolean
}): boolean {
  return Boolean(input.error) && !input.isDownloading
}

/**
 * Worker module graph touched `window`/`document` (Vite HMR, a viewer chunk,
 * or prepare). The isolate is dead — do not wait for ready/stall, run here.
 */
export function isWorkerIsolateFailure(message: string | null | undefined): boolean {
  if (!message) return false
  const lower = message.toLowerCase()
  return (
    lower.includes('window is not defined') ||
    lower.includes('document is not defined')
  )
}

/** In-flight run whose worker died on isolate init — fall back immediately. */
export function shouldFallbackOnWorkerError(input: {
  isDownloading: boolean
  message: string | null | undefined
}): boolean {
  return input.isDownloading && isWorkerIsolateFailure(input.message)
}

/**
 * A prior isolate `window` crash must not skip constructing a new Worker.
 * Only run JSZip+USJ on this thread when no Worker object exists.
 */
export function shouldRunExtractOnThisThread(input: {
  workerConstructed: boolean
}): boolean {
  return !input.workerConstructed
}

/** Control-plane fields — progress pulses must not re-render Read parents. */
export function downloadControlSnapshotEqual(
  a: { isDownloading: boolean; queue: readonly string[]; error: string | null },
  b: { isDownloading: boolean; queue: readonly string[]; error: string | null }
): boolean {
  if (a.isDownloading !== b.isDownloading) return false
  if (a.error !== b.error) return false
  if (a.queue.length !== b.queue.length) return false
  return a.queue.every((key, i) => key === b.queue[i])
}

/** Queue first, then the in-flight key — used to retry a failed 0/N run. */
export function keysForDownloadRetry(input: {
  queue?: readonly string[] | null
  currentResource?: string | null
}): string[] {
  if (input.queue && input.queue.length > 0) return [...input.queue]
  if (input.currentResource) return [input.currentResource]
  return []
}

/** True when the worker message belongs to the hook's current run. */
export function shouldAcceptWorkerMessage(
  activeRunId: number,
  messageRunId: unknown
): boolean {
  return (
    typeof messageRunId === 'number' &&
    Number.isFinite(messageRunId) &&
    messageRunId > 0 &&
    messageRunId === activeRunId
  )
}

/** Badge floor while a run is queued/fetching so 0% never sticks. */
export const STARTING_PROGRESS_PERCENT = 1

/** Coarse step for debug UI — not user-facing copy. */
export type DownloadRunPhase =
  | 'starting'
  | 'init'
  | 'metadata'
  | 'checking'
  | 'downloading'
  | 'extracting'
  | 'completing'
  | 'idle'
  | 'error'

export type LoaderProgressHint = {
  loaded?: number
  total?: number
  percentage?: number
  message?: string
}

/** Skip the whole zip when skipExisting and checkResource already agrees. */
export function shouldSkipCompleteResourceDownload(
  skipExisting: boolean,
  isComplete: boolean
): boolean {
  return skipExisting && isComplete
}

/** Honest N/total progress when a complete resource is skipped without a zip. */
export function skippedCompleteResourceProgress(
  ingredientsCount: number,
  resourceKey: string
): LoaderProgressHint {
  const name = resourceKey.split('/').pop() ?? resourceKey
  const total = Math.max(0, ingredientsCount)
  return {
    loaded: total,
    total,
    percentage: 100,
    message: `Skipped ${name} (already cached)`,
  }
}

/** Zip-byte fetch. Loaders send `Downloading zip` with `percentage` as bytes, not books. */
export function isZipByteProgress(progress: LoaderProgressHint): boolean {
  const msg = (progress.message ?? '').trim().toLowerCase()
  return msg === 'downloading zip' || msg.startsWith('downloading zip')
}

/**
 * Books/ingredients written (or skipped as already cached) for this resource.
 * Zip-byte `percentage` must not credit ingredients — that made 52/52 the
 * moment the zip finished while extract was still on `frt`.
 */
export function advanceResourceIngredientProgress(
  ingredientsCount: number,
  peakCompleted: number,
  progress: LoaderProgressHint
): number {
  if (isZipByteProgress(progress)) return peakCompleted
  if (progress.loaded === undefined) return peakCompleted
  const written = Math.min(
    Math.max(0, ingredientsCount),
    Math.max(0, Math.floor(progress.loaded))
  )
  return Math.max(peakCompleted, written)
}

/**
 * Soft % for the current resource only.
 * Zip phase: zip-byte % (may be 100 when the archive lands).
 * Extract phase: written/ingredients — never zip leftovers, so extract of
 * book N of 52 is N/52, not 52/52.
 */
export function currentResourceDisplayPercent(input: {
  progress: LoaderProgressHint
  writtenInResource: number
  ingredientsCount: number
}): number {
  if (isZipByteProgress(input.progress)) {
    const pct = input.progress.percentage
    return typeof pct === 'number' && Number.isFinite(pct)
      ? Math.max(0, Math.min(100, pct))
      : 0
  }
  if (input.ingredientsCount <= 0) return 0
  return Math.max(
    0,
    Math.min(100, (input.writtenInResource / input.ingredientsCount) * 100)
  )
}

/** Zip/extract callback → written count + current-resource soft %. */
export function mapLoaderProgressToResource(input: {
  ingredientsCount: number
  peakCompleted: number
  progress: LoaderProgressHint
}): { writtenInResource: number; currentResourcePercent: number } {
  const writtenInResource = advanceResourceIngredientProgress(
    input.ingredientsCount,
    input.peakCompleted,
    input.progress
  )
  return {
    writtenInResource,
    currentResourcePercent: currentResourceDisplayPercent({
      progress: input.progress,
      writtenInResource,
      ingredientsCount: input.ingredientsCount,
    }),
  }
}

/**
 * Overall % while a resource is in flight. Zip-byte percentages are often too
 * small to floor into an ingredient count, so the indicator would stay at 0/N
 * unless we also scale the current resource's fetch % into the run total.
 */
export function computeInFlightOverallProgress(input: {
  completedIngredients: number
  totalIngredients: number
  currentResourceIngredients: number
  currentResourcePercent?: number
}): number {
  const total = input.totalIngredients
  if (total <= 0) return STARTING_PROGRESS_PERCENT
  const fromCompleted = (input.completedIngredients / total) * 100
  const share = input.currentResourceIngredients / total
  const fromCurrent =
    typeof input.currentResourcePercent === 'number' && input.currentResourcePercent > 0
      ? share * input.currentResourcePercent
      : 0
  return Math.min(
    99,
    Math.max(STARTING_PROGRESS_PERCENT, Math.round(fromCompleted + fromCurrent))
  )
}

/**
 * Display N/total. Completed cannot exceed total; if skip/extract raced past
 * a stale catalog estimate (172/50), raise total so the fraction stays honest.
 */
export function displayIngredientCounts(input: {
  completed: number
  total: number
}): { completed: number; total: number } {
  const completed = Math.max(0, Math.floor(Number(input.completed)) || 0)
  const total = Math.max(0, Math.floor(Number(input.total)) || 0)
  if (completed > total) return { completed, total: completed }
  return { completed, total }
}

/**
 * Badge percent: honor zip overallProgress when completed/total is still 0,
 * and pulse 1% as soon as a run is downloading.
 * 100% is reserved for extract+cache of this run. Zip-byte 100% of the
 * current resource, or `→ book` still in flight, must stay below 100.
 * Completed > stale total (172/50) must not display as 100% mid-run.
 */
export function displayDownloadPercent(input: {
  isDownloading: boolean
  completed: number
  total: number
  reportedOverall?: number
  currentIngredient?: string | null
}): number {
  const { completed, total } = displayIngredientCounts({
    completed: input.completed,
    total: input.total,
  })
  const fromCounts = total > 0 ? Math.round((completed / total) * 100) : 0
  const reported =
    typeof input.reportedOverall === 'number' && Number.isFinite(input.reportedOverall)
      ? input.reportedOverall
      : 0
  let computed = Math.max(fromCounts, reported)
  if (input.isDownloading && computed <= 0) {
    return STARTING_PROGRESS_PERCENT
  }
  // 100% only when the run is actually done. Mid-run zip 100%, extract of
  // the last book, or completed > stale total (172/50) must stay at 99.
  if (input.isDownloading) {
    computed = Math.min(99, computed)
  }
  return Math.min(100, Math.max(0, computed))
}

/**
 * Re-emit a live run after React remount so the badge does not drop to 0
 * while the worker is still fetching (no progress events until the next zip tick).
 */
export function pulseInFlightDownloadProgress<T extends { overallProgress?: number; currentResourceProgress?: number }>(
  progress: T | null,
  isDownloading: boolean
): T | null {
  if (!progress || !isDownloading) return progress
  return {
    ...progress,
    overallProgress: Math.max(progress.overallProgress ?? 0, STARTING_PROGRESS_PERCENT),
    currentResourceProgress: Math.max(
      progress.currentResourceProgress ?? 0,
      STARTING_PROGRESS_PERCENT
    ),
  }
}

/**
 * Metadata fetch only. Do not wrap zip+USJ of a whole UHB/UGNT resource —
 * 39 OT books routinely exceed 3 minutes, and a blocked isolate cannot
 * fire worker setTimeout anyway. Zip idle abort lives in downloadZipball;
 * a dead/blocked worker is caught on the main thread (DOWNLOAD_STALL_*).
 */
export const RESOURCE_DOWNLOAD_TIMEOUT_MS = 180_000

/**
 * Main-thread silence limit. Worker `setTimeout` cannot run if the isolate
 * is blocked (UHB Genesis/Psalms USJ) or already dead (OOM / window crash).
 * Longer than one large Hebrew book; shorter than a 15+ minute frozen 1%.
 */
export const DOWNLOAD_STALL_TIMEOUT_MS = 480_000

export const DOWNLOAD_STALL_MESSAGE =
  'Download stalled (no progress). Tap retry.'

/**
 * If the worker isolate never posts (Cursor embedded browser, failed
 * module graph, `window is not defined` before onerror), do not wait
 * for DOWNLOAD_STALL_TIMEOUT_MS. Fall back to this-thread extract.
 */
export const DOWNLOAD_WORKER_READY_TIMEOUT_MS = 12_000

export const DOWNLOAD_WORKER_SILENCE_MESSAGE =
  'Download worker did not start. Continuing on this thread.'

/** True when start was accepted but the worker has not spoken yet. */
export function shouldFallbackSilentWorker(input: {
  isDownloading: boolean
  workerMessageCount: number
  startedAt: number
  now: number
  readyMs?: number
  /** Constructed Worker still exists — prefer it (Chrome). Stall watchdog covers hangs. */
  workerAlive?: boolean
}): boolean {
  if (!input.isDownloading) return false
  if (input.workerMessageCount > 0) return false
  if (input.workerAlive) return false
  if (input.startedAt <= 0) return false
  return input.now - input.startedAt >= (input.readyMs ?? DOWNLOAD_WORKER_READY_TIMEOUT_MS)
}

/**
 * Worker posted `ready` (module loaded) but never a progress pulse after
 * `start`. Main-thread phase stays `starting` / 1% forever otherwise — the
 * ready message alone clears the silent-worker fallback.
 */
export function shouldFallbackStuckStarting(input: {
  isDownloading: boolean
  /** Progress / queue / resource-complete posts — not `ready`. */
  workerProgressCount: number
  phase?: string | null
  startedAt: number
  now: number
  readyMs?: number
}): boolean {
  if (!input.isDownloading) return false
  if (input.workerProgressCount > 0) return false
  if (input.startedAt <= 0) return false
  const phase = input.phase ?? 'starting'
  if (phase !== 'starting' && phase !== 'init') return false
  return input.now - input.startedAt >= (input.readyMs ?? DOWNLOAD_WORKER_READY_TIMEOUT_MS)
}

export const DOWNLOAD_WORKER_STUCK_STARTING_MESSAGE =
  'Download worker ready but no progress. Continuing on this thread.'

/** Protestant OT books in UHB when catalog ingredients are missing. */
export const UHB_FALLBACK_INGREDIENT_COUNT = 39

/** NT books in UGNT when catalog ingredients are missing. */
export const UGNT_FALLBACK_INGREDIENT_COUNT = 27

/** OBS stories when catalog lists a directory (or zero) ingredient — not 0/1. */
export const OBS_FALLBACK_INGREDIENT_COUNT = OBS_STORY_COUNT

/**
 * True when an in-flight session has not received progress for `stallMs`.
 * Covers silent worker death that never posts `error` / `complete`.
 */
export function shouldFailStalledDownload(input: {
  isDownloading: boolean
  lastProgressAt: number
  now: number
  stallMs?: number
}): boolean {
  if (!input.isDownloading) return false
  if (input.lastProgressAt <= 0) return false
  return input.now - input.lastProgressAt >= (input.stallMs ?? DOWNLOAD_STALL_TIMEOUT_MS)
}

/**
 * Ingredient total for the indicator. Catalog/OL enqueue used to default
 * missing UHB ingredients to 1, so the badge read `0 / 1` for 39 OT books.
 * OBS directory-only manifests list 1 ingredient (`obs` / `./content`) — that
 * is not one story; expand to 50 unless a real per-story list is present.
 */
export function fallbackIngredientCount(
  resourceKey: string,
  listedCount?: number
): number {
  const parts = resourceKey.split('/')
  const lang = (parts[1] ?? '').toLowerCase()
  const id = (parts[2] ?? '').split('#')[0]?.toLowerCase() ?? ''
  if (id === 'obs') {
    if (typeof listedCount === 'number' && listedCount > 1) return listedCount
    return OBS_FALLBACK_INGREDIENT_COUNT
  }
  if (typeof listedCount === 'number' && listedCount > 0) return listedCount
  if (id === 'uhb' || lang === 'hbo') return UHB_FALLBACK_INGREDIENT_COUNT
  if (id === 'ugnt' || lang === 'el-x-koine') return UGNT_FALLBACK_INGREDIENT_COUNT
  return 1
}

/**
 * Ingredient count once catalog metadata is known. OBS expands directory-only
 * manifests via resolveObsStoryIds (same list ObsLoader / completeness use).
 */
export function discoveredIngredientCount(
  resourceKey: string,
  ingredients: Array<{ identifier?: string }> | null | undefined,
  resourceType?: string
): number {
  const id = (resourceKey.split('/')[2] ?? '').split('#')[0]?.toLowerCase() ?? ''
  const isObs = resourceType === 'obs' || id === 'obs'
  if (isObs) {
    const n = resolveObsStoryIds(ingredients ?? []).length
    return fallbackIngredientCount(resourceKey, n > 0 ? n : undefined)
  }
  return fallbackIngredientCount(resourceKey, ingredients?.length)
}

export function totalIngredientsForResourceKeys(
  resourceKeys: readonly string[],
  listedCountByKey?: Readonly<Record<string, number>>
): number {
  return resourceKeys.reduce(
    (sum, key) => sum + fallbackIngredientCount(key, listedCountByKey?.[key]),
    0
  )
}

/**
 * Run total is the sum of known ingredient counts for this run's queued
 * resources. Catalog enqueue often estimates unknown resources as 1 (ULT,
 * TN, …) plus UHB 39 — a frozen 50 — while skip/extract later credit real
 * book counts (66, 39, …) and the badge reads 172/50 100%.
 *
 * Once metadata (or skip-complete) knows a resource's count, that sum is
 * authoritative. The provided catalog estimate is only a floor until then.
 */
export function resolveRunIngredientTotal(input: {
  providedTotal?: number
  discoveredCounts: readonly number[]
}): number {
  const discovered = input.discoveredCounts.reduce(
    (sum, n) => sum + Math.max(0, n),
    0
  )
  const provided =
    typeof input.providedTotal === 'number' && Number.isFinite(input.providedTotal)
      ? Math.max(0, input.providedTotal)
      : 0
  if (input.discoveredCounts.length > 0) return discovered
  return provided
}

/**
 * Raise the run total when a later resource's real count is known.
 * Skip-complete UHB 39 after a 1-book estimate grows total by 38.
 * Never shrinks.
 */
export function growRunIngredientTotal(
  currentTotal: number,
  previousAccounted: number,
  nextCount: number
): number {
  const base = Math.max(0, currentTotal)
  const prev = Math.max(0, previousAccounted)
  const next = Math.max(0, nextCount)
  return base + Math.max(0, next - prev)
}

/** Prefer the worker's discovered total over a stale catalog estimate. */
export function applyDiscoveredIngredientTotal(
  current: number | undefined,
  discovered: number | undefined
): number {
  if (typeof discovered === 'number' && Number.isFinite(discovered) && discovered > 0) {
    return discovered
  }
  if (typeof current === 'number' && Number.isFinite(current) && current > 0) {
    return current
  }
  return 0
}

export function createResourceDownloadTimeoutError(
  resourceKey: string,
  timeoutMs: number
): Error {
  return new Error(`Download timed out after ${timeoutMs}ms: ${resourceKey}`)
}

/** Race a download against a timeout so one hung resource cannot block the queue. */
export async function withResourceDownloadTimeout<T>(
  work: Promise<T>,
  timeoutMs: number,
  resourceKey: string
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      reject(createResourceDownloadTimeoutError(resourceKey, timeoutMs))
    }, timeoutMs)
  })
  try {
    return await Promise.race([work, timeout])
  } finally {
    if (timer !== undefined) clearTimeout(timer)
  }
}

/**
 * Infer a coarse phase from loader message / known fields when the worker
 * omitted an explicit `phase` (older pulses, this-thread fallback).
 */
export function inferDownloadPhase(input: {
  phase?: string | null
  isDownloading?: boolean
  error?: string | null
  currentIngredient?: string | null
  message?: string | null
}): DownloadRunPhase {
  if (input.error && !input.isDownloading) return 'error'
  if (!input.isDownloading) return 'idle'
  if (
    input.phase === 'starting' ||
    input.phase === 'init' ||
    input.phase === 'metadata' ||
    input.phase === 'checking' ||
    input.phase === 'downloading' ||
    input.phase === 'extracting' ||
    input.phase === 'completing' ||
    input.phase === 'idle' ||
    input.phase === 'error'
  ) {
    return input.phase
  }
  const msg = (input.message ?? input.currentIngredient ?? '').toLowerCase()
  if (msg.includes('completeness')) return 'checking'
  if (msg.includes('zip') || msg.startsWith('downloading')) return 'downloading'
  if (msg.includes('extract') || msg.startsWith('processed') || msg.startsWith('skipped')) {
    return 'extracting'
  }
  if (msg.includes('check') || msg.includes('verif')) return 'checking'
  if (msg.includes('metadata')) return 'metadata'
  return 'starting'
}

/**
 * Why the download UI looks frozen: silent worker, long phase, or stall window.
 * Pure — session supplies timestamps.
 */
export function downloadBlockedReason(input: {
  isDownloading: boolean
  error?: string | null
  phase?: string | null
  lastActivityAt?: number | null
  now?: number
  stallMs?: number
}): string | null {
  if (input.error) return input.error
  if (!input.isDownloading) return null
  const now = input.now ?? Date.now()
  const last = input.lastActivityAt ?? 0
  const stallMs = input.stallMs ?? DOWNLOAD_STALL_TIMEOUT_MS
  if (last > 0 && now - last >= stallMs) {
    return DOWNLOAD_STALL_MESSAGE
  }
  const quietMs = last > 0 ? now - last : 0
  if (quietMs >= 15_000) {
    const phase = input.phase || 'starting'
    return `quiet ${Math.round(quietMs / 1000)}s · ${phase}`
  }
  return null
}

/** Initial progress snapshot so the indicator is not stuck with a null / 0% payload. */
export function createInitialDownloadProgress(
  resourceKeys: string[],
  totalIngredients?: number
): {
  currentResource: string | null
  currentResourceProgress: number
  totalResources: number
  completedResources: number
  failedResources: number
  overallProgress: number
  tasks: []
  totalIngredients: number
  completedIngredients: number
  failedIngredients: number
  currentIngredient: undefined
  phase: 'starting'
  lastActivityAt: number
} {
  // Prefer catalog estimate; else UHB/UGNT/OBS fallbacks so the badge is never 0/1
  // while the worker is still in init/metadata for a multi-ingredient zip/prefetch.
  let seededTotal =
    typeof totalIngredients === 'number' && totalIngredients > 0
      ? totalIngredients
      : totalIngredientsForResourceKeys(resourceKeys)
  // OBS directory-only catalogs often enqueue with listedCount=1 — refuse 0/1.
  if (
    seededTotal <= 1 &&
    resourceKeys.length > 0 &&
    resourceKeys.every(
      (k) => (k.split('/')[2] ?? '').split('#')[0]?.toLowerCase() === 'obs'
    )
  ) {
    seededTotal = totalIngredientsForResourceKeys(resourceKeys)
  }
  return {
    currentResource: resourceKeys[0] ?? null,
    currentResourceProgress: STARTING_PROGRESS_PERCENT,
    totalResources: resourceKeys.length,
    completedResources: 0,
    failedResources: 0,
    overallProgress: resourceKeys.length > 0 ? STARTING_PROGRESS_PERCENT : 0,
    tasks: [],
    totalIngredients: seededTotal,
    completedIngredients: 0,
    failedIngredients: 0,
    currentIngredient: undefined,
    phase: 'starting',
    lastActivityAt: Date.now(),
  }
}
