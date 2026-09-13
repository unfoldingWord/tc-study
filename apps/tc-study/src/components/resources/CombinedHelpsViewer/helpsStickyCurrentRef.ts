/**
 * Current CombinedHelps verse group while the list is scrolled / windowed.
 * The compact sticky chrome uses this picker so the bar tracks the group at
 * the scrollport top (including after windowing unmounts earlier groups).
 */

export interface HelpsGroupBounds {
  ref: string
  top: number
  bottom: number
}

export interface HelpsViewportBounds {
  top: number
  bottom: number
}

/** Group that owns the notes at the scrollport top — not merely the first mounted group. */
export function currentHelpsGroupFromBounds(
  groups: readonly HelpsGroupBounds[],
  viewportTop: number
): string | null {
  if (groups.length === 0) return null

  for (const group of groups) {
    if (group.top <= viewportTop && group.bottom > viewportTop) return group.ref
  }

  const first = groups[0]
  if (first && viewportTop < first.top) return first.ref

  let lastAbove: HelpsGroupBounds | undefined
  for (const group of groups) {
    if (group.top <= viewportTop) lastAbove = group
  }
  return lastAbove?.ref ?? groups[groups.length - 1]?.ref ?? null
}

export function isHelpsGroupHeaderInView(
  header: HelpsGroupBounds | HelpsViewportBounds,
  viewport: HelpsViewportBounds
): boolean {
  return header.bottom > viewport.top && header.top < viewport.bottom
}

export function shouldShowStickyCurrentRefClone(
  currentRef: string | null,
  nativeHeaderVisible: boolean
): boolean {
  return currentRef != null && !nativeHeaderVisible
}
