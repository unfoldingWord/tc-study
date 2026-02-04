/**
 * LoaderRegistry - Manages resource loaders
 * Connects loaders to the app and provides unified loading interface
 * 
 * Loaders are now registered via ResourceTypeRegistry, not manually here.
 * This ensures a single source of truth for resource type registration.
 */

import type { ResourceLoader, ResourceMetadata } from '@bt-synergy/catalog-manager'

export class LoaderRegistry {
  private loaders: Map<string, ResourceLoader> = new Map()
  private debug: boolean

  constructor(config?: {
    debug?: boolean
  }) {
    this.debug = config?.debug ?? false

    if (this.debug) {
      console.log('🔌 LoaderRegistry initialized (loaders will be registered via ResourceTypeRegistry)')
    }
  }

  /**
   * Register a loader
   */
  registerLoader(type: string, loader: ResourceLoader): void {
    this.loaders.set(type, loader)
    if (this.debug) {
      console.log(`  ✅ Registered loader: ${type}`)
    }
  }

  /**
   * Get loader for a resource
   */
  getLoaderForResource(metadata: ResourceMetadata): ResourceLoader | null {
    for (const [type, loader] of this.loaders.entries()) {
      if (loader.canHandle(metadata)) {
        return loader
      }
    }
    return null
  }

  /**
   * Get loader by type
   */
  getLoader(type: string): ResourceLoader | undefined {
    return this.loaders.get(type)
  }

  /**
   * Get all registered loaders
   */
  getAllLoaders(): ResourceLoader[] {
    return Array.from(this.loaders.values())
  }
}


