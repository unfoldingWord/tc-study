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
  /** Text/layout direction so header aligns with resource content (e.g. RTL for Persian/Arabic) */
  direction?: 'ltr' | 'rtl'
}

export function ResourceViewerHeader({ 
  title, 
  icon: Icon, 
  subtitle,
  actions,
  direction = 'ltr',
}: ResourceViewerHeaderProps) {
  return (
    <div className="flex-shrink-0 px-content py-chrome border-b border-border-subtle/80" dir={direction}>
      <div className="flex items-center justify-between gap-stack">
        <div className="flex items-center gap-chrome-tight min-w-0">
          {Icon && <Icon className="w-3.5 h-3.5 text-fg-muted flex-shrink-0" />}
          <div className="min-w-0">
            <h2 className="text-micro font-semibold text-fg-secondary truncate tracking-wide uppercase">
              {title}
            </h2>
            {subtitle && (
              <p className="text-caption text-fg-muted truncate">
                {subtitle}
              </p>
            )}
          </div>
        </div>
        {actions && (
          <div className="flex min-w-0 shrink items-center justify-end gap-1">
            {actions}
          </div>
        )}
      </div>
    </div>
  )
}
