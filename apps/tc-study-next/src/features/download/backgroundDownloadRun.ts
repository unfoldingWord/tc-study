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

/** Initial progress snapshot so the indicator is not stuck with a null payload. */
export function createInitialDownloadProgress(
  resourceKeys: string[],
  totalIngredients?: number
): {
  currentResource: null
  currentResourceProgress: number
  totalResources: number
  completedResources: number
  failedResources: number
  overallProgress: number
  tasks: []
  totalIngredients: number
  completedIngredients: number
  failedIngredients: number
} {
  return {
    currentResource: null,
    currentResourceProgress: 0,
    totalResources: resourceKeys.length,
    completedResources: 0,
    failedResources: 0,
    overallProgress: 0,
    tasks: [],
    totalIngredients: totalIngredients ?? 0,
    completedIngredients: 0,
    failedIngredients: 0,
  }
}
