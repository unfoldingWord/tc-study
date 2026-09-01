/**
 * NavigationBar - Context-aware navigation controls
 */

import { useEffect } from 'react'
import {
  useAvailableBooks,
  useCurrentPassageSet,
  useCurrentReference,
  useHasNavigationSource,
  useNavigation,
  useNavigationMode,
} from '../../contexts'
import { useAppStore } from '../../contexts/AppContext'
import { findObsCatalogKey } from '../../features/nav/bcvNavHelpers'
import { useNavigationBarMovement } from '../../features/nav/useNavigationBarMovement'
import { useNavigationBarRtl } from '../../features/nav/useNavigationBarRtl'
import { useReadPathLanguageCode } from '../../features/read/useReadPathLanguageCode'
import { useNavigationBarUiState } from '../../features/nav/useNavigationBarUiState'
import { NavigationBarCompact } from './NavigationBarCompact'
import { NavigationBarDisabled } from './NavigationBarDisabled'

export interface NavigationBarProps {
  isCompact?: boolean
  onToggleCompact?: () => void
  onLanguageSelected?: (languageCode: string) => void
  showLanguagePicker?: boolean
  autoOpenLanguagePicker?: boolean
  languagePickerRequired?: boolean
  downloadIndicator?: React.ReactNode
  onDownloadCollection?: () => void
  onLoadCollection?: () => void
  /** Read: BCV Bible↔Stories apply reloads catalog without resetting helps language. */
  onNavigationScopeCommitted?: (scope: 'scripture' | 'obs') => void
  /** Read: compact Bible↔Stories tap — same path as mismatch Switch. */
  onSwitchTextMode?: (scope: 'scripture' | 'obs') => void
}

export function NavigationBar({
  isCompact = false,
  onToggleCompact: _onToggleCompact,
  onLanguageSelected,
  showLanguagePicker = false,
  autoOpenLanguagePicker = false,
  languagePickerRequired = false,
  downloadIndicator,
  onDownloadCollection,
  onLoadCollection,
  onNavigationScopeCommitted,
  onSwitchTextMode,
}: NavigationBarProps = {}) {
  const navigation = useNavigation()
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const passageSet = useCurrentPassageSet()
  const availableBooks = useAvailableBooks()
  const storeHasNavigationSource = useHasNavigationSource()
  const anchorResourceId = useAppStore((s) => s.anchorResourceId)
  const loadedResources = useAppStore((s) => s.loadedResources)
  const urlLanguageCode = useReadPathLanguageCode()

  const isRtl = useNavigationBarRtl()
  const ui = useNavigationBarUiState()
  const movement = useNavigationBarMovement(
    navigation,
    currentRef,
    navigationMode,
    !!passageSet
  )

  useEffect(() => {
    if (autoOpenLanguagePicker) {
      // intentionally empty
    }
  }, [autoOpenLanguagePicker])

  const hasObsResource = !!findObsCatalogKey(loadedResources, urlLanguageCode)
  const hasNavigationSource =
    storeHasNavigationSource || (!!anchorResourceId && hasObsResource && availableBooks.length === 0)

  // Compact Read chrome must stay mounted when books are briefly empty (helps-only
  // panes / language switch). The disabled skeleton is a 37px blank pill.
  if (isCompact) {
    return (
      <NavigationBarCompact
        isRtl={isRtl}
        hasObsResource={hasObsResource}
        modeLabel={movement.modeLabel}
        handlePrevious={movement.handlePrevious}
        handleNext={movement.handleNext}
        canGoPrevious={movement.canGoPrevious}
        canGoNext={movement.canGoNext}
        downloadIndicator={downloadIndicator}
        showLanguagePicker={showLanguagePicker}
        onLanguageSelected={onLanguageSelected}
        autoOpenLanguagePicker={autoOpenLanguagePicker}
        languagePickerRequired={languagePickerRequired}
        onDownloadCollection={onDownloadCollection}
        onLoadCollection={onLoadCollection}
        onNavigationScopeCommitted={onNavigationScopeCommitted}
        onSwitchTextMode={onSwitchTextMode}
        isNavigatorOpen={ui.isNavigatorOpen}
        setIsNavigatorOpen={ui.setIsNavigatorOpen}
        isHistoryOpen={ui.isHistoryOpen}
        setIsHistoryOpen={ui.setIsHistoryOpen}
        isMenuOpen={ui.isMenuOpen}
        setIsMenuOpen={ui.setIsMenuOpen}
        isVersionOpen={ui.isVersionOpen}
        setIsVersionOpen={ui.setIsVersionOpen}
        menuRef={ui.menuRef}
      />
    )
  }

  if (!hasNavigationSource) {
    return (
      <NavigationBarDisabled
        isCompact={false}
        showLanguagePicker={showLanguagePicker}
        onLanguageSelected={onLanguageSelected}
        autoOpenLanguagePicker={autoOpenLanguagePicker}
        languagePickerRequired={languagePickerRequired}
      />
    )
  }

  return null
}
