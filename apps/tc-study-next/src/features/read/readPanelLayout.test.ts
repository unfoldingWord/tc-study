import { describe, expect, test } from 'bun:test'
import {
  collapseAfterDragEnd,
  collapsedDividerArrowDir,
  COLLAPSE_MOTION_EASING,
  COLLAPSE_MOTION_MS,
  COLLAPSE_THRESHOLD_PERCENT,
  collapseEase,
  collapseTweenRange,
  defaultLayoutForViewport,
  DETENT_RESISTANCE,
  displayedSplitFromPointer,
  dividerCollapsedPanelId,
  edgeSplitPercent,
  isPanelOffFlow,
  layoutRestoreTweenRange,
  panelStayMountedStyle,
  restoreCollapsedDivider,
  restoreTweenRange,
  restoredSplitPercent,
  tweenSplitAt,
} from './readPanelLayout'

describe('readPanelLayout', () => {
  test('mobile default is one panel; desktop default is two unless user chose', () => {
    expect(defaultLayoutForViewport(true)).toBe('one')
    expect(defaultLayoutForViewport(false)).toBe('two')
    expect(defaultLayoutForViewport(true, 'two', true)).toBe('two')
    expect(defaultLayoutForViewport(false, 'one', true)).toBe('one')
    expect(defaultLayoutForViewport(true, 'two', false)).toBe('one')
  })

  test('live drag matches the pointer until the 30/70 detent', () => {
    expect(COLLAPSE_THRESHOLD_PERCENT).toBe(30)
    expect(DETENT_RESISTANCE).toBeGreaterThanOrEqual(0.25)
    expect(DETENT_RESISTANCE).toBeLessThanOrEqual(0.35)
    expect(displayedSplitFromPointer(50)).toEqual({ splitPercent: 50, zone: 'live' })
    expect(displayedSplitFromPointer(COLLAPSE_THRESHOLD_PERCENT + 1)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT + 1,
      zone: 'live',
    })
    expect(displayedSplitFromPointer(100 - COLLAPSE_THRESHOLD_PERCENT - 1)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT - 1,
      zone: 'live',
    })
  })

  test('snap sticks visually at the 30% / 70% detent', () => {
    expect(displayedSplitFromPointer(COLLAPSE_THRESHOLD_PERCENT)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(100 - COLLAPSE_THRESHOLD_PERCENT)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
  })

  test('resistance past the detent shrinks the small pane slower than the pointer', () => {
    const left = displayedSplitFromPointer(20)
    expect(left.zone).toBe('resistance')
    expect(left.splitPercent).toBe(
      COLLAPSE_THRESHOLD_PERCENT - (COLLAPSE_THRESHOLD_PERCENT - 20) * DETENT_RESISTANCE
    )
    expect(left.splitPercent).toBeGreaterThan(20)
    expect(left.splitPercent).toBeLessThan(COLLAPSE_THRESHOLD_PERCENT)

    const right = displayedSplitFromPointer(80)
    expect(right.zone).toBe('resistance')
    expect(right.splitPercent).toBe(
      100 - COLLAPSE_THRESHOLD_PERCENT + (80 - (100 - COLLAPSE_THRESHOLD_PERCENT)) * DETENT_RESISTANCE
    )
    expect(right.splitPercent).toBeLessThan(80)
    expect(right.splitPercent).toBeGreaterThan(100 - COLLAPSE_THRESHOLD_PERCENT)

    const nearer = displayedSplitFromPointer(20).splitPercent
    const farther = displayedSplitFromPointer(10).splitPercent
    expect(nearer - farther).toBeCloseTo(10 * DETENT_RESISTANCE)
  })

  test('reduced motion skips rubber-band but still marks resistance past the detent', () => {
    expect(displayedSplitFromPointer(20, { reducedMotion: true })).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'resistance',
    })
    expect(displayedSplitFromPointer(80, { reducedMotion: true })).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'resistance',
    })
    expect(displayedSplitFromPointer(50, { reducedMotion: true })).toEqual({
      splitPercent: 50,
      zone: 'live',
    })
  })

  test('release on the detent stays; release past the detent collapses', () => {
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      collapsedPanelId: null,
    })
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      collapsedPanelId: null,
    })
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT + 1).collapsedPanelId).toBeNull()
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT - 1).collapsedPanelId).toBeNull()
    expect(collapseAfterDragEnd(50).collapsedPanelId).toBeNull()

    const left = collapseAfterDragEnd(20)
    expect(left.collapsedPanelId).toBe('panel-1')
    expect(left.splitPercent).toBe(displayedSplitFromPointer(20).splitPercent)

    const right = collapseAfterDragEnd(80)
    expect(right.collapsedPanelId).toBe('panel-2')
    expect(right.splitPercent).toBe(displayedSplitFromPointer(80).splitPercent)
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

  test('collapse/restore tween the same in-flow flex-basis live drag uses', () => {
    expect(edgeSplitPercent('panel-1')).toBe(0)
    expect(edgeSplitPercent('panel-2')).toBe(100)
    expect(collapseTweenRange('panel-2', 72)).toEqual({ from: 72, to: 100 })
    expect(collapseTweenRange('panel-1', 28)).toEqual({ from: 28, to: 0 })
    expect(restoreTweenRange('panel-2', 40)).toEqual({ from: 100, to: 40 })
    expect(restoreTweenRange('panel-1', 5)).toEqual({ from: 0, to: 50 })
    expect(layoutRestoreTweenRange(45)).toEqual({ from: 100, to: 45 })

    const mid = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-2',
      collapsedPanelId: null,
      panel1Percent: 85,
    })
    expect(mid.flexBasis).toBe('15%')
    expect(mid.position).toBeUndefined()
    expect(mid.visibility).toBe('visible')
    expect(mid.transition).toBe('none')

    const sibling = panelStayMountedStyle({
      layout: 'two',
      panelId: 'panel-1',
      collapsedPanelId: null,
      panel1Percent: 85,
    })
    expect(sibling.flexBasis).toBe('85%')
    expect(sibling.position).toBeUndefined()
  })

  test('split tween: last drag % → edge, ease-out, reduced motion jumps', () => {
    expect(COLLAPSE_MOTION_MS).toBe(200)
    expect(COLLAPSE_MOTION_EASING).toBe('cubic-bezier(0.4, 0, 0.2, 1)')
    expect(collapseEase(0)).toBe(0)
    expect(collapseEase(1)).toBe(1)
    expect(tweenSplitAt({ from: 25, to: 0, elapsedMs: 0 })).toEqual({
      splitPercent: 25,
      done: false,
    })
    expect(tweenSplitAt({ from: 25, to: 0, elapsedMs: COLLAPSE_MOTION_MS })).toEqual({
      splitPercent: 0,
      done: true,
    })
    expect(tweenSplitAt({ from: 0, to: 50, elapsedMs: 0, reducedMotion: true })).toEqual({
      splitPercent: 50,
      done: true,
    })
    expect(tweenSplitAt({ from: 70, to: 70, elapsedMs: 10 })).toEqual({
      splitPercent: 70,
      done: true,
    })
    const mid = tweenSplitAt({ from: 25, to: 0, elapsedMs: 100 })
    expect(mid.done).toBe(false)
    expect(mid.splitPercent).toBeGreaterThan(0)
    expect(mid.splitPercent).toBeLessThan(25)
    // cubic-bezier(0.4, 0, 0.2, 1) is ahead of linear at t=0.5
    expect(mid.splitPercent).toBeLessThan(12.5)
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
