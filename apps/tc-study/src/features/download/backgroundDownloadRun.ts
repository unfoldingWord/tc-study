/**
 * Run-id fencing for background-download worker messages.
 * Language-switch stop/start can overlap async worker handlers; stale
 * `progress` must not re-arm UI isDownloading after the active run ends.
 */

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

/**
 * Map a loader progress callback into completed ingredients for the current resource.
 * Uses a peak so zip-byte soft progress (percentage) does not regress when extraction
 * starts reporting low ingredient loaded counts.
 */
export function advanceResourceIngredientProgress(
  ingredientsCount: number,
  peakCompleted: number,
  progress: { loaded?: number; total?: number; percentage?: number }
): number {
  let fromCallback = 0
  if (
    progress.loaded !== undefined &&
    progress.total !== undefined &&
    progress.total > 0
  ) {
    fromCallback = Math.floor((progress.loaded / progress.total) * ingredientsCount)
  }
  if (typeof progress.percentage === 'number' && progress.percentage > 0) {
    fromCallback = Math.max(
      fromCallback,
      Math.floor((progress.percentage / 100) * ingredientsCount)
    )
  }
  return Math.max(peakCompleted, fromCallback)
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
 * Badge percent: honor zip overallProgress when completed/total is still 0,
 * and pulse 1% as soon as a run is downloading.
 */
export function displayDownloadPercent(input: {
  isDownloading: boolean
  completed: number
  total: number
  reportedOverall?: number
}): number {
  const fromCounts =
    input.total > 0 ? Math.round((input.completed / input.total) * 100) : 0
  const reported =
    typeof input.reportedOverall === 'number' && Number.isFinite(input.reportedOverall)
      ? input.reportedOverall
      : 0
  const computed = Math.max(fromCounts, reported)
  if (input.isDownloading && computed <= 0) {
    return STARTING_PROGRESS_PERCENT
  }
  return Math.min(100, Math.max(0, computed))
}

/**
 * Per-resource wall clock. Zipball fetch only times out until headers arrive;
 * a stalled body (0-byte / hung arrayBuffer) never resolves and would freeze
 * the sequential worker at the last overall % (often a low single digit).
 */
export const RESOURCE_DOWNLOAD_TIMEOUT_MS = 180_000

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
} {
  return {
    currentResource: resourceKeys[0] ?? null,
    currentResourceProgress: STARTING_PROGRESS_PERCENT,
    totalResources: resourceKeys.length,
    completedResources: 0,
    failedResources: 0,
    overallProgress: resourceKeys.length > 0 ? STARTING_PROGRESS_PERCENT : 0,
    tasks: [],
    totalIngredients: totalIngredients ?? 0,
    completedIngredients: 0,
    failedIngredients: 0,
    currentIngredient: undefined,
  }
}
