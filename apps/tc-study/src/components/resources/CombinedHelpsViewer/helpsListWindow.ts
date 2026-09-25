/**
 * Window CombinedHelps groups so a book-wide support-ref filter does not
 * mount every matching card on first paint.
 */

export const HELPS_LIST_INITIAL_GROUPS = 12
export const HELPS_LIST_GROUP_STEP = 12
/**
 * Groups mounted after the selected card so the scrollport can hold it near
 * the top — with none below, max scrollTop parks it at the bottom edge.
 */
export const HELPS_LIST_GROUPS_AFTER_SELECTION = 4

export function windowMergedGroups<T>(groups: readonly T[], visibleCount: number): T[] {
  if (visibleCount >= groups.length) return groups as T[]
  return groups.slice(0, Math.max(0, visibleCount))
}

export function groupIndexForCard(
  groups: ReadonlyArray<{
    items: ReadonlyArray<{
      kind: 'tn' | 'twl'
      note?: { id: string }
      link?: { id: string }
    }>
  }>,
  selected: { kind: 'tn' | 'twl'; id: string } | null | undefined
): number {
  if (!selected) return -1
  return groups.findIndex((group) =>
    group.items.some((item) => {
      if (item.kind !== selected.kind) return false
      const id = item.kind === 'tn' ? item.note?.id : item.link?.id
      return id === selected.id
    })
  )
}

export function visibleGroupCountForSelection(
  groups: Parameters<typeof groupIndexForCard>[0],
  selected: { kind: 'tn' | 'twl'; id: string } | null | undefined,
  initial: number = HELPS_LIST_INITIAL_GROUPS
): number {
  const idx = groupIndexForCard(groups, selected)
  if (idx < 0) return initial
  return Math.max(initial, idx + 1 + HELPS_LIST_GROUPS_AFTER_SELECTION)
}
