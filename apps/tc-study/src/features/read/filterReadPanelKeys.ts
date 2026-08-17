/**
 * Pure Read panel-2 key filter: scope → book support → CombinedHelps policy.
 * Extracted for unit tests (hook wraps this with referential stability).
 */

import type { ResourceInfo } from '../../contexts/types'
import { isCombinedHelpsId } from '../helps/combinedHelpsIds'
import { applyDualScopeHelpsPolicy } from '../helps/helpsPanelPolicy'
import { RESOURCE_TYPE_IDS } from '../../resourceTypes/resourceTypeIds'
import { normalizeResourceTypeId } from '../../utils/normalizeResourceTypeId'
import { originalLanguageBelongsOnBook } from './originalLanguageForBook'
import { resolveLoadedPanelResource } from './resolveLoadedPanelResource'
import {
  getResourceAppliesToScope,
  resourceSupportsBook,
} from './resourcePanelHelpers'

function isPrimaryScriptureType(type: string | undefined, key: string): boolean {
  if (isCombinedHelpsId(key)) return false
  const id = normalizeResourceTypeId(type)
  return id === RESOURCE_TYPE_IDS.SCRIPTURE || id === RESOURCE_TYPE_IDS.OBS
}

type ResourceTypeRegistryLike = {
  getTypeForSubject: (s: string) => string | undefined
  getScopeForType: (id: string) => string | null
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
    if (isCombinedHelpsId(key)) return false
    const type = resolveLoadedPanelResource(args.loadedResources, key)?.type
    if (type && !isPrimaryScriptureType(type, key)) return false
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
    const type = resolveLoadedPanelResource(loadedResources, key)?.type
    if (type && isPrimaryScriptureType(type, key)) return false
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
