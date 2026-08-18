/**
 * Tiny workspace-group registry. Unused by Read chrome this slice.
 * Keeps “three product registries” clear: groups are not modes or entries.
 */

import { definePanelGroup, type PanelGroupDefinition } from './panelGroup'

export class PanelGroupRegistry {
  private groups = new Map<string, PanelGroupDefinition>()

  register(definition: PanelGroupDefinition): void {
    const def = definePanelGroup(definition)
    if (this.groups.has(def.id)) {
      throw new Error(`Panel group '${def.id}' is already registered`)
    }
    this.groups.set(def.id, def)
  }

  get(id: string): PanelGroupDefinition | undefined {
    return this.groups.get(id)
  }

  has(id: string): boolean {
    return this.groups.has(id)
  }

  getAll(): PanelGroupDefinition[] {
    return Array.from(this.groups.values())
  }
}
