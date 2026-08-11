/**
 * Two-panel split resize (mouse + touch) for SimplifiedReadView.
 */

import { useCallback, useEffect, useRef, useState } from 'react'

export function useReadPanelResize(initialPercent = 50) {
  const [panel1Width, setPanel1Width] = useState(initialPercent)
  const [isResizingPanels, setIsResizingPanels] = useState(false)
  const [resizeStartLayout, setResizeStartLayout] = useState<'vertical' | 'horizontal'>('horizontal')
  const resizeContainerRef = useRef<HTMLDivElement>(null)

  const beginResize = useCallback(() => {
    const container = document.querySelector('.panels-resize-container')
    if (container) {
      const style = window.getComputedStyle(container)
      const isVertical = style.flexDirection === 'column'
      setResizeStartLayout(isVertical ? 'vertical' : 'horizontal')
    }
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

    const handleMouseMove = (e: MouseEvent) => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return

      const rect = container.getBoundingClientRect()

      if (resizeStartLayout === 'horizontal') {
        const newPercent = ((e.clientX - rect.left) / rect.width) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      } else {
        const newPercent = ((e.clientY - rect.top) / rect.height) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      }
    }

    const handleTouchMove = (e: TouchEvent) => {
      const container = document.querySelector('.panels-resize-container')
      if (!container) return

      const rect = container.getBoundingClientRect()
      const touch = e.touches[0]

      if (resizeStartLayout === 'horizontal') {
        const newPercent = ((touch.clientX - rect.left) / rect.width) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      } else {
        const newPercent = ((touch.clientY - rect.top) / rect.height) * 100
        setPanel1Width(Math.max(20, Math.min(80, newPercent)))
      }
    }

    const handleMouseUp = () => {
      setIsResizingPanels(false)
    }

    document.addEventListener('mousemove', handleMouseMove)
    document.addEventListener('touchmove', handleTouchMove)
    document.addEventListener('mouseup', handleMouseUp)
    document.addEventListener('touchend', handleMouseUp)

    return () => {
      document.removeEventListener('mousemove', handleMouseMove)
      document.removeEventListener('touchmove', handleTouchMove)
      document.removeEventListener('mouseup', handleMouseUp)
      document.removeEventListener('touchend', handleMouseUp)
    }
  }, [isResizingPanels, resizeStartLayout])

  return {
    panel1Width,
    isResizingPanels,
    resizeContainerRef,
    handlePanelDividerMouseDown,
    handlePanelDividerTouchStart,
  }
}
