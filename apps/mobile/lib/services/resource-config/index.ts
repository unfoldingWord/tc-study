/**
 * Resource Configuration Service
 * 
 * This service provides the main API for initializing app resources using
 * the declarative resource configuration system.
 */

import { LinkedPanelsConfig } from 'linked-panels'
import { APP_RESOURCES, MINIMAL_APP_RESOURCES, getGlobalResources } from '../../config/app-resources'
import { ResourceManager, StorageAdapter } from '../../types/context'
import {
    AppResourceConfig,
    ProcessedAppResourceConfig
} from '../../types/resource-config'
import { AdapterFactory } from './AdapterFactory'
import { ResourceConfigProcessor } from './ResourceConfigProcessor'

// ============================================================================
// MAIN API
// ============================================================================

/**
 * Initialize app resources from configuration
 */
export async function initializeAppResources(
  configs: AppResourceConfig[],
  appParams: { server: string; owner: string; language: string },
  storageAdapter: StorageAdapter,
  resourceManager: ResourceManager
): Promise<{
  processedConfig: ProcessedAppResourceConfig[];
  panelConfig: LinkedPanelsConfig;
  anchorResource: ProcessedAppResourceConfig;
}> {
    
  const adapterFactory = new AdapterFactory()
  const processor = new ResourceConfigProcessor()
  
  const result = await processor.process(
    configs,
    appParams,
    adapterFactory,
    resourceManager,
    storageAdapter
  )
  
    
  return result
}

/**
 * Get app resource configuration by mode
 */
export function getAppResourceConfig(mode: 'minimal' | 'default' | 'comprehensive' = 'default'): AppResourceConfig[] {
  const globalResources = getGlobalResources()
  
  switch (mode) {
    case 'minimal':
      return [...MINIMAL_APP_RESOURCES, ...globalResources]
    case 'default':
      return [...APP_RESOURCES, ...globalResources]
    case 'comprehensive':
      // TODO: Implement comprehensive resource set
      return [...APP_RESOURCES, ...globalResources]
    default:
      return [...APP_RESOURCES, ...globalResources]
  }
}

// ============================================================================
// RE-EXPORTS
// ============================================================================

export * from '../../types/resource-config'
export { AdapterFactory } from './AdapterFactory'
export { ResourceConfigProcessor } from './ResourceConfigProcessor'
