/**
 * Registry-derived Door43 subject lists for language availability flags.
 * languageAvailability.ts stays pure — this caller maps helps-mode panel
 * entries (compositions + pane-members) → consumed subjects.
 */

import type { PanelEntryRegistry, ResourceTypeRegistry } from '@bt-synergy/resource-types'
import type { LanguageAvailabilitySubjectSets } from './languageAvailability'

export function availabilitySubjectSetsFromRegistry(
  resourceTypes: Pick<ResourceTypeRegistry, 'subjectsForLanguageList'>,
  panelEntries?: Pick<PanelEntryRegistry, 'subjectsForCompositionAvailability'> | null
): LanguageAvailabilitySubjectSets {
  const bibleHelps = panelEntries?.subjectsForCompositionAvailability('scripture') ?? []
  const obsHelps = panelEntries?.subjectsForCompositionAvailability('obs') ?? []
  return {
    bible: resourceTypes.subjectsForLanguageList('scripture'),
    obs: resourceTypes.subjectsForLanguageList('obs'),
    bibleHelps:
      bibleHelps.length > 0 ? bibleHelps : resourceTypes.subjectsForLanguageList('helps'),
    obsHelps:
      obsHelps.length > 0 ? obsHelps : resourceTypes.subjectsForLanguageList('obs-helps'),
  }
}
