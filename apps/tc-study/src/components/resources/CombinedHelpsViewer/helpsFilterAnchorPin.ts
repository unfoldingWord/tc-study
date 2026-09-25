/**
 * Keep the clicked CombinedHelps card in view when a book-wide TWL / support-ref
 * filter streams earlier chapters in above it. User input releases the pin.
 */

import type { HelpsFilterAnchor } from '../../../features/helps/helpsDisplayFilters'

export type { HelpsFilterAnchor }

export function helpsFilterAnchorFromRow(
  kind: HelpsFilterAnchor['kind'],
  id: string,
  reference: string
): HelpsFilterAnchor {
  return { kind, id, ref: reference }
}

export function helpsAnchorRowId(anchor: HelpsFilterAnchor): string {
  return `helps-row-${anchor.kind}-${anchor.id}`
}

export function helpsAnchorSelection(
  anchor: HelpsFilterAnchor | null | undefined
): { kind: 'tn' | 'twl'; id: string } | null {
  if (!anchor) return null
  return { kind: anchor.kind, id: anchor.id }
}

/** Skip jump-to-top when a book-wide chip was applied from a visible card. */
export function shouldScrollHelpsListToTop(args: {
  bookWideFilter: boolean
  hasApplyAnchor: boolean
}): boolean {
  return !(args.bookWideFilter && args.hasApplyAnchor)
}

/**
 * Deliberate user input on the scrollport. Programmatic scrollTop writes fire
 * `scroll` too, so `scroll` itself must not release the pin.
 */
export const HELPS_ANCHOR_PIN_RELEASE_EVENTS = [
  'wheel',
  'touchmove',
  'pointerdown',
  'keydown',
] as const

export const HELPS_ANCHOR_PIN_OFFSET_PX = 16

/**
 * scrollTop that holds the anchor row `offset` px below the scrollport top.
 * "Merely in view" is not enough: rows above keep growing (content-visibility
 * estimates → real height, streamed chapters) and would push it off the bottom.
 * Prefer this over Element.scrollIntoView — content-visibility:auto rows
 * can report a huge offset yet not scroll.
 */
export function scrollTopToPinAnchor(args: {
  scrollTop: number
  /** Anchor top relative to the scrollport (getBoundingClientRect delta). */
  anchorOffsetTop: number
  offset?: number
}): number {
  const offset = args.offset ?? HELPS_ANCHOR_PIN_OFFSET_PX
  const drift = args.anchorOffsetTop - offset
  if (Math.abs(drift) < 1) return args.scrollTop
  return Math.max(0, args.scrollTop + drift)
}
