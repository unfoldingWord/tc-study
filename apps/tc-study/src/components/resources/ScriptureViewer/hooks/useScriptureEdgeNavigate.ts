/**
 * Edge travel pads + elastic overscroll → next/prev navigation unit.
 * Pads appear only after the reader parks at a content edge, giving the
 * scrollbar extra range. Wheel/touch still rubber-band at the far edge.
 */

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import {
  accumulateEdgeOverscroll,
  commitEdgeNavigation,
  EDGE_NAV_MAX_PULL_PX,
  EDGE_NAV_MIN_DWELL_MS,
  EDGE_NAV_THRESHOLD_PX,
  EDGE_PAD_PEEK_PX,
  EDGE_TRAVEL_PAD_PX,
  edgeTravelFromPads,
  elasticPullPx,
  isEdgeGestureArmed,
  nextEdgePadVisibility,
  scaleWheelOverscrollDelta,
  scrollEdgeState,
  type ScriptureEdge,
} from '../../../../features/nav/scriptureEdgeNavigate'
import { beginProgrammaticScrollSuppress } from '../../../../features/nav/chapterScrollActivity'

export interface UseScriptureEdgeNavigateOptions {
  /** Element that actually scrolls (overflow parent), or null until mounted. */
  scrollParent: HTMLElement | null
  /** Content wrapper that receives translateY for elastic feedback. */
  contentEl: HTMLElement | null
  onNext: () => void
  onPrev: () => void
  canNext: () => boolean
  canPrev: () => boolean
  /** Called when a travel pad first appears — warm the adjacent chapter. */
  onArmed?: (edge: ScriptureEdge) => void
  enabled?: boolean
  thresholdPx?: number
  maxPullPx?: number
  minDwellMs?: number
}

function findOverflowParent(el: HTMLElement | null): HTMLElement | null {
  let parent = el?.parentElement ?? null
  while (parent) {
    const overflowY = getComputedStyle(parent).overflowY
    if (overflowY === 'auto' || overflowY === 'scroll') return parent
    parent = parent.parentElement
  }
  return null
}

export function resolveScriptureScrollParent(contentRoot: HTMLElement | null): HTMLElement | null {
  return findOverflowParent(contentRoot)
}

export function useScriptureEdgeNavigate({
  scrollParent,
  contentEl,
  onNext,
  onPrev,
  canNext,
  canPrev,
  onArmed,
  enabled = true,
  thresholdPx = EDGE_NAV_THRESHOLD_PX,
  maxPullPx = EDGE_NAV_MAX_PULL_PX,
  minDwellMs = EDGE_NAV_MIN_DWELL_MS,
}: UseScriptureEdgeNavigateOptions): {
  pullPx: number
  rawPullPx: number
  edge: ScriptureEdge | null
  showTopPad: boolean
  showBottomPad: boolean
  clickPrev: () => void
  clickNext: () => void
} {
  const [pullPx, setPullPx] = useState(0)
  const [rawPullPx, setRawPullPx] = useState(0)
  const [edge, setEdge] = useState<ScriptureEdge | null>(null)
  const [showTopPad, setShowTopPad] = useState(false)
  const [showBottomPad, setShowBottomPad] = useState(false)

  const rawRef = useRef(0)
  const edgeRef = useRef<ScriptureEdge | null>(null)
  const committedRef = useRef(false)
  const touchStartYRef = useRef<number | null>(null)
  const touchStartedAtEdgeRef = useRef<ScriptureEdge | null>(null)
  const edgeReachedAtRef = useRef<number | null>(null)
  const padArmedAtRef = useRef<number | null>(null)
  const showTopPadRef = useRef(false)
  const showBottomPadRef = useRef(false)
  const prevTopPadRef = useRef(false)
  const prevBottomPadRef = useRef(false)
  const onNextRef = useRef(onNext)
  const onPrevRef = useRef(onPrev)
  const canNextRef = useRef(canNext)
  const canPrevRef = useRef(canPrev)
  const onArmedRef = useRef(onArmed)
  onNextRef.current = onNext
  onPrevRef.current = onPrev
  canNextRef.current = canNext
  canPrevRef.current = canPrev
  onArmedRef.current = onArmed

  const applyVisual = (raw: number, nextEdge: ScriptureEdge | null) => {
    rawRef.current = raw
    edgeRef.current = nextEdge
    const display = nextEdge ? elasticPullPx(raw, maxPullPx) : 0
    const signed = nextEdge === 'top' ? display : nextEdge === 'bottom' ? -display : 0
    setPullPx(signed)
    setRawPullPx(nextEdge ? raw : 0)
    setEdge(nextEdge)
    if (contentEl) {
      contentEl.style.transform = signed ? `translateY(${signed}px)` : ''
      contentEl.style.transition = signed ? 'none' : 'transform 160ms ease-out'
    }
  }

  const clearPull = (resetCommitted = true) => {
    applyVisual(0, null)
    if (resetCommitted) committedRef.current = false
  }

  const dismissPads = () => {
    showTopPadRef.current = false
    showBottomPadRef.current = false
    padArmedAtRef.current = null
    setShowTopPad(false)
    setShowBottomPad(false)
  }

  const noteEdgePresence = (atTop: boolean, atBottom: boolean) => {
    if (atTop || atBottom) {
      if (edgeReachedAtRef.current == null) edgeReachedAtRef.current = Date.now()
    } else {
      edgeReachedAtRef.current = null
    }
  }

  const unlockTimerRef = useRef<number | null>(null)
  const lockGesture = () => {
    committedRef.current = true
    if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
    unlockTimerRef.current = window.setTimeout(() => {
      unlockTimerRef.current = null
      committedRef.current = false
    }, 450)
  }

  const fire = (action: 'previous' | 'next') => {
    lockGesture()
    clearPull(false)
    dismissPads()
    if (action === 'previous') onPrevRef.current()
    else onNextRef.current()
  }

  const tryCommit = (fromClick = false) => {
    if (committedRef.current) {
      clearPull(false)
      return
    }
    if (
      !fromClick &&
      !isEdgeGestureArmed(padArmedAtRef.current ?? edgeReachedAtRef.current, Date.now(), minDwellMs)
    ) {
      return
    }
    const action = commitEdgeNavigation({
      edge: edgeRef.current,
      rawOverscrollPx: fromClick ? thresholdPx : rawRef.current,
      canPrev: canPrevRef.current(),
      canNext: canNextRef.current(),
      thresholdPx,
    })
    if (action === 'previous' || action === 'next') {
      fire(action)
      return
    }
    if (contentEl) {
      contentEl.style.transition = 'transform 160ms ease-out'
    }
    clearPull(true)
  }

  const clickPrev = () => {
    if (!canPrevRef.current()) return
    edgeRef.current = 'top'
    rawRef.current = thresholdPx
    tryCommit(true)
  }

  const clickNext = () => {
    if (!canNextRef.current()) return
    edgeRef.current = 'bottom'
    rawRef.current = thresholdPx
    tryCommit(true)
  }

  const readPadTravel = () => {
    if (!scrollParent) {
      return edgeTravelFromPads({
        scrollTop: 0,
        scrollHeight: 0,
        clientHeight: 0,
        topPadPx: 0,
        bottomPadPx: 0,
      })
    }
    return edgeTravelFromPads({
      scrollTop: scrollParent.scrollTop,
      scrollHeight: scrollParent.scrollHeight,
      clientHeight: scrollParent.clientHeight,
      topPadPx: showTopPadRef.current ? EDGE_TRAVEL_PAD_PX : 0,
      bottomPadPx: showBottomPadRef.current ? EDGE_TRAVEL_PAD_PX : 0,
    })
  }

  const syncPadsFromScroll = () => {
    if (!scrollParent) return
    const travel = readPadTravel()
    const next = nextEdgePadVisibility({
      showTop: showTopPadRef.current,
      showBottom: showBottomPadRef.current,
      scrollTop: scrollParent.scrollTop,
      contentMin: travel.contentMin,
      contentMax: travel.contentMax,
      topRaw: travel.topRaw,
      bottomRaw: travel.bottomRaw,
      canPrev: canPrevRef.current(),
      canNext: canNextRef.current(),
    })

    if (next.showTop !== showTopPadRef.current) {
      showTopPadRef.current = next.showTop
      if (next.showTop) {
        padArmedAtRef.current = Date.now()
        onArmedRef.current?.('top')
      } else if (!next.showBottom) {
        padArmedAtRef.current = null
      }
      setShowTopPad(next.showTop)
    }
    if (next.showBottom !== showBottomPadRef.current) {
      showBottomPadRef.current = next.showBottom
      if (next.showBottom) {
        padArmedAtRef.current = Date.now()
        onArmedRef.current?.('bottom')
      } else if (!next.showTop) {
        padArmedAtRef.current = null
      }
      setShowBottomPad(next.showBottom)
    }

    if (travel.bottomRaw > 0) applyVisual(travel.bottomRaw, 'bottom')
    else if (travel.topRaw > 0) applyVisual(travel.topRaw, 'top')
    else if (rawRef.current > 0 && edgeRef.current) {
      // Leave elastic pull alone when parked at the far document edge.
      const { atTop, atBottom } = scrollEdgeState(
        scrollParent.scrollTop,
        scrollParent.scrollHeight,
        scrollParent.clientHeight
      )
      if (!atTop && !atBottom) applyVisual(0, null)
    }
  }

  useLayoutEffect(() => {
    if (!scrollParent) {
      prevTopPadRef.current = showTopPad
      prevBottomPadRef.current = showBottomPad
      return
    }
    const peekingIn =
      (showTopPad && !prevTopPadRef.current) || (showBottomPad && !prevBottomPadRef.current)
    const peekingOut =
      (!showTopPad && prevTopPadRef.current) || (!showBottomPad && prevBottomPadRef.current)
    if (peekingIn || peekingOut) {
      beginProgrammaticScrollSuppress(120)
    }
    if (showTopPad && !prevTopPadRef.current) {
      scrollParent.scrollTop += EDGE_TRAVEL_PAD_PX - EDGE_PAD_PEEK_PX
    } else if (!showTopPad && prevTopPadRef.current) {
      scrollParent.scrollTop = Math.max(0, scrollParent.scrollTop - EDGE_TRAVEL_PAD_PX)
    }
    if (showBottomPad && !prevBottomPadRef.current) {
      scrollParent.scrollTop += EDGE_PAD_PEEK_PX
    }
    prevTopPadRef.current = showTopPad
    prevBottomPadRef.current = showBottomPad
  }, [showTopPad, showBottomPad, scrollParent])

  useEffect(() => {
    if (!enabled || !scrollParent) {
      clearPull()
      dismissPads()
      return
    }

    const readEdges = () =>
      scrollEdgeState(scrollParent.scrollTop, scrollParent.scrollHeight, scrollParent.clientHeight)

    const onWheel = (event: WheelEvent) => {
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      syncPadsFromScroll()
      if (!atTop && !atBottom && rawRef.current === 0) return

      const inPad =
        (atBottom && showBottomPadRef.current) || (atTop && showTopPadRef.current)
      // While a pad is open, let native scroll consume the extra range first.
      if (inPad && (showBottomPadRef.current ? readPadTravel().bottomRaw < EDGE_TRAVEL_PAD_PX - 2 : readPadTravel().topRaw < EDGE_TRAVEL_PAD_PX - 2)) {
        return
      }

      const armed = isEdgeGestureArmed(edgeReachedAtRef.current, Date.now(), minDwellMs)
      const next = accumulateEdgeOverscroll({
        atTop,
        atBottom,
        deltaY: scaleWheelOverscrollDelta(event.deltaY),
        currentRaw: rawRef.current,
        currentEdge: edgeRef.current,
        armed,
      })

      if (next.edge && next.raw > 0) {
        event.preventDefault()
        applyVisual(next.raw, next.edge)
      } else if (rawRef.current > 0 && next.raw === 0) {
        applyVisual(0, null)
      }
    }

    let wheelSettleTimer: number | null = null
    const onWheelSettle = (event: WheelEvent) => {
      onWheel(event)
      if (wheelSettleTimer != null) window.clearTimeout(wheelSettleTimer)
      wheelSettleTimer = window.setTimeout(() => {
        wheelSettleTimer = null
        if (rawRef.current > 0) tryCommit()
      }, 180)
    }

    const onTouchStart = (event: TouchEvent) => {
      touchStartYRef.current = event.touches[0]?.clientY ?? null
      committedRef.current = false
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      touchStartedAtEdgeRef.current = atTop ? 'top' : atBottom ? 'bottom' : null
    }

    const onTouchMove = (event: TouchEvent) => {
      const startY = touchStartYRef.current
      const y = event.touches[0]?.clientY
      if (startY == null || y == null) return
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      syncPadsFromScroll()

      const started = touchStartedAtEdgeRef.current
      if (!started) {
        if (rawRef.current > 0) applyVisual(0, null)
        return
      }

      const travel = readPadTravel()
      if (started === 'bottom' && showBottomPadRef.current && travel.bottomRaw < EDGE_TRAVEL_PAD_PX - 2) {
        return
      }
      if (started === 'top' && showTopPadRef.current && travel.topRaw < EDGE_TRAVEL_PAD_PX - 2) {
        return
      }

      if (started === 'top' && atTop && y > startY) {
        const raw = y - startY
        if (raw > 0) {
          event.preventDefault()
          applyVisual(raw, 'top')
        }
        return
      }
      if (started === 'bottom' && atBottom && y < startY) {
        const raw = startY - y
        if (raw > 0) {
          event.preventDefault()
          applyVisual(raw, 'bottom')
        }
        return
      }
      if (rawRef.current > 0) applyVisual(0, null)
    }

    const onTouchEnd = () => {
      touchStartYRef.current = null
      touchStartedAtEdgeRef.current = null
      if (rawRef.current > 0) tryCommit()
    }

    let scrollSettleTimer: number | null = null
    const onScroll = () => {
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      syncPadsFromScroll()
      if (scrollSettleTimer != null) window.clearTimeout(scrollSettleTimer)
      scrollSettleTimer = window.setTimeout(() => {
        scrollSettleTimer = null
        if (rawRef.current > 0) tryCommit()
      }, 180)
    }

    scrollParent.addEventListener('wheel', onWheelSettle, { passive: false })
    scrollParent.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollParent.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollParent.addEventListener('touchend', onTouchEnd, { passive: true })
    scrollParent.addEventListener('touchcancel', onTouchEnd, { passive: true })
    scrollParent.addEventListener('scroll', onScroll, { passive: true })
    syncPadsFromScroll()

    return () => {
      scrollParent.removeEventListener('wheel', onWheelSettle)
      scrollParent.removeEventListener('touchstart', onTouchStart)
      scrollParent.removeEventListener('touchmove', onTouchMove)
      scrollParent.removeEventListener('touchend', onTouchEnd)
      scrollParent.removeEventListener('touchcancel', onTouchEnd)
      scrollParent.removeEventListener('scroll', onScroll)
      if (wheelSettleTimer != null) window.clearTimeout(wheelSettleTimer)
      if (scrollSettleTimer != null) window.clearTimeout(scrollSettleTimer)
      if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
      if (contentEl) {
        contentEl.style.transform = ''
        contentEl.style.transition = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- applyVisual closes over latest contentEl
  }, [enabled, scrollParent, contentEl, thresholdPx, maxPullPx, minDwellMs])

  return {
    pullPx,
    rawPullPx,
    edge,
    showTopPad,
    showBottomPad,
    clickPrev,
    clickNext,
  }
}
