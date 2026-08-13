/**
 * useSwipeGesture - Hook for detecting left/right swipe gestures
 * Supports touch, mouse drag, and wheel (with Shift modifier) gestures
 */

import { useCallback, useEffect, useRef } from 'react'

export interface SwipeGestureHandlers {
  onTouchStart: (e: React.TouchEvent) => void
  onTouchMove: (e: React.TouchEvent) => void
  onTouchEnd: () => void
  onMouseDown: (e: React.MouseEvent) => void
  onMouseMove: (e: React.MouseEvent) => void
  onMouseUp: () => void
  onMouseLeave: () => void
  ref: (node: HTMLElement | null) => void // Ref callback for wheel events
}

export interface SwipeGestureOptions {
  onSwipeLeft?: () => void
  onSwipeRight?: () => void
  minSwipeDistance?: number
  wheelSensitivity?: number // Minimum wheel delta to trigger navigation
}

export function useSwipeGesture({
  onSwipeLeft,
  onSwipeRight,
  minSwipeDistance = 50,
  wheelSensitivity = 50,
}: SwipeGestureOptions): SwipeGestureHandlers {
  const touchStartX = useRef<number | null>(null)
  const touchEndX = useRef<number | null>(null)
  const mouseStartX = useRef<number | null>(null)
  const mouseEndX = useRef<number | null>(null)
  const isDragging = useRef(false)
  const wheelAccumulator = useRef(0)
  const wheelTimeout = useRef<NodeJS.Timeout | null>(null)
  const elementRef = useRef<HTMLElement | null>(null)

  // Touch handlers
  const onTouchStart = useCallback((e: React.TouchEvent) => {
    touchEndX.current = null
    touchStartX.current = e.targetTouches[0].clientX
  }, [])

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    touchEndX.current = e.targetTouches[0].clientX
  }, [])

  const onTouchEnd = useCallback(() => {
    if (!touchStartX.current || !touchEndX.current) return

    const distance = touchStartX.current - touchEndX.current
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && onSwipeLeft) {
      onSwipeLeft()
    } else if (isRightSwipe && onSwipeRight) {
      onSwipeRight()
    }

    // Reset
    touchStartX.current = null
    touchEndX.current = null
  }, [onSwipeLeft, onSwipeRight, minSwipeDistance])

  // Mouse drag handlers (for trackpad-like gestures)
  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to left mouse button
    if (e.button !== 0) return
    
    isDragging.current = true
    mouseEndX.current = null
    mouseStartX.current = e.clientX
  }, [])

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging.current) return
    mouseEndX.current = e.clientX
  }, [])

  const onMouseUp = useCallback(() => {
    if (!isDragging.current) return
    
    if (mouseStartX.current !== null && mouseEndX.current !== null) {
      const distance = mouseStartX.current - mouseEndX.current
      const isLeftSwipe = distance > minSwipeDistance
      const isRightSwipe = distance < -minSwipeDistance

      if (isLeftSwipe && onSwipeLeft) {
        onSwipeLeft()
      } else if (isRightSwipe && onSwipeRight) {
        onSwipeRight()
      }
    }

    // Reset
    isDragging.current = false
    mouseStartX.current = null
    mouseEndX.current = null
  }, [onSwipeLeft, onSwipeRight, minSwipeDistance])

  const onMouseLeave = useCallback(() => {
    // Cancel drag if mouse leaves the area
    isDragging.current = false
    mouseStartX.current = null
    mouseEndX.current = null
  }, [])

  // Wheel handler (Shift + Wheel for horizontal navigation)
  // Must use native addEventListener with { passive: false } to allow preventDefault
  const handleWheel = useCallback((e: WheelEvent) => {
    // Respond to either:
    // 1. Trackpad horizontal swipe (deltaX is significant)
    // 2. Shift + Wheel (for mouse wheels without horizontal scroll)
    const isHorizontalSwipe = Math.abs(e.deltaX) > Math.abs(e.deltaY)
    const isShiftWheel = e.shiftKey && Math.abs(e.deltaY) > 0
    
    if (!isHorizontalSwipe && !isShiftWheel) return

    // Prevent default horizontal scroll
    e.preventDefault()

    // Accumulate wheel delta (deltaX for trackpad horizontal swipe, deltaY with Shift for mouse wheel)
    const delta = isHorizontalSwipe ? e.deltaX : e.deltaY
    wheelAccumulator.current += delta

    // Clear existing timeout
    if (wheelTimeout.current) {
      clearTimeout(wheelTimeout.current)
    }

    // Debounce - wait for wheel to stop before triggering navigation
    wheelTimeout.current = setTimeout(() => {
      if (Math.abs(wheelAccumulator.current) > wheelSensitivity) {
        if (wheelAccumulator.current > 0 && onSwipeLeft) {
          onSwipeLeft()
        } else if (wheelAccumulator.current < 0 && onSwipeRight) {
          onSwipeRight()
        }
      }
      wheelAccumulator.current = 0
    }, 50) // Reduced from 150ms to 50ms for snappier response
  }, [onSwipeLeft, onSwipeRight, wheelSensitivity])

  // Ref callback to attach/detach wheel listener
  const ref = useCallback((node: HTMLElement | null) => {
    // Remove listener from previous element
    if (elementRef.current) {
      elementRef.current.removeEventListener('wheel', handleWheel)
    }

    // Store new element and add listener
    elementRef.current = node
    if (node) {
      node.addEventListener('wheel', handleWheel, { passive: false })
    }
  }, [handleWheel])

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (elementRef.current) {
        elementRef.current.removeEventListener('wheel', handleWheel)
      }
      if (wheelTimeout.current) {
        clearTimeout(wheelTimeout.current)
      }
    }
  }, [handleWheel])

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onMouseDown,
    onMouseMove,
    onMouseUp,
    onMouseLeave,
    ref,
  }
}
