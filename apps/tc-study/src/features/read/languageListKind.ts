/**
 * Which Door43 subject set a Read language picker should request.
 *
 * Fetch follows **panel type** only (`text` vs `helps`), not app nav
 * (bible vs OBS). Any / Bible / OBS chips still narrow the fetched list.
 * Bootstrap (no listMode) uses the global content union.
 */

import type { LanguageListKind } from '@bt-synergy/resource-types'
import type { LanguagePickerListMode } from './filterPickerLanguages'

export type { LanguageListKind }

export type LanguageListNavigationScope = 'scripture' | 'obs'

export function resolveLanguageListKind(options: {
  listMode?: LanguagePickerListMode | null
  /** Ignored — pickers do not discriminate bible vs OBS nav. */
  navigationScope?: LanguageListNavigationScope | null
}): LanguageListKind {
  const listMode = options.listMode ?? 'text'
  if (listMode === 'helps') return 'all-helps'
  return 'global'
}

/** OBS helps are mostly prod without `topic=tc-ready` (only ~3 TSV GLs). */
export function languageListDoor43Filter(kind: LanguageListKind): {
  stage: string
  topic?: string
} {
  if (kind === 'obs-helps' || kind === 'all-helps') return { stage: 'prod' }
  return { stage: 'prod', topic: 'tc-ready' }
}
