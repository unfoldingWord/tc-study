/**
 * Slide a pane off/on only for snap-to-collapse and restore — never live drag.
 */

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react'
import {
  COLLAPSE_MOTION_MS,
  nextCollapseAnimPhase,
  panelCollapseMotionStyle,
  type PanelCollapseAnimPhase,
} from './readPanelLayout'
import type { ReadLayoutMode } from './readPanelPersistence'
import type { ReadPanelId } from './readPanelModel'

function prefersReducedMotion(): boolean {
  return (
    typeof window !== 'undefined' &&
    window.matchMedia('(prefers-reduced-motion: reduce)').matches
  )
}

export function useReadPanelCollapse(options: {
  collapsedPanelId: ReadPanelId | null
  layout: ReadLayoutMode
  isNarrow: boolean
  isResizingPanels: boolean
  panel1Width: number
}) {
  const { collapsedPanelId, layout, isNarrow, isResizingPanels, panel1Width } = options
  const lastDragPercentRef = useRef(panel1Width)
  const panel1WidthRef = useRef(panel1Width)
  panel1WidthRef.current = panel1Width
  if (isResizingPanels) lastDragPercentRef.current = panel1Width

  const [phase, setPhase] = useState<PanelCollapseAnimPhase>('idle')
  const [animPanelId, setAnimPanelId] = useState<ReadPanelId | null>(null)
  const [sliding, setSliding] = useState(false)
  const [animPanel1Percent, setAnimPanel1Percent] = useState(panel1Width)

  const prevCollapsedRef = useRef(collapsedPanelId)
  const prevLayoutRef = useRef(layout)
  const didInitRef = useRef(false)

  useEffect(() => {
    if (!didInitRef.current) {
      didInitRef.current = true
      prevCollapsedRef.current = collapsedPanelId
      prevLayoutRef.current = layout
      return
    }
    const reducedMotion = prefersReducedMotion()
    const next = nextCollapseAnimPhase({
      prevCollapsed: prevCollapsedRef.current,
      nextCollapsed: collapsedPanelId,
      prevLayout: prevLayoutRef.current,
      nextLayout: layout,
      reducedMotion,
    })
    const sameLayout = prevLayoutRef.current === layout
    prevCollapsedRef.current = collapsedPanelId
    prevLayoutRef.current = layout

    if (next.phase === 'idle') {
      setPhase('idle')
      setAnimPanelId(null)
      setSliding(false)
      return
    }

    setAnimPanel1Percent(
      next.phase === 'out' && sameLayout
        ? lastDragPercentRef.current
        : panel1WidthRef.current
    )
    setAnimPanelId(next.panelId)
    setSliding(false)
    setPhase(next.phase)
  }, [collapsedPanelId, layout])

  useEffect(() => {
    if (phase === 'idle') return
    let inner = 0
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setSliding(true))
    })
    return () => {
      cancelAnimationFrame(outer)
      cancelAnimationFrame(inner)
    }
  }, [phase, animPanelId])

  useEffect(() => {
    if (phase === 'idle' || !sliding) return
    const t = window.setTimeout(() => {
      setPhase('idle')
      setSliding(false)
      setAnimPanelId(null)
    }, COLLAPSE_MOTION_MS)
    return () => window.clearTimeout(t)
  }, [phase, sliding])

  const styleFor = useCallback(
    (panelId: ReadPanelId): CSSProperties =>
      panelCollapseMotionStyle({
        panelId,
        animPanelId,
        phase,
        sliding,
        stacked: isNarrow,
        panel1Percent: animPanel1Percent,
        reducedMotion: isResizingPanels || prefersReducedMotion(),
      }),
    [animPanelId, phase, sliding, isNarrow, animPanel1Percent, isResizingPanels]
  )

  return { styleFor, phase }
}
