import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from './combinedHelpsIds'
import {
  isCombinedHelpsResourceType,
  isNotesResourceType,
  isWordsLinksResourceType,
  normalizeResourceTypeId,
} from '../../utils/normalizeResourceTypeId'
import type { HelpsScope } from './combinedHelpsInjection'

export interface PanelResourceRef {
  key: string
  type?: string
}

/**
 * Shared Read/Studio policy: when CombinedHelps is present for a scope,
 * prefer it as active and hide raw TN/TWL tabs for that scope.
 *
 * Unlock 1: ensureCombinedHelps strips TN/TWL from panel.resourceKeys so
 * painted tabs === store keys (single tab space). This hide path is a
 * defensive residual for stale membership only — do not add new permanent
 * coordinate-system / index-map layers on top of painted≠raw.
 */
export function orderHelpsPanelKeys(
  resources: PanelResourceRef[],
  scope: HelpsScope
): { visibleKeys: string[]; activeKey: string | null; hiddenKeys: string[] } {
  const combinedId =
    scope === 'obs' ? OBS_COMBINED_HELPS_RESOURCE_ID : COMBINED_HELPS_RESOURCE_ID

  const hasCombined = resources.some(
    (r) => r.key === combinedId || isCombinedHelpsResourceType(r.type)
  )

  const hiddenKeys: string[] = []
  const visibleKeys: string[] = []

  for (const r of resources) {
    const isScopedNotes = isNotesResourceType(r.type, scope)
    const isScopedTwl = isWordsLinksResourceType(r.type, scope)
    const isCombined =
      r.key === combinedId ||
      (isCombinedHelpsResourceType(r.type) &&
        (scope === 'obs'
          ? r.key === OBS_COMBINED_HELPS_RESOURCE_ID ||
            normalizeResourceTypeId(r.type) === 'obs-combined-helps'
          : r.key === COMBINED_HELPS_RESOURCE_ID ||
            normalizeResourceTypeId(r.type) === 'combined-helps'))

    if (hasCombined && (isScopedNotes || isScopedTwl) && !isCombined) {
      hiddenKeys.push(r.key)
      continue
    }
    visibleKeys.push(r.key)
  }

  // Prefer combined as first among helps-related keys
  if (hasCombined && visibleKeys.includes(combinedId)) {
    const rest = visibleKeys.filter((k) => k !== combinedId)
    return {
      visibleKeys: [combinedId, ...rest],
      activeKey: combinedId,
      hiddenKeys,
    }
  }

  return {
    visibleKeys,
    activeKey: visibleKeys[0] ?? null,
    hiddenKeys,
  }
}

/**
 * Apply both scripture and OBS CombinedHelps visibility rules to a panel key list.
 */
export function applyDualScopeHelpsPolicy(resources: PanelResourceRef[]): {
  visibleKeys: string[]
  activeKey: string | null
  hiddenKeys: string[]
} {
  const scripture = orderHelpsPanelKeys(resources, 'scripture')
  const obs = orderHelpsPanelKeys(resources, 'obs')
  const hidden = new Set([...scripture.hiddenKeys, ...obs.hiddenKeys])
  const orderedCombined = [COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID].filter(
    (id) => resources.some((r) => r.key === id) && !hidden.has(id)
  )
  const rest = resources
    .map((r) => r.key)
    .filter((k) => !hidden.has(k) && !orderedCombined.includes(k))
  const visibleKeys = [...orderedCombined, ...rest]
  return {
    visibleKeys,
    activeKey: orderedCombined[0] ?? visibleKeys[0] ?? null,
    hiddenKeys: [...hidden],
  }
}
