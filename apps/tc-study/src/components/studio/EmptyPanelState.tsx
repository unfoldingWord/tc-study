/**
 * EmptyPanelState - Minimalistic empty state for panels
 */

import { BookMarked, BookOpen, Plus, type LucideIcon } from 'lucide-react'
import {
  TEXT_MODE_MISMATCH_COPY,
  type TextModeMismatchKind,
} from '../../features/read/textModeMismatch'
import {
  EmptyStateActionButton,
  EmptyStateIcon,
  EmptyStateLayout,
  EmptyStateMessage,
} from '../shared/EmptyStateLayout'

export const SELECT_LANGUAGE_TO_LOAD_RESOURCES = 'Select a language to load resources'

/** After inherit/URL hydrate, a pane with a language must not show the pick-language CTA. */
export function emptyPanelSelectLanguageCta(
  languageCode: string | null | undefined
): string | undefined {
  return languageCode?.trim() ? undefined : SELECT_LANGUAGE_TO_LOAD_RESOURCES
}

export interface EmptyPanelStateProps {
  panelId: string
  panelName?: string
  /** Optional message (e.g. "Select a language to load resources") */
  message?: string
  onAddResource?: () => void
  /** When set, the message is a clickable CTA (helps-pane language picker). */
  onMessageClick?: () => void
  /** Full a11y label (panel-1 mode mismatch). Visible text is `actionShortLabel`. */
  actionLabel?: string
  /** Compact visible action (e.g. `Stories` / `Bible`). */
  actionShortLabel?: string
  onAction?: () => void
  /** Drives the large muted icon (BookOpen / BookMarked). */
  emptyKind?: TextModeMismatchKind
}

function mismatchIcons(kind?: TextModeMismatchKind, actionLabel?: string): {
  EmptyIcon: LucideIcon
  ActionIcon: LucideIcon
  shortLabel: string
} | null {
  if (kind === 'obs-only' || actionLabel === TEXT_MODE_MISMATCH_COPY.switchToStories) {
    return {
      EmptyIcon: BookMarked,
      ActionIcon: BookMarked,
      shortLabel: TEXT_MODE_MISMATCH_COPY.stories,
    }
  }
  if (kind === 'bible-only' || actionLabel === TEXT_MODE_MISMATCH_COPY.switchToBible) {
    return {
      EmptyIcon: BookOpen,
      ActionIcon: BookOpen,
      shortLabel: TEXT_MODE_MISMATCH_COPY.bible,
    }
  }
  if (kind === 'neither') {
    return {
      EmptyIcon: BookOpen,
      ActionIcon: BookOpen,
      shortLabel: '',
    }
  }
  return null
}

export function EmptyPanelState({
  panelId: _panelId,
  panelName,
  message,
  onAddResource,
  onMessageClick,
  actionLabel,
  actionShortLabel,
  onAction,
  emptyKind,
}: EmptyPanelStateProps) {
  const label = message ?? panelName
  const showAction = !!(actionLabel && onAction)
  const chrome = mismatchIcons(emptyKind, actionLabel)
  const shortLabel = actionShortLabel ?? chrome?.shortLabel
  const showMismatchIcon = !!(chrome && (showAction || emptyKind))

  return (
    <EmptyStateLayout className={onAddResource ? 'h-full' : undefined}>
      {showMismatchIcon && chrome ? <EmptyStateIcon icon={chrome.EmptyIcon} /> : null}
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
        <EmptyStateMessage>{label}</EmptyStateMessage>
      ) : null}
      {showAction && chrome && shortLabel ? (
        <EmptyStateActionButton
          icon={chrome.ActionIcon}
          label={actionLabel!}
          shortLabel={shortLabel}
          onClick={onAction!}
        />
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
    </EmptyStateLayout>
  )
}
