/**
 * Scripture Loader
 *
 * Loads scripture content (USFM files) from cache or Door43 API.
 * Processes USFM into structured scripture data using usfm-processor.
 */

import { USFMProcessor } from '@bt-synergy/usfm-processor'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ResourceLoader, ProgressCallback } from '@bt-synergy/resource-types'

/**
 * Find the file path for a book from resource ingredients
 */
function getBookPath(metadata: ResourceMetadata, bookId: string): string | null {
  const ingredients = metadata.contentMetadata?.ingredients
  if (!ingredients || !Array.isArray(ingredients)) {
    return null
  }

  const bookIdLower = bookId.toLowerCase()
  const ingredient = ingredients.find(
    (ing: any) => ing.identifier?.toLowerCase() === bookIdLower
  )

  return ingredient?.path || null
}

export class ScriptureLoader implements ResourceLoader {
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean
  private usfmProcessor: USFMProcessor

  constructor(config: any) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug || false
    this.usfmProcessor = new USFMProcessor()
  }

  get resourceType(): string {
    return 'scripture'
  }

  canHandle(metadata: ResourceMetadata): boolean {
    const subjects = ['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament']
    return subjects.includes(metadata.subject)
  }

  async loadContent(resourceKey: string, bookId: string): Promise<unknown> {
    const cacheKey = `scripture:${resourceKey}:${bookId}`

    try {
      const cached = await this.cacheAdapter.get(cacheKey)
      if (cached) {
        if (this.debug) {
          console.log(`Cache hit for ${cacheKey}`)
        }

        // Check if cached content is ProcessedScripture or old raw format
        const content = cached.content
        if (content && content.metadata && content.chapters) {
          // New format - return as is
          if (this.debug) {
            console.log('✅ Cached content is ProcessedScripture format')
          }
          return content
        } else if (content && content.usfm) {
          // Old format - needs reprocessing
          if (this.debug) {
            console.log('⚠️ Cached content is old raw USFM format, reprocessing...')
          }
          const processedScripture = await this.usfmProcessor.processUSFM(
            content.usfm,
            bookId,
            bookId.toUpperCase(),
            {
              includeAlignments: true,
              includeWordTokens: true,
              includeParagraphs: true
            }
          )

          // Update cache with new format
          await this.cacheAdapter.set(cacheKey, {
            content: processedScripture,
            timestamp: Date.now(),
            resourceKey,
            bookId,
          })

          return processedScripture
        } else {
          // Invalid format - delete and refetch
          if (this.debug) {
            console.warn('⚠️ Invalid cached content format, deleting and refetching')
          }
          await this.cacheAdapter.delete(cacheKey)
          // Continue to fetch below
        }
      }
    } catch (err) {
      console.warn('[ScriptureLoader] Cache error:', err)
    }

    if (this.debug) {
      console.log(`Cache miss, fetching ${resourceKey}/${bookId} from Door43...`)
    }

    try {
      // Get resource metadata to access ingredients
      const metadata = await this.getMetadata(resourceKey)
      if (!metadata) {
        throw new Error(`Resource metadata not found for ${resourceKey}`)
      }

      // Get the file path from ingredients
      const bookPath = getBookPath(metadata, bookId)
      if (!bookPath) {
        throw new Error(`Book "${bookId}" not found in resource ingredients for ${resourceKey}`)
      }

      // Resource key format: owner/language/resourceId
      // Examples:
      //   - unfoldingWord/en/ult
      //   - es-419_gl/es-419/glt
      const parts = resourceKey.split('/')
      if (parts.length !== 3) {
        throw new Error(`Invalid resourceKey format: ${resourceKey} (expected owner/language/resourceId)`)
      }

      const owner = parts[0]
      const language = parts[1]
      const resourceId = parts[2]

      // Door43 repository names follow the pattern: language_resourceId
      // e.g., 'en_ult', 'es-419_glt', etc.
      const repoName = `${language}_${resourceId}`

      if (this.debug) {
        console.log('🔍 Step 1: Looking for repository', { owner, repoName, bookPath })
      }

      const repo = await this.door43Client.findRepository(owner, repoName, 'prod')

      if (this.debug) {
        console.log('🔍 Step 2: Repository response', {
          found: !!repo,
          hasRelease: !!repo?.release,
          releaseTag: repo?.release?.tag_name,
          defaultBranch: repo?.default_branch,
          repoKeys: repo ? Object.keys(repo).slice(0, 10) : []
        })
      }

      if (!repo) {
        throw new Error(`Repository not found for ${owner}/${repoName}`)
      }

      const ref = repo.release?.tag_name || repo.default_branch || 'master'

      if (this.debug) {
        console.log('🔍 Step 3: Will fetch file', {
          owner,
          repoName,
          bookPath,
          ref,
          expectedUrl: `https://git.door43.org/${owner}/${repoName}/raw/${ref.startsWith('v') ? 'tag' : 'branch'}/${ref}/${bookPath}`
        })
      }

      const usfmContent = await this.door43Client.fetchTextContent(owner, repoName, bookPath, ref)

      if (this.debug) {
        console.log('🔍 Step 4: Fetched USFM content', {
          contentLength: usfmContent.length,
          preview: usfmContent.substring(0, 100)
        })
      }

      // Process USFM into ProcessedScripture format
      if (this.debug) {
        console.log('🔍 Step 5: Processing USFM with USFMProcessor')
      }

      const processedScripture = await this.usfmProcessor.processUSFM(
        usfmContent,
        bookId,
        bookId.toUpperCase(), // bookName - use uppercase bookId as fallback
        {
          includeAlignments: true,
          includeWordTokens: true,
          includeParagraphs: true
        }
      )

      if (this.debug) {
        console.log('🔍 Step 6: Processed scripture', {
          hasMetadata: !!processedScripture.metadata,
          hasChapters: !!processedScripture.chapters,
          chaptersCount: processedScripture.chapters?.length,
          versesCount: processedScripture.metadata?.totalVerses
        })
      }

      try {
        await this.cacheAdapter.set(cacheKey, {
          content: processedScripture,
          timestamp: Date.now(),
          resourceKey,
          bookId,
        })

        if (this.debug) {
          console.log(`Cached ${cacheKey}`)
        }
      } catch (err) {
        console.warn('[ScriptureLoader] Failed to cache:', err)
      }

      return processedScripture
    } catch (err) {
      if (this.debug) {
        console.error(`Failed to load ${resourceKey}/${bookId}`)
        console.error('Error details:', err)
        if (err instanceof Error) {
          console.error('Error message:', err.message)
          console.error('Error stack:', err.stack)
        }
        try {
          console.error('Error JSON:', JSON.stringify(err, null, 2))
        } catch (jsonErr) {
          console.error('Could not stringify error')
        }
      }

      const errorMsg = err instanceof Error ? err.message : String(err)
      throw new Error(`Scripture content not available for ${resourceKey}/${bookId}: ${errorMsg}`)
    }
  }

  async getMetadata(resourceKey: string): Promise<ResourceMetadata> {
    if (this.catalogAdapter) {
      return await this.catalogAdapter.get(resourceKey)
    }
    throw new Error('Catalog adapter not configured')
  }

  async isOfflineAvailable(resourceKey: string): Promise<boolean> {
    try {
      const metadata = await this.getMetadata(resourceKey)
      return !!metadata
    } catch {
      return false
    }
  }

  async clearCache(resourceKey: string): Promise<void> {
    console.warn('[ScriptureLoader] clearCache not implemented')
  }

  /**
   * Download entire scripture resource (all books) for offline use
   * 
   * @param resourceKey - Resource identifier (e.g., "unfoldingWord/en/ult")
   * @param options - Download options
   * @param onProgress - Progress callback
   */
  async downloadResource(
    resourceKey: string,
    options?: {
      method?: 'individual' | 'zip' | 'tar'
      skipExisting?: boolean
    },
    onProgress?: ProgressCallback
  ): Promise<void> {
    const method = options?.method || 'zip' // Default to zip for better performance
    const skipExisting = options?.skipExisting ?? true

    console.log(`📦 [ScriptureLoader] Starting download for ${resourceKey}`)
    console.log(`📦 Method: ${method}, Skip existing: ${skipExisting}`)

    // Get resource metadata to access ingredients (book list)
    const metadata = await this.getMetadata(resourceKey)
    if (!metadata) {
      throw new Error(`Resource metadata not found for ${resourceKey}`)
    }

    const ingredients = metadata.contentMetadata?.ingredients
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error(`No ingredients found for ${resourceKey}`)
    }

    console.log(`📦 Found ${ingredients.length} books to download`)

    // Download using the appropriate method
    if (method === 'zip') {
      // Try ZIP first, fallback to individual if ZIP fails
      try {
        await this.downloadViaZip(resourceKey, metadata, ingredients, skipExisting, onProgress)
      } catch (zipError) {
        console.warn(`⚠️ ZIP download failed, falling back to individual downloads:`, zipError)
        await this.downloadIndividual(resourceKey, metadata, ingredients, skipExisting, onProgress)
      }
    } else if (method === 'individual') {
      await this.downloadIndividual(resourceKey, metadata, ingredients, skipExisting, onProgress)
    } else {
      throw new Error(`Download method '${method}' not yet implemented. Use 'zip' or 'individual'.`)
    }

    // Mark resource as fully downloaded
    const resourceCacheKey = `resource:${resourceKey}`
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: true },
      metadata: {
        downloadComplete: true,
        downloadCompletedAt: new Date().toISOString(),
        downloadMethod: method,
        entryCount: ingredients.length,
        expectedEntryCount: ingredients.length
      }
    })

    console.log(`✅ [ScriptureLoader] Download complete for ${resourceKey}`)
  }

  /**
   * Download via ZIP (zipball)
   * Downloads entire repository as a single ZIP file and processes all books
   */
  private async downloadViaZip(
    resourceKey: string,
    metadata: ResourceMetadata,
    ingredients: any[],
    skipExisting: boolean,
    onProgress?: ProgressCallback
  ): Promise<void> {
    const zipUrl = metadata.release?.zipball_url
    if (!zipUrl) {
      throw new Error('No zipball URL available in metadata')
    }

    console.log(`📦 Downloading zipball from ${zipUrl}`)

    // Parse resourceKey to get repo info
    const parts = resourceKey.split('/')
    if (parts.length !== 3) {
      throw new Error(`Invalid resourceKey format: ${resourceKey}`)
    }
    const [owner, language, resourceId] = parts
    const repoName = `${language}_${resourceId}`
    const ref = metadata.release?.tag_name || (metadata as any).default_branch || 'master'

    // Use Door43ApiClient's downloadZipball method
    const zipballBuffer = await this.door43Client.downloadZipball(owner, repoName, ref)
    
    console.log(`✅ Downloaded zipball: ${(zipballBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`)

    // Load zip using JSZip
    const jszipMod = await import('jszip')
    const JSZip = (jszipMod as unknown as { default?: typeof jszipMod }).default ?? jszipMod
    const zip = await JSZip.loadAsync(zipballBuffer)

    // Process each book from ingredients
    const total = ingredients.length
    let loaded = 0
    let processed = 0

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) {
        console.warn(`⚠️ Skipping ingredient without identifier:`, ingredient)
        loaded++
        continue
      }

      try {
        // Check if already cached
        if (skipExisting) {
          const cacheKey = `scripture:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.content && cached.content.metadata && cached.content.chapters) {
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

        // Find the book file in ZIP
        const bookPath = ingredient.path
        if (!bookPath) {
          throw new Error(`No path found for book ${bookId}`)
        }

        // ZIP files from Door43 have a root directory like "owner-repo-sha/"
        // We need to find the file that ends with our bookPath
        // bookPath might be like "./08-RUT.usfm" so we normalize it
        const normalizedPath = bookPath.replace(/^\.\//, '') // Remove leading ./
        
        let zipFile: { dir?: boolean; async?(type: string): Promise<unknown> } | null = null
        for (const [fileName, file] of Object.entries(zip.files)) {
          const entry = file as { dir?: boolean }
          // Match if filename ends with the normalized path (handles root folder prefix)
          if (fileName.endsWith(normalizedPath) && !entry.dir) {
            zipFile = file as { dir?: boolean; async?(type: string): Promise<unknown> }
            break
          }
        }

        if (!zipFile) {
          // Book not in repository - this is normal, ingredients may list unavailable books
          if (this.debug) {
            console.warn(`⚠️ ${bookId} not found in ZIP (listed in ingredients but not in repo)`)
          }
          loaded++
          if (onProgress) {
            onProgress({
              loaded,
              total,
              percentage: Math.round((loaded / total) * 100),
              message: `Skipped ${bookId} (not in repo)`
            })
          }
          continue
        }

        // Extract USFM content
        const raw = await (zipFile as { async(type: string): Promise<unknown> }).async('string')
        const usfmContent = raw as string
        
        if (this.debug) {
          console.log(`📖 Processing ${bookId} from ZIP (${usfmContent.length} bytes)`)
        }

        // Process USFM into ProcessedScripture format
        const processedScripture = await this.usfmProcessor.processUSFM(
          usfmContent,
          bookId,
          bookId.toUpperCase(),
          {
            includeAlignments: true,
            includeWordTokens: true,
            includeParagraphs: true
          }
        )

        // Cache the processed scripture
        const cacheKey = `scripture:${resourceKey}:${bookId}`
        await this.cacheAdapter.set(cacheKey, {
          content: processedScripture,
          timestamp: Date.now(),
          resourceKey,
          bookId,
        })

        processed++
        loaded++
        
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Processed ${bookId}`
          })
        }
      } catch (error) {
        console.error(`❌ Failed to process ${bookId} from ZIP:`, error)
        loaded++
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Failed: ${bookId}`
          })
        }
      }
    }

    console.log(`✅ Processed ${processed}/${total} books from zipball`)
  }

  /**
   * Download books individually (one by one)
   */
  private async downloadIndividual(
    resourceKey: string,
    metadata: ResourceMetadata,
    ingredients: any[],
    skipExisting: boolean,
    onProgress?: ProgressCallback
  ): Promise<void> {
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
          const cacheKey = `scripture:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.content && cached.content.metadata && cached.content.chapters) {
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
        console.log(`📥 Downloading ${bookId}...`)
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
        console.error(`❌ Failed to download ${bookId}:`, error)
        // Continue with next book even if one fails
        loaded++
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Failed: ${bookId}`
          })
        }
      }
    }
  }
}
