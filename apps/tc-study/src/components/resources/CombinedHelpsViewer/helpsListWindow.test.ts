import { describe, expect, test } from 'bun:test'
import {
  HELPS_LIST_GROUPS_AFTER_SELECTION,
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

  test('expands the window to include the selected card plus a few groups below it', () => {
    expect(groupIndexForCard(groups, { kind: 'tn', id: 'n20' })).toBe(19)
    expect(visibleGroupCountForSelection(groups, { kind: 'tn', id: 'n20' })).toBe(
      20 + HELPS_LIST_GROUPS_AFTER_SELECTION
    )
    expect(visibleGroupCountForSelection(groups, null)).toBe(HELPS_LIST_INITIAL_GROUPS)
  })

  test('selected card is never the last mounted group (so it can pin near the top)', () => {
    const count = visibleGroupCountForSelection(groups, { kind: 'tn', id: 'n30' })
    const windowed = windowMergedGroups(groups, count)
    const idx = windowed.findIndex((g) => g.ref === '30:1')
    expect(windowed.length - 1 - idx).toBe(HELPS_LIST_GROUPS_AFTER_SELECTION)
  })

  test('book filter: pinned source card keeps earlier chapters mounted above and later below', () => {
    // Book-wide matches, source card in chapter 4 (one group per chapter/verse).
    const book = ['1:3', '2:1', '3:5', '4:1', '4:14', '5:2', '6:11', '6:20'].map((ref) => ({
      ref,
      items: [{ kind: 'tn' as const, note: { id: `n-${ref}` } }],
    }))
    const count = visibleGroupCountForSelection(book, { kind: 'tn', id: 'n-4:1' }, 1)
    const chapters = new Set(windowMergedGroups(book, count).map((g) => g.ref.split(':')[0]))
    // 4 groups after 4:1 → 4:14, 5:2, 6:11, 6:20.
    expect([...chapters]).toEqual(['1', '2', '3', '4', '5', '6'])
  })
})
