/**
 * Elastic overscroll on the scripture pane → next/prev navigation unit.
 * Gated so navigation is intentional: dwell at edge, touch must start at edge,
 * wheel accumulates slowly and needs a large release threshold.
 */

import { useEffect, useRef, useState } from 'react'
import {
  accumulateEdgeOverscroll,
  commitEdgeNavigation,
  elasticPullPx,
  EDGE_NAV_MAX_PULL_PX,
  EDGE_NAV_MIN_DWELL_MS,
  EDGE_NAV_THRESHOLD_PX,
  isEdgeGestureArmed,
  scaleWheelOverscrollDelta,
  scrollEdgeState,
  type ScriptureEdge,
} from '../../../../features/nav/scriptureEdgeNavigate'

export interface UseScriptureEdgeNavigateOptions {
  /** Element that actually scrolls (overflow parent), or null until mounted. */
  scrollParent: HTMLElement | null
  /** Content wrapper that receives translateY for elastic feedback. */
  contentEl: HTMLElement | null
  onNext: () => void
  onPrev: () => void
  canNext: () => boolean
  canPrev: () => boolean
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
  enabled = true,
  thresholdPx = EDGE_NAV_THRESHOLD_PX,
  maxPullPx = EDGE_NAV_MAX_PULL_PX,
  minDwellMs = EDGE_NAV_MIN_DWELL_MS,
}: UseScriptureEdgeNavigateOptions): {
  pullPx: number
  rawPullPx: number
  edge: ScriptureEdge | null
} {
  const [pullPx, setPullPx] = useState(0)
  const [rawPullPx, setRawPullPx] = useState(0)
  const [edge, setEdge] = useState<ScriptureEdge | null>(null)

  const rawRef = useRef(0)
  const edgeRef = useRef<ScriptureEdge | null>(null)
  const committedRef = useRef(false)
  const touchStartYRef = useRef<number | null>(null)
  /** Touch overscroll only if the gesture began already at that edge. */
  const touchStartedAtEdgeRef = useRef<ScriptureEdge | null>(null)
  const edgeReachedAtRef = useRef<number | null>(null)
  const onNextRef = useRef(onNext)
  const onPrevRef = useRef(onPrev)
  const canNextRef = useRef(canNext)
  const canPrevRef = useRef(canPrev)
  onNextRef.current = onNext
  onPrevRef.current = onPrev
  canNextRef.current = canNext
  canPrevRef.current = canPrev

  const applyVisual = (raw: number, nextEdge: ScriptureEdge | null) => {
    rawRef.current = raw
    edgeRef.current = nextEdge
    const display = nextEdge ? elasticPullPx(raw, maxPullPx) : 0
    // top pull → content moves down (+Y); bottom pull → content moves up (−Y)
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
    // Block wheel inertia / bounce from firing a second unit advance.
    unlockTimerRef.current = window.setTimeout(() => {
      unlockTimerRef.current = null
      committedRef.current = false
    }, 450)
  }

  const tryCommit = () => {
    // One navigation per gesture — ignore inertia after a successful commit.
    if (committedRef.current) {
      clearPull(false)
      return
    }
    const action = commitEdgeNavigation({
      edge: edgeRef.current,
      rawOverscrollPx: rawRef.current,
      canPrev: canPrevRef.current(),
      canNext: canNextRef.current(),
      thresholdPx,
    })
    if (action === 'previous') {
      lockGesture()
      clearPull(false)
      onPrevRef.current()
      return
    }
    if (action === 'next') {
      lockGesture()
      clearPull(false)
      onNextRef.current()
      return
    }
    // Below threshold or blocked — spring back
    if (contentEl) {
      contentEl.style.transition = 'transform 160ms ease-out'
    }
    clearPull(true)
  }

  useEffect(() => {
    if (!enabled || !scrollParent) {
      clearPull()
      return
    }

    const readEdges = () =>
      scrollEdgeState(scrollParent.scrollTop, scrollParent.scrollHeight, scrollParent.clientHeight)

    const onWheel = (event: WheelEvent) => {
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      if (!atTop && !atBottom && rawRef.current === 0) return

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
        // Resist native scroll chaining while pulling
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
      // Longer settle so a brief flick at the edge does not commit.
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
      // Only intentional: finger must start while already parked at the edge.
      touchStartedAtEdgeRef.current = atTop ? 'top' : atBottom ? 'bottom' : null
    }

    const onTouchMove = (event: TouchEvent) => {
      const startY = touchStartYRef.current
      const y = event.touches[0]?.clientY
      if (startY == null || y == null) return
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)

      const started = touchStartedAtEdgeRef.current
      if (!started) {
        if (rawRef.current > 0) applyVisual(0, null)
        return
      }

      // Touch that began at the edge is already intentional — no extra dwell gate.
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

    const onScroll = () => {
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      if (!atTop && !atBottom && rawRef.current > 0) {
        applyVisual(0, null)
      }
    }

    scrollParent.addEventListener('wheel', onWheelSettle, { passive: false })
    scrollParent.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollParent.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollParent.addEventListener('touchend', onTouchEnd, { passive: true })
    scrollParent.addEventListener('touchcancel', onTouchEnd, { passive: true })
    scrollParent.addEventListener('scroll', onScroll, { passive: true })

    return () => {
      scrollParent.removeEventListener('wheel', onWheelSettle)
      scrollParent.removeEventListener('touchstart', onTouchStart)
      scrollParent.removeEventListener('touchmove', onTouchMove)
      scrollParent.removeEventListener('touchend', onTouchEnd)
      scrollParent.removeEventListener('touchcancel', onTouchEnd)
      scrollParent.removeEventListener('scroll', onScroll)
      if (wheelSettleTimer != null) window.clearTimeout(wheelSettleTimer)
      if (unlockTimerRef.current != null) window.clearTimeout(unlockTimerRef.current)
      if (contentEl) {
        contentEl.style.transform = ''
        contentEl.style.transition = ''
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- clearPull/applyVisual close over latest contentEl
  }, [enabled, scrollParent, contentEl, thresholdPx, maxPullPx, minDwellMs])

  return { pullPx, rawPullPx, edge }
}
