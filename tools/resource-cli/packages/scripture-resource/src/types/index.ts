/**
 * Scripture Types
 */

/**
 * Scripture resource data structure
 */
export interface ScriptureResource {
  id: string
  title: string
  language: string
  version: string
  
  // TODO: Add resource-specific fields
  content?: any
  metadata?: any
}

/**
 * Loader configuration
 */
export interface ScriptureLoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  
  // Custom config options
  enableMemoryCache?: boolean
  memoryCacheSize?: number
  debug?: boolean
}
