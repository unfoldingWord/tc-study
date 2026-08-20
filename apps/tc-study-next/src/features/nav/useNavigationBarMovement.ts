import { useCallback } from 'react'
import type { BCVReference, NavigationMode } from '../../contexts/types'
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
    if (currentRef.book === 'obs') {
      if (navigationMode === 'chapter') {
        navigation.previousObsStory()
      } else {
        navigation.previousObsFrame()
      }
      return
    }
    if (navigationMode === 'passage-set' && hasPassageSet) {
      navigation.previousPassage()
    } else if (navigationMode === 'verse') {
      navigation.previousVerse()
    } else if (navigationMode === 'chapter') {
      navigation.previousChapter()
    } else if (navigationMode === 'section') {
      navigation.previousSection()
    }
  }, [currentRef.book, hasPassageSet, navigation, navigationMode])

  const handleNext = useCallback(() => {
    if (currentRef.book === 'obs') {
      if (navigationMode === 'chapter') {
        navigation.nextObsStory()
      } else {
        navigation.nextObsFrame()
      }
      return
    }
    if (navigationMode === 'passage-set' && hasPassageSet) {
      navigation.nextPassage()
    } else if (navigationMode === 'verse') {
      navigation.nextVerse()
    } else if (navigationMode === 'chapter') {
      navigation.nextChapter()
    } else if (navigationMode === 'section') {
      navigation.nextSection()
    }
  }, [currentRef.book, hasPassageSet, navigation, navigationMode])

  const canGoPrevious = useCallback(() => {
    if (currentRef.book === 'obs') {
      return navigationMode === 'chapter'
        ? navigation.canGoToPreviousObsStory()
        : navigation.canGoToPreviousObsFrame()
    }
    if (navigationMode === 'passage-set') {
      return navigation.canGoToPreviousPassage()
    }
    if (navigationMode === 'verse') {
      return navigation.canGoToPreviousVerse()
    }
    if (navigationMode === 'chapter') {
      return navigation.canGoToPreviousChapter()
    }
    if (navigationMode === 'section') {
      return navigation.canGoToPreviousSection()
    }
    return false
  }, [currentRef.book, navigation, navigationMode])

  const canGoNext = useCallback(() => {
    if (currentRef.book === 'obs') {
      return navigationMode === 'chapter'
        ? navigation.canGoToNextObsStory()
        : navigation.canGoToNextObsFrame()
    }
    if (navigationMode === 'passage-set') {
      return navigation.canGoToNextPassage()
    }
    if (navigationMode === 'verse') {
      return navigation.canGoToNextVerse()
    }
    if (navigationMode === 'chapter') {
      return navigation.canGoToNextChapter()
    }
    if (navigationMode === 'section') {
      return navigation.canGoToNextSection()
    }
    return false
  }, [currentRef.book, navigation, navigationMode])

  return {
    modeLabel,
    handlePrevious,
    handleNext,
    canGoPrevious,
    canGoNext,
  }
}
