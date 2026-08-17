/**
 * Text-language picker navigation (Epic #21 / issue #25).
 *
 * Picker taps never auto-switch mode. OBS-only / Bible-only in the wrong mode
 * stay put and show the mismatch empty. Switch / already-in-the-right-mode
 * reuse this helper: keep the current ref, or jump to the default for the
 * target mode. Explicit BCV scope is never overridden.
 */

import type { BCVReference, NavigationCatalogScope, NavigationMode } from '../../contexts/types'
import type { LanguageAvailabilityFlags } from './languageAvailability'
import { applyTextModeScopeSwitch } from './textModeMismatch'

export type TextLanguagePickDecision =
  | { action: 'keep' }
  | { action: 'mismatch' }
  | { action: 'switch'; scope: NavigationCatalogScope }

export type TextLanguagePickNav = {
  setNavigationScope: (scope: NavigationCatalogScope) => void
  setNavigationMode: (mode: NavigationMode) => void
  navigateToReference: (ref: BCVReference) => void
  currentReference?: BCVReference
}

export function resolveTextLanguagePickNavigation(options: {
  availability: LanguageAvailabilityFlags | undefined | null
  currentScope: string
  explicitScope?: string
}): TextLanguagePickDecision {
  if (options.explicitScope === 'obs' || options.explicitScope === 'scripture') {
    return { action: 'keep' }
  }

  const availability = options.availability
  if (!availability) return { action: 'keep' }

  const onObs = options.currentScope === 'obs'
  const hasCurrent = onObs ? availability.obs === true : availability.bible === true
  if (hasCurrent) return { action: 'keep' }

  return { action: 'mismatch' }
}

export function applyTextLanguagePickNavigation(
  nav: TextLanguagePickNav,
  decision: TextLanguagePickDecision
): void {
  if (decision.action === 'switch') {
    applyTextModeScopeSwitch(nav, decision.scope)
  }
}

export function catalogScopeAfterTextLanguagePick(
  currentScope: string,
  decision: TextLanguagePickDecision
): string {
  return decision.action === 'switch' ? decision.scope : currentScope
}
