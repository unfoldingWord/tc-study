/**
 * Panel - Container for resource display
 */

import { BookOpen } from 'lucide-react'
import type { PanelState } from '@bt-synergy/study-store'
import { ReferenceParser } from '@bt-synergy/navigation'

interface PanelProps {
  panel: PanelState
  onSelectResource: () => void
}

export function Panel({ panel, onSelectResource }: PanelProps) {
  if (!panel.resourceKey) {
    return (
      <div className="flex-1 flex items-center justify-center bg-gray-50 border-r border-gray-200">
        <div className="text-center">
          <BookOpen className="w-16 h-16 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-semibold text-gray-700 mb-2">
            No Resource Selected
          </h3>
          <p className="text-gray-500 mb-4">
            Choose a resource to display in this panel
          </p>
          <button
            onClick={onSelectResource}
            className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
          >
            Select Resource
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="flex-1 flex flex-col bg-white border-r border-gray-200">
      {/* Panel Header */}
      <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <BookOpen className="w-5 h-5 text-gray-600" />
            <h3 className="font-semibold text-gray-900">
              {panel.resourceKey}
            </h3>
          </div>
          <button
            onClick={onSelectResource}
            className="text-sm text-blue-600 hover:text-blue-700"
          >
            Change
          </button>
        </div>
        <p className="text-sm text-gray-500 mt-1">
          {ReferenceParser.formatDisplay(panel.currentReference)}
        </p>
      </div>

      {/* Panel Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Placeholder for resource content */}
        <div className="prose max-w-none">
          <h4 className="text-xl font-bold mb-4">
            {ReferenceParser.formatDisplay(panel.currentReference)}
          </h4>
          <p className="text-gray-600 mb-4">
            Resource content will be displayed here.
          </p>
          <p className="text-sm text-gray-500">
            This is a placeholder. The actual resource viewer will be integrated
            with the catalog system in the next phase.
          </p>
        </div>
      </div>
    </div>
  )
}

