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
import { useNavigationBarMovement } from '../../features/nav/useNavigationBarMovement'
import { useNavigationBarRtl } from '../../features/nav/useNavigationBarRtl'
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
}: NavigationBarProps = {}) {
  const navigation = useNavigation()
  const currentRef = useCurrentReference()
  const navigationMode = useNavigationMode()
  const passageSet = useCurrentPassageSet()
  const availableBooks = useAvailableBooks()
  const storeHasNavigationSource = useHasNavigationSource()
  const anchorResourceId = useAppStore((s) => s.anchorResourceId)
  const loadedResources = useAppStore((s) => s.loadedResources)

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

  const hasObsResource = Object.values(loadedResources).some(
    (r) =>
      r.resourceId?.toLowerCase() === 'obs' ||
      (r.subject?.toLowerCase().includes('open bible stories') ?? false)
  )
  const hasNavigationSource =
    storeHasNavigationSource || (!!anchorResourceId && hasObsResource && availableBooks.length === 0)

  if (!hasNavigationSource) {
    return (
      <NavigationBarDisabled
        isCompact={isCompact}
        showLanguagePicker={showLanguagePicker}
        onLanguageSelected={onLanguageSelected}
        autoOpenLanguagePicker={autoOpenLanguagePicker}
        languagePickerRequired={languagePickerRequired}
      />
    )
  }

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
        isNavigatorOpen={ui.isNavigatorOpen}
        setIsNavigatorOpen={ui.setIsNavigatorOpen}
        isHistoryOpen={ui.isHistoryOpen}
        setIsHistoryOpen={ui.setIsHistoryOpen}
        isTypeSelectorOpen={ui.isTypeSelectorOpen}
        setIsTypeSelectorOpen={ui.setIsTypeSelectorOpen}
        isMenuOpen={ui.isMenuOpen}
        setIsMenuOpen={ui.setIsMenuOpen}
        isVersionOpen={ui.isVersionOpen}
        setIsVersionOpen={ui.setIsVersionOpen}
        menuRef={ui.menuRef}
        typeSelectorRef={ui.typeSelectorRef}
      />
    )
  }

  return null
}
