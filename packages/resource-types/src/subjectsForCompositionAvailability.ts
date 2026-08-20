/**
 * Door43 subjects that light picker availability flags for helps-mode
 * panel entries (compositions and pane-members).
 *
 * bibleHelps / obsHelps = union of catalogLanguageListSubjects for each
 * consumed type on entries whose entryType is `helps` and whose
 * groupId/scope matches. CombinedHelps lights TN/TWL; questions lights TQ.
 */

import type { PanelEntryDefinition, PanelEntryScope } from './panelEntry'
import {
  catalogLanguageListSubjects,
  type LanguageListTypeFields,
} from './subjectsForLanguageList'

export type CompositionAvailabilityEntry = Pick<
  PanelEntryDefinition,
  'consumes' | 'scope' | 'groupId' | 'entryType'
>

export function entryMatchesAvailabilityScope(
  entry: CompositionAvailabilityEntry,
  scope: PanelEntryScope
): boolean {
  const id = entry.groupId ?? entry.scope
  return id === scope
}

export function isHelpsModeAvailabilityEntry(entry: CompositionAvailabilityEntry): boolean {
  return entry.entryType == null || entry.entryType === 'helps'
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
    if (!isHelpsModeAvailabilityEntry(entry)) continue
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
