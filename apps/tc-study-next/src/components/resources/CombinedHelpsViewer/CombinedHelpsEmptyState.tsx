/**
 * CombinedHelps empty pane (issue #24). One short line + icon action.
 * Language changes only on explicit tap — never an automatic switch.
 */

import { BookOpen, FileText, Languages } from 'lucide-react'
import { HELPS_EMPTY_COPY, type HelpsEmptyView } from '../../../features/helps/helpsEmptyCopy'
import { useHelpsLanguageActions } from '../../../features/helps/HelpsLanguageActionsContext'
import {
  EMPTY_STATE_ICON,
  EmptyStateActionButton,
  EmptyStateIcon,
  EmptyStateLayout,
  EmptyStateMessage,
} from '../../shared/EmptyStateLayout'

export function CombinedHelpsEmptyState({ view }: { view: HelpsEmptyView }) {
  const actions = useHelpsLanguageActions()
  const EmptyIcon = view.kind === 'no-sources' ? FileText : BookOpen
  const canUseDefault = !!(view.actionLabel && view.defaultHelpsLanguageCode && actions)
  const messageOpensPicker = !canUseDefault && !!actions

  return (
    <EmptyStateLayout>
      {messageOpensPicker ? (
        <button
          type="button"
          onClick={() => actions.openHelpsPicker()}
          className="flex flex-col items-center gap-3 max-w-sm"
          title={HELPS_EMPTY_COPY.chooseHelpsLanguage}
          aria-label={HELPS_EMPTY_COPY.chooseHelpsLanguage}
        >
          <Languages className={EMPTY_STATE_ICON} aria-hidden />
          <span className="text-sm text-fg-secondary text-center">{view.message}</span>
        </button>
      ) : (
        <>
          <EmptyStateIcon icon={EmptyIcon} />
          <EmptyStateMessage>{view.message}</EmptyStateMessage>
        </>
      )}
      {canUseDefault ? (
        <EmptyStateActionButton
          icon={Languages}
          label={view.actionLabel!}
          shortLabel={view.actionShortLabel!}
          onClick={() => actions.selectHelpsLanguage(view.defaultHelpsLanguageCode!)}
        />
      ) : null}
    </EmptyStateLayout>
  )
}
