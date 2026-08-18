import { definePanelGroup, type PanelGroupDefinition } from '@bt-synergy/resource-types'

/**
 * Workspace groups (scripture vs OBS). Unused by Read chrome this slice.
 * Do not make OBS a third panel mode.
 */
export const scripturePanelGroup: PanelGroupDefinition = definePanelGroup({
  id: 'scripture',
  displayName: 'Scripture',
})

export const obsPanelGroup: PanelGroupDefinition = definePanelGroup({
  id: 'obs',
  displayName: 'Open Bible Stories',
})
