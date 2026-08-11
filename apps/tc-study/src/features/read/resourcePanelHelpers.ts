import type { ResourceInfo } from '../../contexts/types'
import {
  COMBINED_HELPS_IDS,
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from '../helps/combinedHelpsIds'
import { findHelpsKeysAmongResources } from '../helps/combinedHelpsInjection'
import { getContentStructure, getIngredients } from '../../utils/resourceMetadataAccessors'
import { useAppStore } from '../../contexts/AppContext'

export function primaryLangSegment(code: string): string {
  return String(code || '')
    .trim()
    .split(/[-_/]/)[0]!
    .toLowerCase()
}

/**
 * Resolve TN/TWL catalog keys from the app store right after Phase 1 load.
 * scope='scripture' returns scripture-TN + scripture-TWL keys.
 * scope='obs' returns OBS-TN + OBS-TWL keys.
 */
export function findHelpsKeysForScope(
  langCode: string,
  scope: 'scripture' | 'obs'
): { tnKey?: string; twlKey?: string } {
  const loaded = useAppStore.getState().loadedResources
  return findHelpsKeysAmongResources(Object.values(loaded), scope, {
    langCode,
    skipKeys: COMBINED_HELPS_IDS,
  })
}

/**
 * Derive the reading scope for a resource key:
 * - 'scripture': scripture resources + scripture-companion helps
 * - 'obs': OBS resources + OBS-companion helps
 * - null: shared resources (TW, TA) or unknown types (show in both scopes)
 */
export function getResourceAppliesToScope(
  resourceKey: string,
  loadedResources: Record<string, ResourceInfo | undefined>,
  resourceTypeRegistry: {
    getTypeForSubject: (s: string) => string | undefined
    getScopeForType: (id: string) => string | null
  }
): string | null {
  if (resourceKey === COMBINED_HELPS_RESOURCE_ID) return 'scripture'
  if (resourceKey === OBS_COMBINED_HELPS_RESOURCE_ID) return 'obs'

  const resource = loadedResources[resourceKey]
  if (!resource) return null

  if (resource.appliesToScope === 'shared') return null
  if (resource.appliesToScope === 'scripture' || resource.appliesToScope === 'obs') {
    return resource.appliesToScope
  }

  const subject = resource.subject || resource.category || ''
  const typeId = resourceTypeRegistry.getTypeForSubject(subject)
  if (!typeId) return null

  return resourceTypeRegistry.getScopeForType(typeId)
}

function ingredientMatchesBook(
  ing: { identifier?: string; path?: string },
  bookCode: string
): boolean {
  const code = bookCode.toLowerCase()
  if (ing.identifier?.toLowerCase() === code) return true
  // Catalog paths look like `./tq_TIT.tsv` / `./tit.usfm` — use as fallback when
  // identifier is missing so tabs don't vanish after verification.
  const path = String(ing.path || '').toLowerCase()
  if (!path) return false
  return (
    path.includes(`_${code}.`) ||
    path.includes(`/${code}.`) ||
    path.startsWith(`${code}.`) ||
    path.includes(`_${code}_`)
  )
}

/**
 * Returns false only when we can positively determine that a book-structured resource
 * does NOT contain the given book. Fail-open while ingredients / toc are loading.
 *
 * Important: check catalog ingredients even when Phase 1 set contentStructure to
 * 'entry' (TQ/TN/TWL). Otherwise tabs fail-open during load and then vanish once
 * verifiedIngredients arrives — the Helps+TQ flash bug.
 */
export function resourceSupportsBook(
  resourceKey: string,
  loadedResources: Record<string, ResourceInfo | undefined>,
  bookCode: string
): boolean {
  if (resourceKey === COMBINED_HELPS_RESOURCE_ID || resourceKey === OBS_COMBINED_HELPS_RESOURCE_ID) {
    return true
  }
  if (bookCode === 'obs') return true

  const resource = loadedResources[resourceKey]
  if (!resource) return true

  const code = bookCode.toLowerCase()

  if (resource.verifiedIngredients !== undefined) {
    // Empty list is a verification/path failure sentinel — fail-open rather than
    // hiding every book tab (same class of bug as premature [] in AppContext).
    if (resource.verifiedIngredients.length === 0) return true
    return resource.verifiedIngredients.some((ing) => ingredientMatchesBook(ing, code))
  }

  // Prefer ingredient evidence over contentStructure. Phase 1 marks TQ/TN/TWL as
  // 'entry' (subject lacks "bible") even though they ship per-book files.
  const ingredients = getIngredients(resource) as
    | { identifier?: string; path?: string }[]
    | undefined
  if (ingredients && ingredients.length > 0) {
    return ingredients.some((ing) => ingredientMatchesBook(ing, code))
  }

  const structure = getContentStructure(resource)
  if (structure && structure !== 'book') return true

  const tocBooks = resource.toc?.books
  if (tocBooks && tocBooks.length > 0) {
    return tocBooks.some((b) => b.code?.toLowerCase() === code)
  }

  return true
}
