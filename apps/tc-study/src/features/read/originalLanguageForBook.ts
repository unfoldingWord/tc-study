/**
 * UGNT is NT-only; UHB is OT-only. Never both for one book.
 */

import { getStandardBookOrderIndex } from '../../lib/versification'
import { getBaseResourceKey } from '../workspace/projectPanelResourcesToAppStore'

export interface OriginalLanguageSpec {
  lang: 'el-x-koine' | 'hbo'
  id: 'ugnt' | 'uhb'
  label: 'UGNT' | 'UHB'
  subject: 'Greek New Testament' | 'Hebrew Old Testament'
}

export const ORIGINAL_LANGUAGE_SPECS: readonly OriginalLanguageSpec[] = [
  { lang: 'el-x-koine', id: 'ugnt', label: 'UGNT', subject: 'Greek New Testament' },
  { lang: 'hbo', id: 'uhb', label: 'UHB', subject: 'Hebrew Old Testament' },
]

export const UGNT_RESOURCE_KEY = 'unfoldingWord/el-x-koine/ugnt'
export const UHB_RESOURCE_KEY = 'unfoldingWord/hbo/uhb'

export const ORIGINAL_LANGUAGE_RESOURCE_KEYS: readonly string[] = ORIGINAL_LANGUAGE_SPECS.map(
  (orig) => originalLanguageResourceKey(orig)
)

const FIRST_NT_ORDER = getStandardBookOrderIndex('mat')

export function originalLanguageResourceKey(spec: OriginalLanguageSpec): string {
  return `unfoldingWord/${spec.lang}/${spec.id}`
}

export function specForOriginalLanguageKey(resourceKey: string): OriginalLanguageSpec | undefined {
  const base = getBaseResourceKey(resourceKey)
  return ORIGINAL_LANGUAGE_SPECS.find((orig) => originalLanguageResourceKey(orig) === base)
}

export function isOriginalLanguagePanelKey(instanceId: string): boolean {
  const base = getBaseResourceKey(instanceId)
  return ORIGINAL_LANGUAGE_RESOURCE_KEYS.includes(base)
}

/** NT → UGNT; OT → UHB; OBS / unknown → none. */
export function originalLanguageKeyForBook(bookCode: string): string | null {
  const code = bookCode.toLowerCase().trim()
  if (!code || code === 'obs') return null
  const order = getStandardBookOrderIndex(code)
  if (order >= 1000) return null
  return order >= FIRST_NT_ORDER ? UGNT_RESOURCE_KEY : UHB_RESOURCE_KEY
}

export function originalLanguageSpecForBook(bookCode: string): OriginalLanguageSpec | undefined {
  const key = originalLanguageKeyForBook(bookCode)
  return key ? specForOriginalLanguageKey(key) : undefined
}

/** Non-original keys always belong. Wrong-testament UGNT/UHB do not. */
export function originalLanguageBelongsOnBook(instanceId: string, bookCode: string): boolean {
  if (!isOriginalLanguagePanelKey(instanceId)) return true
  const keep = originalLanguageKeyForBook(bookCode)
  if (!keep) return false
  return getBaseResourceKey(instanceId) === keep
}
