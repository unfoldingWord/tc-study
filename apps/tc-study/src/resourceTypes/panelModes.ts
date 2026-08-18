import { definePanelMode, type PanelModeDefinition } from '@bt-synergy/resource-types'

/** Read layout mode — not a workspace group and not URL {bible|obs}. */
export const scripturePanelMode: PanelModeDefinition = definePanelMode({
  id: 'scripture',
  displayName: 'Scripture',
  allows: ['primary-text'],
})

export const helpsPanelMode: PanelModeDefinition = definePanelMode({
  id: 'helps',
  displayName: 'Helps',
  allows: ['helps'],
})
