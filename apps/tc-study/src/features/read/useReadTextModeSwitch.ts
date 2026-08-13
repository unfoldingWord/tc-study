import { useCallback } from 'react'
import { useNavigationStore } from '../../contexts'
import { applyTextModeScopeSwitch } from './textModeMismatch'

export type TextModeScope = 'scripture' | 'obs'

export type SelectTextLanguage = (
  languageCode: string,
  options?: { navigationScope?: TextModeScope }
) => void | Promise<void>

/**
 * Explicit Bible ↔ Stories taps. The panel-1 Switch button resets to a default
 * ref; BCV Apply keeps the user's pick and only reloads catalog.
 */
export function useReadTextModeSwitch(
  currentLanguageCode: string | null,
  handleLanguageSelected: SelectTextLanguage
) {
  const handleSwitchTextMode = useCallback(
    (scope: TextModeScope) => {
      const code = currentLanguageCode
      if (!code) return
      applyTextModeScopeSwitch(useNavigationStore.getState(), scope)
      void handleLanguageSelected(code, { navigationScope: scope })
    },
    [currentLanguageCode, handleLanguageSelected]
  )

  const handleNavigatorScopeCommitted = useCallback(
    (scope: TextModeScope) => {
      const code = currentLanguageCode
      if (!code) return
      void handleLanguageSelected(code, { navigationScope: scope })
    },
    [currentLanguageCode, handleLanguageSelected]
  )

  return { handleSwitchTextMode, handleNavigatorScopeCommitted }
}
