/**
 * Resource Tabs – always-draggable tabs (including single-tab panels).
 * Pointer FSM lives in TabDnDProvider; this strip handles overflow vs drag.
 */

import React from 'react'
import type { LucideIcon } from 'lucide-react'
import { useTabDnDOptional } from '../../features/dnd/TabDnDContext'
import type { StudioPanelId } from '../../features/studio/studioDnDHelpers'
import type { TabPresentation } from '../../features/tabs'
import { SortableTab } from './SortableTab'

interface Resource {
  id: string
  key: string
  title: string
  languageCode?: string
  owner?: string
  type?: string
}

interface ResourceTabsProps {
  resources: Resource[]
  currentIndex: number
  onIndexChange: (index: number) => void
  /** Resolve tab presentation (icon + short label) from resource */
  getTabPresentation: (resource: Resource) => TabPresentation
  colorScheme: 'blue' | 'purple'
  panelId?: string
  /** Show a ghost placeholder tab when dragging from another panel */
  showDropPlaceholder?: boolean
  /** Label for the placeholder tab */
  placeholderLabel?: string
  /** Icon for the placeholder tab */
  placeholderIcon?: LucideIcon | null
  /** Index where the placeholder should appear (null = end of tabs) */
  placeholderIndex?: number | null
}

export function ResourceTabs({
  resources,
  currentIndex,
  onIndexChange,
  getTabPresentation,
  colorScheme,
  panelId: panelIdProp,
  showDropPlaceholder = false,
  placeholderLabel = '',
  placeholderIcon = null,
  placeholderIndex = null,
}: ResourceTabsProps) {
  const { scrollLocked } = useTabDnDOptional()
  const panelId = (panelIdProp ?? 'panel-1') as StudioPanelId

  const placeholderColors = {
    blue: 'bg-blue-50 text-blue-400 border-blue-200 border-dashed',
    purple: 'bg-purple-50 text-purple-400 border-purple-200 border-dashed',
  }

  const PlaceholderIcon = placeholderIcon
  const placeholderElement = showDropPlaceholder ? (
    <div
      key="cross-panel-placeholder"
      className={`
        flex-shrink-0 px-2 py-1.5 text-xs font-medium whitespace-nowrap
        inline-flex items-center gap-1
        border-2 rounded-t animate-pulse
        ${placeholderColors[colorScheme]}
      `}
    >
      {PlaceholderIcon ? <PlaceholderIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden /> : null}
      {placeholderLabel || (!PlaceholderIcon ? 'Drop here' : null)}
    </div>
  ) : null

  if (resources.length === 0) {
    return (
      <div className="flex-1 min-w-0 flex items-center">
        {showDropPlaceholder && (
          <div
            className={`
              flex-shrink-0 px-2 py-1.5 text-xs font-medium whitespace-nowrap
              inline-flex items-center gap-1
              border-2 rounded animate-pulse
              ${placeholderColors[colorScheme]}
            `}
          >
            {PlaceholderIcon ? (
              <PlaceholderIcon className="w-3.5 h-3.5 flex-shrink-0" aria-hidden />
            ) : null}
            {placeholderLabel || (!PlaceholderIcon ? 'Drop here' : null)}
          </div>
        )}
      </div>
    )
  }

  const showPlaceholderAtEnd =
    placeholderIndex === null || placeholderIndex >= resources.length

  return (
    <div
      className={`flex-1 min-w-0 overflow-y-hidden touch-pan-x ${
        scrollLocked ? 'overflow-x-hidden' : 'overflow-x-auto'
      }`}
    >
      <div className="flex gap-1" role="tablist" aria-label="Resources">
        {resources.map((resource, idx) => {
          const key = resource.key || resource.id
          const presentation = getTabPresentation(resource)
          return (
            <React.Fragment key={key}>
              {showDropPlaceholder &&
                !showPlaceholderAtEnd &&
                placeholderIndex === idx &&
                placeholderElement}
              <SortableTab
                id={key}
                panelId={panelId}
                isActive={idx === currentIndex}
                label={presentation.shortLabel}
                tooltip={presentation.title}
                Icon={presentation.Icon}
                showLabel={presentation.showShortLabel}
                colorScheme={colorScheme}
                onClick={() => onIndexChange(idx)}
              />
            </React.Fragment>
          )
        })}
        {showDropPlaceholder && showPlaceholderAtEnd && placeholderElement}
      </div>
    </div>
  )
}
