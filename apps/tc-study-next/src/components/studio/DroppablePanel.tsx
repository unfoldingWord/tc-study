/**
 * DroppablePanel — panel drop target for tab pointer DnD (+ HTML5 sidebar on Studio).
 */

import type { ReactNode } from 'react'
import { TAB_DND_ATTR, useTabDnDOptional } from '../../features/dnd/TabDnDContext'
import type { StudioPanelId } from '../../features/studio/studioDnDHelpers'

interface DroppablePanelProps {
  id: string
  children: ReactNode
  className?: string
  style?: React.CSSProperties
  isOver?: boolean
  colorScheme?: 'blue' | 'purple'
}

function panelIdFromDroppableId(id: string): StudioPanelId | null {
  if (id === 'panel-1-droppable' || id.startsWith('panel-1')) return 'panel-1'
  if (id === 'panel-2-droppable' || id.startsWith('panel-2')) return 'panel-2'
  return null
}

export function DroppablePanel({
  id,
  children,
  className = '',
  style,
  colorScheme = 'blue',
}: DroppablePanelProps) {
  const { hoverPanelId, isDragging } = useTabDnDOptional()
  const panelId = panelIdFromDroppableId(id)
  const isOver = isDragging && !!panelId && hoverPanelId === panelId

  const highlightColors = {
    blue: 'ring-2 ring-inset ring-blue-400 bg-blue-50',
    purple: 'ring-2 ring-inset ring-purple-400 bg-purple-50',
  }

  return (
    <div
      {...(panelId ? { [TAB_DND_ATTR.droppable]: panelId } : {})}
      className={`${className} ${isOver ? highlightColors[colorScheme] : ''}`}
      style={style}
    >
      {children}
    </div>
  )
}
