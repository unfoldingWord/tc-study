/**
 * Resize + collapse-to-divider. Collapse commits on drag end (no flicker mid-drag).
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  collapseAfterDragEnd,
  restoreCollapsedDivider,
} from './readPanelLayout'
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
      const next = restoreCollapsedDivider(previousSplitRef.current)
      setCollapsedPanelId(next.collapsedPanelId)
      setSplitPercent(next.splitPercent)
    },
    [collapsedPanelId, setCollapsedPanelId, setSplitPercent]
  )

  const restoreCollapsed = useCallback(() => {
    if (layout === 'one') {
      setLayout('two', true)
      return
    }
    if (!collapsedPanelId) return
    expandPanel(collapsedPanelId)
  }, [collapsedPanelId, expandPanel, layout, setLayout])

  // Keep the live drag percent for the frame between mouseup and collapse commit
  // so the slide-out starts from the threshold size, not the previous split.
  const displayWidth = isResizingPanels
    ? panel1Width
    : collapsedPanelId
      ? collapsedPanelId === 'panel-1'
        ? 0
        : 100
      : wasResizingRef.current
        ? panel1Width
        : splitPercent

  return {
    ...resize,
    panel1Width: displayWidth,
    collapsedPanelId,
    expandPanel,
    restoreCollapsed,
  }
}
