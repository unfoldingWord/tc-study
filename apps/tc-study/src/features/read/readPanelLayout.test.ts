import { describe, expect, test } from 'bun:test'
import {
  collapseAfterDragEnd,
  collapseCommitPanelId,
  collapseDuringDrag,
  collapseFromUserDragOnly,
  collapsedDividerArrowDir,
  COLLAPSE_MOTION_EASING,
  COLLAPSE_MOTION_MS,
  COLLAPSE_THRESHOLD_PERCENT,
  collapseEase,
  collapseTweenRange,
  defaultLayoutForViewport,
  hydratePersistedPanelChrome,
  layoutAfterContainerMeasure,
  DETENT_CAPTURE_PERCENT,
  DETENT_COMMIT_OFFSET_PERCENT,
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
  test('mobile and desktop default to two open panels unless the user chose one', () => {
    expect(defaultLayoutForViewport(true)).toBe('two')
    expect(defaultLayoutForViewport(false)).toBe('two')
    expect(defaultLayoutForViewport(true, 'two', true)).toBe('two')
    expect(defaultLayoutForViewport(false, 'one', true)).toBe('one')
    expect(defaultLayoutForViewport(true, 'two', false)).toBe('two')
    expect(defaultLayoutForViewport(true, 'one', false)).toBe('two')
  })

  test('initial mobile/column layout stays open; first measure does not collapse', () => {
    expect(defaultLayoutForViewport(true)).toBe('two')
    expect(
      isPanelOffFlow({ layout: 'two', panelId: 'panel-1', collapsedPanelId: null })
    ).toBe(false)
    expect(
      isPanelOffFlow({ layout: 'two', panelId: 'panel-2', collapsedPanelId: null })
    ).toBe(false)
    expect(dividerCollapsedPanelId({ layout: 'two', collapsedPanelId: null })).toBeNull()

    const stacked = layoutAfterContainerMeasure(50)
    expect(stacked.collapsedPanelId).toBeNull()
    expect(stacked.splitPercent).toBe(50)

    const staleBottom = layoutAfterContainerMeasure(80)
    expect(staleBottom.collapsedPanelId).toBeNull()
    expect(staleBottom.splitPercent).toBe(100 - COLLAPSE_THRESHOLD_PERCENT)

    const staleTop = layoutAfterContainerMeasure(20)
    expect(staleTop.collapsedPanelId).toBeNull()
    expect(staleTop.splitPercent).toBe(COLLAPSE_THRESHOLD_PERCENT)

    expect(
      collapseFromUserDragOnly({ pointerPercent: 90, userDragged: false }).collapsedPanelId
    ).toBeNull()
    expect(
      collapseFromUserDragOnly({ pointerPercent: 90, userDragged: true }).collapsedPanelId
    ).toBe('panel-2')
  })

  test('hydrate keeps a real user collapse and opens auto one-panel mobile saves', () => {
    expect(
      hydratePersistedPanelChrome({
        layout: 'one',
        layoutUserChosen: false,
        collapsedPanelId: null,
        splitPercent: 50,
      })
    ).toEqual({ layout: 'two', collapsedPanelId: null, splitPercent: 50 })
    expect(
      hydratePersistedPanelChrome({
        layout: 'two',
        layoutUserChosen: false,
        collapsedPanelId: 'panel-2',
        splitPercent: 50,
      })
    ).toEqual({ layout: 'two', collapsedPanelId: null, splitPercent: 50 })
    expect(
      hydratePersistedPanelChrome({
        layout: 'two',
        layoutUserChosen: false,
        collapsedPanelId: 'panel-2',
        splitPercent: 100,
      })
    ).toEqual({ layout: 'two', collapsedPanelId: 'panel-2', splitPercent: 100 })
  })

  test('live drag matches the pointer until the capture band', () => {
    expect(COLLAPSE_THRESHOLD_PERCENT).toBe(30)
    expect(DETENT_CAPTURE_PERCENT).toBeGreaterThanOrEqual(3)
    expect(DETENT_CAPTURE_PERCENT).toBeLessThanOrEqual(4)
    expect(displayedSplitFromPointer(50)).toEqual({ splitPercent: 50, zone: 'live' })
    expect(displayedSplitFromPointer(COLLAPSE_THRESHOLD_PERCENT + DETENT_CAPTURE_PERCENT + 1)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT + DETENT_CAPTURE_PERCENT + 1,
      zone: 'live',
    })
    expect(displayedSplitFromPointer(100 - COLLAPSE_THRESHOLD_PERCENT - DETENT_CAPTURE_PERCENT - 1)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT - DETENT_CAPTURE_PERCENT - 1,
      zone: 'live',
    })
  })

  test('magnetic capture jumps to 30/70 when the pointer is close enough', () => {
    expect(displayedSplitFromPointer(COLLAPSE_THRESHOLD_PERCENT + DETENT_CAPTURE_PERCENT)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(100 - COLLAPSE_THRESHOLD_PERCENT - DETENT_CAPTURE_PERCENT)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(COLLAPSE_THRESHOLD_PERCENT)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(100 - COLLAPSE_THRESHOLD_PERCENT)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
  })

  test('hard lock: captured split stays at 30/70 until commit (no rubber-band)', () => {
    const justPastLow = COLLAPSE_THRESHOLD_PERCENT - 1
    const justPastHigh = 100 - COLLAPSE_THRESHOLD_PERCENT + 1
    const nearCommitLow = COLLAPSE_THRESHOLD_PERCENT - DETENT_COMMIT_OFFSET_PERCENT + 1
    const nearCommitHigh = 100 - COLLAPSE_THRESHOLD_PERCENT + DETENT_COMMIT_OFFSET_PERCENT - 1

    expect(displayedSplitFromPointer(justPastLow)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(nearCommitLow)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(20)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(justPastHigh)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(nearCommitHigh)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(80)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      zone: 'detent',
    })
    expect(displayedSplitFromPointer(20).splitPercent).toBe(displayedSplitFromPointer(10).splitPercent)
  })

  test('release on the detent stays; release past detent+offset collapses', () => {
    expect(DETENT_COMMIT_OFFSET_PERCENT).toBe(5)
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
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT + DETENT_CAPTURE_PERCENT)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      collapsedPanelId: null,
    })
    // Locked on detent, short of the commit offset: stay at 30/70.
    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT - 1)).toEqual({
      splitPercent: COLLAPSE_THRESHOLD_PERCENT,
      collapsedPanelId: null,
    })
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT + 1)).toEqual({
      splitPercent: 100 - COLLAPSE_THRESHOLD_PERCENT,
      collapsedPanelId: null,
    })

    const left = collapseAfterDragEnd(20)
    expect(left.collapsedPanelId).toBe('panel-1')
    expect(left.splitPercent).toBe(displayedSplitFromPointer(20).splitPercent)

    const right = collapseAfterDragEnd(80)
    expect(right.collapsedPanelId).toBe('panel-2')
    expect(right.splitPercent).toBe(displayedSplitFromPointer(80).splitPercent)
    expect(collapseAfterDragEnd(10).collapsedPanelId).not.toBe(collapseAfterDragEnd(90).collapsedPanelId)
  })

  test('drag past detent+offset collapses without a release event', () => {
    const low = COLLAPSE_THRESHOLD_PERCENT - DETENT_COMMIT_OFFSET_PERCENT
    const high = 100 - COLLAPSE_THRESHOLD_PERCENT + DETENT_COMMIT_OFFSET_PERCENT
    expect(low).toBe(25)
    expect(high).toBe(75)

    expect(collapseCommitPanelId(COLLAPSE_THRESHOLD_PERCENT)).toBeNull()
    expect(collapseCommitPanelId(low + 1)).toBeNull()
    expect(collapseCommitPanelId(high - 1)).toBeNull()
    expect(collapseDuringDrag(low + 1).collapsedPanelId).toBeNull()
    expect(collapseDuringDrag(high - 1).collapsedPanelId).toBeNull()
    expect(collapseDuringDrag(COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBeNull()

    const left = collapseDuringDrag(low)
    expect(left.collapsedPanelId).toBe('panel-1')
    expect(left.splitPercent).toBe(displayedSplitFromPointer(low).splitPercent)
    expect(collapseCommitPanelId(low)).toBe('panel-1')
    expect(collapseCommitPanelId(low - 1)).toBe('panel-1')

    const right = collapseDuringDrag(high)
    expect(right.collapsedPanelId).toBe('panel-2')
    expect(right.splitPercent).toBe(displayedSplitFromPointer(high).splitPercent)
    expect(collapseCommitPanelId(high)).toBe('panel-2')

    expect(collapseAfterDragEnd(COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBeNull()
    expect(collapseAfterDragEnd(100 - COLLAPSE_THRESHOLD_PERCENT).collapsedPanelId).toBeNull()
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
