/**
 * What may appear in a pane. An entry consumes one or more resource type ids.
 * Same resource may be bound by two entries (shared consume — no exclusive lock).
 *
 * Viewer registration is optional chrome. Viewer ≠ paint / membership.
 */

import { subjectsForCompositionAvailability } from './subjectsForCompositionAvailability'
import {
  definePanelEntry,
  matchesEntryPersistId,
  type PanelEntryDefinition,
  type PanelEntryKind,
  type PanelEntryScope,
  type PanelEntryType,
} from './panelEntry'
import type { ResourceTypeDefinition } from './types'

export interface PanelEntryRegistryConfig {
  /** Used to validate `consumes` ids. */
  hasResourceType: (id: string) => boolean
  getResourceType?: (id: string) => ResourceTypeDefinition | undefined
  getAllResourceTypes?: () => ResourceTypeDefinition[]
  viewerRegistry?: {
    registerViewer: (viewer: {
      resourceType: string
      displayName: string
      component: PanelEntryDefinition['viewer']
      canHandle: (metadata: Record<string, unknown>) => boolean
    }) => void
  }
  debug?: boolean
}

export class PanelEntryRegistry {
  private entries = new Map<string, PanelEntryDefinition>()
  private hasResourceType: (id: string) => boolean
  private getResourceType?: (id: string) => ResourceTypeDefinition | undefined
  private getAllResourceTypes?: () => ResourceTypeDefinition[]
  private viewerRegistry?: PanelEntryRegistryConfig['viewerRegistry']
  private debug: boolean

  constructor(config: PanelEntryRegistryConfig) {
    this.hasResourceType = config.hasResourceType
    this.getResourceType = config.getResourceType
    this.getAllResourceTypes = config.getAllResourceTypes
    this.viewerRegistry = config.viewerRegistry
    this.debug = config.debug ?? false
  }

  register(definition: PanelEntryDefinition): void {
    const def = definePanelEntry(definition)

    if (this.entries.has(def.id)) {
      throw new Error(`Panel entry '${def.id}' is already registered`)
    }

    for (const consumedId of def.consumes) {
      if (!this.hasResourceType(consumedId)) {
        throw new Error(
          `Panel entry '${def.id}' consumes unknown resource type '${consumedId}'`
        )
      }
    }

    this.entries.set(def.id, def)

    if (def.viewer && this.viewerRegistry) {
      try {
        this.viewerRegistry.registerViewer({
          resourceType: def.id,
          displayName: def.displayName,
          component: def.viewer,
          canHandle: (metadata: Record<string, unknown>) => {
            if (metadata.type === def.id) return true
            if (def.persistId && (metadata.type === def.persistId || metadata.resourceId === def.persistId)) {
              return true
            }
            if (metadata.resourceId === def.id) return true
            const key = String(metadata.resourceKey ?? metadata.id ?? '')
            if (def.persistId && matchesEntryPersistId(key, def.persistId)) return true
            return false
          },
        })
      } catch (error) {
        this.entries.delete(def.id)
        console.error(`Failed to register viewer for panel entry '${def.id}':`, error)
        throw error
      }
    }

    if (this.debug) {
      console.log(
        `✅ Registered panel entry: ${def.id} (${def.kind}, consumes ${def.consumes.join(', ')})`
      )
    }
  }

  get(id: string): PanelEntryDefinition | undefined {
    return this.entries.get(id)
  }

  has(id: string): boolean {
    return this.entries.has(id)
  }

  getAll(): PanelEntryDefinition[] {
    return Array.from(this.entries.values())
  }

  getByKind(kind: PanelEntryKind): PanelEntryDefinition[] {
    return this.getAll().filter((e) => e.kind === kind)
  }

  getCompositions(): PanelEntryDefinition[] {
    return this.getByKind('composition')
  }

  getPaneMembers(): PanelEntryDefinition[] {
    return this.getByKind('pane-member')
  }

  /** Pane-member or composition entries that consume this resource type. */
  entriesConsuming(resourceTypeId: string): PanelEntryDefinition[] {
    return this.getAll().filter((e) => e.consumes.includes(resourceTypeId))
  }

  paneMembersConsuming(resourceTypeId: string): PanelEntryDefinition[] {
    return this.getPaneMembers().filter((e) => e.consumes.includes(resourceTypeId))
  }

  /**
   * Resolve by entry id, persist id, or persistId:panel-N.
   * OBS-safe: never prefix-match without a colon.
   */
  resolve(id: string): PanelEntryDefinition | undefined {
    const byId = this.entries.get(id)
    if (byId) return byId

    for (const def of this.entries.values()) {
      if (!def.persistId) continue
      if (matchesEntryPersistId(id, def.persistId)) return def
    }

    return undefined
  }

  subjectsForCompositionAvailability(scope: PanelEntryScope): string[] {
    const types = this.getAllResourceTypes?.() ?? []
    return subjectsForCompositionAvailability(this.getCompositions(), types, scope)
  }
}

export function entryTypeOf(def: PanelEntryDefinition | undefined): PanelEntryType | undefined {
  return def?.entryType
}
