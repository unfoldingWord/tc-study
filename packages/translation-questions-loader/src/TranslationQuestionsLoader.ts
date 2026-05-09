/**
 * TranslationQuestionsLoader - Loads Translation Questions resources
 * Implements ResourceLoader interface for plugin architecture
 * 
 * Translation Questions provide comprehension questions and answers for
 * specific Bible passages, helping translators verify understanding.
 */

import type {
    ProgressCallback,
    ResourceLoader,
    ResourceMetadata
} from '@bt-synergy/catalog-manager'
import { Door43ServerAdapter, ResourceType } from '@bt-synergy/resource-catalog'
import type { ProcessedQuestions } from '@bt-synergy/resource-parsers'
import { QuestionsProcessor } from '@bt-synergy/resource-parsers'
import type {
    TranslationQuestionsLoaderConfig
} from './types'

export class TranslationQuestionsLoader implements ResourceLoader {
  readonly resourceType: string = 'questions'
  
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean
  private serverAdapter: Door43ServerAdapter
  private processor: QuestionsProcessor

  constructor(config: TranslationQuestionsLoaderConfig) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug ?? false
    this.serverAdapter = new Door43ServerAdapter()
    this.processor = new QuestionsProcessor()
  }

  /**
   * Check if this loader can handle a resource
   */
  canHandle(metadata: ResourceMetadata): boolean {
    return (
      metadata.type === 'questions' ||
      metadata.type === 'obs-questions' ||
      metadata.subject === 'TSV Translation Questions' ||
      metadata.subject === 'TSV OBS Translation Questions' ||
      metadata.subject === 'OBS Translation Questions' ||
      metadata.resourceId === 'tq' ||
      metadata.resourceId === 'obs-tq'
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
        type: ResourceType.QUESTIONS,
        format: 'tsv' as any,
        contentType: 'text/tsv',
        contentStructure: 'book',
        subject: 'TSV Translation Questions',
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
   * Load Translation Questions content for a specific book
   */
  async loadContent(resourceKey: string, bookCode: string): Promise<ProcessedQuestions> {
    // Use consistent cache key format
    const cacheKey = `tq:${resourceKey}:${bookCode}`

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
      // doesn't cover that book (e.g. scripture TQ asked for 'obs').
      // Return empty immediately rather than making a request that would 404.
      const ingredients: any[] = (metadata as any).contentMetadata?.ingredients || []
      if (ingredients.length > 0) {
        const hasIngredient = ingredients.some(
          (ing: any) => (ing.identifier || '').toLowerCase() === bookCode.toLowerCase()
        )
        if (!hasIngredient) {
          return {
            bookCode, bookName: bookCode, questions: [], questionsByChapter: {},
            metadata: {
              bookCode, bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalQuestions: 0, chaptersWithQuestions: [],
              statistics: { totalQuestions: 0, questionsPerChapter: {} }
            }
          }
        }
      }

      const tsvUrl = this.buildRawTsvUrl(metadata, bookCode, ref, 'tq')

      if (this.debug) {
        console.log(`📥 Fetching TQ TSV from: ${tsvUrl}`)
      }

      const response = await fetch(tsvUrl)
      if (!response.ok) {
        if (response.status === 404) {
          if (this.debug) console.log(`⚠️ TQ file not found (book not in repo): ${bookCode}`)
          // Do NOT cache 404s — the background download may still be in progress.
          return {
            bookCode, bookName: bookCode, questions: [], questionsByChapter: {},
            metadata: {
              bookCode, bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalQuestions: 0, chaptersWithQuestions: [],
              statistics: { totalQuestions: 0, questionsPerChapter: {} }
            }
          }
        }
        throw new Error(`Failed to fetch TQ TSV: ${response.statusText}`)
      }

      const tsvContent = await response.text()
      const processed = await this.processor.processQuestions(tsvContent, bookCode, bookCode)
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
   * Download entire Translation Questions resource (all books).
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

    console.log(`📦 [TranslationQuestionsLoader] Starting download for ${resourceKey} (method: ${method})`)

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
        console.warn(`⚠️ [TQ] ZIP download failed, falling back to per-book fetch:`, zipError)
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
          const cacheKey = `tq:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.questions) {
            loaded++
            if (onProgress) {
              onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (already cached)` })
            }
            continue
          }
        }

        if (this.debug) console.log(`📥 Downloading TQ for ${bookId}...`)
        await this.loadContent(resourceKey, bookId)

        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Downloaded ${bookId}` })
        }
      } catch (error) {
        if (this.debug) console.warn(`⚠️ Failed to download TQ for ${bookId}:`, error)
        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in repo)` })
        }
      }
    }

    await this.markComplete(resourceKey, ingredients.length, 'individual')
    if (this.debug) console.log(`✅ [TranslationQuestionsLoader] Download complete for ${resourceKey}`)
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

    console.log(`📦 [TQ] Downloading zipball for ${resourceKey} (ref: ${ref})`)
    const zipBuffer = await this.door43Client.downloadZipball(owner, repoName, ref)
    console.log(`✅ [TQ] Zipball downloaded: ${(zipBuffer.byteLength / 1024).toFixed(0)} KB`)

    const jszipMod = await import('jszip')
    const JSZip = (jszipMod as unknown as { default?: typeof jszipMod }).default ?? jszipMod
    const zip = await (JSZip as any).loadAsync(zipBuffer)

    const total = ingredients.length
    let loaded = 0

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) { loaded++; continue }

      try {
        const cacheKey = `tq:${resourceKey}:${bookId}`

        if (skipExisting) {
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.questions) {
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
          if (this.debug) console.warn(`⚠️ [TQ] ${bookId} not found in ZIP`)
          loaded++
          if (onProgress) {
            onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in repo)` })
          }
          continue
        }

        const tsv = await zipFile.async('string')
        const processed = await this.processor.processQuestions(tsv, bookId, bookId)
        await this.cacheAdapter.set(cacheKey, processed)

        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Processed ${bookId}` })
        }
      } catch (error) {
        if (this.debug) console.warn(`⚠️ [TQ] Failed to process ${bookId} from ZIP:`, error)
        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Failed: ${bookId}` })
        }
      }
    }

    console.log(`✅ [TQ] ZIP extraction complete for ${resourceKey}`)
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
