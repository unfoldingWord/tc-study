/**
 * Paint entry instances whose entry type is in the mode allowlist,
 * plus existing book-scope on bound resources.
 */

import type { ResourceInfo } from '../../contexts/types'
import { resolvePanelEntryForKey } from '../helps/resolveCompositionEntry'
import { applyDualScopeHelpsPolicy } from '../helps/helpsPanelPolicy'
import { getActivePanelModeRegistry } from '../../resourceTypes/activeRegistry'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { normalizeResourceTypeId } from '../../utils/normalizeResourceTypeId'
import { originalLanguageBelongsOnBook } from './originalLanguageForBook'
import { resolveLoadedPanelResource } from './resolveLoadedPanelResource'
import {
  getResourceAppliesToScope,
  resourceSupportsBook,
} from './resourcePanelHelpers'

type ResourceTypeRegistryLike = {
  getTypeForSubject: (s: string) => string | undefined
  getScopeForType: (id: string) => string | null
}

function entryTypeForPaintedKey(
  key: string,
  loadedResources: Record<string, ResourceInfo | undefined>
): 'primary-text' | 'helps' | null {
  const entry = resolvePanelEntryForKey(key)
  if (entry) return entry.entryType

  const type = resolveLoadedPanelResource(loadedResources, key)?.type
  const id = normalizeResourceTypeId(type)
  if (id === RESOURCE_TYPE_IDS.SCRIPTURE || id === RESOURCE_TYPE_IDS.OBS) return 'primary-text'
  if (
    id === RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS ||
    id === RESOURCE_TYPE_IDS.OBS_QUESTIONS
  ) {
    return 'helps'
  }
  return null
}

function modeAllowsEntryType(mode: 'scripture' | 'helps', entryType: 'primary-text' | 'helps'): boolean {
  const registry = getActivePanelModeRegistry()
  if (registry?.has(mode)) return registry.allows(mode, entryType)
  return mode === 'scripture' ? entryType === 'primary-text' : entryType === 'helps'
}

export function filterReadPanelKeysByMode(
  mode: 'scripture' | 'helps',
  args: {
    resourceKeys: string[]
    loadedResources: Record<string, ResourceInfo | undefined>
    resourceTypeRegistry: ResourceTypeRegistryLike
    navigationScope: string
    currentBook: string
  }
): string[] {
  if (mode === 'helps') {
    return filterReadPanel2Keys({
      panel2ResourceKeys: args.resourceKeys,
      loadedResources: args.loadedResources,
      resourceTypeRegistry: args.resourceTypeRegistry,
      navigationScope: args.navigationScope,
      currentBook: args.currentBook,
    })
  }
  return args.resourceKeys.filter((key) => {
    const entryType = entryTypeForPaintedKey(key, args.loadedResources)
    if (!entryType || !modeAllowsEntryType('scripture', entryType)) return false
    if (!originalLanguageBelongsOnBook(key, args.currentBook)) return false
    const scope = getResourceAppliesToScope(key, args.loadedResources, args.resourceTypeRegistry)
    if (scope !== args.navigationScope && scope !== null) return false
    return resourceSupportsBook(key, args.loadedResources, args.currentBook)
  })
}

export function filterReadPanel2Keys(args: {
  panel2ResourceKeys: string[]
  loadedResources: Record<string, ResourceInfo | undefined>
  resourceTypeRegistry: ResourceTypeRegistryLike
  navigationScope: string
  currentBook: string
}): string[] {
  const {
    panel2ResourceKeys,
    loadedResources,
    resourceTypeRegistry,
    navigationScope,
    currentBook,
  } = args

  const scoped = panel2ResourceKeys.filter((key) => {
    const entryType = entryTypeForPaintedKey(key, loadedResources)
    if (!entryType || !modeAllowsEntryType('helps', entryType)) return false
    if (!originalLanguageBelongsOnBook(key, currentBook)) return false
    const scope = getResourceAppliesToScope(key, loadedResources, resourceTypeRegistry)
    if (scope !== navigationScope && scope !== null) return false
    return resourceSupportsBook(key, loadedResources, currentBook)
  })
  const refs = scoped.map((key) => ({
    key,
    type: resolveLoadedPanelResource(loadedResources, key)?.type,
  }))
  return applyDualScopeHelpsPolicy(refs).visibleKeys
}
