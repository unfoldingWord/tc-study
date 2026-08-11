import { ChevronDown, ChevronUp } from 'lucide-react'
import { NavigationBar } from './NavigationBar'

export type StudioNavState = 'dismissed' | 'compact'

interface StudioNavToggleProps {
  navState: StudioNavState
  onShow: () => void
  onHide: () => void
}

/** Top stripe that shows/hides the compact navigation bar. */
export function StudioNavToggle({ navState, onShow, onHide }: StudioNavToggleProps) {
  if (navState === 'dismissed') {
    return (
      <button
        onClick={onShow}
        className="flex-shrink-0 w-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5 z-10"
        title="Show navigation"
        aria-label="Show navigation"
      >
        <ChevronDown className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
      </button>
    )
  }

  return (
    <button
      onClick={onHide}
      className="flex-shrink-0 w-full bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer flex items-center justify-center py-0.5 z-10"
      title="Hide navigation"
      aria-label="Hide navigation"
    >
      <ChevronUp className="w-3 h-3 text-gray-300 hover:text-gray-400 transition-colors" />
    </button>
  )
}

interface StudioNavBarSlotProps {
  visible: boolean
}

/** Bottom compact NavigationBar when studio nav is not dismissed. */
export function StudioNavBarSlot({ visible }: StudioNavBarSlotProps) {
  if (!visible) return null
  return (
    <div className="flex-shrink-0 flex items-center bg-white px-2 py-1.5 border-t border-gray-100/50">
      <NavigationBar isCompact={true} onToggleCompact={undefined} />
    </div>
  )
}
