import { useEffect, useRef, type MouseEvent } from 'react'

interface PanelResizeDividerProps {
  isResizing: boolean
  onMouseDown: (e: MouseEvent) => void
  onTouchStart: () => void
}

export function PanelResizeDivider({
  isResizing,
  onMouseDown,
  onTouchStart,
}: PanelResizeDividerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onTouchStartRef = useRef(onTouchStart)
  onTouchStartRef.current = onTouchStart

  // Native non-passive touchstart so preventDefault can block pull-to-refresh.
  // React's synthetic onTouchStart is often passive on mobile browsers.
  useEffect(() => {
    const node = rootRef.current
    if (!node) return

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      onTouchStartRef.current()
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: false })
    return () => node.removeEventListener('touchstart', handleTouchStart)
  }, [])

  return (
    <div
      ref={rootRef}
      onMouseDown={onMouseDown}
      className={`flex-shrink-0 transition-colors relative flex items-center justify-center touch-none select-none ${
        isResizing ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
      } md:w-1.5 md:h-full md:cursor-ew-resize w-full h-1.5 cursor-ns-resize`}
      title="Drag to resize panels"
      aria-label="Resize panels"
    >
      <div className="absolute md:left-1/2 md:-translate-x-1/2 md:top-0 md:w-4 md:h-full top-1/2 -translate-y-1/2 left-0 w-full h-4 touch-none" />
      <div className="absolute flex gap-1 pointer-events-none md:flex-col md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex-row top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full transition-colors ${
              isResizing ? 'bg-white' : 'bg-gray-400'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
