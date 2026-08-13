import { ChevronDown, ChevronLeft, ChevronRight, ChevronUp } from 'lucide-react'
import { RAIL_PX } from '../../features/read/readPanelLayout'
import type { ReadPanelId } from '../../features/read/readPanelModel'

interface ReadPanelRailProps {
  panelId: ReadPanelId
  orientation: 'vertical' | 'horizontal'
  colorScheme: 'blue' | 'purple'
  onExpand: () => void
}

export function ReadPanelRail({
  panelId,
  orientation,
  colorScheme,
  onExpand,
}: ReadPanelRailProps) {
  const vertical = orientation === 'vertical'
  const Arrow = vertical
    ? panelId === 'panel-1'
      ? ChevronRight
      : ChevronLeft
    : panelId === 'panel-1'
      ? ChevronDown
      : ChevronUp
  const label = 'Show other panel'
  const tone = colorScheme === 'blue' ? 'bg-panel-1-soft text-panel-1-fg' : 'bg-panel-2-soft text-panel-2-fg'

  return (
    <button
      type="button"
      onClick={onExpand}
      className={`flex-shrink-0 flex items-center justify-center ${tone} ${
        vertical ? 'h-full' : 'w-full'
      }`}
      style={vertical ? { width: RAIL_PX } : { height: RAIL_PX }}
      title={label}
      aria-label={label}
    >
      <Arrow className="w-5 h-5" />
    </button>
  )
}
