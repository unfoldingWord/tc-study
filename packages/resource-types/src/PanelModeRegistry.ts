/**
 * Panel modes that allow entry types.
 * Read today: scripture → primary-text; helps → helps.
 * Does not assume only panel-1 / panel-2.
 */

import { definePanelMode, type PanelModeDefinition } from './panelMode'
import type { PanelEntryType } from './panelEntry'

export class PanelModeRegistry {
  private modes = new Map<string, PanelModeDefinition>()

  register(definition: PanelModeDefinition): void {
    const def = definePanelMode(definition)
    if (this.modes.has(def.id)) {
      throw new Error(`Panel mode '${def.id}' is already registered`)
    }
    this.modes.set(def.id, def)
  }

  get(id: string): PanelModeDefinition | undefined {
    return this.modes.get(id)
  }

  has(id: string): boolean {
    return this.modes.has(id)
  }

  getAll(): PanelModeDefinition[] {
    return Array.from(this.modes.values())
  }

  /** Entry types this mode may paint. Empty if the mode is unknown. */
  allowedEntryTypes(modeId: string): readonly PanelEntryType[] {
    return this.modes.get(modeId)?.allows ?? []
  }

  allows(modeId: string, entryType: PanelEntryType): boolean {
    return this.allowedEntryTypes(modeId).includes(entryType)
  }
}
