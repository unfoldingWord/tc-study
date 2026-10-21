import type { NavigationCatalogScope } from '../../contexts/types'
import { textKindIconForNavScope } from '../../features/read/textKindIcons'
import { TEXT_MODE_MISMATCH_COPY } from '../../features/read/textModeMismatch'

interface NavigationScopeSwitchProps {
  scope: NavigationCatalogScope
  onSwitch: (scope: NavigationCatalogScope) => void
  className?: string
}

/** Icon-only Bible ↔ Stories tap. Updates navigationScope, not panel scripture/helps. */
export function NavigationScopeSwitch({
  scope,
  onSwitch,
  className = 'p-1.5 hover:bg-accent/15 text-accent-fg transition-colors rounded-full flex items-center justify-center',
}: NavigationScopeSwitchProps) {
  const nextScope: NavigationCatalogScope = scope === 'scripture' ? 'obs' : 'scripture'
  const title =
    nextScope === 'obs'
      ? TEXT_MODE_MISMATCH_COPY.switchToStories
      : TEXT_MODE_MISMATCH_COPY.switchToBible
  const Icon = textKindIconForNavScope(scope)

  return (
    <button
      type="button"
      onClick={() => onSwitch(nextScope)}
      className={className}
      title={title}
      aria-label={title}
    >
      <Icon className="w-4 h-4" aria-hidden />
    </button>
  )
}
