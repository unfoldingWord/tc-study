/**
 * Per-panel catalog spinner — never hang when membership is already present.
 */

import { isOriginalLanguagePanelKey } from './originalLanguageForBook'
import type { CatalogLoadTarget } from './readCatalogPanelPolicy'
import type { ReadPanelId } from './readPanelModel'

/** ULT/GLT/helps tabs count; UGNT/UHB-only must not hide the catalog spinner. */
export function hasNonOriginalMembership(keys: readonly string[]): boolean {
  return keys.some((key) => !isOriginalLanguagePanelKey(key))
}

export function destPanelsForCatalogLoad(options: {
  loadTarget: CatalogLoadTarget
  destPanelId?: ReadPanelId
}): ReadPanelId[] {
  if (options.destPanelId) return [options.destPanelId]
  if (options.loadTarget === 'text') return ['panel-1']
  if (options.loadTarget === 'helps') return ['panel-2']
  return ['panel-1', 'panel-2']
}

/**
 * Unset language, known Bible/OBS mismatch, known no-helps, or finished hydrate.
 * Empty Bible + OBS (or neither) and Bible-mode + no TN/TWL are settled empties,
 * not an in-flight catalog.
 */
export function isReadPanelCatalogSettled(options: {
  languageCode?: string | null
  catalogSettled: boolean
  hasKnownMismatch?: boolean
  hasKnownNoHelps?: boolean
}): boolean {
  if (!options.languageCode?.trim()) return true
  if (options.hasKnownMismatch || options.hasKnownNoHelps) return true
  return options.catalogSettled
}

/**
 * Panel-level spinner only while that panel is fetching and still empty.
 * Gateway/helps membership (including `ult#2`) means hydrate already assigned.
 * Original-language-only tabs do not count — UGNT must not hide the spinner.
 * `catalogSettled: false` keeps the spinner until the first hydrate finishes.
 */
export function isPanelCatalogSpinner(options: {
  catalogLoading: boolean
  hasMembership: boolean
  catalogSettled?: boolean
}): boolean {
  if (options.hasMembership) return false
  if (options.catalogSettled === false) return true
  return options.catalogLoading
}
