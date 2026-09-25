/**
 * Content-edge chevrons + elastic overscroll → next/prev navigation unit.
 * Chevrons mount at document start/end when an adjacent unit exists (click to
 * commit). No travel pad / scrollbar runway — further pull uses elastic overscroll.
 */

import { useEffect, useRef, useState } from 'react'
import { isProgrammaticScrollSuppressed } from '../../../../features/nav/chapterScrollActivity'
import {
  accumulateEdgeOverscroll,
  commitEdgeNavigation,
  EDGE_NAV_MAX_PULL_PX,
  EDGE_NAV_MIN_DWELL_MS,
  EDGE_NAV_THRESHOLD_PX,
  elasticPullPx,
  isEdgeGestureArmed,
  isPastCommitThreshold,
  nextEdgeCueVisibility,
  peakOverscrollPx,
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
  /** Called when an edge cue first appears — warm the adjacent chapter. */
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

/** Prefer the element itself when it is the scrollport (panel-owned overflow). */
export function resolveScriptureScrollParent(contentRoot: HTMLElement | null): HTMLElement | null {
  if (!contentRoot) return null
  const selfOverflow = getComputedStyle(contentRoot).overflowY
  if (selfOverflow === 'auto' || selfOverflow === 'scroll') return contentRoot
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
  showTopCue: boolean
  showBottomCue: boolean
  clickPrev: () => void
  clickNext: () => void
} {
  const [pullPx, setPullPx] = useState(0)
  const [rawPullPx, setRawPullPx] = useState(0)
  const [edge, setEdge] = useState<ScriptureEdge | null>(null)
  const [showTopCue, setShowTopCue] = useState(false)
  const [showBottomCue, setShowBottomCue] = useState(false)

  const rawRef = useRef(0)
  const edgeRef = useRef<ScriptureEdge | null>(null)
  /** Highest raw this pull — bounce-back must not lose a crossed threshold. */
  const peakRawRef = useRef(0)
  const latchedEdgeRef = useRef<ScriptureEdge | null>(null)
  const committedRef = useRef(false)
  const touchStartYRef = useRef<number | null>(null)
  const touchStartedAtEdgeRef = useRef<ScriptureEdge | null>(null)
  const edgeReachedAtRef = useRef<number | null>(null)
  const cueArmedAtRef = useRef<number | null>(null)
  const showTopCueRef = useRef(false)
  const showBottomCueRef = useRef(false)
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
    if (nextEdge && raw > 0) {
      peakRawRef.current = peakOverscrollPx(raw, peakRawRef.current)
      if (isPastCommitThreshold(peakRawRef.current, thresholdPx)) {
        latchedEdgeRef.current = nextEdge
      }
    }
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

  const resetGesturePeak = () => {
    peakRawRef.current = 0
    latchedEdgeRef.current = null
  }

  const clearPull = (resetCommitted = true) => {
    applyVisual(0, null)
    resetGesturePeak()
    if (resetCommitted) committedRef.current = false
  }

  const dismissCues = () => {
    showTopCueRef.current = false
    showBottomCueRef.current = false
    cueArmedAtRef.current = null
    setShowTopCue(false)
    setShowBottomCue(false)
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

  const syncCuesFromScroll = () => {
    const next = nextEdgeCueVisibility({
      canPrev: canPrevRef.current(),
      canNext: canNextRef.current(),
    })

    if (next.showTop !== showTopCueRef.current) {
      showTopCueRef.current = next.showTop
      if (next.showTop) {
        cueArmedAtRef.current = Date.now()
        onArmedRef.current?.('top')
      } else if (!next.showBottom) {
        cueArmedAtRef.current = null
      }
      setShowTopCue(next.showTop)
    }

    if (next.showBottom !== showBottomCueRef.current) {
      showBottomCueRef.current = next.showBottom
      if (next.showBottom) {
        cueArmedAtRef.current = Date.now()
        onArmedRef.current?.('bottom')
      } else if (!next.showTop) {
        cueArmedAtRef.current = null
      }
      setShowBottomCue(next.showBottom)
    }
  }

  const fire = (action: 'previous' | 'next') => {
    lockGesture()
    clearPull(false)
    dismissCues()
    if (action === 'previous') onPrevRef.current()
    else onNextRef.current()
    // Restore always-available cues for the new unit as soon as can* updates.
    syncCuesFromScroll()
  }

  const tryCommit = (fromClick = false) => {
    if (!fromClick && isProgrammaticScrollSuppressed()) {
      clearPull(false)
      return
    }
    if (committedRef.current) {
      clearPull(false)
      return
    }
    const peak = peakOverscrollPx(rawRef.current, peakRawRef.current)
    const crossed = fromClick || isPastCommitThreshold(peak, thresholdPx)
    if (
      !fromClick &&
      !crossed &&
      !isEdgeGestureArmed(cueArmedAtRef.current ?? edgeReachedAtRef.current, Date.now(), minDwellMs)
    ) {
      return
    }
    const action = commitEdgeNavigation({
      edge: edgeRef.current,
      rawOverscrollPx: fromClick ? thresholdPx : rawRef.current,
      peakOverscrollPx: fromClick ? thresholdPx : peak,
      latchedEdge: fromClick ? edgeRef.current : latchedEdgeRef.current,
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

  const commitIfCrossed = () => {
    const peak = peakOverscrollPx(rawRef.current, peakRawRef.current)
    if (latchedEdgeRef.current || isPastCommitThreshold(peak, thresholdPx)) {
      tryCommit()
    }
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

  useEffect(() => {
    if (!enabled || !scrollParent) {
      clearPull()
      dismissCues()
      return
    }

    const readEdges = () =>
      scrollEdgeState(scrollParent.scrollTop, scrollParent.scrollHeight, scrollParent.clientHeight)

    const onWheel = (event: WheelEvent) => {
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      syncCuesFromScroll()
      if (!atTop && !atBottom && rawRef.current === 0) {
        commitIfCrossed()
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
        // Click commits immediately; scroll must too once the spinner is shown.
        // Waiting for settle lets bounce-back / leave-edge wipe raw and abort.
        commitIfCrossed()
      } else if (rawRef.current > 0 && next.raw === 0) {
        applyVisual(0, null)
        commitIfCrossed()
      }
    }

    let wheelSettleTimer: number | null = null
    const onWheelSettle = (event: WheelEvent) => {
      onWheel(event)
      if (wheelSettleTimer != null) window.clearTimeout(wheelSettleTimer)
      wheelSettleTimer = window.setTimeout(() => {
        wheelSettleTimer = null
        if (rawRef.current > 0 || latchedEdgeRef.current) tryCommit()
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
      syncCuesFromScroll()

      const started = touchStartedAtEdgeRef.current
      if (!started) {
        if (rawRef.current > 0) applyVisual(0, null)
        return
      }

      if (started === 'top' && atTop && y > startY) {
        const raw = y - startY
        if (raw > 0) {
          event.preventDefault()
          applyVisual(raw, 'top')
          commitIfCrossed()
        }
        return
      }
      if (started === 'bottom' && atBottom && y < startY) {
        const raw = startY - y
        if (raw > 0) {
          event.preventDefault()
          applyVisual(raw, 'bottom')
          commitIfCrossed()
        }
        return
      }
      if (rawRef.current > 0) applyVisual(0, null)
    }

    const onTouchEnd = () => {
      touchStartYRef.current = null
      touchStartedAtEdgeRef.current = null
      if (rawRef.current > 0 || latchedEdgeRef.current) tryCommit()
    }

    let scrollSettleTimer: number | null = null
    const onScroll = () => {
      const { atTop, atBottom } = readEdges()
      noteEdgePresence(atTop, atBottom)
      syncCuesFromScroll()
      if (rawRef.current > 0 && !atTop && !atBottom) applyVisual(0, null)
      if (scrollSettleTimer != null) window.clearTimeout(scrollSettleTimer)
      scrollSettleTimer = window.setTimeout(() => {
        scrollSettleTimer = null
        if (rawRef.current > 0 || latchedEdgeRef.current) tryCommit()
      }, 180)
    }

    scrollParent.addEventListener('wheel', onWheelSettle, { passive: false })
    scrollParent.addEventListener('touchstart', onTouchStart, { passive: true })
    scrollParent.addEventListener('touchmove', onTouchMove, { passive: false })
    scrollParent.addEventListener('touchend', onTouchEnd, { passive: true })
    scrollParent.addEventListener('touchcancel', onTouchEnd, { passive: true })
    scrollParent.addEventListener('scroll', onScroll, { passive: true })
    syncCuesFromScroll()

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

  // canNext/canPrev change with chapter without a scroll event — keep cues in sync.
  useEffect(() => {
    if (!enabled || !scrollParent) return
    syncCuesFromScroll()
    // Re-run when navigation callbacks change identity (chapter / can* closure).
  }, [enabled, scrollParent, canNext, canPrev])

  return {
    pullPx,
    rawPullPx,
    edge,
    showTopCue,
    showBottomCue,
    clickPrev,
    clickNext,
  }
}
