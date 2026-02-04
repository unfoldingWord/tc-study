/**
 * TranslationWordsLinksLoader - Loads Translation Words Links resources
 * Implements ResourceLoader interface for plugin architecture
 */

import type {
    ProgressCallback,
    ResourceLoader,
    ResourceMetadata
} from '@bt-synergy/catalog-manager'
import { Door43ServerAdapter, ResourceType } from '@bt-synergy/resource-catalog'
import type { ProcessedWordsLinks } from '@bt-synergy/resource-parsers'
import { WordsLinksProcessor } from '@bt-synergy/resource-parsers'
import type {
    TranslationWordsLinksLoaderConfig
} from './types'

export class TranslationWordsLinksLoader implements ResourceLoader {
  readonly resourceType: string = 'words-links'
  
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean
  private serverAdapter: Door43ServerAdapter
  private processor: WordsLinksProcessor

  constructor(config: TranslationWordsLinksLoaderConfig) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug ?? false
    this.serverAdapter = new Door43ServerAdapter()
    this.processor = new WordsLinksProcessor()
  }

  /**
   * Check if this loader can handle a resource
   */
  canHandle(metadata: ResourceMetadata): boolean {
    return (
      metadata.type === 'words-links' ||
      metadata.subject === 'TSV Translation Words Links' ||
      metadata.resourceId === 'twl'
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
        type: ResourceType.WORDS_LINKS,
        format: 'tsv' as any, // ResourceFormat.TSV
        contentType: 'text/tsv',
        contentStructure: 'book',
        subject: 'TSV Translation Words Links',
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
   * Load Translation Words Links content for a specific book
   */
  async loadContent(resourceKey: string, bookCode: string): Promise<ProcessedWordsLinks> {
    // Use consistent cache key format with downloadResource
    const cacheKey = `twl:${resourceKey}:${bookCode}`

    try {
      // Try cache first
      const cached = await this.cacheAdapter.get(cacheKey)
      if (cached) {
        // Check if cached data has twLink
        if (cached.links && cached.links.length > 0) {
          const firstLink = cached.links[0] as any
          if (!firstLink.twLink) {
            console.warn(`[TWL Loader] ⚠️ Cached data missing twLink! Clearing cache and reloading...`)
            // Clear cache and reload
            await this.cacheAdapter.delete(cacheKey)
            // Continue to fetch fresh data
          } else {
            return cached
          }
        } else {
          return cached
        }
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
      // Format: https://git.door43.org/{owner}/{language}_{resourceId}/raw/tag/{ref}/twl_{BOOK}.tsv
      const repoName = `${language}_${resourceId}`
      const tsvUrl = `https://git.door43.org/${owner}/${repoName}/raw/tag/${ref}/twl_${bookCode.toUpperCase()}.tsv`
      
      if (this.debug) {
        console.log(`📥 Fetching TWL TSV from: ${tsvUrl}`)
      }

      const response = await fetch(tsvUrl)
      if (!response.ok) {
        // 404 means book doesn't exist in this repo (common for incomplete translations)
        if (response.status === 404) {
          if (this.debug) {
            console.log(`⚠️ TWL file not found (book not in repo): ${bookCode}`)
          }
          // Return empty processed result so it gets cached and we don't retry
          return {
            bookCode,
            bookName: bookCode,
            links: [],
            linksByChapter: {},
            metadata: {
              bookCode,
              bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalLinks: 0,
              chaptersWithLinks: [],
              statistics: {
                totalLinks: 0,
                linksPerChapter: {}
              }
            }
          }
        }
        throw new Error(`Failed to fetch TSV: ${response.statusText}`)
      }

      const tsvContent = await response.text()
      
      // Process TSV using WordsLinksProcessor (which correctly extracts twLink)
      const processed = await this.processor.processWordsLinks(
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
   * Download entire Translation Words Links resource (all books)
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

    console.log(`📦 [TranslationWordsLinksLoader] Starting download for ${resourceKey}`)

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
          const cacheKey = `twl:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.content) {
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
          console.log(`📥 Downloading TWL for ${bookId}...`)
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
          console.warn(`⚠️ Failed to download TWL for ${bookId}:`, error)
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
      console.log(`✅ [TranslationWordsLinksLoader] Download complete for ${resourceKey}`)
    }
  }
}
