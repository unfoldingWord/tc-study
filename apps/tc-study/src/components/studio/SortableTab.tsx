/**
 * SortableTab — panel resource tab with pointer long-press / distance drag.
 * Presentation (icon / short label) is resolved upstream; this component stays type-agnostic.
 */

import type { LucideIcon } from 'lucide-react'
import type { StudioPanelId } from '../../features/studio/studioDnDHelpers'
import { TAB_DND_ATTR, useTabDnD } from '../../features/dnd/TabDnDContext'

interface SortableTabProps {
  id: string
  panelId: StudioPanelId
  isActive: boolean
  /** Short abbrev text (always provided; may be hidden when icon-only) */
  label: string
  /** Full resource title for aria-label / title */
  tooltip?: string
  Icon?: LucideIcon | null
  /** When false and Icon is set, tab is icon-only */
  showLabel?: boolean
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

export function SortableTab({
  id,
  panelId,
  isActive,
  label,
  tooltip,
  Icon = null,
  showLabel = true,
  colorScheme,
  onClick,
}: SortableTabProps) {
  const { activeId, isDragging, beginTabPress, shouldSuppressClick } = useTabDnD()
  const colors = tabColors[colorScheme]
  const isThisDragging = activeId === id

  let colorClasses: string
  let borderStyle: string

  if (isThisDragging) {
    colorClasses = colors.dragging
    borderStyle = 'border-2 border-dashed'
  } else {
    colorClasses = isActive ? colors.active : colors.inactive
    borderStyle = ''
  }

  const accessibleName = tooltip || label
  const visibleLabel = showLabel || !Icon

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      aria-label={accessibleName}
      title={accessibleName}
      {...{
        [TAB_DND_ATTR.tabKey]: id,
        [TAB_DND_ATTR.tabPanel]: panelId,
      }}
      onPointerDown={(e) => {
        beginTabPress({
          key: id,
          panelId,
          label,
          Icon: Icon ?? null,
          showShortLabel: visibleLabel,
          event: e,
        })
      }}
      onClick={() => {
        if (shouldSuppressClick()) return
        onClick()
      }}
      className={`
        flex-shrink-0 px-2.5 py-1.5 text-xs font-medium whitespace-nowrap
        inline-flex items-center gap-1
        select-none [-webkit-touch-callout:none]
        ${borderStyle} transition-all duration-150 cursor-grab active:cursor-grabbing
        ${colorClasses}
        ${isThisDragging ? 'animate-pulse opacity-60' : ''}
        ${isActive ? 'rounded-t-lg' : 'rounded-t-lg'}
        ${isDragging ? 'touch-none' : ''}
      `}
    >
      {Icon ? <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> : null}
      {visibleLabel ? <span>{label}</span> : null}
    </button>
  )
}
