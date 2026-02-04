/**
 * ResourceLoadingService - Handles loading and caching resource content
 * Bridges catalog, loaders, and viewers
 */

import type { ResourceMetadata } from '@bt-synergy/catalog-manager'
import type { LoaderRegistry } from '../loaders/LoaderRegistry'
import { ProcessedScripture } from '@bt-synergy/usfm-processor'
import { TranslationWord } from '@bt-synergy/translation-words-loader/types'

export interface LoadedResourceContent {
  resourceKey: string
  metadata: ResourceMetadata
  content: any // Scripture: ProcessedScripture, Words: TranslationWord, etc.
  loadedAt: Date
  type: 'scripture' | 'words' | 'notes' | 'questions' | 'academy' | 'unknown'
}

export class ResourceLoadingService {
  private loaderRegistry: LoaderRegistry
  private loadedContent: Map<string, LoadedResourceContent> = new Map()
  private debug: boolean

  constructor(loaderRegistry: LoaderRegistry, debug = false) {
    this.loaderRegistry = loaderRegistry
    this.debug = debug
  }

  /**
   * Load resource content into memory
   * Returns the loaded content and viewer component
   */
  async loadResource(
    metadata: ResourceMetadata,
    ingredientId?: string
  ): Promise<LoadedResourceContent> {
    const cacheKey = ingredientId 
      ? `${metadata.id}/${ingredientId}` 
      : metadata.id

    // Check if already loaded
    if (this.loadedContent.has(cacheKey)) {
      if (this.debug) {
        console.log(`✨ Resource already in memory: ${cacheKey}`)
      }
      return this.loadedContent.get(cacheKey)!
    }

    // Find appropriate loader
    const loader = this.loaderRegistry.getLoaderForResource(metadata)
    if (!loader) {
      throw new Error(`No loader available for resource type: ${metadata.type}`)
    }

    if (this.debug) {
      console.log(`📥 Loading resource: ${cacheKey}`)
    }

    // Load content based on content structure
    let content: any
    if (metadata.contentStructure === 'book') {
      // Book-organized resources (e.g., Scripture) - load specific book
      if (!ingredientId) {
        throw new Error('ingredientId (book code) required for book-organized resources')
      }
      content = await loader.loadContent(metadata.id, ingredientId)
    } else if (metadata.contentStructure === 'entry') {
      // Entry-organized resources (e.g., Translation Words) - load specific entry or index
      if (ingredientId) {
        content = await loader.loadContent(metadata.id, ingredientId)
      } else {
        // Load entry list/index
        content = await loader.getMetadata(metadata.id)
      }
    } else {
      // Unknown structure - try generic load
      content = await loader.loadContent(metadata.id, ingredientId || '')
    }

    const loaded: LoadedResourceContent = {
      resourceKey: cacheKey,
      metadata,
      content,
      loadedAt: new Date(),
      type: this.determineType(metadata),
    }

    this.loadedContent.set(cacheKey, loaded)

    if (this.debug) {
      console.log(`✅ Resource loaded: ${cacheKey}`)
    }

    return loaded
  }

  /**
   * Check if resource is loaded in memory
   */
  isLoaded(resourceKey: string): boolean {
    return this.loadedContent.has(resourceKey)
  }

  /**
   * Get loaded resource content
   */
  getLoaded(resourceKey: string): LoadedResourceContent | null {
    return this.loadedContent.get(resourceKey) || null
  }

  /**
   * Unload resource from memory
   */
  unload(resourceKey: string): void {
    this.loadedContent.delete(resourceKey)
    if (this.debug) {
      console.log(`🗑️ Unloaded resource: ${resourceKey}`)
    }
  }

  /**
   * Get all loaded resources
   */
  getAllLoaded(): LoadedResourceContent[] {
    return Array.from(this.loadedContent.values())
  }

  /**
   * Clear all loaded content
   */
  clearAll(): void {
    this.loadedContent.clear()
    if (this.debug) {
      console.log('🗑️ Cleared all loaded resources')
    }
  }

  /**
   * Determine resource type from metadata
   */
  private determineType(metadata: ResourceMetadata): LoadedResourceContent['type'] {
    if (metadata.type === 'scripture' || metadata.subject === 'Bible' || metadata.subject === 'Aligned Bible') {
      return 'scripture'
    }
    if (metadata.type === 'words' || metadata.subject === 'Translation Words') {
      return 'words'
    }
    if (metadata.subject === 'Translation Notes') {
      return 'notes'
    }
    if (metadata.subject === 'Translation Questions') {
      return 'questions'
    }
    if (metadata.subject === 'Translation Academy') {
      return 'academy'
    }
    return 'unknown'
  }

  /**
   * Get memory usage stats
   */
  getStats() {
    return {
      totalLoaded: this.loadedContent.size,
      resources: Array.from(this.loadedContent.values()).map(r => ({
        key: r.resourceKey,
        type: r.type,
        loadedAt: r.loadedAt,
      })),
    }
  }
}



