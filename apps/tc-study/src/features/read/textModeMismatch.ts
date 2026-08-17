/**
 * Panel-1 empty state when the text language has no content for the current
 * Bible/OBS mode (Epic #21 / issue #25).
 *
 * Picker taps never auto-switch: they land here. Mode changes only on Switch.
 * Same family: neither-type languages, and explicit BCV into a mode the
 * language does not have.
 */

import type { BCVReference, NavigationCatalogScope, NavigationMode } from '../../contexts/types'
import type { LanguageAvailabilityFlags } from './languageAvailability'
import { languageEnglishCopyDisplayName } from './languageListDisplayName'
import { loadLanguagesCache } from './languagesCache'
import { parseReadUrl } from './readUrlGrammar'

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
  stories: 'Stories',
  bible: 'Bible',
} as const

export interface TextModeMismatchView {
  kind: TextModeMismatchKind
  languageCode: string
  languageName: string
  message: string
  actionLabel: string | null
  /** Compact visible action (`Stories` / `Bible`); full sentence lives in `actionLabel`. */
  actionShortLabel: string | null
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
      actionShortLabel: null,
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
      actionShortLabel: TEXT_MODE_MISMATCH_COPY.bible,
      switchScope: 'scripture',
    }
  }

  return {
    kind: 'obs-only',
    languageCode: options.languageCode,
    languageName: name,
    message: TEXT_MODE_MISMATCH_COPY.noBibleHasObs(name),
    actionLabel: TEXT_MODE_MISMATCH_COPY.switchToStories,
    actionShortLabel: TEXT_MODE_MISMATCH_COPY.stories,
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
    languageName: languageEnglishCopyDisplayName(lang, code),
  })
}

/** Stories → whole-story grain; Bible → verse/ref. */
export function defaultNavigationModeForScope(scope: NavigationCatalogScope): NavigationMode {
  return scope === 'obs' ? 'chapter' : 'verse'
}

export function applyTextModeScopeSwitch(
  nav: {
    setNavigationScope: (scope: NavigationCatalogScope) => void
    setNavigationMode: (mode: NavigationMode) => void
    navigateToReference: (ref: BCVReference) => void
    currentReference?: BCVReference
  },
  scope: NavigationCatalogScope
): void {
  nav.setNavigationScope(scope)
  nav.setNavigationMode(defaultNavigationModeForScope(scope))
  const current = nav.currentReference
  const alreadyOnTarget =
    scope === 'obs' ? current?.book === 'obs' : !!(current && current.book !== 'obs')
  if (alreadyOnTarget) return
  nav.navigateToReference(scope === 'obs' ? DEFAULT_OBS_REF : DEFAULT_BIBLE_REF)
}

/** `/read/{lang}[/{lang2}]/bible|obs/...` — ignore `/read-v1`. */
export function navigationScopeFromReadPath(
  pathname: string,
  fallback: string
): string {
  if (pathname.includes('/read-v1/')) return fallback
  const parsed = parseReadUrl(pathname)
  if (!parsed.resourceType) return fallback
  return parsed.resourceType === 'obs' ? 'obs' : 'scripture'
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
