import { useCallback } from 'react'
import { useNavigationStore } from '../../contexts'
import { markReadNavigationInternal } from './replaceReadUrlFromUi'
import { applyTextLanguagePickNavigation } from './textLanguagePickNavigation'

export type TextModeScope = 'scripture' | 'obs'

export type SelectTextLanguage = (
  languageCode: string,
  options?: { navigationScope?: TextModeScope }
) => void | Promise<void>

/**
 * Explicit Bible ↔ Stories taps. Switch uses pick-navigation (default ref
 * unless already showing a matching Bible/OBS ref). BCV Apply keeps the
 * user's pick and only reloads catalog.
 */
export function useReadTextModeSwitch(
  currentLanguageCode: string | null,
  handleLanguageSelected: SelectTextLanguage
) {
  const handleSwitchTextMode = useCallback(
    (scope: TextModeScope) => {
      const code = currentLanguageCode
      if (!code) return
      markReadNavigationInternal()
      applyTextLanguagePickNavigation(useNavigationStore.getState(), {
        action: 'switch',
        scope,
      })
      void handleLanguageSelected(code, { navigationScope: scope })
    },
    [currentLanguageCode, handleLanguageSelected]
  )

  const handleNavigatorScopeCommitted = useCallback(
    (scope: TextModeScope) => {
      const code = currentLanguageCode
      if (!code) return
      markReadNavigationInternal()
      void handleLanguageSelected(code, { navigationScope: scope })
    },
    [currentLanguageCode, handleLanguageSelected]
  )

  return { handleSwitchTextMode, handleNavigatorScopeCommitted }
}
