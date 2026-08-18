/**
 * Registry-derived Door43 subject lists for language availability flags.
 * languageAvailability.ts stays pure — this caller maps composition entries → subjects.
 */

import type { PanelEntryRegistry, ResourceTypeRegistry } from '@bt-synergy/resource-types'
import type { LanguageAvailabilitySubjectSets } from './languageAvailability'

export function availabilitySubjectSetsFromRegistry(
  resourceTypes: Pick<ResourceTypeRegistry, 'subjectsForLanguageList'>,
  panelEntries?: Pick<PanelEntryRegistry, 'subjectsForCompositionAvailability'> | null
): LanguageAvailabilitySubjectSets {
  return {
    bible: resourceTypes.subjectsForLanguageList('scripture'),
    obs: resourceTypes.subjectsForLanguageList('obs'),
    bibleHelps: panelEntries?.subjectsForCompositionAvailability('scripture') ?? [],
    obsHelps: panelEntries?.subjectsForCompositionAvailability('obs') ?? [],
  }
}
