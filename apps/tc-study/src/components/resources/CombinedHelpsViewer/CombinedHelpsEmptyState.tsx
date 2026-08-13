/**
 * CombinedHelps empty pane (issue #24). One short line + icon action.
 * Language changes only on explicit tap — never an automatic switch.
 */

import { BookOpen, FileText, Languages } from 'lucide-react'
import { HELPS_EMPTY_COPY, type HelpsEmptyView } from '../../../features/helps/helpsEmptyCopy'
import { useHelpsLanguageActions } from '../../../features/helps/HelpsLanguageActionsContext'

export function CombinedHelpsEmptyState({ view }: { view: HelpsEmptyView }) {
  const actions = useHelpsLanguageActions()
  const EmptyIcon = view.kind === 'no-sources' ? FileText : BookOpen
  const canUseDefault = !!(view.actionLabel && view.defaultHelpsLanguageCode && actions)
  const messageOpensPicker = !canUseDefault && !!actions

  return (
    <div className="flex flex-col items-center justify-center py-8 text-fg-muted gap-3 px-4">
      {messageOpensPicker ? (
        <button
          type="button"
          onClick={() => actions.openHelpsPicker()}
          className="flex flex-col items-center gap-3 max-w-sm"
          title={HELPS_EMPTY_COPY.chooseHelpsLanguage}
          aria-label={HELPS_EMPTY_COPY.chooseHelpsLanguage}
        >
          <Languages className="w-12 h-12 opacity-50" aria-hidden />
          <span className="text-sm text-fg-secondary text-center">{view.message}</span>
        </button>
      ) : (
        <>
          <EmptyIcon className="w-12 h-12 opacity-50" aria-hidden />
          <p className="text-sm text-fg-secondary text-center max-w-sm">{view.message}</p>
        </>
      )}
      {canUseDefault ? (
        <button
          type="button"
          onClick={() => actions.selectHelpsLanguage(view.defaultHelpsLanguageCode!)}
          className="inline-flex items-center gap-1.5 p-1.5 rounded-md text-accent hover:bg-accent-soft"
          title={view.actionLabel!}
          aria-label={view.actionLabel!}
        >
          <Languages className="w-5 h-5" aria-hidden />
          <span className="text-sm font-medium">{view.actionShortLabel}</span>
        </button>
      ) : null}
    </div>
  )
}
