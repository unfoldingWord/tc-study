/**
 * Resource Tabs – tab-based navigation for panel resources using dnd-kit.
 * Provides sortable tabs with drag-and-drop support for reordering and cross-panel moves.
 */

import { SortableContext, horizontalListSortingStrategy } from '@dnd-kit/sortable'
import React from 'react'
import { SortableTab } from './SortableTab'

interface Resource {
  id: string
  key: string
  title: string
  languageCode?: string
  owner?: string
}

interface ResourceTabsProps {
  resources: Resource[]
  currentIndex: number
  onIndexChange: (index: number) => void
  getResourceId: (resource: Resource) => string
  colorScheme: 'blue' | 'purple'
  panelId?: string
  /** Show a ghost placeholder tab when dragging from another panel */
  showDropPlaceholder?: boolean
  /** Label for the placeholder tab */
  placeholderLabel?: string
  /** Index where the placeholder should appear (null = end of tabs) */
  placeholderIndex?: number | null
}

export function ResourceTabs({
  resources,
  currentIndex,
  onIndexChange,
  getResourceId,
  colorScheme,
  panelId,
  showDropPlaceholder = false,
  placeholderLabel = '',
  placeholderIndex = null,
}: ResourceTabsProps) {
  // Placeholder tab styles
  const placeholderColors = {
    blue: 'bg-blue-50 text-blue-400 border-blue-200 border-dashed',
    purple: 'bg-purple-50 text-purple-400 border-purple-200 border-dashed',
  }

  if (resources.length === 0) {
    return (
      <div className="flex-1 min-w-0 flex items-center">
        {/* Ghost placeholder when dragging from another panel to empty panel */}
        {showDropPlaceholder && (
          <div
            className={`
              flex-shrink-0 px-2 py-1.5 text-xs font-medium whitespace-nowrap
              border-2 rounded animate-pulse
              ${placeholderColors[colorScheme]}
            `}
          >
            {placeholderLabel || 'Drop here'}
          </div>
        )}
      </div>
    )
  }

  if (resources.length === 1) {
    const r = resources[0]
    // For single resource, placeholder can appear before (index 0) or after (index 1 or null)
    const showPlaceholderBefore = showDropPlaceholder && placeholderIndex === 0
    const showPlaceholderAfter = showDropPlaceholder && (placeholderIndex === null || placeholderIndex >= 1)
    
    const singlePlaceholder = (
      <div
        className={`
          flex-shrink-0 px-2 py-1.5 text-xs font-medium whitespace-nowrap
          border-2 rounded animate-pulse
          ${placeholderColors[colorScheme]}
        `}
      >
        {placeholderLabel || 'Drop here'}
      </div>
    )
    
    return (
      <div className="flex-1 min-w-0 flex items-center gap-1">
        {/* Ghost placeholder before the tab */}
        {showPlaceholderBefore && singlePlaceholder}
        <div
          role="tab"
          aria-selected
          aria-label={r?.title}
          onClick={() => onIndexChange(0)}
          title={r?.title}
          className="text-xs md:text-sm font-semibold truncate cursor-default"
        >
          {getResourceId(r)}
        </div>
        {/* Ghost placeholder after the tab */}
        {showPlaceholderAfter && singlePlaceholder}
      </div>
    )
  }

  // Create sortable items with resource keys as IDs
  const sortableIds = resources.map(r => r.key || r.id)

  // Placeholder element for cross-panel drop
  const placeholderElement = showDropPlaceholder ? (
    <div
      key="cross-panel-placeholder"
      className={`
        flex-shrink-0 px-2 py-1.5 text-xs font-medium whitespace-nowrap
        border-2 rounded-t animate-pulse
        ${placeholderColors[colorScheme]}
      `}
    >
      {placeholderLabel || 'Drop here'}
    </div>
  ) : null

  // Determine where to show the placeholder
  // If placeholderIndex is null or >= resources.length, show at end
  const showPlaceholderAtEnd = placeholderIndex === null || placeholderIndex >= resources.length

  return (
    <div className="flex-1 min-w-0 overflow-x-auto overflow-y-hidden">
      <SortableContext items={sortableIds} strategy={horizontalListSortingStrategy}>
        <div
          className="flex gap-1"
          role="tablist"
          aria-label="Resources"
        >
          {resources.map((resource, idx) => {
            const key = resource.key || resource.id
            return (
              <React.Fragment key={key}>
                {/* Show placeholder before this tab if this is the drop position */}
                {showDropPlaceholder && !showPlaceholderAtEnd && placeholderIndex === idx && placeholderElement}
                <SortableTab
                  id={key}
                  isActive={idx === currentIndex}
                  label={getResourceId(resource)}
                  tooltip={resource.title} // Show full resource title on hover
                  colorScheme={colorScheme}
                  onClick={() => onIndexChange(idx)}
                />
              </React.Fragment>
            )
          })}
          {/* Ghost placeholder at end when dragging from another panel */}
          {showDropPlaceholder && showPlaceholderAtEnd && placeholderElement}
        </div>
      </SortableContext>
    </div>
  )
}
