import type { MouseEvent, TouchEvent } from 'react'

interface PanelResizeDividerProps {
  isResizing: boolean
  onMouseDown: (e: MouseEvent) => void
  onTouchStart: (e: TouchEvent) => void
}

export function PanelResizeDivider({
  isResizing,
  onMouseDown,
  onTouchStart,
}: PanelResizeDividerProps) {
  return (
    <div
      onMouseDown={onMouseDown}
      onTouchStart={onTouchStart}
      className={`flex-shrink-0 transition-colors relative flex items-center justify-center ${
        isResizing ? 'bg-blue-500' : 'bg-gray-200 hover:bg-blue-400'
      } md:w-1.5 md:h-full md:cursor-ew-resize w-full h-1.5 cursor-ns-resize`}
      title="Drag to resize panels"
      aria-label="Resize panels"
    >
      <div className="absolute md:left-1/2 md:-translate-x-1/2 md:top-0 md:w-4 md:h-full top-1/2 -translate-y-1/2 left-0 w-full h-4" />
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
