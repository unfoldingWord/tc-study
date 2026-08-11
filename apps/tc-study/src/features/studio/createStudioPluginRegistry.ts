import { createDefaultPluginRegistry } from '@bt-synergy/resource-panels'
import { STUDIO_MESSAGE_PLUGINS } from './studioMessagePlugins'

/** Shared message-plugin registry used by Read and Studio containers. */
export function createStudioPluginRegistry() {
  const pluginRegistry = createDefaultPluginRegistry()
  for (const plugin of STUDIO_MESSAGE_PLUGINS) {
    // Heterogeneous MessageTypePlugin union — register one plugin at a time.
    ;(pluginRegistry.register as (p: (typeof STUDIO_MESSAGE_PLUGINS)[number]) => void)(plugin)
  }
  return pluginRegistry
}
