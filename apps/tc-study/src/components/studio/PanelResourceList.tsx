/**
 * PanelResourceList - Displays resources in a panel with drag-and-drop support
 */

import { Plus } from 'lucide-react'
import { useState } from 'react'
import { DraggableResourceItem } from './DraggableResourceItem'

interface Resource {
  id: string
  title: string
}

interface PanelResourceListProps {
  panelId: string
  panelName?: string
  resources: Resource[]
  activeIndex: number
  onNavigate: (index: number) => void
  onRemove: (resourceId: string) => void
  onAdd: () => void
  onDrop: (resourceId: string) => void
}

export function PanelResourceList({
  panelId,
  panelName,
  resources,
  activeIndex,
  onNavigate,
  onRemove,
  onAdd,
  onDrop,
}: PanelResourceListProps) {
  // Extract display name (e.g., 'panel-1' -> 'Panel 1')
  const displayName = panelName || 
    panelId.replace(/^panel-(\d+)$/, 'Panel $1').replace(/-/g, ' ')
  const [isDragOver, setIsDragOver] = useState(false)
  const [draggingResourceId, setDraggingResourceId] = useState<string | null>(null)

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
    
    const resourceId = e.dataTransfer.getData('text/plain')
    if (resourceId) {
      onDrop(resourceId)
    }
  }

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`
        p-3 rounded-lg border-2 border-dashed transition-all min-h-[120px]
        ${isDragOver ? 'border-blue-400 bg-blue-50' : 'border-gray-200 bg-gray-50'}
      `}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3">
        <h4 className="text-sm font-semibold text-gray-700">
          {displayName}
          {resources.length > 0 && (
            <span className="ml-2 text-xs text-gray-500">
              ({resources.length} resource{resources.length !== 1 ? 's' : ''})
            </span>
          )}
        </h4>
        <button
          onClick={onAdd}
          className="flex items-center gap-1 px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Resource List */}
      <div className="space-y-2">
        {resources.length === 0 ? (
          <div className="text-center py-6 text-sm text-gray-400">
            Drop resources here or click Add
          </div>
        ) : (
          resources.map((resource, index) => (
            <button
              key={resource.id}
              onClick={() => onNavigate(index)}
              className="w-full"
            >
              <DraggableResourceItem
                resourceId={resource.id}
                title={resource.title}
                isActive={index === activeIndex}
                onRemove={() => onRemove(resource.id)}
                onDragStart={setDraggingResourceId}
                onDragEnd={() => setDraggingResourceId(null)}
              />
            </button>
          ))
        )}
      </div>

      {/* Drop Zone Indicator */}
      {isDragOver && (
        <div className="mt-3 text-center text-sm text-blue-600 font-medium">
          Drop here to add to {displayName}
        </div>
      )}
    </div>
  )
}
