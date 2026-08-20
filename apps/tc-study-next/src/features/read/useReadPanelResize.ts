/**
 * Two-panel split resize (mouse + touch) for SimplifiedReadView.
 * Ends the pointer session mid-move once collapseDuringDrag commits —
 * no mouseup/touchend required after that; further moves are ignored.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { collapseDuringDrag } from './readPanelLayout'

const RESIZE_CONTAINER_SELECTOR = '.panels-resize-container'

function detectLayoutOrientation(): 'vertical' | 'horizontal' {
  const container = document.querySelector(RESIZE_CONTAINER_SELECTOR)
  if (!container) return 'horizontal'
  const style = window.getComputedStyle(container)
  return style.flexDirection === 'column' ? 'vertical' : 'horizontal'
}

export function useReadPanelResize(initialPercent = 50) {
  const [panel1Width, setPanel1Width] = useState(initialPercent)
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const [resizeStartLayout, setResizeStartLayout] = useState<'vertical' | 'horizontal'>('horizontal')
  const resizeContainerRef = useRef<HTMLDivElement>(null)
  const draggingRef = useRef(false)

  const beginResize = useCallback(() => {
    draggingRef.current = true
    setResizeStartLayout(detectLayoutOrientation())
    setIsResizingPanels(true)
  }, [])

  const endResize = useCallback(() => {
    draggingRef.current = false
    setIsResizingPanels(false)
  }, [])

  const handlePanelDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      beginResize()
    },
    [beginResize]
  )

  const handlePanelDividerTouchStart = useCallback(() => {
    beginResize()
  }, [beginResize])

  useEffect(() => {
    if (!isResizingPanels) return

    const container =
      resizeContainerRef.current ?? document.querySelector(RESIZE_CONTAINER_SELECTOR)
    if (!container) return

    const isVertical = resizeStartLayout === 'vertical'
    const containerEl = container as HTMLElement
    const prevContainerOverscroll = containerEl.style.overscrollBehavior
    const prevHtmlOverscroll = document.documentElement.style.overscrollBehavior

    const handleMove = (clientX: number, clientY: number) => {
      if (!draggingRef.current) return
      const rect = container.getBoundingClientRect()
      const newPercent = isVertical
        ? ((clientY - rect.top) / rect.height) * 100
        : ((clientX - rect.left) / rect.width) * 100
      const pointerPercent = Math.max(0, Math.min(100, newPercent))
      setPanel1Width(pointerPercent)
      if (collapseDuringDrag(pointerPercent).collapsedPanelId) {
        endResize()
      }
    }

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => {
      // Non-passive + preventDefault blocks mobile pull-to-refresh during drag
      e.preventDefault()
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }

    containerEl.style.overscrollBehavior = 'none'
    document.documentElement.style.overscrollBehavior = 'none'
    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', endResize)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', endResize)
    document.body.style.cursor = isVertical ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    document.body.style.touchAction = 'none'

    return () => {
      containerEl.style.overscrollBehavior = prevContainerOverscroll
      document.documentElement.style.overscrollBehavior = prevHtmlOverscroll
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', endResize)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', endResize)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.style.touchAction = ''
    }
  }, [endResize, isResizingPanels, resizeStartLayout])

  return {
    panel1Width,
    isResizingPanels,
    resizeContainerRef,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
  }
}
