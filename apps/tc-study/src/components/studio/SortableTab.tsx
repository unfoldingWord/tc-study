/**
 * SortableTab - Individual draggable/sortable tab using dnd-kit
 * Provides smooth animations and transforms during drag operations
 */

import { useSortable } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'

interface SortableTabProps {
  id: string
  isActive: boolean
  label: string
  tooltip?: string // Full resource name for tooltip
  colorScheme: 'blue' | 'purple'
  onClick: () => void
}

const tabColors = {
  blue: {
    active: 'bg-gradient-to-b from-blue-100 to-blue-50 text-blue-700 font-semibold',
    inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/50',
    dragging: 'bg-blue-50 text-blue-400 border-blue-200',
  },
  purple: {
    active: 'bg-gradient-to-b from-purple-100 to-purple-50 text-purple-700 font-semibold',
    inactive: 'text-gray-500 hover:text-gray-700 hover:bg-gray-50/50',
    dragging: 'bg-purple-50 text-purple-400 border-purple-200',
  },
}

export function SortableTab({ id, isActive, label, tooltip, colorScheme, onClick }: SortableTabProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id })

  const colors = tabColors[colorScheme]

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  }

  // Determine which color scheme to use
  let colorClasses: string
  let borderStyle: string
  
  if (isDragging) {
    // When dragging, show dashed border placeholder style
    colorClasses = colors.dragging
    borderStyle = 'border-2 border-dashed'
  } else {
    // Normal state
    colorClasses = isActive ? colors.active : colors.inactive
    borderStyle = isActive ? '' : ''
  }

  return (
    <button
      ref={setNodeRef}
      style={style}
      {...attributes}
      {...listeners}
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={label}
      title={tooltip || label}
      onClick={onClick}
      className={`
        flex-shrink-0 px-3 py-1.5 text-xs font-medium whitespace-nowrap
        ${borderStyle} transition-all duration-150 cursor-grab active:cursor-grabbing
        ${colorClasses}
        ${isDragging ? 'animate-pulse' : ''}
        ${isActive ? 'rounded-t-lg' : 'rounded-t-lg'}
      `}
    >
      {label}
    </button>
  )
}
