/**
 * Resize + collapse-to-rail. Collapse commits on drag end (no flicker mid-drag).
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  collapseAfterDragEnd,
  restoredSplitPercent,
} from './readPanelLayout'
import { useReadPanelResize } from './useReadPanelResize'
import { useReadPanelStore } from './readPanelStore'

export function useReadPanelLayout() {
  const splitPercent = useReadPanelStore((s) => s.splitPercent)
  const collapsedPanelId = useReadPanelStore((s) => s.collapsedPanelId)
  const setSplitPercent = useReadPanelStore((s) => s.setSplitPercent)
  const setCollapsedPanelId = useReadPanelStore((s) => s.setCollapsedPanelId)
  const previousSplitRef = useRef(splitPercent)

  const resize = useReadPanelResize(splitPercent)
  const { panel1Width, isResizingPanels } = resize
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
      setCollapsedPanelId(result.collapsedPanelId)
    } else {
      setCollapsedPanelId(null)
      setSplitPercent(result.splitPercent)
    }
  }, [isResizingPanels, panel1Width, setCollapsedPanelId, setSplitPercent, splitPercent])

  const expandPanel = useCallback(
    (panelId: 'panel-1' | 'panel-2') => {
      if (collapsedPanelId !== panelId) return
      setCollapsedPanelId(null)
      setSplitPercent(restoredSplitPercent(previousSplitRef.current))
    },
    [collapsedPanelId, setCollapsedPanelId, setSplitPercent]
  )

  const displayWidth = isResizingPanels
    ? panel1Width
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
  }
}
