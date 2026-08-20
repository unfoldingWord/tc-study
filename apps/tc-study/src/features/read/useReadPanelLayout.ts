/**
 * Resize + collapse-to-divider. Live drag jumps to 30/70 once the pointer
 * is within DETENT_CAPTURE_PERCENT, then hard-locks until commit. Collapse
 * commits during drag once the pointer crosses detent + DETENT_COMMIT_OFFSET
 * (or on release if already past that offset). Release on the detent stays at 30/70.
 */

import { useCallback, useEffect, useRef } from 'react'
import {
  collapseFromUserDragOnly,
  collapseTweenRange,
  defaultSplitPercent,
  displayedSplitFromPointer,
  edgeSplitPercent,
  layoutAfterContainerMeasure,
  layoutRestoreTweenRange,
  restoreCollapsedDivider,
  viewportIsNarrow,
} from './readPanelLayout'
import { useReadPanelCollapse } from './useReadPanelCollapse'
import { useReadPanelResize } from './useReadPanelResize'
import { useReadPanelStore } from './readPanelStore'
import { useIsNarrowViewport } from './useIsNarrowViewport'

function defaultSplitFromStore(): number {
  const panels = useReadPanelStore.getState().panels
  return defaultSplitPercent({
    panel1Mode: panels['panel-1'].mode,
    panel2Mode: panels['panel-2'].mode,
    isNarrow: viewportIsNarrow(),
  })
}

export function useReadPanelLayout() {
  const layout = useReadPanelStore((s) => s.layout)
  const splitPercent = useReadPanelStore((s) => s.splitPercent)
  const splitUserChosen = useReadPanelStore((s) => s.splitUserChosen)
  const collapsedPanelId = useReadPanelStore((s) => s.collapsedPanelId)
  const panel1Mode = useReadPanelStore((s) => s.panels['panel-1'].mode)
  const panel2Mode = useReadPanelStore((s) => s.panels['panel-2'].mode)
  const setLayout = useReadPanelStore((s) => s.setLayout)
  const setSplitPercent = useReadPanelStore((s) => s.setSplitPercent)
  const setCollapsedPanelId = useReadPanelStore((s) => s.setCollapsedPanelId)
  const isNarrow = useIsNarrowViewport()

  const resize = useReadPanelResize(splitPercent)
  const { panel1Width, isResizingPanels } = resize
  const { runTween, tweenPercent } = useReadPanelCollapse({ isResizingPanels })
  const wasResizingRef = useRef(false)
  const didMeasureRef = useRef(false)

  useEffect(() => {
    if (didMeasureRef.current) return
    didMeasureRef.current = true
    if (collapsedPanelId) return
    const next = layoutAfterContainerMeasure(splitPercent)
    if (next.splitPercent !== splitPercent) setSplitPercent(next.splitPercent)
  }, [collapsedPanelId, setSplitPercent, splitPercent])

  useEffect(() => {
    if (splitUserChosen || collapsedPanelId || isResizingPanels || tweenPercent !== null) return
    const next = defaultSplitPercent({
      panel1Mode,
      panel2Mode,
      isNarrow: viewportIsNarrow(),
    })
    if (next !== splitPercent) setSplitPercent(next, false)
  }, [
    collapsedPanelId,
    isNarrow,
    isResizingPanels,
    panel1Mode,
    panel2Mode,
    setSplitPercent,
    splitPercent,
    splitUserChosen,
    tweenPercent,
  ])

  useEffect(() => {
    if (isResizingPanels) {
      wasResizingRef.current = true
      return
    }
    if (!wasResizingRef.current) return
    wasResizingRef.current = false
    const result = collapseFromUserDragOnly({
      pointerPercent: panel1Width,
      userDragged: true,
    })
    if (result.collapsedPanelId) {
      const { from, to } = collapseTweenRange(result.collapsedPanelId, result.splitPercent)
      runTween(from, to, () => {
        setSplitPercent(to)
        setCollapsedPanelId(result.collapsedPanelId)
      })
    } else {
      setCollapsedPanelId(null)
      const userSized = result.splitPercent !== splitPercent
      setSplitPercent(result.splitPercent, userSized ? true : undefined)
    }
  }, [isResizingPanels, panel1Width, runTween, setCollapsedPanelId, setSplitPercent, splitPercent])

  const expandPanel = useCallback(
    (panelId: 'panel-1' | 'panel-2') => {
      if (collapsedPanelId !== panelId) return
      const next = restoreCollapsedDivider({
        panel1Mode,
        panel2Mode,
        isNarrow: viewportIsNarrow(),
      })
      setCollapsedPanelId(next.collapsedPanelId)
      runTween(edgeSplitPercent(panelId), next.splitPercent, () => {
        setSplitPercent(next.splitPercent, false)
      })
    },
    [collapsedPanelId, panel1Mode, panel2Mode, runTween, setCollapsedPanelId, setSplitPercent]
  )

  const restoreCollapsed = useCallback(() => {
    const to = defaultSplitFromStore()
    if (layout === 'one') {
      const { from } = layoutRestoreTweenRange(to)
      setLayout('two', true)
      runTween(from, to, () => {
        setSplitPercent(to, false)
      })
      return
    }
    if (!collapsedPanelId) return
    expandPanel(collapsedPanelId)
  }, [collapsedPanelId, expandPanel, layout, runTween, setLayout, setSplitPercent])

  const displayWidth = isResizingPanels
    ? displayedSplitFromPointer(panel1Width).splitPercent
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
