/**
 * Replace the Read URL for any panel language change without React Router.
 */

import { useNavigationStore } from '../nav/navigationStore'
import { buildReadPath, buildReadRouteTailFromNavigation } from '../../utils/readRoutes'
import { replaceReadUrlFromUi } from './replaceReadUrlFromUi'
import { serializeReadUrl } from './readUrlGrammar'

export function replaceReadLanguageUrlFromUi(languageCodes: string | string[]): void {
  const langs = (Array.isArray(languageCodes) ? languageCodes : [languageCodes]).filter(Boolean)
  if (langs.length === 0) return
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
    replaceReadUrlFromUi(buildReadPath(langs, tail))
  } else {
    replaceReadUrlFromUi(serializeReadUrl({ langs }))
  }
}
