import { describe, expect, test } from 'bun:test'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import { applyDualScopeHelpsPolicy, orderHelpsPanelKeys } from './helpsPanelPolicy'

describe('helpsPanelPolicy', () => {
  test('scripture-only: no combined, no hidden', () => {
    const result = orderHelpsPanelKeys(
      [
        { key: 'uw/en/ult', type: 'scripture' },
        { key: 'uw/en/tn', type: 'notes' },
      ],
      'scripture'
    )
    expect(result.hiddenKeys).toEqual([])
    expect(result.visibleKeys).toContain('uw/en/tn')
  })

  test('scripture + TN + TWL + combined → combined first, TN/TWL hidden', () => {
    const result = orderHelpsPanelKeys(
      [
        { key: 'uw/en/ult', type: 'scripture' },
        { key: 'uw/en/tn', type: 'notes' },
        { key: 'uw/en/twl', type: 'words-links' },
        { key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' },
      ],
      'scripture'
    )
    expect(result.activeKey).toBe(COMBINED_HELPS_RESOURCE_ID)
    expect(result.visibleKeys[0]).toBe(COMBINED_HELPS_RESOURCE_ID)
    expect(result.hiddenKeys).toEqual(expect.arrayContaining(['uw/en/tn', 'uw/en/twl']))
    expect(result.visibleKeys).not.toContain('uw/en/tn')
  })

  test('OBS combined hides OBS TN/TWL', () => {
    const result = orderHelpsPanelKeys(
      [
        { key: 'uw/en/obs', type: 'obs' },
        { key: 'uw/en/obs-tn', type: 'obs-notes' },
        { key: 'uw/en/obs-twl', type: 'obs-words-links' },
        { key: OBS_COMBINED_HELPS_RESOURCE_ID, type: 'obs-combined-helps' },
      ],
      'obs'
    )
    expect(result.activeKey).toBe(OBS_COMBINED_HELPS_RESOURCE_ID)
    expect(result.hiddenKeys).toEqual(
      expect.arrayContaining(['uw/en/obs-tn', 'uw/en/obs-twl'])
    )
  })

  test('CombinedHelps does not hide TQ (questions stay beside Helps)', () => {
    const result = applyDualScopeHelpsPolicy([
      { key: 'uw/en/tn', type: 'notes' },
      { key: 'uw/en/twl', type: 'words-links' },
      { key: 'uw/en/tq', type: 'questions' },
      { key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' },
    ])
    expect(result.visibleKeys[0]).toBe(COMBINED_HELPS_RESOURCE_ID)
    expect(result.visibleKeys).toContain('uw/en/tq')
    expect(result.hiddenKeys).toEqual(expect.arrayContaining(['uw/en/tn', 'uw/en/twl']))
    expect(result.hiddenKeys).not.toContain('uw/en/tq')
  })

  test('dual-scope: scripture+OBS CombinedHelps both visible; both scopes hide raw TN/TWL', () => {
    const result = applyDualScopeHelpsPolicy([
      { key: 'uw/en/tn', type: 'notes' },
      { key: 'uw/en/twl', type: 'words-links' },
      { key: 'uw/en/obs-tn', type: 'obs-notes' },
      { key: 'uw/en/obs-twl', type: 'obs-words-links' },
      { key: COMBINED_HELPS_RESOURCE_ID, type: 'combined-helps' },
      { key: OBS_COMBINED_HELPS_RESOURCE_ID, type: 'obs-combined-helps' },
      { key: 'uw/en/tq', type: 'questions' },
    ])
    expect(result.visibleKeys.slice(0, 2)).toEqual([
      COMBINED_HELPS_RESOURCE_ID,
      OBS_COMBINED_HELPS_RESOURCE_ID,
    ])
    expect(result.activeKey).toBe(COMBINED_HELPS_RESOURCE_ID)
    expect(result.hiddenKeys).toEqual(
      expect.arrayContaining(['uw/en/tn', 'uw/en/twl', 'uw/en/obs-tn', 'uw/en/obs-twl'])
    )
    expect(result.visibleKeys).toContain('uw/en/tq')
  })

  test('without CombinedHelps, TN/TWL remain visible owners of their tabs', () => {
    const result = applyDualScopeHelpsPolicy([
      { key: 'uw/en/tn', type: 'notes' },
      { key: 'uw/en/twl', type: 'words-links' },
      { key: 'uw/en/tq', type: 'questions' },
    ])
    expect(result.hiddenKeys).toEqual([])
    expect(result.visibleKeys).toEqual(['uw/en/tn', 'uw/en/twl', 'uw/en/tq'])
    expect(result.activeKey).toBe('uw/en/tn')
  })
})
