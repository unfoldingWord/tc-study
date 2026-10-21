/**
 * UGNT is NT-only; UHB is OT-only. Never both for one book.
 */

import { getStandardBookOrderIndex } from '../../lib/versification'
import { getBaseResourceKey } from '../workspace/projectPanelResourcesToAppStore'
import {
  ORIGINAL_LANGUAGE_RESOURCE_KEYS,
  ORIGINAL_LANGUAGE_SPECS,
  UGNT_RESOURCE_KEY,
  UHB_RESOURCE_KEY,
  originalLanguageResourceKey,
  type OriginalLanguageSpec,
} from '@bt-synergy/resource-pipeline/scripture/originalLanguageSpecs'

export {
  ORIGINAL_LANGUAGE_RESOURCE_KEYS,
  ORIGINAL_LANGUAGE_SPECS,
  UGNT_RESOURCE_KEY,
  UHB_RESOURCE_KEY,
  originalLanguageResourceKey,
  type OriginalLanguageSpec,
}

const FIRST_NT_ORDER = getStandardBookOrderIndex('mat')

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
