/**
 * Shared zip-vs-per-file policy for scripture + helps (TN/TQ/TWL) loaders.
 *
 * Interrupted downloads leave partial ingredient caches; re-fetching the full
 * zipball for mostly-cached resources is wasteful (common with UST/TN/TWL loops).
 *
 * Thresholds (documented here — keep loaders aligned via chooseIngredientFetchMode):
 * - Cold start (cachedCount === 0): zip — one HTTP round-trip for the whole release.
 * - Partial cache (cachedCount >= PARTIAL_CACHE_INDIVIDUAL_MIN_CACHED): fill remaining
 *   ingredients with per-file HTTP; do not re-download the zip.
 * - Nothing left to fetch (remainingToFetchCount === 0): skip — fully cached and/or
 *   only release phantoms remain (callers persist absentFromRelease separately).
 */

/** Prefer per-file fill when at least this many ingredients are already cached. */
export const PARTIAL_CACHE_INDIVIDUAL_MIN_CACHED = 1

export type IngredientFetchMode = 'skip' | 'zip' | 'individual'

/**
 * Decide whether to skip, download the zipball, or fetch remaining files individually.
 *
 * @param cachedCount — ingredients already complete in local cache
 * @param remainingToFetchCount — incomplete ingredients that exist in the release
 *   (or all incomplete when the repo tree probe is unavailable)
 */
export function chooseIngredientFetchMode(input: {
  cachedCount: number
  remainingToFetchCount: number
}): IngredientFetchMode {
  const cached = Math.max(0, input.cachedCount)
  const remaining = Math.max(0, input.remainingToFetchCount)
  if (remaining <= 0) return 'skip'
  if (cached >= PARTIAL_CACHE_INDIVIDUAL_MIN_CACHED) return 'individual'
  return 'zip'
}
