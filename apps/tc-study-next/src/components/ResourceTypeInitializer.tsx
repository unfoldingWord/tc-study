/**
 * Resource Type Initializer
 *
 * Registers resource types AFTER contexts are mounted to avoid circular dependencies.
 * Modal-only types (words, academy) omit viewer in their plugin definitions.
 *
 * Reports completion/failure to CatalogContext so app ready (`useCatalogReady`)
 * means services + types registered — not "catalog downloaded".
 * Fail-closed: missing/invalid listed export OR incomplete registry
 * calls markResourceTypesFailed; never marks ready on partial success.
 */

import { useEffect } from 'react'
import { useCatalog, useResourceTypeRegistry } from '../contexts'
import {
  assertAllPluginsRegistered,
  collectRequiredPluginDefs,
} from '../resourceTypes/assertAllPluginsRegistered'
import { RESOURCE_TYPE_PLUGIN_EXPORTS } from '../resourceTypes/pluginRegistry'
import type { ResourceTypeDefinition } from '@bt-synergy/resource-types'

export function ResourceTypeInitializer() {
  const registry = useResourceTypeRegistry()
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
          if (!registry.has(def.id)) registry.register(def as ResourceTypeDefinition)
        }

        assertAllPluginsRegistered(
          expectedIds,
          registry.getAll().map((t) => t.id)
        )

        markResourceTypesReady()
      } catch (error) {
        console.error('📦 [Initializer] ❌ Failed to register resource types:', error)
        markResourceTypesFailed(error)
      }
    }

    void registerResourceTypes()
  }, [
    registry,
    resourceTypesReady,
    resourceTypesError,
    markResourceTypesReady,
    markResourceTypesFailed,
  ])

  return null
}
