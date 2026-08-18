/**
 * Registers resource types AFTER contexts are mounted to avoid circular dependencies.
 * Modal-only types (words, academy) omit viewer in their plugin definitions.
 * Panel entries / modes / groups register after resource types so `consumes` ids exist.
 *
 * Reports completion/failure to CatalogContext so app ready (`useCatalogReady`)
 * means services + types registered — not "catalog downloaded".
 * Fail-closed: missing/invalid listed export OR incomplete registry
 * calls markResourceTypesFailed; never marks ready on partial success.
 */

import { useEffect } from 'react'
import {
  useCatalog,
  usePanelEntryRegistry,
  usePanelGroupRegistry,
  usePanelModeRegistry,
  useResourceTypeRegistry,
} from '../contexts'
import {
  assertAllPanelEntriesRegistered,
  assertAllPanelModesRegistered,
  assertAllPluginsRegistered,
  collectRequiredPluginDefs,
} from '../resourceTypes/assertAllPluginsRegistered'
import {
  PANEL_ENTRY_PLUGIN_EXPORTS,
  PANEL_GROUP_PLUGIN_EXPORTS,
  PANEL_MODE_PLUGIN_EXPORTS,
  RESOURCE_TYPE_PLUGIN_EXPORTS,
} from '../resourceTypes/pluginRegistry'
import type {
  PanelEntryDefinition,
  PanelGroupDefinition,
  PanelModeDefinition,
  ResourceTypeDefinition,
} from '@bt-synergy/resource-types'
import { setActiveRegistries } from '../resourceTypes/activeRegistry'
import { reensureCurrentWorkspaceCompositions } from '../features/workspace/reensureWorkspaceCompositions'

export function ResourceTypeInitializer() {
  const resourceTypeRegistry = useResourceTypeRegistry()
  const panelEntryRegistry = usePanelEntryRegistry()
  const panelModeRegistry = usePanelModeRegistry()
  const panelGroupRegistry = usePanelGroupRegistry()
  const { resourceTypesReady, resourceTypesError, markResourceTypesReady, markResourceTypesFailed } =
    useCatalog()

  useEffect(() => {
    if (resourceTypesReady || resourceTypesError) return

    const registerResourceTypes = async () => {
      try {
        const plugins = await import('../resourceTypes')
        const defs = collectRequiredPluginDefs(
          RESOURCE_TYPE_PLUGIN_EXPORTS,
          plugins as Record<string, unknown>
        )
        const expectedIds = defs.map((def) => def.id)

        for (const def of defs) {
          if (!resourceTypeRegistry.has(def.id)) {
            resourceTypeRegistry.register(def as ResourceTypeDefinition)
          }
        }

        assertAllPluginsRegistered(
          expectedIds,
          resourceTypeRegistry.getAll().map((t) => t.id)
        )

        const groupDefs = collectRequiredPluginDefs(
          PANEL_GROUP_PLUGIN_EXPORTS,
          plugins as Record<string, unknown>
        )
        for (const def of groupDefs) {
          if (!panelGroupRegistry.has(def.id)) {
            panelGroupRegistry.register(def as PanelGroupDefinition)
          }
        }

        const modeDefs = collectRequiredPluginDefs(
          PANEL_MODE_PLUGIN_EXPORTS,
          plugins as Record<string, unknown>
        )
        for (const def of modeDefs) {
          if (!panelModeRegistry.has(def.id)) {
            panelModeRegistry.register(def as PanelModeDefinition)
          }
        }
        assertAllPanelModesRegistered(
          modeDefs.map((d) => d.id),
          panelModeRegistry.getAll().map((m) => m.id)
        )

        const entryDefs = collectRequiredPluginDefs(
          PANEL_ENTRY_PLUGIN_EXPORTS,
          plugins as Record<string, unknown>
        )
        const expectedEntryIds = entryDefs.map((def) => def.id)

        for (const def of entryDefs) {
          if (!panelEntryRegistry.has(def.id)) {
            panelEntryRegistry.register(def as PanelEntryDefinition)
          }
        }

        assertAllPanelEntriesRegistered(
          expectedEntryIds,
          panelEntryRegistry.getAll().map((e) => e.id)
        )

        setActiveRegistries({
          resourceTypes: resourceTypeRegistry,
          panelEntries: panelEntryRegistry,
          panelModes: panelModeRegistry,
          panelGroups: panelGroupRegistry,
        })
        reensureCurrentWorkspaceCompositions()
        markResourceTypesReady()
      } catch (error) {
        console.error('📦 [Initializer] ❌ Failed to register resource types:', error)
        markResourceTypesFailed(error)
      }
    }

    void registerResourceTypes()
  }, [
    resourceTypeRegistry,
    panelEntryRegistry,
    panelModeRegistry,
    panelGroupRegistry,
    resourceTypesReady,
    resourceTypesError,
    markResourceTypesReady,
    markResourceTypesFailed,
  ])

  return null
}
