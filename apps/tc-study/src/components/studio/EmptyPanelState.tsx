/**
 * EmptyPanelState - Minimalistic empty state for panels
 */

import { Plus } from 'lucide-react'

export interface EmptyPanelStateProps {
  panelId: string
  panelName?: string
  /** Optional message (e.g. "Select a language to load resources") */
  message?: string
  onAddResource?: () => void
  /** When set, the message is a clickable CTA (helps-pane language picker). */
  onMessageClick?: () => void
  /** Labeled action (panel-1 mode mismatch). Icon-first exception: sentence + button. */
  actionLabel?: string
  onAction?: () => void
}

export function EmptyPanelState({
  panelId: _panelId,
  panelName,
  message,
  onAddResource,
  onMessageClick,
  actionLabel,
  onAction,
}: EmptyPanelStateProps) {
  const label = message ?? panelName
  const showAction = !!(actionLabel && onAction)
  return (
    <div className="h-full flex flex-col items-center justify-center gap-3 px-4">
      {label && onMessageClick && !showAction ? (
        <button
          type="button"
          onClick={onMessageClick}
          className="text-sm text-fg-secondary hover:text-fg"
          title={label}
          aria-label={label}
        >
          {label}
        </button>
      ) : label ? (
        <p className="text-sm text-fg-secondary text-center max-w-sm">{label}</p>
      ) : null}
      {showAction ? (
        <button
          type="button"
          onClick={onAction}
          className="px-2.5 py-1 rounded-md border border-accent text-accent text-sm font-medium hover:bg-accent-soft"
          title={actionLabel}
          aria-label={actionLabel}
        >
          {actionLabel}
        </button>
      ) : null}
      {onAddResource ? (
      <button
        onClick={onAddResource}
        className="w-16 h-16 rounded-full bg-blue-500 hover:bg-blue-600 flex items-center justify-center transition-colors shadow-lg hover:shadow-xl group"
        title="Add resource"
        aria-label="Add resource to this panel"
      >
        <Plus className="w-8 h-8 text-white group-hover:scale-110 transition-transform" />
      </button>
      ) : null}
    </div>
  )
}
