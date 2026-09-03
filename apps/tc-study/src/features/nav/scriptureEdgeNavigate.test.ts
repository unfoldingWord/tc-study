import { describe, expect, it } from 'vitest'
import {
  accumulateEdgeOverscroll,
  commitEdgeNavigation,
  elasticPullPx,
  isEdgeGestureArmed,
  isPastCommitThreshold,
  scaleWheelOverscrollDelta,
  scrollEdgeState,
} from './scriptureEdgeNavigate'

describe('elasticPullPx', () => {
  it('applies resistance and caps magnitude', () => {
    expect(elasticPullPx(100, 48, 0.35)).toBe(35)
    expect(elasticPullPx(200, 48, 0.35)).toBe(48)
    expect(elasticPullPx(0, 48)).toBe(0)
  })
})

describe('isPastCommitThreshold', () => {
  it('requires threshold', () => {
    expect(isPastCommitThreshold(40, 120)).toBe(false)
    expect(isPastCommitThreshold(120, 120)).toBe(true)
  })
})

describe('isEdgeGestureArmed', () => {
  it('requires dwell before arming', () => {
    expect(isEdgeGestureArmed(null, 1000, 320)).toBe(false)
    expect(isEdgeGestureArmed(1000, 1200, 320)).toBe(false)
    expect(isEdgeGestureArmed(1000, 1320, 320)).toBe(true)
  })
})

describe('scaleWheelOverscrollDelta', () => {
  it('dampens wheel deltas', () => {
    expect(scaleWheelOverscrollDelta(100, 0.4)).toBe(40)
  })
})

describe('scrollEdgeState', () => {
  it('detects top and bottom with slop', () => {
    expect(scrollEdgeState(0, 500, 200)).toEqual({ atTop: true, atBottom: false })
    expect(scrollEdgeState(300, 500, 200)).toEqual({ atTop: false, atBottom: true })
    expect(scrollEdgeState(100, 500, 200)).toEqual({ atTop: false, atBottom: false })
  })
})

describe('accumulateEdgeOverscroll', () => {
  it('accumulates at bottom edge for positive delta when armed', () => {
    const next = accumulateEdgeOverscroll({
      atTop: false,
      atBottom: true,
      deltaY: 20,
      currentRaw: 0,
      currentEdge: null,
      armed: true,
    })
    expect(next.edge).toBe('bottom')
    expect(next.raw).toBe(20)
  })

  it('ignores accumulation when not armed', () => {
    const next = accumulateEdgeOverscroll({
      atTop: false,
      atBottom: true,
      deltaY: 40,
      currentRaw: 10,
      currentEdge: 'bottom',
      armed: false,
    })
    expect(next.raw).toBe(0)
    expect(next.edge).toBeNull()
  })

  it('accumulates at top edge for negative delta', () => {
    const next = accumulateEdgeOverscroll({
      atTop: true,
      atBottom: false,
      deltaY: -20,
      currentRaw: 0,
      currentEdge: null,
    })
    expect(next.edge).toBe('top')
    expect(next.raw).toBe(20)
  })

  it('clears when not at an edge', () => {
    const next = accumulateEdgeOverscroll({
      atTop: false,
      atBottom: false,
      deltaY: 40,
      currentRaw: 30,
      currentEdge: 'bottom',
    })
    expect(next.raw).toBe(0)
    expect(next.edge).toBeNull()
  })
})

describe('commitEdgeNavigation', () => {
  it('commits next once past threshold when canNext', () => {
    expect(
      commitEdgeNavigation({
        edge: 'bottom',
        rawOverscrollPx: 130,
        canPrev: true,
        canNext: true,
        thresholdPx: 120,
      })
    ).toBe('next')
  })

  it('commits previous at top edge', () => {
    expect(
      commitEdgeNavigation({
        edge: 'top',
        rawOverscrollPx: 130,
        canPrev: true,
        canNext: true,
        thresholdPx: 120,
      })
    ).toBe('previous')
  })

  it('cancels below threshold', () => {
    expect(
      commitEdgeNavigation({
        edge: 'bottom',
        rawOverscrollPx: 40,
        canPrev: true,
        canNext: true,
        thresholdPx: 120,
      })
    ).toBeNull()
  })

  it('does not navigate when canGo is false', () => {
    expect(
      commitEdgeNavigation({
        edge: 'bottom',
        rawOverscrollPx: 130,
        canPrev: true,
        canNext: false,
        thresholdPx: 120,
      })
    ).toBeNull()
    expect(
      commitEdgeNavigation({
        edge: 'top',
        rawOverscrollPx: 130,
        canPrev: false,
        canNext: true,
        thresholdPx: 120,
      })
    ).toBeNull()
  })
})
