/**
 * Resource Card Component
 * Displays a resource with drag-and-drop support for moving between panels
 */

import { GripVertical, X } from 'lucide-react'
import { useState, useRef } from 'react'
import type { ResourceInfo } from '../../contexts/types'

export interface ResourceCardProps {
  resource: ResourceInfo
  isActive: boolean
  panelId: string
  index: number
  onActivate: () => void
  onRemove: () => void
  onDragStart: (resourceId: string, sourcePanelId: string) => void
  onDragEnd: () => void
  onDrop: (resourceId: string, targetPanelId: string, index: number) => void
}

export function ResourceCard({
  resource,
  isActive,
  panelId,
  index,
  onActivate,
  onRemove,
  onDragStart,
  onDragEnd,
  onDrop,
}: ResourceCardProps) {
  const [isDragging, setIsDragging] = useState(false)
  const [isDragOver, setIsDragOver] = useState(false)
  const dragRef = useRef<HTMLDivElement>(null)

  const handleDragStart = (e: React.DragEvent) => {
    setIsDragging(true)
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('resourceId', resource.key)
    e.dataTransfer.setData('sourcePanelId', panelId)
    onDragStart(resource.key, panelId)
  }

  const handleDragEnd = () => {
    setIsDragging(false)
    onDragEnd()
  }

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault()
    e.dataTransfer.dropEffect = 'move'
    setIsDragOver(true)
  }

  const handleDragLeave = () => {
    setIsDragOver(false)
  }

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault()
    setIsDragOver(false)
    
    const resourceId = e.dataTransfer.getData('resourceId')
    const sourcePanelId = e.dataTransfer.getData('sourcePanelId')
    
    // Only handle if dropping from a different panel
    if (resourceId && sourcePanelId !== panelId) {
      onDrop(resourceId, panelId, index)
    }
  }

  return (
    <div
      ref={dragRef}
      draggable
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={onActivate}
      className={`
        relative flex items-center gap-2 px-3 py-2 rounded-lg border-2 transition-all duration-200 cursor-pointer
        ${isActive 
          ? 'border-blue-500 bg-blue-50 shadow-sm' 
          : 'border-gray-200 bg-white hover:border-gray-300'
        }
        ${isDragging ? 'opacity-50 scale-95' : ''}
        ${isDragOver ? 'ring-2 ring-blue-400 ring-offset-2' : ''}
      `}
      title={resource.title}
    >
      {/* Drag Handle */}
      <button
        className="p-1 hover:bg-gray-200 rounded cursor-grab active:cursor-grabbing"
        title="Drag to reorder or move to another panel"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GripVertical className="w-4 h-4 text-gray-400" />
      </button>

      {/* Resource Info */}
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium truncate">{resource.title}</div>
        <div className="text-xs text-gray-500 truncate">{resource.type}</div>
      </div>

      {/* Active Indicator */}
      {isActive && (
        <div className="w-2 h-2 bg-blue-500 rounded-full" title="Currently active" />
      )}

      {/* Remove Button */}
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="p-1 hover:bg-red-100 rounded transition-colors"
        title="Remove from panel"
      >
        <X className="w-4 h-4 text-red-600" />
      </button>
    </div>
  )
}
