/**
 * TranslationWordsLinksLoader - Loads Translation Words Links resources
 * Implements ResourceLoader interface for plugin architecture
 */

import type {
    ProgressCallback,
    ResourceLoader,
    ResourceMetadata
} from '@bt-synergy/catalog-manager'
import {
    ABSENT_FROM_RELEASE_KEY,
    Door43ServerAdapter,
    ResourceType,
    buildIngestReceiptFromCatalog,
    chooseIngredientFetchMode,
    fetchReleasePathSet,
    helpsIngestSchema,
    ingredientPresentInPathSet,
    normalizeIngredientPath,
    partitionIngredientsByReleasePaths,
    pathSetFromZipFileNames,
    persistAbsentFromRelease,
    presentIngredientCount,
    readAbsentFromRelease,
} from '@bt-synergy/resource-catalog'
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
      metadata.type === 'obs-words-links' ||
      metadata.subject === 'TSV Translation Words Links' ||
      metadata.subject === 'TSV OBS Translation Words Links' ||
      metadata.subject === 'OBS Translation Words Links' ||
      metadata.resourceId === 'twl' ||
      metadata.resourceId === 'obs-twl'
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

    console.warn(`[TWL] loadContent called: ${cacheKey}`)

    try {
      // Try cache first
      const cached = await this.cacheAdapter.get(cacheKey)
      console.warn(`[TWL] cache result for ${cacheKey}:`, cached ? `links=${cached.links?.length ?? 'undefined'}` : 'null/undefined')
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
          console.warn(`[TWL] Cache hit with empty links for ${cacheKey} — deleting stale entry and re-fetching`)
          await this.cacheAdapter.delete(cacheKey)
          // Fall through to fetch fresh data
        }
      }

      // Get metadata to retrieve the release info and ingredient paths
      const metadata = await this.getMetadata(resourceKey)
      
      const ref = (metadata as any).release?.tag_name
      if (!ref) {
        throw new Error(`Resource ${resourceKey} has no release tag.`)
      }

      // If the resource has ingredients but none match this book, it simply
      // doesn't cover that book (e.g. scripture TWL asked for 'obs').
      // Return empty immediately rather than making a request that would 404.
      const ingredients: any[] = (metadata as any).contentMetadata?.ingredients || []
      if (ingredients.length > 0) {
        const hasIngredient = ingredients.some(
          (ing: any) => (ing.identifier || '').toLowerCase() === bookCode.toLowerCase()
        )
        if (!hasIngredient) {
          return {
            bookCode, bookName: bookCode, links: [], linksByChapter: {},
            metadata: {
              bookCode, bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalLinks: 0, chaptersWithLinks: [],
              statistics: { totalLinks: 0, linksPerChapter: {} }
            }
          }
        }
      }

      // Derive the correct raw-file URL. Door43 repos are not always named
      // "${language}_${resourceId}" — e.g. es-419_gl OBS TWL repos use the
      // gateway-language prefix in the repo name even when language="en".
      // Use release.zipball_url to extract the actual owner/repo, then find
      // the ingredient path for this book to get the correct filename.
      const tsvUrl = this.buildRawTsvUrl(metadata, bookCode, ref, 'twl')

      if (this.debug) {
        console.log(`📥 Fetching TWL TSV from: ${tsvUrl}`)
      }

      const response = await fetch(tsvUrl)
      if (!response.ok) {
        if (response.status === 404) {
          if (this.debug) console.log(`⚠️ TWL file not found (book not in repo): ${bookCode}`)
          // Do NOT cache 404s — the background download may still be in progress.
          return {
            bookCode, bookName: bookCode, links: [], linksByChapter: {},
            metadata: {
              bookCode, bookName: bookCode,
              processingDate: new Date().toISOString(),
              totalLinks: 0, chaptersWithLinks: [],
              statistics: { totalLinks: 0, linksPerChapter: {} }
            }
          }
        }
        throw new Error(`Failed to fetch TWL TSV: ${response.statusText}`)
      }

      const tsvContent = await response.text()
      const processed = await this.processor.processWordsLinks(tsvContent, bookCode, bookCode)
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
   * Build a raw-file URL for a single TSV ingredient.
   * Uses release.zipball_url to determine the actual owner/repo (more reliable than
   * reconstructing "${language}_${resourceId}" which breaks for gateway-language orgs).
   * Falls back to the conventional pattern when zipball_url is absent.
   */
  private buildRawTsvUrl(metadata: ResourceMetadata, bookCode: string, ref: string, prefix: string): string {
    const zipballUrl: string | undefined = (metadata as any).release?.zipball_url
    let owner: string
    let repoName: string

    if (zipballUrl) {
      // zipball_url pattern: https://git.door43.org/{owner}/{repo}/archive/{ref}.zip
      const match = zipballUrl.match(/git\.door43\.org\/([^/]+)\/([^/]+)\/archive\//)
      if (match) {
        owner = match[1]
        repoName = match[2]
      } else {
        const parts = (metadata as any).resourceKey?.split('/') || []
        owner = parts[0] || ''
        repoName = `${parts[1]}_${parts[2]}`
      }
    } else {
      const parts = (metadata as any).resourceKey?.split('/') || []
      owner = parts[0] || ''
      repoName = `${parts[1]}_${parts[2]}`
    }

    // Prefer the ingredient path for the exact filename; fall back to convention.
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
   * Download entire Translation Words Links resource (all books).
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

    console.log(`📦 [TranslationWordsLinksLoader] Starting download for ${resourceKey} (method: ${method})`)

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
    let failedBooks: string[] = []

    if (method === 'zip' && zipUrl) {
      try {
        failedBooks = await this.downloadViaZip(resourceKey, metadata, ingredients, skipExisting, onProgress)
        if (failedBooks.length === 0) {
          await this.markComplete(resourceKey, ingredients.length, 'zip', metadata)
        } else {
          await this.markIncomplete(resourceKey, ingredients.length, failedBooks, 'zip')
        }
        return
      } catch (zipError) {
        console.warn(`⚠️ [TWL] ZIP download failed, falling back to per-book fetch:`, zipError)
      }
    }

    // Per-book fallback
    const total = ingredients.length
    let loaded = 0
    failedBooks = []

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) {
        console.warn(`⚠️ Skipping ingredient without identifier:`, ingredient)
        continue
      }

      try {
        if (skipExisting) {
          const cacheKey = `twl:${resourceKey}:${bookId}`
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.links !== undefined) {
            loaded++
            if (onProgress) {
              onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (already cached)` })
            }
            continue
          }
        }

        if (this.debug) console.log(`📥 Downloading TWL for ${bookId}...`)
        await this.loadContent(resourceKey, bookId)

        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Downloaded ${bookId}` })
        }
      } catch (error) {
        if (this.debug) console.warn(`⚠️ Failed to download TWL for ${bookId}:`, error)
        failedBooks.push(bookId)
        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in repo)` })
        }
      }
    }

    if (failedBooks.length === 0) {
      await this.markComplete(resourceKey, ingredients.length, 'individual', metadata)
      if (this.debug) console.log(`✅ [TranslationWordsLinksLoader] Download complete for ${resourceKey}`)
    } else {
      await this.markIncomplete(resourceKey, ingredients.length, failedBooks, 'individual')
    }
  }

  private async isBookCached(resourceKey: string, bookId: string): Promise<boolean> {
    const cached = await this.cacheAdapter.get(`twl:${resourceKey}:${bookId}`)
    return !!(cached && cached.links !== undefined)
  }

  private async listIncompleteIngredients(
    resourceKey: string,
    ingredients: Array<{ identifier?: string; path?: string }>
  ): Promise<Array<{ identifier?: string; path?: string }>> {
    const incomplete: Array<{ identifier?: string; path?: string }> = []
    for (const ingredient of ingredients) {
      if (!ingredient.identifier) continue
      if (!(await this.isBookCached(resourceKey, ingredient.identifier))) {
        incomplete.push(ingredient)
      }
    }
    return incomplete
  }

  private emitSkippedIngredients(
    ingredients: Array<{ identifier?: string }>,
    onProgress?: ProgressCallback,
    reason: 'already cached' | 'not in release' = 'already cached'
  ): void {
    const total = ingredients.length
    let loaded = 0
    for (const ingredient of ingredients) {
      loaded++
      const bookId = ingredient.identifier ?? 'unknown'
      onProgress?.({
        loaded,
        total,
        percentage: Math.round((loaded / total) * 100),
        message: `Skipped ${bookId} (${reason})`,
      })
    }
  }

  /**
   * Fill only missing books via per-book HTTP (avoid re-downloading a huge zip
   * when most ingredients are already in cache).
   */
  private async fillIncompleteIndividually(
    resourceKey: string,
    incomplete: Array<{ identifier?: string; path?: string }>,
    total: number,
    loadedStart: number,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    let loaded = loadedStart
    const failedBooks: string[] = []
    for (const ingredient of incomplete) {
      const bookId = ingredient.identifier
      if (!bookId) continue
      try {
        await this.loadContent(resourceKey, bookId)
        if (!(await this.isBookCached(resourceKey, bookId))) {
          failedBooks.push(bookId)
          loaded++
          onProgress?.({
            loaded,
            total,
            percentage: Math.round((loaded / Math.max(1, total)) * 100),
            message: `Skipped ${bookId} (not in repo)`,
          })
          continue
        }
        loaded++
        onProgress?.({
          loaded,
          total,
          percentage: Math.round((loaded / Math.max(1, total)) * 100),
          message: `Downloaded ${bookId}`,
        })
      } catch (error) {
        if (this.debug) console.warn(`⚠️ Failed to download TWL for ${bookId}:`, error)
        failedBooks.push(bookId)
        loaded++
        onProgress?.({
          loaded,
          total,
          percentage: Math.round((loaded / Math.max(1, total)) * 100),
          message: `Skipped ${bookId} (not in repo)`,
        })
      }
    }
    return failedBooks
  }

  /**
   * Download all books via a single zipball fetch, then extract and cache each TSV.
   * Uses the same processWordsLinks call as loadContent to ensure byte-identical cached output.
   */
  private async downloadViaZip(
    resourceKey: string,
    metadata: ResourceMetadata,
    ingredients: any[],
    skipExisting: boolean,
    onProgress?: ProgressCallback
  ): Promise<string[]> {
    const ref = (metadata as any).release?.tag_name || 'master'

    // Derive the actual owner/repo from release.zipball_url (same as buildRawTsvUrl).
    // For gateway-language orgs like es-419_gl the repo name differs from the resource key
    // (e.g. es-419_obs-twl vs en_obs-twl), so constructing from the key is wrong.
    const zipballUrl: string | undefined = (metadata as any).release?.zipball_url
    let owner: string
    let repoName: string
    if (zipballUrl) {
      const match = zipballUrl.match(/git\.door43\.org\/([^/]+)\/([^/]+)\/archive\//)
      if (match) {
        owner = match[1]
        repoName = match[2]
      } else {
        const parts = resourceKey.split('/')
        owner = parts[0] || ''
        repoName = `${parts[1]}_${parts[2]}`
      }
    } else {
      const parts = resourceKey.split('/')
      owner = parts[0] || ''
      repoName = `${parts[1]}_${parts[2]}`
    }

    const recordAbsent = async (absentIds: string[]) => {
      await persistAbsentFromRelease({
        cacheAdapter: this.cacheAdapter,
        catalogAdapter: this.catalogAdapter,
        resourceKey,
        metadata,
        absentIds,
        logLabel: 'TWL',
      })
    }

    // Peak written count before zip so UI is not stuck at 0/N while bytes climb.
    let cachedBeforeZip = 0
    if (skipExisting) {
      const incomplete = await this.listIncompleteIngredients(resourceKey, ingredients)
      cachedBeforeZip = Math.max(0, ingredients.length - incomplete.length)
      if (incomplete.length === 0) {
        this.emitSkippedIngredients(ingredients, onProgress)
        return []
      }
      if (cachedBeforeZip > 0) {
        onProgress?.({
          loaded: cachedBeforeZip,
          total: ingredients.length,
          percentage: Math.round((cachedBeforeZip / ingredients.length) * 100),
          message: `Cached ${cachedBeforeZip}`,
        })
      }
      onProgress?.({
        loaded: cachedBeforeZip,
        total: ingredients.length,
        percentage: Math.round((cachedBeforeZip / Math.max(1, ingredients.length)) * 100),
        message: 'Checking release',
      })
      const treePaths = await fetchReleasePathSet(this.door43Client, owner, repoName, ref)
      if (treePaths) {
        const { present, absent } = partitionIngredientsByReleasePaths(incomplete, treePaths)
        if (absent.length > 0) {
          const absentIds = absent
            .map((ing) => ing.identifier)
            .filter((id): id is string => typeof id === 'string')
          await recordAbsent(absentIds)
        }
        const mode = chooseIngredientFetchMode({
          cachedCount: cachedBeforeZip,
          remainingToFetchCount: present.length,
        })
        if (mode === 'skip') {
          this.emitSkippedIngredients(incomplete, onProgress, 'not in release')
          onProgress?.({
            loaded: ingredients.length,
            total: ingredients.length,
            percentage: 100,
            message: `Skipped ${resourceKey.split('/').pop() ?? resourceKey} (already cached)`,
          })
          console.log(
            `⏭️ [TWL] Skipping zip for ${resourceKey}: ${absent.length} incomplete book(s) absent from ${ref}`
          )
          return []
        }
        if (mode === 'individual') {
          console.log(
            `⏭️ [TWL] Partial cache ${cachedBeforeZip}/${ingredients.length} — filling ${present.length} book(s) individually (skip zip)`
          )
          return await this.fillIncompleteIndividually(
            resourceKey,
            present,
            ingredients.length,
            cachedBeforeZip,
            onProgress
          )
        }
      } else {
        const mode = chooseIngredientFetchMode({
          cachedCount: cachedBeforeZip,
          remainingToFetchCount: incomplete.length,
        })
        if (mode === 'individual') {
          console.log(
            `⏭️ [TWL] Partial cache ${cachedBeforeZip}/${ingredients.length} — filling ${incomplete.length} book(s) individually (no tree; skip zip)`
          )
          return await this.fillIncompleteIndividually(
            resourceKey,
            incomplete,
            ingredients.length,
            cachedBeforeZip,
            onProgress
          )
        }
      }
    }

    console.log(`📦 [TWL] Downloading zipball for ${resourceKey} → ${owner}/${repoName} (ref: ${ref})`)
    if (onProgress) {
      onProgress({
        loaded: cachedBeforeZip,
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
        ? (p: { percentage: number }) => {
            onProgress({
              loaded: cachedBeforeZip,
              total: ingredients.length,
              percentage: p.percentage,
              message: 'Downloading zip',
            })
          }
        : undefined
    )
    console.log(`✅ [TWL] Zipball downloaded: ${(zipBuffer.byteLength / 1024).toFixed(0)} KB`)

    const jszipMod = await import('jszip')
    const JSZip = (jszipMod as unknown as { default?: typeof jszipMod }).default ?? jszipMod
    const zip = await (JSZip as any).loadAsync(zipBuffer)
    const zipPaths = pathSetFromZipFileNames(Object.keys(zip.files))

    const total = ingredients.length
    let loaded = 0
    const failedBooks: string[] = []
    const absentBooks: string[] = []

    for (const ingredient of ingredients) {
      const bookId = ingredient.identifier
      if (!bookId) { loaded++; continue }

      try {
        const cacheKey = `twl:${resourceKey}:${bookId}`

        if (skipExisting) {
          const cached = await this.cacheAdapter.get(cacheKey)
          if (cached && cached.links !== undefined) {
            loaded++
            if (onProgress) {
              onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (already cached)` })
            }
            continue
          }
        }

        const normalizedPath = normalizeIngredientPath(ingredient.path)
        if (
          !normalizedPath ||
          !ingredientPresentInPathSet({ path: ingredient.path }, zipPaths)
        ) {
          if (this.debug) console.warn(`⚠️ [TWL] ${bookId} not found in ZIP`)
          absentBooks.push(bookId)
          loaded++
          if (onProgress) {
            onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in release)` })
          }
          continue
        }

        let zipFile: any = null
        for (const [fileName, file] of Object.entries(zip.files) as [string, any][]) {
          if (
            (fileName === normalizedPath ||
              fileName.endsWith('/' + normalizedPath) ||
              fileName.endsWith(normalizedPath)) &&
            !file.dir
          ) {
            zipFile = file
            break
          }
        }

        if (!zipFile) {
          absentBooks.push(bookId)
          loaded++
          if (onProgress) {
            onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Skipped ${bookId} (not in release)` })
          }
          continue
        }

        const tsv = await zipFile.async('string')
        // Use the same processor call as loadContent so cached output is byte-identical
        const processed = await this.processor.processWordsLinks(tsv, bookId, bookId)
        await this.cacheAdapter.set(cacheKey, processed)

        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Processed ${bookId}` })
        }
      } catch (error) {
        if (this.debug) console.warn(`⚠️ [TWL] Failed to process ${bookId} from ZIP:`, error)
        failedBooks.push(bookId)
        loaded++
        if (onProgress) {
          onProgress({ loaded, total, percentage: Math.round((loaded / total) * 100), message: `Failed: ${bookId}` })
        }
      }
    }

    if (absentBooks.length > 0) {
      await recordAbsent(absentBooks)
    }

    console.log(
      `✅ [TWL] ZIP extraction complete for ${resourceKey} (${failedBooks.length} failed, ${absentBooks.length} absent from release)`
    )
    return failedBooks
  }

  private async markComplete(
    resourceKey: string,
    ingredientCount: number,
    method: string,
    metadata?: ResourceMetadata
  ): Promise<void> {
    const resourceCacheKey = `resource:${resourceKey}`
    const prior = await this.cacheAdapter.get(resourceCacheKey)
    const absentFromRelease = readAbsentFromRelease(prior?.metadata)
    const presentCount = presentIngredientCount(ingredientCount, absentFromRelease)
    const receipt = buildIngestReceiptFromCatalog(metadata, {
      ingestSchema: helpsIngestSchema(),
      ingredientCount: presentCount,
      downloadMethod: method,
      entryCount: presentCount,
      expectedEntryCount: presentCount,
    })
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: true },
      metadata: {
        ...(receipt ?? {
          downloadComplete: true,
          downloadCompletedAt: new Date().toISOString(),
          downloadMethod: method,
          entryCount: presentCount,
          expectedEntryCount: presentCount,
        }),
        ...(absentFromRelease.length > 0
          ? { [ABSENT_FROM_RELEASE_KEY]: absentFromRelease }
          : {}),
      },
    })
  }

  private async markIncomplete(
    resourceKey: string,
    expectedEntryCount: number,
    failedBooks: string[],
    method: string
  ): Promise<void> {
    const resourceCacheKey = `resource:${resourceKey}`
    const prior = await this.cacheAdapter.get(resourceCacheKey)
    const priorAbsent = readAbsentFromRelease(prior?.metadata)
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: false, failedBooks },
      metadata: {
        downloadComplete: false,
        downloadMethod: method,
        entryCount: Math.max(0, expectedEntryCount - failedBooks.length),
        expectedEntryCount,
        failedBooks,
        ...(priorAbsent.length > 0
          ? { [ABSENT_FROM_RELEASE_KEY]: priorAbsent }
          : {}),
      }
    })
    console.warn(
      `⚠️ [TranslationWordsLinksLoader] Download incomplete for ${resourceKey}: ${failedBooks.length} book(s) failed`
    )
  }
}
