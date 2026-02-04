/**
 * Resource Switcher Component
 * Provides navigation UI for switching between resources in a panel
 * Supports keyboard navigation, swipe gestures, and visual indicators
 */

import { useEffect, useRef, useState } from 'react'

export interface ResourceSwitcherProps {
  resourceCount: number
  activeIndex: number
  resourceTitles: string[]
  onNavigate: (index: number) => void
  onPrevious: () => void
  onNext: () => void
  hasPrevious: boolean
  hasNext: boolean
  panelColor?: 'blue' | 'purple' | 'green' | 'orange'
}

export function ResourceSwitcher({
  resourceCount,
  activeIndex,
  resourceTitles,
  onNavigate,
  onPrevious,
  onNext,
  hasPrevious,
  hasNext,
  panelColor = 'blue',
}: ResourceSwitcherProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [touchStart, setTouchStart] = useState<number | null>(null)
  const [touchEnd, setTouchEnd] = useState<number | null>(null)

  // Minimum swipe distance (in px) to trigger navigation
  const minSwipeDistance = 50

  // Color mappings for different panels
  const colorClasses = {
    blue: {
      button: 'bg-blue-500 hover:bg-blue-600 disabled:bg-gray-200',
      dot: 'bg-blue-500',
      dotInactive: 'bg-gray-300',
    },
    purple: {
      button: 'bg-purple-500 hover:bg-purple-600 disabled:bg-gray-200',
      dot: 'bg-purple-500',
      dotInactive: 'bg-gray-300',
    },
    green: {
      button: 'bg-green-500 hover:bg-green-600 disabled:bg-gray-200',
      dot: 'bg-green-500',
      dotInactive: 'bg-gray-300',
    },
    orange: {
      button: 'bg-orange-500 hover:bg-orange-600 disabled:bg-gray-200',
      dot: 'bg-orange-500',
      dotInactive: 'bg-gray-300',
    },
  }

  const colors = colorClasses[panelColor]

  // Handle keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.target !== containerRef.current && !containerRef.current?.contains(e.target as Node)) {
        return
      }

      if (e.key === 'ArrowLeft' && hasPrevious) {
        e.preventDefault()
        onPrevious()
      } else if (e.key === 'ArrowRight' && hasNext) {
        e.preventDefault()
        onNext()
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [hasPrevious, hasNext, onPrevious, onNext])

  // Handle touch events for swipe gestures
  const onTouchStart = (e: React.TouchEvent) => {
    setTouchEnd(null)
    setTouchStart(e.targetTouches[0].clientX)
  }

  const onTouchMove = (e: React.TouchEvent) => {
    setTouchEnd(e.targetTouches[0].clientX)
  }

  const onTouchEnd = () => {
    if (!touchStart || !touchEnd) return
    
    const distance = touchStart - touchEnd
    const isLeftSwipe = distance > minSwipeDistance
    const isRightSwipe = distance < -minSwipeDistance

    if (isLeftSwipe && hasNext) {
      onNext()
    } else if (isRightSwipe && hasPrevious) {
      onPrevious()
    }
  }

  if (resourceCount <= 1) {
    return null // Don't show switcher if only one or no resources
  }

  return (
    <div
      ref={containerRef}
      className="flex items-center justify-center gap-1.5 py-2 bg-gray-50 border-t border-gray-200"
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      tabIndex={0}
      role="navigation"
      aria-label="Resource navigation"
    >
      {/* Resource Indicators (Dots) - Minimal */}
      {resourceTitles.map((title, index) => (
        <button
          key={index}
          onClick={() => onNavigate(index)}
          className={`w-1.5 h-1.5 rounded-full transition-all duration-200 ${
            index === activeIndex
              ? `${colors.dot} w-4`
              : `${colors.dotInactive} hover:scale-125`
          }`}
          title={title}
          aria-label={`Go to ${title}`}
          aria-current={index === activeIndex ? 'true' : undefined}
        />
      ))}
    </div>
  )
}
