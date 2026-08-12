/**
 * Reusable Selectable Grid Component
 * Eliminates UI duplication across wizard steps
 */

import { Check } from 'lucide-react'
import { ReactNode } from 'react'

export interface SelectableGridProps<T> {
  /**
   * Items to display in the grid
   */
  items: T[]
  
  /**
   * Set of selected item keys
   */
  selected: Set<string>
  
  /**
   * Callback when item is toggled
   */
  onToggle: (key: string) => void
  
  /**
   * Function to get unique key for each item
   */
  getKey: (item: T) => string
  
  /**
   * Function to render item content
   */
  renderItem: (item: T, isSelected: boolean, isDisabled: boolean) => ReactNode
  
  /**
   * Optional: Function to check if item is disabled
   */
  isDisabled?: (item: T) => boolean
  
  /**
   * Optional: Function to check if item is locked (selected but can't deselect)
   */
  isLocked?: (item: T) => boolean
  
  /**
   * Optional: Custom class name for grid container
   */
  className?: string
  
  /**
   * Optional: Number of columns (default: responsive)
   */
  columns?: number
}

export function SelectableGrid<T>({
  items,
  selected,
  onToggle,
  getKey,
  renderItem,
  isDisabled,
  isLocked,
  className,
  columns,
}: SelectableGridProps<T>) {
  const gridClass = columns
    ? `grid gap-2`
    : `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2`
  
  const gridStyle = columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined

  return (
    <div className={className || gridClass} style={gridStyle}>
      {items.map((item) => {
        const key = getKey(item)
        const isSelected = selected.has(key)
        const disabled = isDisabled?.(item) || false
        const locked = isLocked?.(item) || false
        
        return (
          <div
            key={key}
            onClick={() => !disabled && !locked && onToggle(key)}
            className={`
              relative p-3 rounded-lg border-2 transition-all
              ${locked
                ? 'cursor-default border-accent bg-accent-soft'
                : disabled 
                  ? 'opacity-50 cursor-not-allowed border-border bg-muted' 
                  : isSelected
                    ? 'cursor-pointer border-accent bg-accent-soft'
                    : 'cursor-pointer border-border hover:border-accent/50 hover:bg-accent-soft bg-surface'
              }
            `}
            title={key}
          >
            {isSelected && !disabled && (
              <Check className={`absolute top-1.5 right-1.5 w-4 h-4 ${locked ? 'text-accent' : 'text-accent'}`} />
            )}
            {renderItem(item, isSelected, disabled)}
          </div>
        )
      })}
    </div>
  )
}

/**
 * Variation with different selection color (e.g., for cached vs online)
 */
export interface SelectableGridWithStatusProps<T> extends Omit<SelectableGridProps<T>, 'renderItem'> {
  /**
   * Function to get status for styling
   */
  getStatus: (item: T) => 'cached' | 'online'
  
  /**
   * Function to render item content with status
   */
  renderItem: (item: T, isSelected: boolean, status: 'cached' | 'online') => ReactNode
}

export function SelectableGridWithStatus<T>({
  items,
  selected,
  onToggle,
  getKey,
  getStatus,
  renderItem,
  className,
  columns,
}: SelectableGridWithStatusProps<T>) {
  const gridClass = columns
    ? `grid gap-2`
    : `grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2`
  
  const gridStyle = columns ? { gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` } : undefined

  return (
    <div className={className || gridClass} style={gridStyle}>
      {items.map((item) => {
        const key = getKey(item)
        const isSelected = selected.has(key)
        const status = getStatus(item)
        
        const borderColor = isSelected
          ? status === 'cached' ? 'border-accent' : 'border-accent'
          : 'border-border hover:border-accent/50'
          
        const bgColor = isSelected
          ? status === 'cached' ? 'bg-accent-soft' : 'bg-accent-soft'
          : 'bg-surface hover:bg-accent-soft'
        
        return (
          <div
            key={key}
            onClick={() => onToggle(key)}
            className={`
              relative p-3 rounded-lg border-2 transition-all cursor-pointer
              ${borderColor} ${bgColor}
            `}
            title={key}
          >
            {isSelected && (
              <Check className={`absolute top-1.5 right-1.5 w-4 h-4 text-accent`} />
            )}
            {renderItem(item, isSelected, status)}
          </div>
        )
      })}
    </div>
  )
}



