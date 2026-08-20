import { defaultDestPanelIdForTarget } from '../read/readPanelModel'

/** Stable id for the synthetic Read-panel "Helps" resource (scripture TN + TWL combined). */
export const COMBINED_HELPS_RESOURCE_ID = '__combined-helps__'

/** Stable id for the synthetic Read-panel "OBS Helps" resource (OBS TN + TWL combined). */
export const OBS_COMBINED_HELPS_RESOURCE_ID = '__combined-helps-obs__'

/** All combined-helps resource IDs for easy membership checks. */
export const COMBINED_HELPS_IDS = new Set([COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID])

/**
 * App policy: Read default helps pane. Registry ensure takes panelId: string.
 * N-pane groups will use group+panel ids later.
 */
export function defaultHelpsPanelId(): string {
  return defaultDestPanelIdForTarget('helps')
}

/** OBS CombinedHelps (unscoped or `:panel-N`). Check before scripture prefix. */
export function isObsCombinedHelpsId(id: string | undefined | null): boolean {
  if (!id) return false
  return id === OBS_COMBINED_HELPS_RESOURCE_ID || id.startsWith(`${OBS_COMBINED_HELPS_RESOURCE_ID}:`)
}

/**
 * Persist-id helper for migration. Do not use as the paint/membership predicate —
 * use PanelEntryRegistry.resolve / entry instances.
 */
export function isCombinedHelpsId(id: string | undefined | null): boolean {
  if (!id) return false
  return (
    isObsCombinedHelpsId(id) ||
    id === COMBINED_HELPS_RESOURCE_ID ||
    id.startsWith(`${COMBINED_HELPS_RESOURCE_ID}:`)
  )
}

/** Unscoped on the default helps pane; others `:panel-N`. */
export function combinedHelpsIdForPanel(baseId: string, panelId: string): string {
  const defaultId = defaultHelpsPanelId()
  return !panelId || panelId === defaultId ? baseId : `${baseId}:${panelId}`
}
