/**
 * Registry-driven Door43 subjects for Read language lists.
 *
 * Panel modes default from contentRole + scope / companionFor so a new
 * plugin expands the right list without picker hardcoding.
 */

import type { ResourceTypeDefinition } from './types'

export type LanguageListKind =
  | 'global'
  | 'scripture'
  | 'obs'
  | 'helps'
  | 'obs-helps'
  | 'all-helps'
export type ResourcePanelMode = 'scripture' | 'obs' | 'helps'

export type LanguageListTypeFields = Pick<
  ResourceTypeDefinition,
  | 'subjects'
  | 'languageListSubjects'
  | 'includeInLanguageLists'
  | 'panelModes'
  | 'contentRole'
  | 'scope'
  | 'companionFor'
>

export function panelModesForType(def: LanguageListTypeFields): ResourcePanelMode[] {
  if (def.panelModes && def.panelModes.length > 0) return [...def.panelModes]
  if (def.contentRole === 'primary') {
    if (def.scope === 'obs') return ['obs']
    if (def.scope === 'scripture') return ['scripture']
    return []
  }
  // companion (default) → helps lists; obs vs bible via companionFor.
  // shared (TW/TA) stays registered for articles after a lang is picked,
  // but does not contribute language-list subjects.
  return ['helps']
}

export function catalogLanguageListSubjects(def: LanguageListTypeFields): string[] {
  if (def.includeInLanguageLists === false) return []
  return uniqueSubjects(def.languageListSubjects ?? def.subjects ?? [])
}

function typeMatchesKind(def: LanguageListTypeFields, kind: LanguageListKind): boolean {
  // Shared article types (TW/TA) are not "has helps" — CombinedHelps inject
  // needs TN / TWL / TQ. Querying them floods the picker with empty langs.
  if (def.contentRole === 'shared') return false
  const modes = panelModesForType(def)
  if (kind === 'scripture') return modes.includes('scripture')
  if (kind === 'obs') return modes.includes('obs')
  if (kind === 'helps') {
    if (!modes.includes('helps')) return false
    const forScopes = def.companionFor ?? []
    return forScopes.includes('scripture') || forScopes.length === 0
  }
  if (kind === 'obs-helps') {
    if (!modes.includes('helps')) return false
    return (def.companionFor ?? []).includes('obs')
  }
  return false
}

/**
 * Door43 subjects for one language list.
 * - `global` — union of scripture + OBS **content** subjects (text picker / cache)
 * - `scripture` / `obs` — primary content subjects for that mode
 * - `helps` / `obs-helps` — companion subjects for bible vs OBS (not shared TW/TA)
 * - `all-helps` — union of scripture + OBS companion subjects (not shared TW/TA)
 */
export function subjectsForLanguageList(
  types: readonly LanguageListTypeFields[],
  kind: LanguageListKind
): string[] {
  if (kind === 'global') {
    return uniqueConcat(
      subjectsForLanguageList(types, 'scripture'),
      subjectsForLanguageList(types, 'obs')
    )
  }
  if (kind === 'all-helps') {
    return uniqueConcat(
      subjectsForLanguageList(types, 'helps'),
      subjectsForLanguageList(types, 'obs-helps')
    )
  }

  const seen = new Set<string>()
  const out: string[] = []
  for (const def of types) {
    if (!typeMatchesKind(def, kind)) continue
    for (const subject of catalogLanguageListSubjects(def)) {
      if (seen.has(subject)) continue
      seen.add(subject)
      out.push(subject)
    }
  }
  return out
}

function uniqueSubjects(subjects: readonly string[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const raw of subjects) {
    const subject = String(raw ?? '').trim()
    if (!subject || seen.has(subject)) continue
    seen.add(subject)
    out.push(subject)
  }
  return out
}

function uniqueConcat(...lists: readonly string[][]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const list of lists) {
    for (const subject of list) {
      if (seen.has(subject)) continue
      seen.add(subject)
      out.push(subject)
    }
  }
  return out
}
