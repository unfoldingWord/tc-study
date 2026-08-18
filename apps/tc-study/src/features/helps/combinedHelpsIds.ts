/** Stable id for the synthetic Read-panel "Helps" resource (scripture TN + TWL combined). */
export const COMBINED_HELPS_RESOURCE_ID = '__combined-helps__'

/** Stable id for the synthetic Read-panel "OBS Helps" resource (OBS TN + TWL combined). */
export const OBS_COMBINED_HELPS_RESOURCE_ID = '__combined-helps-obs__'

/** All combined-helps resource IDs for easy membership checks. */
export const COMBINED_HELPS_IDS = new Set([COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID])

/** OBS CombinedHelps (unscoped or `:panel-N`). Check before scripture prefix. */
export function isObsCombinedHelpsId(id: string | undefined | null): boolean {
  if (!id) return false
  return id === OBS_COMBINED_HELPS_RESOURCE_ID || id.startsWith(`${OBS_COMBINED_HELPS_RESOURCE_ID}:`)
}

/** Default ids plus per-panel scoped ids (`__combined-helps__:panel-1`). */
export function isCombinedHelpsId(id: string | undefined | null): boolean {
  if (!id) return false
  return (
    isObsCombinedHelpsId(id) ||
    id === COMBINED_HELPS_RESOURCE_ID ||
    id.startsWith(`${COMBINED_HELPS_RESOURCE_ID}:`)
  )
}

/** Panel-2 keeps the stable id so existing bootstrap stays green. */
export function combinedHelpsIdForPanel(baseId: string, panelId: string): string {
  return !panelId || panelId === 'panel-2' ? baseId : `${baseId}:${panelId}`
}
