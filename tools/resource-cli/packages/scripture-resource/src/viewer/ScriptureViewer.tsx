/**
 * Scripture Viewer (Web)
 */

import React from 'react'
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

export const ScriptureViewer: React.FC<EnhancedViewerProps> = ({
  resource,
  settings,
  sendSignal,
  sendToPanel,
  sendToResource,
  resourceId,
}) => {
  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{resource.title || 'Scripture'}</h1>
      <div className="text-gray-600">
        Resource ID: {resource.id}
      </div>
      
      {/* TODO: Implement Scripture viewer UI */}
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-yellow-800">
          Viewer not implemented yet. See src/viewer/ScriptureViewer.tsx
        </p>
      </div>
    </div>
  )
}
