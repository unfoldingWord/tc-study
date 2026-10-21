/**
 * Helps quote/align IDB keys need catalog stamps. Catalog metadata reads can
 * stall under IndexedDB contention.
 *
 * Two budgets:
 * - HYDRATE: wait long enough that a warm helps-quote/helps-align chapter can
 *   still be keyed and painted on refresh (soft 250ms skip was the regression
 *   that forced warm.worker rebuilds / 8s RPC waits).
 * - LIVE: after a confirmed cache miss (or hydrate exhausted), do not block
 *   live quote/align forever on hung stamps — persist may be skipped.
 *
 * Builds stay on warm.worker (preferred) / prepare.worker — not the main thread.
 */

/** Soft budget for live-build persist ctx — miss path only. */
export const HELPS_CACHE_CONTEXT_BUDGET_MS = 250

/**
 * Budget for cache-first hydrate (refresh / revisit). Must exceed typical
 * catalog stamp latency under IDB contention so warm rows are not skipped.
 */
export const HELPS_CACHE_HYDRATE_BUDGET_MS = 5_000

/**
 * Resolve cache context within a budget. On timeout or rejection, return null
 * so callers live-build / live-align immediately (still on a worker).
 */
export function settleHelpsCacheContext<T>(
  pending: Promise<T | null | undefined>,
  budgetMs: number = HELPS_CACHE_CONTEXT_BUDGET_MS
): Promise<T | null> {
  if (!(budgetMs > 0)) {
    return Promise.resolve(pending).then(
      (value) => value ?? null,
      () => null
    )
  }
  return new Promise((resolve) => {
    let settled = false
    const finish = (value: T | null) => {
      if (settled) return
      settled = true
      resolve(value)
    }
    const timer = setTimeout(() => finish(null), budgetMs)
    Promise.resolve(pending).then(
      (value) => {
        clearTimeout(timer)
        finish(value ?? null)
      },
      () => {
        clearTimeout(timer)
        finish(null)
      }
    )
  })
}

/**
 * Prefer worker result; sync only when the worker rejects / is unavailable.
 * Do not time out into main-thread chapter builds — that starved UI jank
 * instead of prepare.worker (regression vs non-blocking principle).
 */
export function settleHelpsWorkerOrSync<T>(
  worker: Promise<T>,
  sync: () => T
): Promise<T> {
  return worker.then(
    (value) => value,
    () => sync()
  )
}

/**
 * Prefer the sync align path only for tiny batches or when worker work cannot
 * produce ULT chips yet (no quote tokens / quote-build still gated).
 * Chapter-sized batches must use the worker (warm.worker preferred).
 */
export function shouldSyncHelpsAlign(args: {
  linkCount: number
  syncMaxLinks: number
  quoteBuildReady: boolean
  linksHaveQuoteTokens: boolean
}): boolean {
  if (args.linkCount <= args.syncMaxLinks) return true
  if (!args.quoteBuildReady) return true
  if (!args.linksHaveQuoteTokens) return true
  return false
}
