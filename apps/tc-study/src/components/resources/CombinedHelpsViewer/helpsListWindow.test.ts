import { describe, expect, test } from 'bun:test'
import {
  HELPS_LIST_INITIAL_GROUPS,
  groupIndexForCard,
  visibleGroupCountForSelection,
  windowMergedGroups,
} from './helpsListWindow'

describe('helpsListWindow', () => {
  const groups = Array.from({ length: 40 }, (_, i) => ({
    ref: `${i + 1}:1`,
    items: [{ kind: 'tn' as const, note: { id: `n${i + 1}` } }],
  }))

  test('windows groups so first paint does not mount every Metaphor card', () => {
    const windowed = windowMergedGroups(groups, HELPS_LIST_INITIAL_GROUPS)
    expect(windowed).toHaveLength(HELPS_LIST_INITIAL_GROUPS)
    expect(windowed[0]?.ref).toBe('1:1')
    expect(windowMergedGroups(groups, 100)).toHaveLength(40)
  })

  test('expands the window to include the selected card', () => {
    expect(groupIndexForCard(groups, { kind: 'tn', id: 'n20' })).toBe(19)
    expect(visibleGroupCountForSelection(groups, { kind: 'tn', id: 'n20' })).toBe(20)
    expect(visibleGroupCountForSelection(groups, null)).toBe(HELPS_LIST_INITIAL_GROUPS)
  })
})
