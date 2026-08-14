import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { useEffect, useRef, type MouseEvent } from 'react'

const COLLAPSED_ARROWS = {
  left: ChevronLeft,
  right: ChevronRight,
  up: ChevronUp,
  down: ChevronDown,
} as const

export type DividerCollapsedArrow = keyof typeof COLLAPSED_ARROWS

/** Hit target stays inside overflow-hidden: expand inward when collapsed; never md:h-full + -translate-y-1/2. */
function hitOverlayClass(collapsedArrow: DividerCollapsedArrow | null): string {
  const base = 'absolute touch-none'
  if (collapsedArrow === 'left') return `${base} inset-y-0 right-0 w-3`
  if (collapsedArrow === 'right') return `${base} inset-y-0 left-0 w-3`
  if (collapsedArrow === 'up') return `${base} inset-x-0 bottom-0 h-3`
  if (collapsedArrow === 'down') return `${base} inset-x-0 top-0 h-3`
  return `${base} left-0 w-full h-4 top-1/2 -translate-y-1/2 md:left-1/2 md:top-0 md:w-4 md:h-full md:-translate-x-1/2 md:translate-y-0`
}

interface PanelResizeDividerProps {
  isResizing: boolean
  onMouseDown: (e: MouseEvent) => void
  onTouchStart: () => void
  collapsedArrow?: DividerCollapsedArrow | null
  onRestoreCollapsed?: () => void
}

export function PanelResizeDivider({
  isResizing,
  onMouseDown,
  onTouchStart,
  collapsedArrow = null,
  onRestoreCollapsed,
}: PanelResizeDividerProps) {
  const rootRef = useRef<HTMLDivElement>(null)
  const onTouchStartRef = useRef(onTouchStart)
  onTouchStartRef.current = onTouchStart

  // Native non-passive touchstart so preventDefault can block pull-to-refresh.
  // React's synthetic onTouchStart is often passive on mobile browsers.
  useEffect(() => {
    if (collapsedArrow) return
    const node = rootRef.current
    if (!node) return

    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      onTouchStartRef.current()
    }

    node.addEventListener('touchstart', handleTouchStart, { passive: false })
    return () => node.removeEventListener('touchstart', handleTouchStart)
  }, [collapsedArrow])

  const sizeClass = collapsedArrow
    ? 'md:w-3 md:self-stretch md:h-auto w-full h-3'
    : 'md:w-1.5 md:self-stretch md:h-auto w-full h-1.5'

  const barClass = `flex-shrink-0 min-w-0 min-h-0 border-0 p-0 appearance-none transition-colors relative z-10 flex items-center justify-center touch-none select-none overflow-visible ${
    isResizing ? 'bg-accent' : 'bg-border hover:bg-accent/70'
  } ${sizeClass} ${
    collapsedArrow ? 'cursor-pointer md:cursor-pointer' : 'cursor-ns-resize md:cursor-ew-resize'
  }`

  const hitOverlay = <div className={hitOverlayClass(collapsedArrow)} />

  if (collapsedArrow) {
    const Arrow = COLLAPSED_ARROWS[collapsedArrow]
    const label = 'Show other panel'
    return (
      <button
        type="button"
        onClick={onRestoreCollapsed}
        className={barClass}
        title={label}
        aria-label={label}
      >
        {hitOverlay}
        <Arrow className="w-2.5 h-2.5 text-fg-muted pointer-events-none" />
      </button>
    )
  }

  return (
    <div
      ref={rootRef}
      onMouseDown={onMouseDown}
      className={barClass}
      title="Drag to resize panels"
      aria-label="Resize panels"
    >
      {hitOverlay}
      <div className="absolute flex gap-1 pointer-events-none md:flex-col md:left-1/2 md:-translate-x-1/2 md:top-1/2 md:-translate-y-1/2 flex-row top-1/2 -translate-y-1/2 left-1/2 -translate-x-1/2">
        {[0, 1, 2].map((i) => (
          <div
            key={i}
            className={`w-1 h-1 rounded-full transition-colors ${
              isResizing ? 'bg-surface' : 'bg-fg-muted'
            }`}
          />
        ))}
      </div>
    </div>
  )
}
