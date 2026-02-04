/**
 * DroppablePanel - A wrapper that makes a panel a drop target for dnd-kit
 * Used to enable dragging tabs from one panel to another
 */

import { useDroppable } from '@dnd-kit/core'
import type { ReactNode } from 'react'

interface DroppablePanelProps {
  id: string
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  isOver?: boolean
  colorScheme?: 'blue' | 'purple'
}

export function DroppablePanel({
  id,
  children,
  className = '',
  style,
  colorScheme = 'blue',
}: DroppablePanelProps) {
  const { isOver, setNodeRef } = useDroppable({
    id,
  })

  const highlightColors = {
    blue: 'ring-2 ring-inset ring-blue-400 bg-blue-50',
    purple: 'ring-2 ring-inset ring-purple-400 bg-purple-50',
  }

  return (
    <div
      ref={setNodeRef}
      className={`${className} ${isOver ? highlightColors[colorScheme] : ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
