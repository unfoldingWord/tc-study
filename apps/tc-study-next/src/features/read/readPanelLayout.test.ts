import { describe, expect, test } from 'bun:test'
import {
  collapseAfterDragEnd,
  COLLAPSE_THRESHOLD_PERCENT,
  defaultLayoutForViewport,
  isPanelOffFlow,
  panelStayMountedStyle,
  restoredSplitPercent,
  showPanelRail,
} from './readPanelLayout'

describe('readPanelLayout', () => {
  test('mobile default is one panel; desktop default is two unless user chose', () => {
    expect(defaultLayoutForViewport(true)).toBe('one')
    expect(defaultLayoutForViewport(false)).toBe('two')
    expect(defaultLayoutForViewport(true, 'two', true)).toBe('two')
    expect(defaultLayoutForViewport(false, 'one', true)).toBe('one')
    expect(defaultLayoutForViewport(true, 'two', false)).toBe('one')
  })

  test('drag past min width collapses that panel; restore uses previous or 50%', () => {
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBe('panel-1')
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBe('panel-2')
    expect(collapseAfterDragEnd(50).collapsedPanelId).toBeNull()
    expect(restoredSplitPercent(40)).toBe(40)
    expect(restoredSplitPercent(5)).toBe(50)
  })

  test('one-panel hides panel-2 without a rail; collapse is two-panel + rail', () => {
    expect(isPanelOffFlow({ layout: 'one', panelId: 'panel-2', collapsedPanelId: null })).toBe(true)
    expect(showPanelRail({ layout: 'one', panelId: 'panel-2', collapsedPanelId: null })).toBe(false)
    expect(
      showPanelRail({ layout: 'two', panelId: 'panel-2', collapsedPanelId: 'panel-2' })
    ).toBe(true)
    const hidden = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-2',
      collapsedPanelId: 'panel-2',
      panel1Percent: 90,
    })
    expect(hidden.visibility).toBe('hidden')
    expect(hidden.flexBasis).toBe(0)
    expect(hidden.position).toBe('absolute')
  })
})
