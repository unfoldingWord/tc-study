/**
 * Pure load-plan for Read text vs helps catalog bootstrap (issue #24).
 */

import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import {
  helpsFlagForNavigationScope,
  resolveHelpsLanguageForMode,
  shouldReloadHelpsOnTextSwitch,
} from './helpsLanguagePolicy'
import type { LanguageAvailabilityFlags } from './languageAvailability'
import type { ListedLanguage } from './languagesCache'

export type ReadLoadPane = 'text' | 'helps'

export interface ReadCatalogLoadPlan {
  helpsLanguageCode: string
  loadTarget: CatalogLoadTarget
}

export function availabilityLookupFromListed(
  languages: readonly ListedLanguage[] | null | undefined
): (code: string) => LanguageAvailabilityFlags | undefined {
  const byCode = new Map<string, LanguageAvailabilityFlags>()
  for (const lang of languages ?? []) {
    if (lang.code && lang.availability) byCode.set(lang.code, lang.availability)
  }
  return (code) => byCode.get(code)
}

export function mergeExpectedResourceKeys(options: {
  loadTarget: CatalogLoadTarget
  existingTextKeys: readonly string[]
  existingHelpsKeys: readonly string[]
  nextTextKeys: readonly string[]
  nextHelpsKeys: readonly string[]
}): { textKeys: string[]; helpsKeys: string[] } {
  return {
    textKeys:
      options.loadTarget === 'helps' ? [...options.existingTextKeys] : [...options.nextTextKeys],
    helpsKeys:
      options.loadTarget === 'text' ? [...options.existingHelpsKeys] : [...options.nextHelpsKeys],
  }
}

export function shouldHydrateOriginalLanguages(target: CatalogLoadTarget): boolean {
  return target === 'text' || target === 'both'
}

/**
 * CombinedHelps always re-asserts against the helps language, including after a
 * text-only hydrate so addResource cannot leave panel-2 blank.
 */
export function shouldEnsureCombinedHelps(_target: CatalogLoadTarget): boolean {
  return true
}

export function resolveReadCatalogLoadPlan(options: {
  switchedPane: ReadLoadPane
  textLanguageCode: string
  nextHelpsLanguageCode?: string
  currentHelpsLanguage: string | null
  persistedHelpsLanguage: string | null
  navigationScope: string
  availabilityFor: (code: string) => LanguageAvailabilityFlags | undefined
}): ReadCatalogLoadPlan {
  if (options.switchedPane === 'helps') {
    const helpsLanguageCode =
      options.nextHelpsLanguageCode?.trim() ||
      options.persistedHelpsLanguage?.trim() ||
      options.currentHelpsLanguage ||
      'en'
    return { helpsLanguageCode, loadTarget: 'helps' }
  }

  const helpsLanguageCode = resolveHelpsLanguageForMode({
    persistedHelpsLanguage: options.persistedHelpsLanguage,
    textLanguageCode: options.textLanguageCode,
    flag: helpsFlagForNavigationScope(options.navigationScope),
    availabilityFor: options.availabilityFor,
  })
  const loadTarget: CatalogLoadTarget = shouldReloadHelpsOnTextSwitch(
    options.currentHelpsLanguage,
    helpsLanguageCode
  )
    ? 'both'
    : 'text'

  return { helpsLanguageCode, loadTarget }
}
