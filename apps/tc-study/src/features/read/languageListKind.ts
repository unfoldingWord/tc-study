/**
 * Which Door43 subject set a Read language picker should request.
 *
 * listMode still shares filter chrome (Any / Bible / OBS). The **fetch**
 * is scoped so scripture panes do not ask for OBS-only subjects, and helps
 * panes follow bible vs OBS nav. Bootstrap (no scope) uses the global
 * content union — the shared cache / “200 languages” baseline.
 */

import type { LanguageListKind } from '@bt-synergy/resource-types'
import type { LanguagePickerListMode } from './filterPickerLanguages'

export type { LanguageListKind }

export type LanguageListNavigationScope = 'scripture' | 'obs'

export function resolveLanguageListKind(options: {
  listMode?: LanguagePickerListMode | null
  navigationScope?: LanguageListNavigationScope | null
}): LanguageListKind {
  const listMode = options.listMode ?? 'text'
  const scope = options.navigationScope
  if (listMode === 'helps') {
    return scope === 'obs' ? 'obs-helps' : 'helps'
  }
  if (scope === 'obs') return 'obs'
  if (scope === 'scripture') return 'scripture'
  return 'global'
}

/** OBS helps are mostly prod without `topic=tc-ready` (only ~3 TSV GLs). */
export function languageListDoor43Filter(kind: LanguageListKind): {
  stage: string
  topic?: string
} {
  if (kind === 'obs-helps') return { stage: 'prod' }
  return { stage: 'prod', topic: 'tc-ready' }
}
