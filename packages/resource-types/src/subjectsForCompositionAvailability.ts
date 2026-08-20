/**
 * Door43 subjects that light picker availability flags for composition entries.
 *
 * bibleHelps / obsHelps = union of catalogLanguageListSubjects for each
 * consumed type on composition entries whose groupId/scope matches. TQ does
 * not light flags unless a composition consumes questions.
 */

import type { PanelEntryDefinition, PanelEntryScope } from './panelEntry'
import {
  catalogLanguageListSubjects,
  type LanguageListTypeFields,
} from './subjectsForLanguageList'

export type CompositionAvailabilityEntry = Pick<
  PanelEntryDefinition,
  'consumes' | 'scope' | 'groupId'
>

export function entryMatchesAvailabilityScope(
  entry: CompositionAvailabilityEntry,
  scope: PanelEntryScope
): boolean {
  const id = entry.groupId ?? entry.scope
  return id === scope
}

export function subjectsForCompositionAvailability(
  entries: readonly CompositionAvailabilityEntry[],
  types: readonly (LanguageListTypeFields & { id: string })[],
  scope: PanelEntryScope
): string[] {
  const typeById = new Map(types.map((def) => [def.id, def]))
  const seen = new Set<string>()
  const out: string[] = []

  for (const entry of entries) {
    if (!entryMatchesAvailabilityScope(entry, scope)) continue
    for (const typeId of entry.consumes) {
      const def = typeById.get(typeId)
      if (!def) continue
      for (const subject of catalogLanguageListSubjects(def)) {
        if (seen.has(subject)) continue
        seen.add(subject)
        out.push(subject)
      }
    }
  }

  return out
}
