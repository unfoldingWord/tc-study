/**
 * Scrollport key handling: roving focus over words / verse numbers, plus the
 * pane's own Enter/Space (set as anchor). See utils/scriptureKeyboardNav.ts.
 */

import { useCallback, useId, useRef, type KeyboardEvent } from 'react'
import { handleScriptureKeyDown, selectionAnnouncement } from '../utils/scriptureKeyboardNav'

export function useScriptureKeyboardNav(rtl: boolean, onActivatePane: () => void) {
  const announcerRef = useRef<HTMLSpanElement>(null)
  const hintId = useId()

  const onKeyDown = useCallback(
    (e: KeyboardEvent<HTMLElement>) =>
      handleScriptureKeyDown(e, e.currentTarget, {
        rtl,
        onActivatePane,
        // Announce after React paints the word's aria-current.
        onActivated: (item) =>
          requestAnimationFrame(() => {
            const message = selectionAnnouncement(item)
            if (message && announcerRef.current) announcerRef.current.textContent = message
          }),
      }),
    [rtl, onActivatePane]
  )

  return { onKeyDown, announcerRef, hintId }
}
