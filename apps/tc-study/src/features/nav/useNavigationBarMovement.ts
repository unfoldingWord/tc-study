import { useCallback } from 'react'
import type { BCVReference, NavigationMode } from '../../contexts/types'
import { markReadNavigationInternal } from '../read/replaceReadUrlFromUi'
import {
  advanceNavigationUnit,
  canAdvanceNavigationUnit,
} from './advanceNavigationUnit'
import { getNavigationModeLabel } from './navigationBarReferenceFormat'
import type { NavigationActions } from './navigationTypes'

export function useNavigationBarMovement(
  navigation: NavigationActions,
  currentRef: BCVReference,
  navigationMode: NavigationMode,
  hasPassageSet: boolean
) {
  const modeLabel = getNavigationModeLabel(currentRef, navigationMode)

  const handlePrevious = useCallback(() => {
    markReadNavigationInternal()
    advanceNavigationUnit({
      direction: 'previous',
      navigationMode,
      currentRef,
      navigation,
      hasPassageSet,
    })
  }, [currentRef, hasPassageSet, navigation, navigationMode])

  const handleNext = useCallback(() => {
    markReadNavigationInternal()
    advanceNavigationUnit({
      direction: 'next',
      navigationMode,
      currentRef,
      navigation,
      hasPassageSet,
    })
  }, [currentRef, hasPassageSet, navigation, navigationMode])

  const canGoPrevious = useCallback(
    () =>
      canAdvanceNavigationUnit({
        direction: 'previous',
        navigationMode,
        currentRef,
        navigation,
        hasPassageSet,
      }),
    [currentRef, hasPassageSet, navigation, navigationMode]
  )

  const canGoNext = useCallback(
    () =>
      canAdvanceNavigationUnit({
        direction: 'next',
        navigationMode,
        currentRef,
        navigation,
        hasPassageSet,
      }),
    [currentRef, hasPassageSet, navigation, navigationMode]
  )

  return {
    modeLabel,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
  }
}
