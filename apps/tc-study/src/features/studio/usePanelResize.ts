import { useCallback, useEffect, useRef, useState } from 'react'

const RESIZE_CONTAINER_SELECTOR = '.panels-resize-container'

function detectLayoutOrientation(): 'vertical' | 'horizontal' {
  const container = document.querySelector(RESIZE_CONTAINER_SELECTOR)
  if (!container) return 'horizontal'
  const style = window.getComputedStyle(container)
  return style.flexDirection === 'column' ? 'vertical' : 'horizontal'
}

/**
 * Panel split resize (mouse + touch) for LinkedPanelsStudio.
 */
export function usePanelResize(initialWidth = 50) {
  const resizeContainerRef = useRef<HTMLDivElement>(null)
  const [panel1Width, setPanel1Width] = useState(initialWidth)
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const [resizeStartLayout, setResizeStartLayout] = useState<'vertical' | 'horizontal'>(
    'horizontal'
  )

  const beginResize = useCallback(() => {
    setResizeStartLayout(detectLayoutOrientation())
    setIsResizingPanels(true)
  }, [])

  const handlePanelDividerMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault()
      beginResize()
    },
    [beginResize]
  )

  const handlePanelDividerTouchStart = useCallback(
    (e: React.TouchEvent) => {
      e.preventDefault()
      beginResize()
    },
    [beginResize]
  )

  useEffect(() => {
    if (!isResizingPanels) return

    const isVertical = resizeStartLayout === 'vertical'
    const container = document.querySelector(RESIZE_CONTAINER_SELECTOR)
    if (!container) return

    const containerRect = container.getBoundingClientRect()

    const handleMove = (clientX: number, clientY: number) => {
      const percentage = isVertical
        ? ((clientY - containerRect.top) / containerRect.height) * 100
        : ((clientX - containerRect.left) / containerRect.width) * 100
      setPanel1Width(Math.max(10, Math.min(90, percentage)))
    }

    const handleMouseMove = (e: MouseEvent) => handleMove(e.clientX, e.clientY)
    const handleTouchMove = (e: TouchEvent) => {
      if (e.touches.length > 0) {
        handleMove(e.touches[0].clientX, e.touches[0].clientY)
      }
    }
    const handleEnd = () => setIsResizingPanels(false)

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('mouseup', handleEnd)
    document.addEventListener('touchmove', handleTouchMove, { passive: false })
    document.addEventListener('touchend', handleEnd)
    document.body.style.cursor = isVertical ? 'ns-resize' : 'ew-resize'
    document.body.style.userSelect = 'none'
    document.body.style.touchAction = 'none'

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('mouseup', handleEnd)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('touchend', handleEnd)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      document.body.style.touchAction = ''
    }
  }, [isResizingPanels, resizeStartLayout])

  return {
    resizeContainerRef,
    panel1Width,
    isResizingPanels,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
  }
}
