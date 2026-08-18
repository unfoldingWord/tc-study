import type { ResourceInfo } from '../../contexts/types'
import { findConsumedKeys, type HelpsScope } from '../helps/compositionInjection'
import { resolveCompositionForPersistId } from '../helps/resolveCompositionEntry'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
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
 * Retargeted to findConsumedKeys — CombinedHelps consume ids for this product helper.
 */
export function findHelpsKeysForScope(
  langCode: string,
  scope: HelpsScope
): { tnKey?: string; twlKey?: string } {
  const loaded = useAppStore.getState().loadedResources
  const consumes =
    scope === 'obs'
      ? [RESOURCE_TYPE_IDS.OBS_NOTES, RESOURCE_TYPE_IDS.OBS_WORDS_LINKS]
      : [RESOURCE_TYPE_IDS.TRANSLATION_NOTES, RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS]
  const skipKeys = new Set(
    Object.keys(loaded).filter((key) => resolveCompositionForPersistId(key))
  )
  const found = findConsumedKeys(Object.values(loaded), consumes, { langCode, skipKeys })
  return {
    tnKey: found[consumes[0]!],
    twlKey: found[consumes[1]!],
  }
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
  const composition = resolveCompositionForPersistId(resourceKey)
  if (composition) return composition.scope ?? null

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
 */
export function resourceSupportsBook(
  resourceKey: string,
  loadedResources: Record<string, ResourceInfo | undefined>,
  bookCode: string
): boolean {
  if (resolveCompositionForPersistId(resourceKey)) {
    return true
  }
  if (bookCode === 'obs') return true

  const resource = loadedResources[resourceKey]
  if (!resource) return true

  const code = bookCode.toLowerCase()

  if (resource.verifiedIngredients !== undefined) {
    if (resource.verifiedIngredients.length === 0) return true
    return resource.verifiedIngredients.some((ing) => ingredientMatchesBook(ing, code))
  }

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
