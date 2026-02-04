/**
 * Base types that both resource-types and catalog-manager need
 * Extracted here to prevent circular dependencies
 */

import type { ResourceMetadata } from '@bt-synergy/resource-panels'

/**
 * Base props for all resource viewer components
 */
export interface ResourceViewerProps {
  resourceId: string
  resourceKey: string
  [key: string]: any // Allow additional props
}

/**
 * Progress callback type for download operations
 * Matches the signature used in catalog-manager
 */
export interface ProgressCallback {
  (progress: {
    loaded: number
    total: number
    percentage: number
    message?: string
  }): void
}

/**
 * Base interface that ALL resource loaders must implement
 * This enables the plugin architecture
 */
export interface ResourceLoader {
  /**
   * Unique identifier for this resource type
   * Examples: 'scripture', 'notes', 'audio-bible', 'video'
   */
  readonly resourceType: string
  
  /**
   * Check if this loader can handle a specific resource
   * @param metadata - Resource metadata to check
   * @returns true if this loader can handle the resource
   */
  canHandle(metadata: ResourceMetadata): boolean
  
  /**
   * Load content for a resource
   * @param resourceKey - Unique resource identifier
   * @param contentId - Content identifier (e.g., book ID, chapter ID)
   * @returns Loaded content (type varies by resource type)
   */
  loadContent(resourceKey: string, contentId: string): Promise<unknown>
  
  /**
   * Get resource metadata
   * @param resourceKey - Unique resource identifier
   * @returns Resource metadata
   */
  getMetadata(resourceKey: string): Promise<ResourceMetadata>
  
  /**
   * Optional: Download entire resource for offline use
   * @param resourceKey - Unique resource identifier
   * @param options - Download options (method, skipExisting, etc.)
   * @param onProgress - Progress callback
   */
  downloadResource?(
    resourceKey: string,
    options?: {
      method?: 'individual' | 'zip' | 'tar'
      skipExisting?: boolean
    },
    onProgress?: ProgressCallback
  ): Promise<void>
  
  /**
   * Optional: Download a single ingredient (file) on-demand
   * @param resourceKey - Unique resource identifier
   * @param ingredientId - Ingredient identifier (e.g., "gen", "01-GEN")
   * @param options - Download options
   */
  downloadIngredient?(
    resourceKey: string,
    ingredientId: string,
    options?: {
      priority?: 'low' | 'normal' | 'high'
      onProgress?: (progress: number) => void
    }
  ): Promise<void>
  
  /**
   * Optional: Check if a specific ingredient is cached
   * @param resourceKey - Unique resource identifier
   * @param ingredientId - Ingredient identifier
   * @returns true if ingredient is cached locally
   */
  isIngredientCached?(
    resourceKey: string,
    ingredientId: string
  ): Promise<boolean>
  
  /**
   * Optional: Check if resource is available offline
   * @param resourceKey - Unique resource identifier
   * @returns true if resource is cached offline
   */
  isOfflineAvailable?(resourceKey: string): Promise<boolean>
  
  /**
   * Optional: Clear cached data for resource
   * @param resourceKey - Unique resource identifier
   */
  clearCache?(resourceKey: string): Promise<void>
}
