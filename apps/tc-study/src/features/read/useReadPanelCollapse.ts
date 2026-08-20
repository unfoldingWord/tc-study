/**
 * Tween splitPercent to the edge (collapse) or back (restore) — same flex
 * resize as live divider drag. Never translate panes. Never tween during drag.
 * Reduced motion skips the tween.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { COLLAPSE_MOTION_MS, tweenSplitAt } from './readPanelLayout'

export function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useReadPanelCollapse(options: { isResizingPanels: boolean }) {
  const { isResizingPanels } = options
  const [tweenPercent, setTweenPercent] = useState<number | null>(null)
  const rafRef = useRef(0)
  const doneRef = useRef<(() => void) | null>(null)

  const cancelTween = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current)
    rafRef.current = 0
    doneRef.current = null
    setTweenPercent(null)
  }, [])

  const runTween = useCallback(
    (from: number, to: number, onDone?: () => void) => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
      rafRef.current = 0
      doneRef.current = null

      if (prefersReducedMotion() || from === to) {
        setTweenPercent(null)
        onDone?.()
        return
      }

      doneRef.current = onDone ?? null
      setTweenPercent(from)
      const start = performance.now()

      const tick = (now: number) => {
        const { splitPercent, done } = tweenSplitAt({
          from,
          to,
          elapsedMs: now - start,
          durationMs: COLLAPSE_MOTION_MS,
        })
        if (done) {
          rafRef.current = 0
          setTweenPercent(null)
          const cb = doneRef.current
          doneRef.current = null
          cb?.()
          return
        }
        setTweenPercent(splitPercent)
        rafRef.current = requestAnimationFrame(tick)
      }
      rafRef.current = requestAnimationFrame(tick)
    },
    []
  )

  useEffect(() => {
    if (isResizingPanels) cancelTween()
  }, [isResizingPanels, cancelTween])

  useEffect(
    () => () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current)
    },
    []
  )

  return { runTween, tweenPercent }
}
