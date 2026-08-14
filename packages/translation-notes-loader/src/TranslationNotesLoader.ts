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
      metadata.type === 'obs-notes' ||
      metadata.subject === 'TSV Translation Notes' ||
      metadata.subject === 'TSV OBS Translation Notes' ||
      metadata.subject === 'OBS Translation Notes' ||
      metadata.resourceId === 'tn' ||
      metadata.resourceId === 'obs-tn'
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

      // Get metadata to retrieve the release info and ingredient paths
      const metadata = await this.getMetadata(resourceKey)

      const ref = (metadata as any).release?.tag_name
      if (!ref) {
        throw new Error(`Resource ${resourceKey} has no release tag.`)
      }

      // If the resource has ingredients but none match this book, it simply
      // doesn't cover that book (e.g. scripture TN asked for 'obs').
      // Return empty immediately rather than making a request that would 404.
      const ingredients: any[] = (metadata as any).contentMetadata?.ingredients || []
      if (ingredients.length > 0) {
        const hasIngredient = ingredients.some(
          (ing: any) => (ing.identifier || '').toLowerCase() === bookCode.toLowerCase()
        )
        if (!hasIngredient) {
          return {
            bookCode, bookName: bookCode, notes: [], notesByChapter: {},
            metadata: {
              bookCode, bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalNotes: 0, chaptersWithNotes: [],
              statistics: { totalNotes: 0, notesPerChapter: {} }
            }
          }
        }
      }

      const tsvUrl = this.buildRawTsvUrl(metadata, bookCode, ref, 'tn')

      if (this.debug) {
        console.log(`📥 Fetching TN TSV from: ${tsvUrl}`)
      }

      const response = await fetch(tsvUrl)
      if (!response.ok) {
        if (response.status === 404) {
          if (this.debug) console.log(`⚠️ TN file not found (book not in repo): ${bookCode}`)
          // Do NOT cache 404s — the background download may still be in progress.
          return {
            bookCode, bookName: bookCode, notes: [], notesByChapter: {},
            metadata: {
              bookCode, bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalNotes: 0, chaptersWithNotes: [],
              statistics: { totalNotes: 0, notesPerChapter: {} }
            }
          }
        }
        throw new Error(`Failed to fetch TN TSV: ${response.statusText}`)
      }

      const tsvContent = await response.text()
      const processed = await this.processor.processNotes(tsvContent, bookCode, bookCode)
      await this.cacheAdapter.set(cacheKey, processed)
      return processed
    } catch (error) {
      if (this.debug) {
        console.error(`❌ Failed to load content for ${cacheKey}:`, error)
      }
      throw error
    }
  }

  private buildRawTsvUrl(metadata: ResourceMetadata, bookCode: string, ref: string, prefix: string): string {
    const zipballUrl: string | undefined = (metadata as any).release?.zipball_url
    let owner: string
    let repoName: string

    if (zipballUrl) {
      const match = zipballUrl.match(/git\.door43\.org\/([^/]+)\/([^/]+)\/archive\//)
      if (match) {
        owner = match[1]; repoName = match[2]
      } else {
        const parts = (metadata as any).resourceKey?.split('/') || []
        owner = parts[0] || ''; repoName = `${parts[1]}_${parts[2]}`
      }
    } else {
      const parts = (metadata as any).resourceKey?.split('/') || []
      owner = parts[0] || ''; repoName = `${parts[1]}_${parts[2]}`
    }

    const ingredients: any[] = (metadata as any).contentMetadata?.ingredients || []
    const ingredient = ingredients.find(
      (ing: any) => (ing.identifier || '').toLowerCase() === bookCode.toLowerCase()
    )
    const filePath = ingredient?.path
      ? ingredient.path.replace(/^\.\//, '')
      : `${prefix}_${bookCode.toUpperCase()}.tsv`

    return `https://git.door43.org/${owner}/${repoName}/raw/tag/${ref}/${filePath}`
  }

  /**
   * Download entire Translation Notes resource (all books).
   * Uses zipball by default (one HTTP fetch for all books); falls back to per-book fetches
   * when no zipball URL is available or the zip download fails.
   */
  async downloadResource(
    resourceKey: string,
    options?: { 
      method?: 'individual' | 'zip'
      skipExisting?: boolean
    },
    onProgress?: ProgressCallback
  ): Promise<void> {
    const skipExisting = options?.skipExisting ?? true
    const method = options?.method ?? 'zip'

    console.log(`📦 [TranslationNotesLoader] Starting download for ${resourceKey} (method: ${method})`)

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

    const zipUrl = (metadata as any).release?.zipball_url
    if (method === 'zip' && zipUrl) {
      try {
        await this.downloadViaZip(resourceKey, metadata, ingredients, skipExisting, onProgress)
        await this.markComplete(resourceKey, ingredients.length, 'zip')
        return
      } catch (zipError) {
        console.warn(`⚠️ [TN] ZIP download failed, falling back to per-book fetch:`, zipError)
      }
    }

    // Per-book fallback
    const total = ingredients.length
    let loaded = 0

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) {
        console.warn(`⚠️ Skipping ingredient without identifier:`, ingredient)
        continue
      }

      try {
        if (skipExisting) {
          const cacheKey = `tn:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.notes) {
            loaded++
            if (onProgress) {
              onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (already cached)` })
            }
            continue
          }
        }

        if (this.debug) console.log(`📥 Downloading TN for ${bookId}...`)
        await this.loadContent(resourceKey, bookId)

        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Downloaded ${bookId}` })
        }
      } catch (error) {
        if (this.debug) console.warn(`⚠️ Failed to download TN for ${bookId}:`, error)
        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in repo)` })
        }
      }
    }

    await this.markComplete(resourceKey, ingredients.length, 'individual')
    if (this.debug) console.log(`✅ [TranslationNotesLoader] Download complete for ${resourceKey}`)
  }

  /**
   * Download all books via a single zipball fetch, then extract and cache each TSV.
   */
  private async downloadViaZip(
    resourceKey: string,
    metadata: ResourceMetadata,
    ingredients: any[],
    skipExisting: boolean,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const [owner, language, resourceId] = resourceKey.split('/')
    const repoName = `${language}_${resourceId}`
    const ref = (metadata as any).release?.tag_name || 'master'

    console.log(`📦 [TN] Downloading zipball for ${resourceKey} (ref: ${ref})`)
    if (onProgress) {
      onProgress({
        loaded: 0,
        total: ingredients.length,
        percentage: 0,
        message: 'Downloading zip',
      })
    }
    const zipBuffer = await this.door43Client.downloadZipball(
      owner,
      repoName,
      ref,
      onProgress
        ? (p) => {
            onProgress({
              loaded: 0,
              total: ingredients.length,
              percentage: p.percentage,
              message: 'Downloading zip',
            })
          }
        : undefined
    )
    console.log(`✅ [TN] Zipball downloaded: ${(zipBuffer.byteLength / 1024).toFixed(0)} KB`)

    const jszipMod = await import('jszip')
    const JSZip = (jszipMod as unknown as { default?: typeof jszipMod }).default ?? jszipMod
    const zip = await (JSZip as any).loadAsync(zipBuffer)

    const total = ingredients.length
    let loaded = 0

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) { loaded++; continue }

      try {
        const cacheKey = `tn:${resourceKey}:${bookId}`

        if (skipExisting) {
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.notes) {
            loaded++
            if (onProgress) {
              onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (already cached)` })
            }
            continue
          }
        }

        const normalizedPath = (ingredient.path || '').replace(/^\.\//, '')
        let zipFile: any = null
        for (const [fileName, file] of Object.entries(zip.files) as [string, any][]) {
          if (fileName.endsWith(normalizedPath) && !file.dir) {
            zipFile = file
            break
          }
        }

        if (!zipFile) {
          if (this.debug) console.warn(`⚠️ [TN] ${bookId} not found in ZIP`)
          loaded++
          if (onProgress) {
            onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in repo)` })
          }
          continue
        }

        const tsv = await zipFile.async('string')
        const processed = await this.processor.processNotes(tsv, bookId, bookId)
        await this.cacheAdapter.set(cacheKey, processed)

        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Processed ${bookId}` })
        }
      } catch (error) {
        if (this.debug) console.warn(`⚠️ [TN] Failed to process ${bookId} from ZIP:`, error)
        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Failed: ${bookId}` })
        }
      }
    }

    console.log(`✅ [TN] ZIP extraction complete for ${resourceKey}`)
  }

  private async markComplete(resourceKey: string, entryCount: number, method: string): Promise<void> {
    const resourceCacheKey = `resource:${resourceKey}`
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: true },
      metadata: {
        downloadComplete: true,
        downloadCompletedAt: new Date().toISOString(),
        downloadMethod: method,
        entryCount,
        expectedEntryCount: entryCount
      }
    })
  }
}
