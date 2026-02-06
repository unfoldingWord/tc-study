/**
 * Resource Viewer Header
 * 
 * Compact header component displayed at the top of each resource viewer
 * showing the resource title/name.
 */

import { LucideIcon } from 'lucide-react'

interface ResourceViewerHeaderProps {
  /** Resource title to display */
  title: string
  /** Optional icon to display before the title */
  icon?: LucideIcon
  /** Optional subtitle/description */
  subtitle?: string
  /** Optional extra content on the right side */
  actions?: React.ReactNode
}

export function ResourceViewerHeader({ 
  title, 
  icon: Icon, 
  subtitle,
  actions 
}: ResourceViewerHeaderProps) {
  return (
    <div className="flex-shrink-0 bg-white border-b border-gray-200 px-4 py-2">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          {Icon && <Icon className="w-4 h-4 text-gray-600 flex-shrink-0" />}
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-gray-900 truncate">
              {title}
            </h2>
            {subtitle && (
              <p className="text-xs text-gray-500 truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex-shrink-0">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
