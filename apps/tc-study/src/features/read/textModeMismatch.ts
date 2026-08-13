/**
 * Panel-1 empty state when the text language has no content for the current
 * Bible/OBS mode (Epic #21 / issue #25).
 *
 * Picker taps never auto-switch: they land here. Mode changes only on Switch.
 * Same family: neither-type languages, and explicit BCV into a mode the
 * language does not have.
 */

import type { BCVReference, NavigationCatalogScope } from '../../contexts/types'
import type { LanguageAvailabilityFlags } from './languageAvailability'
import { languageAnglicizedDisplayName } from './languageListDisplayName'
import { loadLanguagesCache } from './languagesCache'

export type TextModeMismatchKind = 'obs-only' | 'bible-only' | 'neither'

/** Single copy table — swap here for localization. */
export const TEXT_MODE_MISMATCH_COPY = {
  noBibleHasObs: (name: string) =>
    `${name} doesn't have a Bible yet, but it has Open Bible Stories.`,
  noObsHasBible: (name: string) =>
    `${name} doesn't have Open Bible Stories yet, but it has a Bible.`,
  neither: (name: string) =>
    `${name} doesn't have a Bible or Open Bible Stories yet.`,
  switchToStories: 'Switch to Stories',
  switchToBible: 'Switch to Bible',
} as const

export interface TextModeMismatchView {
  kind: TextModeMismatchKind
  languageCode: string
  languageName: string
  message: string
  actionLabel: string | null
  switchScope: NavigationCatalogScope | null
}

const DEFAULT_BIBLE_REF: BCVReference = { book: 'tit', chapter: 1, verse: 1 }
const DEFAULT_OBS_REF: BCVReference = { book: 'obs', chapter: 1, verse: 1 }

export function resolveTextModeMismatch(options: {
  navigationScope: string
  availability: LanguageAvailabilityFlags | undefined | null
  languageCode: string
  languageName: string
}): TextModeMismatchView | null {
  const availability = options.availability
  if (!availability) return null

  const name = options.languageName.trim() || options.languageCode
  const wantsObs = options.navigationScope === 'obs'
  const hasCurrent = wantsObs ? availability.obs : availability.bible
  if (hasCurrent) return null

  const hasOther = wantsObs ? availability.bible : availability.obs
  if (!hasOther) {
    return {
      kind: 'neither',
      languageCode: options.languageCode,
      languageName: name,
      message: TEXT_MODE_MISMATCH_COPY.neither(name),
      actionLabel: null,
      switchScope: null,
    }
  }

  if (wantsObs) {
    return {
      kind: 'bible-only',
      languageCode: options.languageCode,
      languageName: name,
      message: TEXT_MODE_MISMATCH_COPY.noObsHasBible(name),
      actionLabel: TEXT_MODE_MISMATCH_COPY.switchToBible,
      switchScope: 'scripture',
    }
  }

  return {
    kind: 'obs-only',
    languageCode: options.languageCode,
    languageName: name,
    message: TEXT_MODE_MISMATCH_COPY.noBibleHasObs(name),
    actionLabel: TEXT_MODE_MISMATCH_COPY.switchToStories,
    switchScope: 'obs',
  }
}

export function textModeMismatchFromCache(options: {
  languageCode: string | null
  navigationScope: string
  supportedSubjects: string[]
}): TextModeMismatchView | null {
  const code = options.languageCode?.trim()
  if (!code) return null
  const listed = loadLanguagesCache(options.supportedSubjects)
  const lang = listed?.find((entry) => entry.code === code)
  return resolveTextModeMismatch({
    navigationScope: options.navigationScope,
    availability: lang?.availability,
    languageCode: code,
    languageName: languageAnglicizedDisplayName(lang, code),
  })
}

export function applyTextModeScopeSwitch(
  nav: {
    setNavigationScope: (scope: NavigationCatalogScope) => void
    navigateToReference: (ref: BCVReference) => void
    currentReference?: BCVReference
  },
  scope: NavigationCatalogScope
): void {
  nav.setNavigationScope(scope)
  const current = nav.currentReference
  const alreadyOnTarget =
    scope === 'obs' ? current?.book === 'obs' : !!(current && current.book !== 'obs')
  if (alreadyOnTarget) return
  nav.navigateToReference(scope === 'obs' ? DEFAULT_OBS_REF : DEFAULT_BIBLE_REF)
}

/** `/read/{lang}/bible|obs/...` — ignore `/read-v1`. */
export function navigationScopeFromReadPath(
  pathname: string,
  fallback: string
): string {
  const match = /(?:^|\/)read\/[^/]+\/(bible|obs)(?:\/|$)/.exec(pathname)
  if (!match || pathname.includes('/read-v1/')) return fallback
  return match[1] === 'obs' ? 'obs' : 'scripture'
}

/**
 * Catalog-load scope: an explicit Switch / BCV Bible↔Stories tap wins so a
 * stale `/read/.../bible|obs` URL cannot skip the load (issue #25).
 */
export function resolveCatalogNavigationScope(options: {
  pathname: string
  storeScope: string
  explicitScope?: string
}): string {
  if (options.explicitScope === 'obs' || options.explicitScope === 'scripture') {
    return options.explicitScope
  }
  return navigationScopeFromReadPath(options.pathname, options.storeScope)
}
