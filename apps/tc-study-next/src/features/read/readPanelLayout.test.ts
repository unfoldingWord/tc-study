import { describe, expect, test } from 'bun:test'
import {
  collapseAfterDragEnd,
  collapsedDividerArrowDir,
  COLLAPSE_MOTION_MS,
  COLLAPSE_THRESHOLD_PERCENT,
  defaultLayoutForViewport,
  dividerCollapsedPanelId,
  isPanelOffFlow,
  layoutCollapsedPanelId,
  nextCollapseAnimPhase,
  panelCollapseMotionStyle,
  panelStayMountedStyle,
  restoreCollapsedDivider,
  restoredSplitPercent,
  slideOffTransform,
  slideOnTransform,
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

  test('slide-off transform points at the pane edge (side-by-side and stacked)', () => {
    expect(slideOffTransform('panel-2', false)).toBe('translate3d(100%, 0, 0)')
    expect(slideOffTransform('panel-1', false)).toBe('translate3d(-100%, 0, 0)')
    expect(slideOffTransform('panel-2', true)).toBe('translate3d(0, 100%, 0)')
    expect(slideOffTransform('panel-1', true)).toBe('translate3d(0, -100%, 0)')
    expect(slideOnTransform(false)).toBe('translate3d(0, 0, 0)')
    expect(slideOnTransform(true)).toBe('translate3d(0, 0, 0)')
  })

  test('restore keeps the entering pane parked in layout so the sibling stays 100%', () => {
    expect(
      layoutCollapsedPanelId({
        collapsedPanelId: null,
        phase: 'in',
        animPanelId: 'panel-2',
      })
    ).toBe('panel-2')
    expect(
      layoutCollapsedPanelId({
        collapsedPanelId: 'panel-1',
        phase: 'out',
        animPanelId: 'panel-1',
      })
    ).toBe('panel-1')
    expect(
      layoutCollapsedPanelId({
        collapsedPanelId: null,
        phase: 'idle',
        animPanelId: null,
      })
    ).toBeNull()
  })

  test('collapse/restore phase: out on park, in on restore; reduced motion snaps', () => {
    expect(
      nextCollapseAnimPhase({
        prevCollapsed: null,
        nextCollapsed: 'panel-2',
        prevLayout: 'two',
        nextLayout: 'two',
        reducedMotion: false,
      })
    ).toEqual({ phase: 'out', panelId: 'panel-2' })
    expect(
      nextCollapseAnimPhase({
        prevCollapsed: 'panel-1',
        nextCollapsed: null,
        prevLayout: 'two',
        nextLayout: 'two',
        reducedMotion: false,
      })
    ).toEqual({ phase: 'in', panelId: 'panel-1' })
    expect(
      nextCollapseAnimPhase({
        prevCollapsed: null,
        nextCollapsed: null,
        prevLayout: 'one',
        nextLayout: 'two',
        reducedMotion: false,
      })
    ).toEqual({ phase: 'in', panelId: 'panel-2' })
    expect(
      nextCollapseAnimPhase({
        prevCollapsed: 'panel-2',
        nextCollapsed: 'panel-2',
        prevLayout: 'two',
        nextLayout: 'two',
        reducedMotion: true,
      })
    ).toEqual({ phase: 'idle', panelId: null })
  })

  test('out motion keeps the pane visible then translates toward its edge', () => {
    const start = panelCollapseMotionStyle({
      panelId: 'panel-2',
      animPanelId: 'panel-2',
      phase: 'out',
      sliding: false,
      stacked: false,
      panel1Percent: 75,
      reducedMotion: false,
    })
    expect(start.visibility).toBe('visible')
    expect(start.position).toBe('absolute')
    expect(start.width).toBe('25%')
    expect(start.right).toBe(0)
    expect(start.left).toBe('auto')
    expect(start.transform).toBe('translate3d(0, 0, 0)')
    expect(start.transition).toBe('none')
    expect(start.isolation).toBe('isolate')
    expect(String(start.transition)).not.toContain('flex')

    const end = panelCollapseMotionStyle({
      panelId: 'panel-2',
      animPanelId: 'panel-2',
      phase: 'out',
      sliding: true,
      stacked: false,
      panel1Percent: 75,
      reducedMotion: false,
    })
    expect(end.transform).toBe('translate3d(100%, 0, 0)')
    expect(end.isolation).toBe('isolate')
    expect(end.transition).toBe(
      `transform ${COLLAPSE_MOTION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
    )
    expect(String(end.transition)).not.toMatch(/flex|width|height/)
  })

  test('in motion is the same overlay layer; starts off-edge then settles', () => {
    const start = panelCollapseMotionStyle({
      panelId: 'panel-1',
      animPanelId: 'panel-1',
      phase: 'in',
      sliding: false,
      stacked: true,
      panel1Percent: 50,
      reducedMotion: false,
    })
    expect(start.position).toBe('absolute')
    expect(start.height).toBe('50%')
    expect(start.transform).toBe('translate3d(0, -100%, 0)')
    expect(start.transition).toBe('none')
    expect(start.isolation).toBe('isolate')

    const end = panelCollapseMotionStyle({
      panelId: 'panel-1',
      animPanelId: 'panel-1',
      phase: 'in',
      sliding: true,
      stacked: true,
      panel1Percent: 50,
      reducedMotion: false,
    })
    expect(end.position).toBe('absolute')
    expect(end.transform).toBe('translate3d(0, 0, 0)')
    expect(end.isolation).toBe('isolate')
    expect(end.transition).toBe(
      `transform ${COLLAPSE_MOTION_MS}ms cubic-bezier(0.4, 0, 0.2, 1)`
    )

    expect(
      panelCollapseMotionStyle({
        panelId: 'panel-1',
        animPanelId: 'panel-2',
        phase: 'out',
        sliding: true,
        stacked: false,
        panel1Percent: 80,
        reducedMotion: false,
      })
    ).toEqual({ transition: 'none' })

    expect(
      panelCollapseMotionStyle({
        panelId: 'panel-2',
        animPanelId: 'panel-2',
        phase: 'out',
        sliding: true,
        stacked: false,
        panel1Percent: 80,
        reducedMotion: true,
      })
    ).toEqual({})
    expect(
      panelCollapseMotionStyle({
        panelId: 'panel-2',
        animPanelId: 'panel-2',
        phase: 'idle',
        sliding: false,
        stacked: false,
        panel1Percent: 50,
        reducedMotion: false,
      })
    ).toEqual({})
  })

  test('stay-mounted panes never declare a flex transition', () => {
    const visible = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-1',
      collapsedPanelId: 'panel-2',
      panel1Percent: 100,
    })
    expect(visible.transition).toBe('none')
    const split = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-1',
      collapsedPanelId: null,
      panel1Percent: 50,
    })
    expect(split.transition).toBe('none')
  })
})
