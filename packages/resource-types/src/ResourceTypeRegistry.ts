/**
 * ResourceTypeRegistry
 * 
 * Central registry for resource type plugins.
 * Automatically wires up loaders, viewers, and subject mappings
 * when a resource type is registered.
 */

import type { APIFilters, ResourceTypeDefinition } from './types'

export interface ResourceTypeRegistryConfig {
  catalogManager: any  // CatalogManager instance
  viewerRegistry: any  // ViewerRegistry instance
  loaderRegistry?: any  // Optional LoaderRegistry instance
  debug?: boolean
}

export class ResourceTypeRegistry {
  private types = new Map<string, ResourceTypeDefinition>()
  private subjectToTypeMap = new Map<string, string>()
  private catalogManager: any
  private viewerRegistry: any
  private loaderRegistry: any
  private debug: boolean
  
  constructor(config: ResourceTypeRegistryConfig) {
    this.catalogManager = config.catalogManager
    this.viewerRegistry = config.viewerRegistry
    this.loaderRegistry = config.loaderRegistry
    this.debug = config.debug ?? false
    
    if (this.debug) {
      console.log('📦 ResourceTypeRegistry initialized')
    }
  }
  
  /**
   * Register a complete resource type
   * Automatically wires up loader, viewer, and subject mappings
   */
  register(definition: ResourceTypeDefinition): void {
    const { id, displayName, subjects, loader, loaderConfig, viewer, aliases } = definition
    
    // 1. Validate definition
    if (this.types.has(id)) {
      throw new Error(`Resource type '${id}' is already registered`)
    }
    
    if (!subjects || subjects.length === 0) {
      throw new Error(`Resource type '${id}' must specify at least one subject`)
    }
    
    if (!loader) {
      throw new Error(`Resource type '${id}' must have a loader`)
    }
    
    // Viewer is optional - resources without viewers are modal-only
    // (accessible via Entry Viewer Registry, not as panel tabs)
    
    // 2. Store definition
    this.types.set(id, definition)
    
    // 3. Register subject mappings
    for (const subject of subjects) {
      if (this.subjectToTypeMap.has(subject)) {
        console.warn(
          `Subject '${subject}' is already mapped to '${this.subjectToTypeMap.get(subject)}', ` +
          `overriding with '${id}'`
        )
      }
      this.subjectToTypeMap.set(subject, id)
    }
    
    // 4. Register loader (data layer)
    try {
      // Merge loader config with required dependencies from catalogManager
      const fullConfig = {
        ...(loaderConfig || {}),
        cacheAdapter: this.catalogManager.cacheAdapter,
        catalogAdapter: this.catalogManager.catalogAdapter,  // ✅ Pass catalog adapter too!
        door43Client: this.catalogManager.door43Client,
      }
      // Instantiate loader
      const loaderInstance = new loader(fullConfig)
      
      // Register with CatalogManager (for downloading resources)
      this.catalogManager.registerResourceType(loaderInstance)
      
      // Also register with LoaderRegistry if provided (for unified access)
      if (this.loaderRegistry && this.loaderRegistry.registerLoader) {
        this.loaderRegistry.registerLoader(id, loaderInstance)
      }
    } catch (error) {
      console.error(`Failed to register loader for '${id}':`, error)
      throw error
    }
    
    // 5. Register viewer (UI layer) - only if viewer is provided
    if (viewer) {
      try {
        this.viewerRegistry.registerViewer({
          resourceType: id,
          displayName: displayName,
          component: viewer,
          canHandle: (metadata: any) => {
            // Check type
            if (metadata.type === id) return true
            
            // Check subjects
            if (metadata.subject && subjects.includes(metadata.subject)) {
              return true
            }
            
            // Check aliases
            if (aliases) {
              for (const alias of aliases) {
                if (
                  metadata.type === alias ||
                  metadata.resourceId === alias ||
                  metadata.subject === alias
                ) {
                  return true
                }
              }
            }
            
            return false
          }
        })
      } catch (error) {
        console.error(`Failed to register viewer for '${id}':`, error)
        throw error
      }
    } else {
      if (this.debug) {
        console.log(`ℹ️ No viewer registered for '${id}' (modal-only resource)`)
      }
    }
    
    // 6. Log success (simplified)
    console.log(`✅ Registered: ${id} (${subjects.length} subjects)${viewer ? '' : ' [modal-only]'}`)
  }
  
  /**
   * Get all registered resource types
   */
  getAll(): ResourceTypeDefinition[] {
    return Array.from(this.types.values())
  }
  
  /**
   * Get a specific resource type by ID
   */
  get(id: string): ResourceTypeDefinition | undefined {
    return this.types.get(id)
  }
  
  /**
   * Check if a resource type is registered
   */
  has(id: string): boolean {
    return this.types.has(id)
  }
  
  /**
   * Get resource type ID for a Door43 subject
   */
  getTypeForSubject(subject: string): string | undefined {
    return this.subjectToTypeMap.get(subject)
  }
  
  /**
   * Get all supported subjects (for API filtering)
   */
  getSupportedSubjects(): string[] {
    return Array.from(this.subjectToTypeMap.keys())
  }
  
  /**
   * Get API filters for Door43 requests
   * Automatically includes all supported subjects
   */
  getAPIFilters(): APIFilters {
    return {
      subjects: this.getSupportedSubjects(),
      stage: 'prod',
      topic: 'tc-ready',
    }
  }
  
  /**
   * Check if a subject is supported
   */
  isSubjectSupported(subject: string): boolean {
    return this.subjectToTypeMap.has(subject)
  }
  
  /**
   * Check if a resource type supports a specific feature
   */
  supportsFeature(typeId: string, feature: string): boolean {
    const type = this.types.get(typeId)
    if (!type || !type.features) return false
    return type.features[feature] === true
  }
  
  /**
   * Get all resource types that support a specific feature
   */
  getTypesByFeature(feature: string): ResourceTypeDefinition[] {
    return Array.from(this.types.values()).filter(
      type => type.features?.[feature] === true
    )
  }
  
  /**
   * Unregister a resource type
   * Note: This does not unregister from CatalogManager/ViewerRegistry
   */
  unregister(id: string): boolean {
    const definition = this.types.get(id)
    if (!definition) return false
    
    // Remove subject mappings
    for (const subject of definition.subjects) {
      if (this.subjectToTypeMap.get(subject) === id) {
        this.subjectToTypeMap.delete(subject)
      }
    }
    
    // Remove from types
    this.types.delete(id)
    
    console.log(`🗑️ Unregistered resource type: ${id}`)
    return true
  }
  
  /**
   * Get statistics about registered types
   */
  getStats() {
    return {
      totalTypes: this.types.size,
      totalSubjects: this.subjectToTypeMap.size,
      types: Array.from(this.types.keys()),
      subjects: Array.from(this.subjectToTypeMap.keys()),
    }
  }
}
