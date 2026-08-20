/**
 * Mid-session scripture language change vs Bible/OBS mismatch (issue #25).
 *
 * Cold start already skips catalog + clears panel-1. A hydrated pane's language
 * picker goes through handlePanelLanguageSelected / runCatalogLoad, which used
 * to keep leftover ULT/UGNT and hide EmptyPanelState.
 */

import { clearReadPanelsForLanguageSwitch } from './clearReadPanelsForLanguageSwitch'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { ReadPanelId } from './readPanelModel'
import {
  textModeMismatchFromCache,
  type TextModeMismatchView,
} from './textModeMismatch'

export function supportedSubjectsFromRegistry(registry: {
  subjectsForLanguageList?: (kind: 'global') => string[]
  getSupportedSubjects?: () => string[]
}): string[] {
  if (typeof registry.subjectsForLanguageList === 'function') {
    return registry.subjectsForLanguageList('global')
  }
  return typeof registry.getSupportedSubjects === 'function'
    ? registry.getSupportedSubjects()
    : []
}

export function shouldSkipTextCatalogForMismatch(options: {
  loadTarget: CatalogLoadTarget
  languageCode: string
  navigationScope: string
  supportedSubjects: string[]
}): boolean {
  if (options.loadTarget === 'helps') return false
  return Boolean(
    textModeMismatchFromCache({
      languageCode: options.languageCode,
      navigationScope: options.navigationScope,
      supportedSubjects: options.supportedSubjects,
    })
  )
}

/**
 * If this scripture language has no content for the current Bible/OBS mode,
 * drop leftover gateway + OL membership so UGNT/ULT cannot keep rendering.
 */
export function applyScripturePanelMismatch(options: {
  languageCode: string
  navigationScope: string
  supportedSubjects: string[]
  panelId: ReadPanelId
  helpsLanguageCode?: string
}): TextModeMismatchView | null {
  const mismatch = textModeMismatchFromCache({
    languageCode: options.languageCode,
    navigationScope: options.navigationScope,
    supportedSubjects: options.supportedSubjects,
  })
  if (!mismatch) return null
  clearReadPanelsForLanguageSwitch(options.helpsLanguageCode, options.panelId, {
    reconcileHelps: false,
  })
  return mismatch
}

/** Clear leftover membership and drop text expected keys when mismatch. */
export function skipTextCatalogOnMismatch(options: {
  languageCode: string
  navigationScope: string
  supportedSubjects: string[]
  panelId: ReadPanelId
  helpsLanguageCode?: string
  textKeysRef: { current: string[] }
  helpsKeysRef: { current: string[] }
  setExpectedResources: (keys: string[]) => void
}): TextModeMismatchView | null {
  const mismatch = applyScripturePanelMismatch(options)
  if (!mismatch) return null
  options.textKeysRef.current = []
  options.setExpectedResources(options.helpsKeysRef.current)
  return mismatch
}

/** Mismatch empty wins over leftover UGNT/ULT (or any prior viewer). */
export function scriptureKeysForMismatchDisplay(
  keys: readonly string[],
  mismatch: TextModeMismatchView | null
): string[] {
  if (mismatch) return []
  return [...keys]
}
