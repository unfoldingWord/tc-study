/**
 * Process-wide registries used by non-React ensure / persist / paint.
 * CatalogProvider binds live instances after construction.
 */

import type {
  PanelEntryRegistry,
  PanelGroupRegistry,
  PanelModeRegistry,
  ResourceTypeRegistry,
} from '@bt-synergy/resource-types'

let activeResourceTypes: ResourceTypeRegistry | null = null
let activePanelEntries: PanelEntryRegistry | null = null
let activePanelModes: PanelModeRegistry | null = null
let activePanelGroups: PanelGroupRegistry | null = null

export function setActiveResourceTypeRegistry(registry: ResourceTypeRegistry | null): void {
  activeResourceTypes = registry
}

export function getActiveResourceTypeRegistry(): ResourceTypeRegistry | null {
  return activeResourceTypes
}

export function setActivePanelEntryRegistry(registry: PanelEntryRegistry | null): void {
  activePanelEntries = registry
}

export function getActivePanelEntryRegistry(): PanelEntryRegistry | null {
  return activePanelEntries
}

export function setActivePanelModeRegistry(registry: PanelModeRegistry | null): void {
  activePanelModes = registry
}

export function getActivePanelModeRegistry(): PanelModeRegistry | null {
  return activePanelModes
}

export function setActivePanelGroupRegistry(registry: PanelGroupRegistry | null): void {
  activePanelGroups = registry
}

export function getActivePanelGroupRegistry(): PanelGroupRegistry | null {
  return activePanelGroups
}

export function setActiveRegistries(options: {
  resourceTypes?: ResourceTypeRegistry | null
  panelEntries?: PanelEntryRegistry | null
  panelModes?: PanelModeRegistry | null
  panelGroups?: PanelGroupRegistry | null
}): void {
  if ('resourceTypes' in options) setActiveResourceTypeRegistry(options.resourceTypes ?? null)
  if ('panelEntries' in options) setActivePanelEntryRegistry(options.panelEntries ?? null)
  if ('panelModes' in options) setActivePanelModeRegistry(options.panelModes ?? null)
  if ('panelGroups' in options) setActivePanelGroupRegistry(options.panelGroups ?? null)
}

export function clearActiveRegistries(): void {
  activeResourceTypes = null
  activePanelEntries = null
  activePanelModes = null
  activePanelGroups = null
}
