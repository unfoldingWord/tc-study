/**
 * Resize + collapse-to-divider. Collapse commits on drag end (no flicker mid-drag).
 * Snap / restore tween splitPercent like a continued divider drag.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  collapseAfterDragEnd,
  collapseTweenRange,
  edgeSplitPercent,
  layoutRestoreTweenRange,
  restoreCollapsedDivider,
} from './readPanelLayout'
import { useReadPanelCollapse } from './useReadPanelCollapse'
import { useReadPanelResize } from './useReadPanelResize'
import { useReadPanelStore } from './readPanelStore'

export function useReadPanelLayout() {
  const layout = useReadPanelStore((s) => s.layout)
  const splitPercent = useReadPanelStore((s) => s.splitPercent)
  const collapsedPanelId = useReadPanelStore((s) => s.collapsedPanelId)
  const setLayout = useReadPanelStore((s) => s.setLayout)
  const setSplitPercent = useReadPanelStore((s) => s.setSplitPercent)
  const setCollapsedPanelId = useReadPanelStore((s) => s.setCollapsedPanelId)
  const previousSplitRef = useRef(splitPercent)

  const resize = useReadPanelResize(splitPercent)
  const { panel1Width, isResizingPanels } = resize
  const { runTween, tweenPercent } = useReadPanelCollapse({ isResizingPanels })
  const wasResizingRef = useRef(false)

  useEffect(() => {
    if (isResizingPanels) {
      wasResizingRef.current = true
      return
    }
    if (!wasResizingRef.current) return
    wasResizingRef.current = false
    const result = collapseAfterDragEnd(panel1Width)
    if (result.collapsedPanelId) {
      previousSplitRef.current = splitPercent
      const { from, to } = collapseTweenRange(result.collapsedPanelId, panel1Width)
      runTween(from, to, () => {
        setSplitPercent(to)
        setCollapsedPanelId(result.collapsedPanelId)
      })
    } else {
      setCollapsedPanelId(null)
      setSplitPercent(result.splitPercent)
    }
  }, [isResizingPanels, panel1Width, runTween, setCollapsedPanelId, setSplitPercent, splitPercent])

  const expandPanel = useCallback(
    (panelId: 'panel-1' | 'panel-2') => {
      if (collapsedPanelId !== panelId) return
      const next = restoreCollapsedDivider(previousSplitRef.current)
      setCollapsedPanelId(next.collapsedPanelId)
      runTween(edgeSplitPercent(panelId), next.splitPercent, () => {
        setSplitPercent(next.splitPercent)
      })
    },
    [collapsedPanelId, runTween, setCollapsedPanelId, setSplitPercent]
  )

  const restoreCollapsed = useCallback(() => {
    if (layout === 'one') {
      const { from, to } = layoutRestoreTweenRange(previousSplitRef.current)
      setLayout('two', true)
      runTween(from, to, () => {
        setSplitPercent(to)
      })
      return
    }
    if (!collapsedPanelId) return
    expandPanel(collapsedPanelId)
  }, [collapsedPanelId, expandPanel, layout, runTween, setLayout, setSplitPercent])

  const displayWidth = isResizingPanels
    ? panel1Width
    : tweenPercent !== null
      ? tweenPercent
      : collapsedPanelId
        ? collapsedPanelId === 'panel-1'
          ? 0
          : 100
        : splitPercent

  return {
    ...resize,
    panel1Width: displayWidth,
    collapsedPanelId,
    expandPanel,
    restoreCollapsed,
  }
}
