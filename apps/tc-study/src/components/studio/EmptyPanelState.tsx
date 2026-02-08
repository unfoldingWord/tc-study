/**
 * EmptyPanelState - Minimalistic empty state for panels
 */

import { Plus } from 'lucide-react'

export interface EmptyPanelStateProps {
  panelId: string
  panelName?: string
  /** Optional message (e.g. "Select a language to load resources") */
  message?: string
  onAddResource?: () => void
}

export function EmptyPanelState({ panelId, panelName, message, onAddResource }: EmptyPanelStateProps) {
  return (
    <div className="h-full flex items-center justify-center">
      {(message || panelName) && (
        <p className="text-sm text-gray-500 mb-2 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-8">{message ?? panelName}</p>
      )}
      {onAddResource ? (
      <button
        onClick={onAddResource}
        className="w-16 h-16 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors shadow-lg hover:shadow-xl group"
        title="Add resource"
        aria-label="Add resource to this panel"
      >
        <Plus className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
      </button>
      ) : null}
    </div>
  )
}
