import { describe, expect, it } from 'vitest'
import {
  accumulateEdgeOverscroll,
  commitEdgeNavigation,
  EDGE_NAV_THRESHOLD_PX,
  EDGE_TRAVEL_PAD_PX,
  edgeTravelFromPads,
  elasticPullPx,
  isEdgeGestureArmed,
  isPastCommitThreshold,
  isVerticalScrollbarHit,
  nextEdgePadVisibility,
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

describe('isVerticalScrollbarHit', () => {
  function box(args: { left: number; right: number; offsetWidth: number; clientWidth: number }) {
    return {
      getBoundingClientRect: () =>
        ({ left: args.left, right: args.right, top: 0, bottom: 200, width: args.right - args.left, height: 200 }) as DOMRect,
      offsetWidth: args.offsetWidth,
      clientWidth: args.clientWidth,
    }
  }

  it('hits the classic LTR gutter', () => {
    const el = box({ left: 0, right: 200, offsetWidth: 200, clientWidth: 185 })
    expect(isVerticalScrollbarHit(el, 190, 'ltr')).toBe(true)
    expect(isVerticalScrollbarHit(el, 100, 'ltr')).toBe(false)
  })

  it('hits the RTL gutter on the inline-start side', () => {
    const el = box({ left: 0, right: 200, offsetWidth: 200, clientWidth: 185 })
    expect(isVerticalScrollbarHit(el, 8, 'rtl')).toBe(true)
    expect(isVerticalScrollbarHit(el, 190, 'rtl')).toBe(false)
  })

  it('falls back to a thin overlay strip when gutter is 0', () => {
    const el = box({ left: 0, right: 200, offsetWidth: 200, clientWidth: 200 })
    expect(isVerticalScrollbarHit(el, 195, 'ltr')).toBe(true)
    expect(isVerticalScrollbarHit(el, 160, 'ltr')).toBe(false)
  })
})

describe('edgeTravelFromPads', () => {
  it('measures travel into a bottom pad so the scrollbar can keep going', () => {
    const travel = edgeTravelFromPads({
      scrollTop: 400 + 50,
      scrollHeight: 600 + EDGE_TRAVEL_PAD_PX,
      clientHeight: 200,
      topPadPx: 0,
      bottomPadPx: EDGE_TRAVEL_PAD_PX,
    })
    expect(travel.contentMax).toBe(400)
    expect(travel.bottomRaw).toBe(50)
    expect(travel.atContentBottom).toBe(true)
    expect(travel.bottomRaw).toBeLessThan(EDGE_NAV_THRESHOLD_PX)
  })

  it('measures travel into a top pad', () => {
    const travel = edgeTravelFromPads({
      scrollTop: 20,
      scrollHeight: 600 + EDGE_TRAVEL_PAD_PX,
      clientHeight: 200,
      topPadPx: EDGE_TRAVEL_PAD_PX,
      bottomPadPx: 0,
    })
    expect(travel.contentMin).toBe(EDGE_TRAVEL_PAD_PX)
    expect(travel.topRaw).toBe(EDGE_TRAVEL_PAD_PX - 20)
    expect(travel.atContentTop).toBe(true)
  })
})

describe('nextEdgePadVisibility', () => {
  it('shows the bottom pad only after the content end is reached', () => {
    expect(
      nextEdgePadVisibility({
        showTop: false,
        showBottom: false,
        scrollTop: 200,
        contentMin: 0,
        contentMax: 400,
        topRaw: 0,
        bottomRaw: 0,
        canPrev: true,
        canNext: true,
      }).showBottom
    ).toBe(false)
    expect(
      nextEdgePadVisibility({
        showTop: false,
        showBottom: false,
        scrollTop: 400,
        contentMin: 0,
        contentMax: 400,
        topRaw: 0,
        bottomRaw: 0,
        canPrev: true,
        canNext: true,
      }).showBottom
    ).toBe(true)
  })

  it('keeps the pad while traveling, then hides after scrolling back into the text', () => {
    expect(
      nextEdgePadVisibility({
        showTop: false,
        showBottom: true,
        scrollTop: 450,
        contentMin: 0,
        contentMax: 400,
        topRaw: 0,
        bottomRaw: 50,
        canPrev: false,
        canNext: true,
      }).showBottom
    ).toBe(true)
    expect(
      nextEdgePadVisibility({
        showTop: false,
        showBottom: true,
        scrollTop: 300,
        contentMin: 0,
        contentMax: 400,
        topRaw: 0,
        bottomRaw: 0,
        canPrev: false,
        canNext: true,
      }).showBottom
    ).toBe(false)
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
