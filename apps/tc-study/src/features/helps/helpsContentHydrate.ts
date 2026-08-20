/**
 * Shared companion content hydrate after a Read mode switch.
 *
 * Catalog membership (TN/TWL/TQ types in the package) is not book content.
 * Switching back to helps must still run viewer loaders — CombinedHelps quotes
 * and note bodies, and TQ — even when Door43 search is skipped.
 */

let hydrateTick = 0
const listeners = new Set<() => void>()

export function getHelpsContentHydrateTick(): number {
  return hydrateTick
}

export function subscribeHelpsContentHydrate(onStoreChange: () => void): () => void {
  listeners.add(onStoreChange)
  return () => {
    listeners.delete(onStoreChange)
  }
}

/** Bump so mounted TN / TWL / TQ loaders re-run after a helps-mode switch-back. */
export function requestHelpsContentHydrate(): number {
  hydrateTick += 1
  for (const listener of listeners) listener()
  return hydrateTick
}

/** Test-only: drop the tick between cases. */
export function resetHelpsContentHydrateTick(): void {
  hydrateTick = 0
  listeners.clear()
}

/**
 * Reuse an in-memory book-content cache only when it is a successful load.
 * Empty+error is not settled — switch-back must refetch.
 */
export function shouldReuseHelpsContentCache(hit: { error?: string | null } | undefined): boolean {
  if (hit === undefined) return false
  return !hit.error
}
