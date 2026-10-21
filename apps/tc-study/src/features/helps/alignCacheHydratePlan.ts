/**
 * Decide how useAlignedTokens should use helps-align IDB rows.
 *
 * Compact align rows prefer full-chapter target tokens (prepared:scripture full)
 * to reconstruct. When prepared / SCRIPTURE_TOKENS are not ready yet, paint from
 * stored display texts (`t`) if present — do not skip the IDB cache and
 * live-align (that felt like a rebuild on refresh even when already warmed).
 */

export type AlignCacheHydrateAction =
  /** Reconstruct cache hits against full-chapter tokens. */
  | 'reconstruct'
  /** Full IDB hit with stored display texts — paint chips without tokens. */
  | 'paint-display'
  /** Full IDB hit but no target tokens / display texts — wait for scripture. */
  | 'wait-for-tokens'
  /** Cache miss (or cannot merge) — live-align remaining / all links. */
  | 'live-align'

/**
 * True when broadcast SCRIPTURE_TOKENS look like a whole-chapter extract.
 * Verse 1→999 is definitive; verse 1→chapter-end (nav last verse) is the usual
 * hydrate after whole-chapter reading and matches prepared full positions.
 * Verse 1→N selection can false-positive — rare vs prepared-miss live-align thrash.
 */
export function broadcastTokensCoverFullChapter(args: {
  hasTokens: boolean
  passageStartChapter: number
  passageEndChapter: number
  tokenChapter: number
  tokenEndChapter: number
  tokenStartVerse: number
  tokenEndVerse: number
}): boolean {
  if (!args.hasTokens) return false
  if (args.passageStartChapter !== args.passageEndChapter) return false
  if (args.tokenChapter !== args.passageStartChapter) return false
  if (args.tokenEndChapter !== args.passageEndChapter) return false
  if (args.tokenStartVerse > 1) return false
  return args.tokenEndVerse > args.tokenStartVerse || args.tokenEndVerse >= 999
}

/**
 * Plan after reading helps-align for the span.
 * `canReconstruct` means every passage chapter has full-chapter target tokens.
 * `canPaintDisplay` means every non-miss hit carries stored word texts (`t`).
 */
export function planAlignCacheHydrate(args: {
  canReconstruct: boolean
  hitCount: number
  missCount: number
  hasAnyTargetTokens: boolean
  canPaintDisplay?: boolean
}): AlignCacheHydrateAction {
  if (args.hitCount > 0 && args.canReconstruct) return 'reconstruct'
  if (args.hitCount > 0 && args.canPaintDisplay) return 'paint-display'
  if (args.hitCount > 0 && args.missCount === 0 && !args.canReconstruct) {
    // Full IDB hit: wait only while scripture has published nothing yet.
    // If tokens exist but are not full-chapter, live-align rather than stick.
    return args.hasAnyTargetTokens ? 'live-align' : 'wait-for-tokens'
  }
  return 'live-align'
}

/**
 * Cold live-align target source. Prefer prepared:scripture full when every
 * passage chapter is ready — do not wait for SCRIPTURE_TOKENS from a mounted
 * ScriptureViewer (ULT panel may still be loading USJ / ownership).
 */
export function resolveLiveAlignTargetSource(args: {
  preparedFlat: readonly unknown[] | null | undefined
  broadcastTokens: readonly unknown[]
  hasBroadcastTokens: boolean
  currentChapter: number
  endChapter: number
  tokenChapter: number
  tokenEndChapter: number
  tokenStartVerse: number
  tokenEndVerse: number
}): {
  usePrepared: boolean
  hasTokens: boolean
  tokenChapter: number
  tokenEndChapter: number
  tokenStartVerse: number
  tokenEndVerse: number
} {
  const usePrepared = (args.preparedFlat?.length ?? 0) > 0
  if (usePrepared) {
    return {
      usePrepared: true,
      hasTokens: true,
      tokenChapter: args.currentChapter,
      tokenEndChapter: args.endChapter,
      tokenStartVerse: 1,
      tokenEndVerse: 999,
    }
  }
  return {
    usePrepared: false,
    hasTokens: args.hasBroadcastTokens,
    tokenChapter: args.tokenChapter,
    tokenEndChapter: args.tokenEndChapter,
    tokenStartVerse: args.tokenStartVerse,
    tokenEndVerse: args.tokenEndVerse,
  }
}
