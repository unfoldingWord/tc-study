/**
 * Shared empty-pane chrome (Combined Helps + panel-1 mismatch).
 * Icon + one line + optional compact accent action — not an outline button.
 */

import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

export const EMPTY_STATE_LAYOUT =
  'flex flex-col items-center justify-center py-8 text-fg-muted gap-3 px-4'

export const EMPTY_STATE_ICON = 'w-12 h-12 opacity-50'

export const EMPTY_STATE_MESSAGE = 'text-sm text-fg-secondary text-center max-w-sm'

export const EMPTY_STATE_ACTION =
  'inline-flex items-center gap-1.5 p-1.5 rounded-md text-accent hover:bg-accent-soft'

export function EmptyStateLayout({
  children,
  className,
}: {
  children: ReactNode
  className?: string
}) {
  return (
    <div className={className ? `${EMPTY_STATE_LAYOUT} ${className}` : EMPTY_STATE_LAYOUT}>
      {children}
    </div>
  )
}

export function EmptyStateIcon({ icon: Icon }: { icon: LucideIcon }) {
  return <Icon className={EMPTY_STATE_ICON} aria-hidden />
}

export function EmptyStateMessage({ children }: { children: ReactNode }) {
  return <p className={EMPTY_STATE_MESSAGE}>{children}</p>
}

export function EmptyStateActionButton({
  icon: Icon,
  label,
  shortLabel,
  onClick,
}: {
  icon: LucideIcon
  label: string
  shortLabel: string
  onClick: () => void
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={EMPTY_STATE_ACTION}
      title={label}
      aria-label={label}
    >
      <Icon className="w-5 h-5" aria-hidden />
      <span className="text-sm font-medium">{shortLabel}</span>
    </button>
  )
}
