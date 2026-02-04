/**
 * Resource Configuration Processor
 * 
 * Processes AppResourceConfig declarations to:
 * 1. Create and configure resource adapters
 * 2. Load resource metadata
 * 3. Generate LinkedPanelsConfig for the panel system
 * 4. Identify the anchor resource
 */

import { LinkedPanelsConfig } from 'linked-panels';
import { PANEL_ASSIGNMENTS, getSmartPanelEntries } from '../../config/app-resources';
import { ResourceAdapter, ResourceManager, ResourceMetadata } from '../../types/context';
import {
    AdapterType,
    AppResourceConfig,
    AdapterFactory as IAdapterFactory,
    ResourceConfigProcessor as IResourceConfigProcessor,
    ProcessedAppResourceConfig
} from '../../types/resource-config';

export class ResourceConfigProcessor implements IResourceConfigProcessor {
  async process(
    appResourceConfigs: AppResourceConfig[],
    appParams: { server: string; owner: string; language: string },
    adapterFactory: IAdapterFactory,
    resourceManager: ResourceManager,
    storageAdapter?: any // StorageAdapter - using any to avoid circular import
  ): Promise<{
    processedConfig: ProcessedAppResourceConfig[];
    panelConfig: LinkedPanelsConfig;
    anchorResource: ProcessedAppResourceConfig;
  }> {
        
    // Sort by load priority
    const sortedConfigs = [...appResourceConfigs].sort((a, b) => 
      (a.loadPriority || 999) - (b.loadPriority || 999)
    )
    
    const processedConfigs: ProcessedAppResourceConfig[] = []
    const adapters: ResourceAdapter[] = []
    
    // Step 1: Create all adapters
        for (const config of sortedConfigs) {
      try {
                        
        const adapter = adapterFactory.createAdapter(
          config.adapterType,
          config.adapterConfig,
          this.inferResourceType(config)
        )
        
        adapters.push(adapter)
                      } catch (error) {
        console.error(`❌ Failed to create adapter for ${config.panelResourceId}:`, error)
        // Continue with other resources
      }
    }
    
    // Step 2: Initialize ResourceManager with all adapters
        if (!storageAdapter) {
      throw new Error('Storage adapter is required for ResourceManager initialization')
    }
    await resourceManager.initialize(storageAdapter, adapters)
    
    // Step 3: Load metadata for each resource individually (supports different languages)
        
    for (let i = 0; i < sortedConfigs.length && i < adapters.length; i++) {
      const config = sortedConfigs[i]
      const adapter = adapters[i]
      
      try {
        // Use resource-specific parameters or fall back to app defaults
        const resourceServer = config.server || appParams.server
        const resourceOwner = config.owner || appParams.owner
        const resourceLanguage = config.language || appParams.language
        
        const adapterMetadata = await resourceManager.getOrFetchMetadataForAdapter(
          adapter,
          resourceServer,
          resourceOwner,
          resourceLanguage
        )
        
        if (!adapterMetadata) {
          throw new Error(`No metadata found for adapter ${adapter.resourceId} (${adapter.resourceType})`)
        }
        
        // Use the cached metadata directly (already in ResourceMetadata format)
        const matchingMetadata: ResourceMetadata = {
          ...adapterMetadata,
          // Override with config-specific values
          isAnchor: config.isAnchor || false,
        }
        
        // Register the metadata-to-adapter mapping in ResourceManager
        resourceManager.registerMetadataMapping(matchingMetadata, adapter)
        
        // Create processed config
        const actualTitle = matchingMetadata.title || config.panelConfig.title
        const actualDescription = matchingMetadata.description || config.panelConfig.description || ''

        
        const processedConfig: ProcessedAppResourceConfig = {
          panelResourceId: config.panelResourceId,
          adapter,
          panelConfig: config.panelConfig,
          metadata: matchingMetadata,
          isAnchor: config.isAnchor || false,
          loadPriority: config.loadPriority || 999,
          actualTitle,
          actualDescription
        }
        
        processedConfigs.push(processedConfig)
              } catch (error) {
        console.error(`❌ Failed to process resource ${config.panelResourceId}:`, error)
        // Continue with other resources
      }
    }
    
    // Find anchor resource
    const anchorResource = processedConfigs.find(config => config.isAnchor) || processedConfigs[0]
    if (!anchorResource) {
      throw new Error('No anchor resource found or processed successfully')
    }
    
    // Generate LinkedPanelsConfig
    const panelConfig = this.generatePanelConfig(processedConfigs)
    
        
    return {
      processedConfig: processedConfigs,
      panelConfig,
      anchorResource
    }
  }
  
  private inferResourceType(config: AppResourceConfig): any {
    // Map adapter types to resource types
    switch (config.adapterType) {
      case AdapterType.DOOR43_SCRIPTURE:
        return 'scripture' // ResourceType.SCRIPTURE
      case AdapterType.DOOR43_NOTES:
        return 'notes' // ResourceType.NOTES
      case AdapterType.DOOR43_WORDS:
        return 'words' // ResourceType.WORDS
      case AdapterType.DOOR43_ACADEMY:
        return 'academy' // ResourceType.ACADEMY
      case AdapterType.DOOR43_QUESTIONS:
        return 'questions' // ResourceType.QUESTIONS
      default:
        return 'unknown'
    }
  }
  
  private generatePanelConfig(processedConfigs: ProcessedAppResourceConfig[]): LinkedPanelsConfig {
    // Create resources map from processed configs (traditional resources)
    const resources = processedConfigs.map(config => ({
      id: config.panelResourceId,
      component: config.panelConfig.component as any, // Type assertion for linked-panels compatibility
      title: config.actualTitle,
      category: config.panelConfig.category,
      description: config.actualDescription,
      icon: config.panelConfig.icon,
      defaultVisible: config.panelConfig.defaultVisible,
      resizable: config.panelConfig.resizable,
      closable: config.panelConfig.closable,
      preferredWidth: config.panelConfig.preferredWidth,
      minWidth: config.panelConfig.minWidth,
      maxWidth: config.panelConfig.maxWidth
    }))

    // Add smart panel entries as resources (they'll get dynamic titles at runtime)
    const smartPanelEntries = getSmartPanelEntries()
    const smartResources = smartPanelEntries.map(entry => ({
      id: entry.panelEntryId,
      component: entry.component as any,
      title: 'Original Languages', // Default title, will be updated dynamically
      category: entry.category,
      description: 'Hebrew Bible (OT) and Greek New Testament (NT)', // Default description
      icon: 'languages', // Default icon
      defaultVisible: true,
      resizable: true,
      closable: true,
      preferredWidth: 500,
      minWidth: 350,
      maxWidth: 800
    }))

    // Combine traditional resources and smart entries
    const allResources = [...resources, ...smartResources]
    
    // Generate panels based on PANEL_ASSIGNMENTS instead of individual resource configs
    const panels: Record<string, any> = {}
    PANEL_ASSIGNMENTS.forEach(panelAssignment => {
      // Combine traditional resources and smart entries for this panel
      const panelResourceIds = [
        ...(panelAssignment.resources || []),
        ...(panelAssignment.smartEntries || [])
      ]

      panels[panelAssignment.panelId] = {
        resourceIds: panelResourceIds, // Multiple resources per panel (including smart entries)
        initialResourceId: panelAssignment.defaultResource, // Which resource to show by default
        title: panelAssignment.title,
        description: panelAssignment.description,
        category: panelAssignment.category,
        icon: panelAssignment.icon,
        defaultVisible: panelAssignment.defaultVisible,
        resizable: panelAssignment.resizable,
        closable: panelAssignment.closable,
        preferredWidth: panelAssignment.preferredWidth,
        minWidth: panelAssignment.minWidth,
        maxWidth: panelAssignment.maxWidth
      }
    })

    
    return {
      resources: allResources,
      panels
    }
  }
}