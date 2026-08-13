/**
 * Scripture Loader
 *
 * Loads scripture content (USFM files) from cache or Door43 API.
 * Sole process + cache path: @bt-synergy/usj-processor → `scripture-usj:` SoT.
 *
 * Primary API: loadScriptureResult() / loadViewModel().
 * ResourceLoader contract: loadContent() → ProcessedScripture projection only.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ProgressCallback, ResourceLoader } from '@bt-synergy/resource-types'
import {
  USJProcessor,
  type ProcessedScripture,
  type UsjScriptureViewModel,
} from '@bt-synergy/usj-processor'

import { processUsfmToUsjResult } from './processUsfm'
import type { ScriptureLoadResult } from './scriptureLoadResult'
import {
  legacyScriptureKey,
  STALE_SCRIPTURE_CACHE_HINT,
  usjScriptureKey,
} from './scriptureCacheKeys'
import type { ScriptureLoaderConfig } from './types'
import { processedFromUsjCache, usjResultFromCache } from './usjCache'

/**
 * Produce a human-readable description from any thrown value, including
 * Door43ApiError plain-objects and class instances that don't extend Error.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message
  }
  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>
    const parts: string[] = []
    if (typeof e['message'] === 'string') parts.push(e['message'])
    if (typeof e['code'] === 'string') parts.push(`code=${e['code']}`)
    if (typeof e['status'] === 'number') parts.push(`status=${e['status']}`)
    if (parts.length > 0) return parts.join(' ')
    try {
      return JSON.stringify(err)
    } catch {
      /* ignore */
    }
  }
  return String(err)
}

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
  /** Lazy: constructed on first USJ process/cache read. */
  private usjProcessor: USJProcessor | null = null

  constructor(config: ScriptureLoaderConfig | any) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug || false
    if (this.debug) {
      console.log('[ScriptureLoader] pipeline=usj (USJ-only; scripture-usj: SoT)')
    }
  }

  /** Always true — USJ is the only process path. */
  get isUsjPipeline(): boolean {
    return true
  }

  private getUsjProcessor(): USJProcessor {
    if (!this.usjProcessor) {
      this.usjProcessor = new USJProcessor()
    }
    return this.usjProcessor
  }

  /**
   * Process USFM and persist to scripture-usj: SoT.
   */
  private async processAndCacheResult(
    usfmText: string,
    resourceKey: string,
    bookId: string
  ): Promise<ScriptureLoadResult> {
    const bookName = bookId.toUpperCase()

    const result = await processUsfmToUsjResult({
      usfmText,
      bookId,
      bookName,
      usjProcessor: this.getUsjProcessor(),
      debug: this.debug,
    })
    const usjKey = usjScriptureKey(resourceKey, bookId)
    try {
      await this.cacheAdapter.set(usjKey, {
        content: result.cacheContent,
        timestamp: Date.now(),
        resourceKey,
        bookId,
      })
      if (this.debug) {
        console.log(`[ScriptureLoader] Cached USJ SoT ${usjKey}`)
      }
    } catch (err) {
      console.warn('[ScriptureLoader] Failed to cache USJ SoT:', err)
    }
    return {
      viewModel: result.viewModel,
      scripture: result.scripture,
      fromUsjCache: false,
    }
  }

  /** Zip download path — persists and returns ProcessedScripture projection. */
  private async processAndCache(
    usfmText: string,
    resourceKey: string,
    bookId: string
  ): Promise<ProcessedScripture> {
    return (await this.processAndCacheResult(usfmText, resourceKey, bookId)).scripture
  }

  /**
   * Read scripture-usj: only. Legacy `scripture:` blobs are never served —
   * on miss we re-process from USFM source (Door43 / zip).
   */
  private async readCachedResult(
    resourceKey: string,
    bookId: string
  ): Promise<{ result: ScriptureLoadResult | null; hadLegacy: boolean }> {
    const usjKey = usjScriptureKey(resourceKey, bookId)
    try {
      const usjCached = await this.cacheAdapter.get(usjKey)
      if (usjCached?.content) {
        const full = usjResultFromCache(
          usjCached.content,
          bookId,
          this.getUsjProcessor()
        )
        if (full) {
          if (this.debug) {
            console.log(`Cache hit (USJ SoT) for ${usjKey}`)
          }
          return {
            result: {
              viewModel: full.viewModel,
              scripture: full.scripture,
              fromUsjCache: true,
            },
            hadLegacy: false,
          }
        }
        console.warn(
          `[ScriptureLoader] Stale/incompatible USJ cache at ${usjKey}; deleting. ${STALE_SCRIPTURE_CACHE_HINT}`
        )
        await this.cacheAdapter.delete(usjKey)
      }
    } catch (err) {
      console.warn('[ScriptureLoader] USJ cache error:', err)
    }

    // Hard-deprecate: never migrate-read legacy scripture: processed blobs.
    const hadLegacy = await this.warnIfLegacyScripturePresent(resourceKey, bookId)
    return { result: null, hadLegacy }
  }

  private async warnIfLegacyScripturePresent(
    resourceKey: string,
    bookId: string
  ): Promise<boolean> {
    const legacyKey = legacyScriptureKey(resourceKey, bookId)
    try {
      const legacy = await this.cacheAdapter.get(legacyKey)
      if (legacy?.content) {
        console.warn(
          `[ScriptureLoader] Ignoring deprecated ${legacyKey} (scripture-usj: only). ${STALE_SCRIPTURE_CACHE_HINT}`
        )
        return true
      }
    } catch {
      /* ignore */
    }
    return false
  }

  /** Offline skip / download: only scripture-usj: with compatible version counts. */
  private async hasUsableCache(resourceKey: string, bookId: string): Promise<boolean> {
    try {
      const usjCached = await this.cacheAdapter.get(usjScriptureKey(resourceKey, bookId))
      if (
        usjCached?.content &&
        processedFromUsjCache(usjCached.content, bookId, this.getUsjProcessor())
      ) {
        return true
      }
    } catch {
      /* ignore */
    }
    return false
  }

  private async fetchUsfmText(resourceKey: string, bookId: string): Promise<string> {
    const metadata = await this.getMetadata(resourceKey)
    if (!metadata) {
      throw new Error(`Resource metadata not found for ${resourceKey}`)
    }

    const bookPath = getBookPath(metadata, bookId)
    if (!bookPath) {
      throw new Error(`Book "${bookId}" not found in resource ingredients for ${resourceKey}`)
    }

    const parts = resourceKey.split('/')
    if (parts.length !== 3) {
      throw new Error(
        `Invalid resourceKey format: ${resourceKey} (expected owner/language/resourceId)`
      )
    }

    const owner = parts[0]
    const language = parts[1]
    const resourceId = parts[2]
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
        repoKeys: repo ? Object.keys(repo).slice(0, 10) : [],
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
        expectedUrl: `https://git.door43.org/${owner}/${repoName}/raw/${ref.startsWith('v') ? 'tag' : 'branch'}/${ref}/${bookPath}`,
      })
    }

    const usfmContent = await this.door43Client.fetchTextContent(
      owner,
      repoName,
      bookPath,
      ref
    )

    if (this.debug) {
      console.log('🔍 Step 4: Fetched USFM content', {
        contentLength: usfmContent.length,
        preview: usfmContent.substring(0, 100),
      })
      console.log('🔍 Step 5: Processing USFM with USJProcessor')
    }

    return usfmContent
  }

  get resourceType(): string {
    return 'scripture'
  }

  canHandle(metadata: ResourceMetadata): boolean {
    const subjects = ['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament']
    return subjects.includes(metadata.subject)
  }

  /**
   * Primary load API: UsjScriptureViewModel + transitional ProcessedScripture.
   * Cache: scripture-usj: only; miss → fetch USFM → process → write scripture-usj:.
   */
  async loadScriptureResult(
    resourceKey: string,
    bookId: string
  ): Promise<ScriptureLoadResult> {
    const { result: fromCache, hadLegacy } = await this.readCachedResult(resourceKey, bookId)
    if (fromCache) return fromCache

    if (this.debug) {
      console.log(`Cache miss (scripture-usj:), fetching ${resourceKey}/${bookId} from Door43...`)
    }

    try {
      const usfmContent = await this.fetchUsfmText(resourceKey, bookId)
      const loaded = await this.processAndCacheResult(usfmContent, resourceKey, bookId)

      if (this.debug) {
        console.log('🔍 Step 6: Processed scripture', {
          hasMetadata: !!loaded.scripture.metadata,
          hasChapters: !!loaded.scripture.chapters,
          chaptersCount: loaded.scripture.chapters?.length,
          versesCount: loaded.scripture.metadata?.totalVerses,
          version: loaded.scripture.metadata?.version,
          fromUsjCache: loaded.fromUsjCache,
          viewModelChapters: loaded.viewModel.chapters.length,
        })
      }

      return loaded
    } catch (err) {
      console.error(`[ScriptureLoader] Failed to load ${resourceKey}/${bookId}:`, describeError(err))
      if (err instanceof Error) {
        console.error('[ScriptureLoader] Stack:', err.stack)
      } else {
        try {
          console.error('[ScriptureLoader] Error value:', JSON.stringify(err, null, 2))
        } catch {
          /* ignore */
        }
      }

      const staleSuffix = hadLegacy ? ` ${STALE_SCRIPTURE_CACHE_HINT}` : ''
      const wrapped = new Error(
        `Scripture content not available for ${resourceKey}/${bookId}: ${describeError(err)}.${staleSuffix}`
      )
      ;(wrapped as Error & { cause?: unknown }).cause = err
      throw wrapped
    }
  }

  /**
   * Primary Viewer API — UsjScriptureViewModel (identity + alignments).
   */
  async loadViewModel(resourceKey: string, bookId: string): Promise<UsjScriptureViewModel> {
    const { viewModel } = await this.loadScriptureResult(resourceKey, bookId)
    return viewModel
  }

  /**
   * ResourceLoader contract — ProcessedScripture projection only.
   * Prefer loadViewModel() / loadScriptureResult() for new code.
   */
  async loadContent(resourceKey: string, bookId: string): Promise<unknown> {
    const { scripture } = await this.loadScriptureResult(resourceKey, bookId)
    return scripture
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
    console.warn(
      `[ScriptureLoader] clearCache not implemented for ${resourceKey}. ${STALE_SCRIPTURE_CACHE_HINT}`
    )
  }

  /**
   * Download entire scripture resource (all books) for offline use.
   * Writes scripture-usj: only; skipExisting checks USJ SoT only.
   */
  async downloadResource(
    resourceKey: string,
    options?: {
      method?: 'individual' | 'zip' | 'tar'
      skipExisting?: boolean
    },
    onProgress?: ProgressCallback
  ): Promise<void> {
    const method = options?.method || 'zip'
    const skipExisting = options?.skipExisting ?? true

    console.log(`📦 [ScriptureLoader] Starting download for ${resourceKey}`)
    console.log(`📦 Method: ${method}, Skip existing: ${skipExisting}`)

    const metadata = await this.getMetadata(resourceKey)
    if (!metadata) {
      throw new Error(`Resource metadata not found for ${resourceKey}`)
    }

    const ingredients = metadata.contentMetadata?.ingredients
    if (!ingredients || !Array.isArray(ingredients) || ingredients.length === 0) {
      throw new Error(`No ingredients found for ${resourceKey}`)
    }

    console.log(`📦 Found ${ingredients.length} books to download`)

    if (method === 'zip') {
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

    const resourceCacheKey = `resource:${resourceKey}`
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: true },
      metadata: {
        downloadComplete: true,
        downloadCompletedAt: new Date().toISOString(),
        downloadMethod: method,
        entryCount: ingredients.length,
        expectedEntryCount: ingredients.length,
      },
    })

    console.log(`✅ [ScriptureLoader] Download complete for ${resourceKey}`)
  }

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

    const parts = resourceKey.split('/')
    if (parts.length !== 3) {
      throw new Error(`Invalid resourceKey format: ${resourceKey}`)
    }
    const [owner, language, resourceId] = parts
    const repoName = `${language}_${resourceId}`
    const ref = metadata.release?.tag_name || (metadata as any).default_branch || 'master'

    if (onProgress) {
      onProgress({
        loaded: 0,
        total: ingredients.length,
        percentage: 0,
        message: 'Downloading zip',
      })
    }

    const zipballBuffer = await this.door43Client.downloadZipball(
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

    console.log(`✅ Downloaded zipball: ${(zipballBuffer.byteLength / (1024 * 1024)).toFixed(2)} MB`)

    const jszipMod = await import('jszip')
    const JSZip = (jszipMod as unknown as { default?: typeof jszipMod }).default ?? jszipMod
    const zip = await JSZip.loadAsync(zipballBuffer)

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
        if (skipExisting && (await this.hasUsableCache(resourceKey, bookId))) {
          console.log(`⏭️ Skipping ${bookId} (already cached in scripture-usj:)`)
          loaded++
          if (onProgress) {
            onProgress({
              loaded,
              total,
              percentage: Math.round((loaded / total) * 100),
              message: `Skipped ${bookId} (already cached)`,
            })
          }
          continue
        }

        // Legacy-only cache must not count as offline-ready
        await this.warnIfLegacyScripturePresent(resourceKey, bookId)

        const bookPath = ingredient.path
        if (!bookPath) {
          throw new Error(`No path found for book ${bookId}`)
        }

        const normalizedPath = bookPath.replace(/^\.\//, '')

        let zipFile: { dir?: boolean; async?(type: string): Promise<unknown> } | null = null
        for (const [fileName, file] of Object.entries(zip.files)) {
          const entry = file as { dir?: boolean }
          if (fileName.endsWith(normalizedPath) && !entry.dir) {
            zipFile = file as { dir?: boolean; async?(type: string): Promise<unknown> }
            break
          }
        }

        if (!zipFile) {
          if (this.debug) {
            console.warn(`⚠️ ${bookId} not found in ZIP (listed in ingredients but not in repo)`)
          }
          loaded++
          if (onProgress) {
            onProgress({
              loaded,
              total,
              percentage: Math.round((loaded / total) * 100),
              message: `Skipped ${bookId} (not in repo)`,
            })
          }
          continue
        }

        const raw = await (zipFile as { async(type: string): Promise<unknown> }).async('string')
        const usfmContent = raw as string

        if (this.debug) {
          console.log(`📖 Processing ${bookId} from ZIP (${usfmContent.length} bytes)`)
        }

        await this.processAndCache(usfmContent, resourceKey, bookId)

        processed++
        loaded++

        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Processed ${bookId}`,
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
            message: `Failed: ${bookId}`,
          })
        }
      }
    }

    console.log(`✅ Processed ${processed}/${total} books from zipball`)
  }

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
        if (skipExisting && (await this.hasUsableCache(resourceKey, bookId))) {
          console.log(`⏭️ Skipping ${bookId} (already cached in scripture-usj:)`)
          loaded++
          if (onProgress) {
            onProgress({
              loaded,
              total,
              percentage: Math.round((loaded / total) * 100),
              message: `Skipped ${bookId} (already cached)`,
            })
          }
          continue
        }

        console.log(`📥 Downloading ${bookId}...`)
        await this.loadScriptureResult(resourceKey, bookId)

        loaded++
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Downloaded ${bookId}`,
          })
        }
      } catch (error) {
        const msg = describeError(error)
        console.error(
          `❌ Failed to download ${bookId}:`,
          msg.includes('scripture-usj') || msg.includes('Stale scripture')
            ? msg
            : `${msg} ${STALE_SCRIPTURE_CACHE_HINT}`
        )
        loaded++
        if (onProgress) {
          onProgress({
            loaded,
            total,
            percentage: Math.round((loaded / total) * 100),
            message: `Failed: ${bookId}`,
          })
        }
      }
    }
  }
}
