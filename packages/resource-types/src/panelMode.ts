/**
 * Panel modes — layout modes that allow entry types.
 * Read today: scripture allows primary-text; helps allows helps.
 * URL {bible|obs} is nav, not a mode. Do not register OBS as a panel mode.
 */

import type { PanelEntryType } from './panelEntry'

export interface PanelModeDefinition {
  id: string
  displayName: string
  /** Entry types this mode may paint */
  allows: readonly PanelEntryType[]
  /** Optional workspace group (scripture vs obs). Unused by Read chrome this slice. */
  groupId?: string
}

export function definePanelMode(definition: PanelModeDefinition): PanelModeDefinition {
  if (!definition.id) {
    throw new Error('Panel mode definition must have an id')
  }
  if (!definition.displayName) {
    throw new Error('Panel mode definition must have a displayName')
  }
  if (!definition.allows || definition.allows.length === 0) {
    throw new Error('Panel mode definition must allow at least one entry type')
  }
  return definition
}
