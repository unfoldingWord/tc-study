/**
 * Text-language picker navigation (Epic #21).
 *
 * Picking an OBS-only or Bible-only language is an explicit tap: switch into
 * that type instead of the #25 mismatch empty state. Both-types keep the
 * current mode and reference. Explicit Switch / BCV scope is never overridden.
 */

import type { BCVReference, NavigationCatalogScope } from '../../contexts/types'
import type { LanguageAvailabilityFlags } from './languageAvailability'
import { applyTextModeScopeSwitch } from './textModeMismatch'

export type TextLanguagePickDecision =
  | { action: 'keep' }
  | { action: 'switch'; scope: NavigationCatalogScope }

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

  const hasBible = availability.bible === true
  const hasObs = availability.obs === true
  if (hasBible === hasObs) return { action: 'keep' }

  const onObs = options.currentScope === 'obs'
  if (hasObs) {
    return onObs ? { action: 'keep' } : { action: 'switch', scope: 'obs' }
  }
  return onObs ? { action: 'switch', scope: 'scripture' } : { action: 'keep' }
}

export function applyTextLanguagePickNavigation(
  nav: {
    setNavigationScope: (scope: NavigationCatalogScope) => void
    navigateToReference: (ref: BCVReference) => void
  },
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
