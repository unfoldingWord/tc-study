/**
 * EmptyPanelState - Minimalistic empty state for panels
 */

import { Plus } from 'lucide-react'

interface EmptyPanelStateProps {
  panelId: string
  panelName?: string
  onAddResource: () => void
}

export function EmptyPanelState({ panelId, panelName, onAddResource }: EmptyPanelStateProps) {
  return (
    <div className="h-full flex items-center justify-center">
      <button
        onClick={onAddResource}
        className="w-16 h-16 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors shadow-lg hover:shadow-xl group"
        title="Add resource"
        aria-label="Add resource to this panel"
      >
        <Plus className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
      </button>
    </div>
  )
}
