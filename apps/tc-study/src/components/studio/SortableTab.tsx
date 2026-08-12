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
    // tab-selected: elevated white in light; darker than panel-*-soft strip in dark
    active: 'bg-tab-selected text-panel-1-fg font-semibold shadow-sm',
    // fg-secondary (not muted): readable on panel-*-soft header strip in dark
    inactive: 'text-fg-secondary hover:text-fg hover:bg-muted/50',
    dragging: 'bg-panel-1-soft text-panel-1 border-panel-1/40',
  },
  purple: {
    active: 'bg-tab-selected text-panel-2-fg font-semibold shadow-sm',
    inactive: 'text-fg-secondary hover:text-fg hover:bg-muted/50',
    dragging: 'bg-panel-2-soft text-panel-2 border-panel-2/40',
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
    // Reserve border box so selected / icon-only / labeled tabs share one height
    borderStyle = 'border-2 border-transparent'
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
        flex-shrink-0 h-chrome-control min-h-chrome-control px-chrome text-chrome font-medium
        whitespace-nowrap leading-none
        inline-flex items-center justify-center gap-chrome-tight
        select-none [-webkit-touch-callout:none]
        ${borderStyle} transition-colors duration-150 cursor-grab active:cursor-grabbing
        ${colorClasses}
        ${isThisDragging ? 'animate-pulse opacity-60' : ''}
        rounded-md
        ${isDragging ? 'touch-none' : ''}
      `}
    >
      {Icon ? <Icon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> : null}
      {visibleLabel ? <span className="leading-none">{label}</span> : null}
    </button>
  )
}
