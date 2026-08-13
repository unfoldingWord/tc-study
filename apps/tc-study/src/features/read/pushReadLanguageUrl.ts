/**
 * Replace the Read URL for a text-language change without inventing a router.
 */

import type { NavigateFunction } from 'react-router-dom'
import { useNavigationStore } from '../nav/navigationStore'
import { buildReadPath, buildReadRouteTailFromNavigation } from '../../utils/readRoutes'

export function pushReadLanguageUrl(navigate: NavigateFunction, languageCode: string): void {
  const nav = useNavigationStore.getState()
  const tail = buildReadRouteTailFromNavigation({
    scope: nav.navigationScope,
    mode: nav.navigationMode,
    ref: nav.currentReference,
    passageSet: nav.currentPassageSet,
    section1Based:
      nav.navigationMode === 'section' && nav.currentSectionIndex >= 0
        ? nav.currentSectionIndex + 1
        : null,
  })
  if (tail) {
    navigate(buildReadPath(languageCode, tail), { replace: true })
  } else {
    navigate(`/read/${languageCode}`, { replace: true })
  }
}
