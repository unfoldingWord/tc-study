/**
 * Draggable Resource Item - placeholder
 */

import { GripVertical, X } from 'lucide-react'

interface DraggableResourceItemProps {
  id: string
  title: string
  isActive?: boolean
  onRemove?: () => void
  onDragStart?: () => void
  onDragEnd?: () => void
}

export function DraggableResourceItem({
  id,
  title,
  isActive = false,
  onRemove,
  onDragStart,
  onDragEnd
}: DraggableResourceItemProps) {
  return (
    <div
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      className={`flex items-center gap-2 p-2 rounded-md cursor-move ${
        isActive ? 'bg-blue-50 border border-blue-200' : 'bg-gray-50 hover:bg-gray-100'
      }`}
    >
      <GripVertical className="w-4 h-4 text-gray-400" />
      <span className="flex-1 text-sm truncate">{title}</span>
      {onRemove && (
        <button
          onClick={(e) => {
            e.stopPropagation()
            onRemove()
          }}
          className="p-1 hover:bg-gray-200 rounded"
          aria-label="Remove resource"
        >
          <X className="w-4 h-4 text-gray-500" />
        </button>
      )}
    </div>
  )
}
