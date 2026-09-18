/**
 * Pure admission / lane-1 ready policy.
 * Interactive current-chapter work must win over lane 2/3 whole-Bible fill.
 */

/** Don’t start a new lane-2/3 slice while this many warm jobs are still pending. */
export const LANE3_MAX_PENDING = 8

/** Rest-of-current-book jobs admitted per pass (Psalms-scale must not dump 147×N). */
export const LANE2_JOBS_PER_PASS = 8

/** After a lane-3 pass, wait before admitting another (job-done must not flood). */
export const LANE3_ADMIT_COOLDOWN_MS = 750

export function canAdmitBackgroundLanes(args: {
  lane1Drained: boolean
  scrollUnsettled?: boolean
  documentVisible?: boolean
  /** Lane 3 only: in-flight + queued warm jobs. */
  pendingJobKeys?: number
  maxPending?: number
  lastAdmitAt?: number
  now?: number
  cooldownMs?: number
  lane?: 2 | 3
}): boolean {
  return warmLaneBlockedReason(args) == null
}

/** Debug: why lane 2/3 admit is gated (null = open). */
export function warmLaneBlockedReason(args: {
  lane1Drained: boolean
  scrollUnsettled?: boolean
  documentVisible?: boolean
  pendingJobKeys?: number
  maxPending?: number
  lastAdmitAt?: number
  now?: number
  cooldownMs?: number
  lane?: 2 | 3
}): string | null {
  if (!args.lane1Drained) return 'lane1-busy'
  if (args.scrollUnsettled) return 'scroll-unsettled'
  if (args.documentVisible === false) return 'document-hidden'
  if (args.lane === 3) {
    const pending = args.pendingJobKeys ?? 0
    const max = args.maxPending ?? LANE3_MAX_PENDING
    if (pending >= max) return `pending>=${max}`
    const last = args.lastAdmitAt ?? 0
    const now = args.now ?? 0
    const cool = args.cooldownMs ?? LANE3_ADMIT_COOLDOWN_MS
    if (last > 0 && now > 0 && now - last < cool) return 'admit-cooldown'
  }
  return null
}

/** CombinedHelps: stay busy until current-chapter notes/quotes exist or cache-hit. */
export function helpsLane1Ready(args: {
  contentPending: boolean
  quoteReady: boolean
  cacheHit: boolean
  /** OL zip missing — show notes and drain so download/retry is not deadlocked. */
  quotesBlocked?: boolean
  /**
   * Book-wide Metaphor / TWL article filter: first list paint is enough to drain.
   * Off-chapter quote/align warm is lane 2 — must not keep helps busy or those jobs
   * never admit (silent enqueue drop while lane1Drained is false).
   */
  bookFilterRowsReady?: boolean
}): boolean {
  if (args.contentPending) return false
  if (args.bookFilterRowsReady) return true
  return args.quoteReady || args.cacheHit || Boolean(args.quotesBlocked)
}

/** Scripture: nav-only is not enough — open chapter must have USJ verses / full. */
export function scriptureLane1Ready(args: {
  isLoading: boolean
  hasViewModel: boolean
  openChapterReady: boolean
}): boolean {
  if (args.isLoading) return false
  return args.hasViewModel && args.openChapterReady
}
