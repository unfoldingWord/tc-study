import { useEffect, type RefObject } from 'react'
import type { BCVReference } from '../../contexts'

/**
 * Smooth-scroll selected book / verse / section / OBS story into view.
 */
export function useBcvNavigatorScroll(options: {
  step: 1 | 2
  pickerScope: 'scripture' | 'obs'
  scripturePickerMode: string
  selectedBook: string
  startVerse: string | null
  sectionsLength: number
  currentRef: BCVReference
  currentSectionRef: RefObject<HTMLButtonElement | null>
  startVerseRef: RefObject<HTMLButtonElement | null>
  selectedBookRef: RefObject<HTMLButtonElement | null>
  selectedObsStoryRef: RefObject<HTMLButtonElement | null>
}) {
  const {
    step,
    pickerScope,
    scripturePickerMode,
    selectedBook,
    startVerse,
    sectionsLength,
    currentRef,
    currentSectionRef,
    startVerseRef,
    selectedBookRef,
    selectedObsStoryRef,
  } = options

  useEffect(() => {
    if (
      scripturePickerMode === 'section' &&
      currentSectionRef.current &&
      step === 2 &&
      pickerScope === 'scripture'
    ) {
      setTimeout(() => {
        currentSectionRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [scripturePickerMode, step, sectionsLength, pickerScope, currentSectionRef])

  useEffect(() => {
    if (
      scripturePickerMode !== 'section' &&
      pickerScope === 'scripture' &&
      startVerseRef.current &&
      step === 2 &&
      startVerse
    ) {
      setTimeout(() => {
        startVerseRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [scripturePickerMode, step, startVerse, pickerScope, startVerseRef])

  useEffect(() => {
    if (step === 1 && selectedBookRef.current && selectedBook && pickerScope === 'scripture') {
      setTimeout(() => {
        selectedBookRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [step, selectedBook, pickerScope, selectedBookRef])

  useEffect(() => {
    if (
      step === 1 &&
      selectedObsStoryRef.current &&
      pickerScope === 'obs' &&
      currentRef.book === 'obs'
    ) {
      setTimeout(() => {
        selectedObsStoryRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' })
      }, 100)
    }
  }, [step, pickerScope, currentRef.book, currentRef.chapter, selectedObsStoryRef])
}
