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
