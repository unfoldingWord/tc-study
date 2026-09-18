/**
 * Keep the clicked CombinedHelps card in view when a book-wide TWL / support-ref
 * filter streams earlier chapters in above it. User scroll releases the pin.
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
 * Groups newly inserted above the clicked card.
 * Stream order is 1→last, so later earlier-chapters land *after* 1:n
 * but still before the apply-anchor — those must count as prepends.
 */
export function prependedGroupRefs(
  prevGroupRefs: readonly string[],
  nextGroupRefs: readonly string[],
  anchorRef?: string
): string[] {
  if (prevGroupRefs.length === 0 || nextGroupRefs.length === 0) return []
  const nextAnchor = anchorRef
    ? nextGroupRefs.indexOf(anchorRef)
    : nextGroupRefs.findIndex((ref) => prevGroupRefs.includes(ref))
  const prevAnchor = anchorRef
    ? prevGroupRefs.indexOf(anchorRef)
    : prevGroupRefs.findIndex((ref) => nextGroupRefs.includes(ref))
  const nextBefore =
    nextAnchor > 0 ? nextGroupRefs.slice(0, nextAnchor) : nextAnchor === 0 ? [] : nextGroupRefs
  const prevBefore = new Set(
    prevAnchor > 0 ? prevGroupRefs.slice(0, prevAnchor) : prevAnchor === 0 ? [] : prevGroupRefs
  )
  return nextBefore.filter((ref) => !prevBefore.has(ref))
}

export function prependedGroupsHeight(
  prependedRefs: readonly string[],
  groupHeights: Readonly<Record<string, number>>
): number {
  let total = 0
  for (const ref of prependedRefs) {
    total += groupHeights[ref] ?? 0
  }
  return total
}

export function nextHelpsAnchorPin(args: {
  pinned: boolean
  userScrolled: boolean
  scrollTop: number
  prevGroupRefs: readonly string[]
  nextGroupRefs: readonly string[]
  groupHeights: Readonly<Record<string, number>>
  isApplyPass: boolean
  anchorRef?: string
}): {
  pinned: boolean
  scrollTop: number
  scrollAnchorIntoView: boolean
} {
  if (!args.pinned || args.userScrolled) {
    return { pinned: false, scrollTop: args.scrollTop, scrollAnchorIntoView: false }
  }
  const prepended = prependedGroupRefs(
    args.prevGroupRefs,
    args.nextGroupRefs,
    args.anchorRef
  )
  const delta = prependedGroupsHeight(prepended, args.groupHeights)
  return {
    pinned: true,
    scrollTop: args.scrollTop + delta,
    // Heights can be under-measured (content-visibility). Always re-pin the card.
    scrollAnchorIntoView: args.isApplyPass || prepended.length > 0,
  }
}

/**
 * Move scrollTop so the anchor row stays in the scrollport.
 * Prefer this over Element.scrollIntoView — content-visibility:auto rows
 * can report a huge offset yet not scroll.
 */
export function scrollTopToKeepAnchorInView(args: {
  scrollTop: number
  viewportHeight: number
  /** Anchor top relative to the scrollport (getBoundingClientRect delta). */
  anchorOffsetTop: number
  anchorHeight: number
  padding?: number
}): number {
  const padding = args.padding ?? 16
  const top = args.anchorOffsetTop
  const bottom = top + args.anchorHeight
  if (top >= padding && bottom <= args.viewportHeight - padding) return args.scrollTop
  return args.scrollTop + top - padding
}
