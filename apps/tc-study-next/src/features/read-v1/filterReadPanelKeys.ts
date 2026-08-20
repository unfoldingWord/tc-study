/**
 * Pure Read panel-2 key filter: scope → book support → CombinedHelps policy.
 * Extracted for unit tests (hook wraps this with referential stability).
 */

import type { ResourceInfo } from '../../contexts/types'
import { applyDualScopeHelpsPolicy } from '../helps/helpsPanelPolicy'
import {
  getResourceAppliesToScope,
  resourceSupportsBook,
} from './resourcePanelHelpers'

type ResourceTypeRegistryLike = {
  getTypeForSubject: (s: string) => string | undefined
  getScopeForType: (id: string) => string | null
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
    const scope = getResourceAppliesToScope(key, loadedResources, resourceTypeRegistry)
    if (scope !== navigationScope && scope !== null) return false
    return resourceSupportsBook(key, loadedResources, currentBook)
  })
  const refs = scoped.map((key) => ({
    key,
    type: loadedResources[key]?.type,
  }))
  return applyDualScopeHelpsPolicy(refs).visibleKeys
}
