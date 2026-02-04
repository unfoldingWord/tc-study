/**
 * TranslationNotesLoader - Loads Translation Notes resources
 * Implements ResourceLoader interface for plugin architecture
 * 
 * Translation Notes provide translation guidance for specific phrases,
 * with links to Translation Academy articles for further training.
 */

import type {
    ProgressCallback,
    ResourceLoader,
    ResourceMetadata
} from '@bt-synergy/catalog-manager'
import { ResourceType } from '@bt-synergy/resource-catalog'
import { Door43ServerAdapter } from '@bt-synergy/resource-catalog'
import type { ProcessedNotes } from '@bt-synergy/resource-parsers'
import { NotesProcessor } from '@bt-synergy/resource-parsers'
import type {
    TranslationNotesLoaderConfig
} from './types'

export class TranslationNotesLoader implements ResourceLoader {
  readonly resourceType: string = 'notes'
  
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean
  private serverAdapter: Door43ServerAdapter
  private processor: NotesProcessor

  constructor(config: TranslationNotesLoaderConfig) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug ?? false
    this.serverAdapter = new Door43ServerAdapter()
    this.processor = new NotesProcessor()
  }

  /**
   * Check if this loader can handle a resource
   */
  canHandle(metadata: ResourceMetadata): boolean {
    return (
      metadata.type === 'notes' ||
      metadata.subject === 'TSV Translation Notes' ||
      metadata.resourceId === 'tn'
    )
  }

  /**
   * Get resource metadata
   */
  async getMetadata(resourceKey: string): Promise<ResourceMetadata> {
    try {
      // Try catalog first
      const catalogMeta = await this.catalogAdapter.get(resourceKey)
      if (catalogMeta) {
        return catalogMeta
      }

      // Parse resourceKey using adapter
      const identifiers = this.serverAdapter.parseResourceKey(resourceKey)
      const { owner, language, resourceId } = identifiers

      // Fetch from Door43
      // Door43 repository names follow the pattern: language_resourceId
      const repoName = `${language}_${resourceId}`
      const repo = await this.door43Client.findRepository(owner, repoName, 'prod')
      if (!repo) {
        throw new Error(`Resource not found: ${owner}/${repoName}`)
      }

      // Only use release tag - throw if missing
      if (!repo.release?.tag_name) {
        throw new Error(
          `Resource ${owner}/${language}/${resourceId} has no release tag. ` +
          `Only released resources are currently supported.`
        )
      }

      // Build metadata
      const metadata: ResourceMetadata = {
        resourceKey,
        server: 'git.door43.org',
        owner: repo.owner?.login || owner,
        language: repo.language?.slug || language,
        resourceId: repo.name || resourceId,
        type: ResourceType.NOTES,
        format: 'tsv' as any,
        contentType: 'text/tsv',
        contentStructure: 'book',
        subject: 'TSV Translation Notes',
        version: repo.release.tag_name,
        title: repo.title || `${owner}/${language}/${resourceId}`,
        description: repo.description,
        availability: {
          online: true,
          offline: false,
          bundled: false,
          partial: false
        },
        locations: [],
        release: repo.release,
        catalogedAt: new Date().toISOString()
      }

      return metadata
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${resourceKey}:`, error)
      throw error
    }
  }

  /**
   * Load Translation Notes content for a specific book
   */
  async loadContent(resourceKey: string, bookCode: string): Promise<ProcessedNotes> {
    // Use consistent cache key format
    const cacheKey = `tn:${resourceKey}:${bookCode}`

    try {
      // Try cache first
      const cached = await this.cacheAdapter.get(cacheKey)
      if (cached) {
        return cached
      }

      // Get metadata to retrieve the release tag/version
      const metadata = await this.getMetadata(resourceKey)
      
      // Parse resourceKey to get identifiers
      const parts = resourceKey.split('/')
      const [owner, language, resourceId] = parts
      
      // Get release tag
      const ref = metadata.release?.tag_name
      if (!ref) {
        throw new Error(
          `Resource ${resourceKey} has no release tag. ` +
          `Only released resources are currently supported.`
        )
      }

      // Construct TSV URL directly
      // Format: https://git.door43.org/{owner}/{language}_{resourceId}/raw/tag/{ref}/tn_{BOOK}.tsv
      const repoName = `${language}_${resourceId}`
      const tsvUrl = `https://git.door43.org/${owner}/${repoName}/raw/tag/${ref}/tn_${bookCode.toUpperCase()}.tsv`
      
      if (this.debug) {
        console.log(`📥 Fetching TN TSV from: ${tsvUrl}`)
      }

      const response = await fetch(tsvUrl)
      if (!response.ok) {
        // 404 means book doesn't exist in this repo (common for incomplete translations)
        if (response.status === 404) {
          if (this.debug) {
            console.log(`⚠️ TN file not found (book not in repo): ${bookCode}`)
          }
          // Return empty processed result so it gets cached and we don't retry
          return {
            bookCode,
            bookName: bookCode,
            notes: [],
            notesByChapter: {},
            metadata: {
              bookCode,
              bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalNotes: 0,
              chaptersWithNotes: [],
              statistics: {
                totalNotes: 0,
                notesPerChapter: {}
              }
            }
          }
        }
        throw new Error(`Failed to fetch TSV: ${response.statusText}`)
      }

      const tsvContent = await response.text()
      
      // Process TSV using NotesProcessor
      const processed = await this.processor.processNotes(
        tsvContent,
        bookCode,
        bookCode // Use bookCode as bookName for now
      )

      // Cache it
      await this.cacheAdapter.set(cacheKey, processed)

      return processed
    } catch (error) {
      if (this.debug) {
        console.error(`❌ Failed to load content for ${cacheKey}:`, error)
      }
      throw error
    }
  }

  /**
   * Download entire Translation Notes resource (all books)
   */
  async downloadResource(
    resourceKey: string,
    options?: { 
      method?: 'individual' | 'zip'
      skipExisting?: boolean
      onProgress?: ProgressCallback
    }
  ): Promise<void> {
    const skipExisting = options?.skipExisting ?? true
    const onProgress = options?.onProgress

    console.log(`📦 [TranslationNotesLoader] Starting download for ${resourceKey}`)

    // Get resource metadata to access ingredients (book list)
    const metadata = await this.getMetadata(resourceKey)
    if (!metadata) {
      throw new Error(`Resource metadata not found for ${resourceKey}`)
    }

    const ingredients = metadata.contentMetadata?.ingredients
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      console.warn(`⚠️ No ingredients found for ${resourceKey}`)
      return
    }

    console.log(`📦 Found ${ingredients.length} books to download`)

    const total = ingredients.length
    let loaded = 0

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) {
        console.warn(`⚠️ Skipping ingredient without identifier:`, ingredient)
        continue
      }

      try {
        // Check if already cached
        if (skipExisting) {
          const cacheKey = `tn:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.notes) {
            console.log(`⏭️ Skipping ${bookId} (already cached)`)
            loaded++
            if (onProgress) {
              onProgress({
                loaded,
                total,
                percentage: Math.round((loaded / total) * 100),
                message: `Skipped ${bookId} (already cached)`
              })
            }
            continue
          }
        }

        // Download and process this book
        if (this.debug) {
          console.log(`📥 Downloading TN for ${bookId}...`)
        }
        await this.loadContent(resourceKey, bookId)

        loaded++
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Downloaded ${bookId}`
          })
        }
      } catch (error) {
        if (this.debug) {
          console.warn(`⚠️ Failed to download TN for ${bookId}:`, error)
        }
        // Continue with next book even if one fails
        loaded++
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Skipped ${bookId} (not in repo)`
          })
        }
      }
    }

    // Mark resource as fully downloaded
    const resourceCacheKey = `resource:${resourceKey}`
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: true },
      metadata: {
        downloadComplete: true,
        downloadCompletedAt: new Date().toISOString(),
        downloadMethod: 'individual',
        entryCount: ingredients.length,
        expectedEntryCount: ingredients.length
      }
    })

    if (this.debug) {
      console.log(`✅ [TranslationNotesLoader] Download complete for ${resourceKey}`)
    }
  }
}
