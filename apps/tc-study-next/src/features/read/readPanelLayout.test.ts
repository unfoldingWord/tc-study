import { describe, expect, test } from 'bun:test'
import {
  collapseAfterDragEnd,
  collapsedDividerArrowDir,
  COLLAPSE_THRESHOLD_PERCENT,
  defaultLayoutForViewport,
  dividerCollapsedPanelId,
  isPanelOffFlow,
  panelStayMountedStyle,
  restoreCollapsedDivider,
  restoredSplitPercent,
} from './readPanelLayout'

describe('readPanelLayout', () => {
  test('mobile default is one panel; desktop default is two unless user chose', () => {
    expect(defaultLayoutForViewport(true)).toBe('one')
    expect(defaultLayoutForViewport(false)).toBe('two')
    expect(defaultLayoutForViewport(true, 'two', true)).toBe('two')
    expect(defaultLayoutForViewport(false, 'one', true)).toBe('one')
    expect(defaultLayoutForViewport(true, 'two', false)).toBe('one')
  })

  test('drag past min width collapses the smaller panel', () => {
    expect(COLLAPSE_THRESHOLD_PERCENT).toBe(30)
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBe('panel-1')
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT - 1).collapsedPanelId).toBe('panel-1')
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT + 1).collapsedPanelId).toBeNull()
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBe('panel-2')
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT + 1).collapsedPanelId).toBe('panel-2')
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT - 1).collapsedPanelId).toBeNull()
    expect(collapseAfterDragEnd(50).collapsedPanelId).toBeNull()
  })

  test('when both panes meet the threshold, still collapse only the smaller one', () => {
    // Shares always sum to 100, so both ≤30% cannot happen. Equal shares collapse panel-1.
    expect(collapseAfterDragEnd(20).collapsedPanelId).toBe('panel-1')
    expect(collapseAfterDragEnd(80).collapsedPanelId).toBe('panel-2')
    expect(collapseAfterDragEnd(10).collapsedPanelId).not.toBe(collapseAfterDragEnd(90).collapsedPanelId)
  })

  test('click restore uses previous split or 50% and clears collapse', () => {
    expect(restoreCollapsedDivider(40)).toEqual({ collapsedPanelId: null, splitPercent: 40 })
    expect(restoreCollapsedDivider(5)).toEqual({ collapsedPanelId: null, splitPercent: 50 })
    expect(restoredSplitPercent(40)).toBe(40)
    expect(restoredSplitPercent(5)).toBe(50)
    expect(restoredSplitPercent(COLLAPSE_THRESHOLD_PERCENT)).toBe(50)
    expect(restoredSplitPercent(COLLAPSE_THRESHOLD_PERCENT + 1)).toBe(COLLAPSE_THRESHOLD_PERCENT + 1)
  })

  test('inward arrow points at the remaining visible panel', () => {
    expect(collapsedDividerArrowDir({ collapsedPanelId: 'panel-2', stacked: false })).toBe('left')
    expect(collapsedDividerArrowDir({ collapsedPanelId: 'panel-1', stacked: false })).toBe('right')
    expect(collapsedDividerArrowDir({ collapsedPanelId: 'panel-2', stacked: true })).toBe('up')
    expect(collapsedDividerArrowDir({ collapsedPanelId: 'panel-1', stacked: true })).toBe('down')
  })

  test('one-panel parks panel-2 behind the divider rail; collapse stays mounted', () => {
    expect(isPanelOffFlow({ layout: 'one', panelId: 'panel-2', collapsedPanelId: null })).toBe(true)
    expect(dividerCollapsedPanelId({ layout: 'one', collapsedPanelId: null })).toBe('panel-2')
    expect(dividerCollapsedPanelId({ layout: 'two', collapsedPanelId: null })).toBeNull()
    expect(dividerCollapsedPanelId({ layout: 'two', collapsedPanelId: 'panel-2' })).toBe('panel-2')
    const hidden = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-2',
      collapsedPanelId: 'panel-2',
      panel1Percent: 90,
    })
    expect(hidden.visibility).toBe('hidden')
    expect(hidden.flexBasis).toBe(0)
    expect(hidden.position).toBe('absolute')
    expect(hidden.height).toBe(0)
    expect(hidden.top).toBe(0)
    expect(hidden.left).toBe(0)
  })

  test('visible pane grows into leftover so the divider stays in the flex row', () => {
    const rightParked = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-1',
      collapsedPanelId: 'panel-2',
      panel1Percent: 100,
    })
    expect(rightParked.flexGrow).toBe(1)
    expect(rightParked.flexShrink).toBe(1)
    expect(rightParked.flexBasis).toBe(0)
    expect(rightParked.position).toBeUndefined()

    const leftParked = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-2',
      collapsedPanelId: 'panel-1',
      panel1Percent: 0,
    })
    expect(leftParked.flexGrow).toBe(1)
    expect(leftParked.flexBasis).toBe(0)

    const onePanel = panelStayMountedStyle({
      layout: 'one',
      panelId: 'panel-1',
      collapsedPanelId: null,
      panel1Percent: 100,
    })
    expect(onePanel.flexGrow).toBe(1)
    expect(onePanel.flexBasis).toBe(0)
  })
})
