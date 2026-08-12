/**
 * Scripture Loader
 *
 * Loads scripture content (USFM files) from cache or Door43 API.
 * Processes USFM into ProcessedScripture via usfm-processor (default) or
 * usj-processor when USE_USJ_PIPELINE / useUsjPipeline is on.
 *
 * P2: When USJ pipeline is on, persistent SoT is `scripture-usj:…` (USJ + AlignmentMap);
 * callers still receive ProcessedScripture only. Flag-off keeps legacy `scripture:…`.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog';
import type { ProgressCallback, ResourceLoader } from '@bt-synergy/resource-types';
import type { ProcessedScripture } from '@bt-synergy/usfm-processor';
import { USFMProcessor } from '@bt-synergy/usfm-processor';
import { USJProcessor } from '@bt-synergy/usj-processor';

import { processUsfmToScripture } from './processUsfm';
import { resolveUseUsjPipeline } from './resolveUseUsjPipeline';
import { legacyScriptureKey, usjScriptureKey } from './scriptureCacheKeys';
import type { ScriptureLoaderConfig } from './types';
import {
  isProcessedScriptureContent,
  isUsjScriptureCacheContent,
  processedFromUsjCache,
} from './usjCache';

/**
 * Produce a human-readable description from any thrown value, including
 * Door43ApiError plain-objects and class instances that don't extend Error.
 */
function describeError(err: unknown): string {
  if (err instanceof Error) {
    return err.message;
  }
  if (err !== null && typeof err === 'object') {
    const e = err as Record<string, unknown>;
    const parts: string[] = [];
    if (typeof e['message'] === 'string') parts.push(e['message']);
    if (typeof e['code'] === 'string') parts.push(`code=${e['code']}`);
    if (typeof e['status'] === 'number') parts.push(`status=${e['status']}`);
    if (parts.length > 0) return parts.join(' ');
    try { return JSON.stringify(err); } catch { /* ignore */ }
  }
  return String(err);
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
  private useUsjPipeline: boolean
  private usfmProcessor: USFMProcessor
  private usjProcessor: USJProcessor

  constructor(config: ScriptureLoaderConfig | any) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug || false
    this.useUsjPipeline = resolveUseUsjPipeline(config.useUsjPipeline)
    this.usfmProcessor = new USFMProcessor()
    this.usjProcessor = new USJProcessor()
    if (this.debug) {
      console.log(
        `[ScriptureLoader] pipeline=${this.useUsjPipeline ? 'usj' : 'usfm'} ` +
          `(USE_USJ_PIPELINE default off)`
      )
    }
  }

  /** Whether this loader instance uses the USJ processor path. */
  get isUsjPipeline(): boolean {
    return this.useUsjPipeline
  }

  private async processUsfm(
    usfmText: string,
    bookId: string
  ): Promise<ProcessedScripture> {
    return processUsfmToScripture({
      usfmText,
      bookId,
      bookName: bookId.toUpperCase(),
      useUsjPipeline: this.useUsjPipeline,
      usfmProcessor: this.usfmProcessor,
      usjProcessor: this.usjProcessor,
      debug: this.debug,
    })
  }

  /**
   * Process USFM and persist to the active cache namespace.
   * Flag on → scripture-usj SoT (+ migrate write); flag off → legacy scripture:.
   */
  private async processAndCache(
    usfmText: string,
    resourceKey: string,
    bookId: string
  ): Promise<ProcessedScripture> {
    if (this.useUsjPipeline) {
      const result = await this.usjProcessor.processUSFM(
        usfmText,
        bookId,
        bookId.toUpperCase()
      )
      const usjContent = this.usjProcessor.toUsjCacheContent(
        result,
        bookId,
        bookId.toUpperCase()
      )
      const usjKey = usjScriptureKey(resourceKey, bookId)
      try {
        await this.cacheAdapter.set(usjKey, {
          content: usjContent,
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
      return result.scripture
    }

    const processedScripture = await this.processUsfm(usfmText, bookId)
    const cacheKey = legacyScriptureKey(resourceKey, bookId)
    try {
      await this.cacheAdapter.set(cacheKey, {
        content: processedScripture,
        timestamp: Date.now(),
        resourceKey,
        bookId,
      })
      if (this.debug) {
        console.log(`[ScriptureLoader] Cached ${cacheKey}`)
      }
    } catch (err) {
      console.warn('[ScriptureLoader] Failed to cache:', err)
    }
    return processedScripture
  }

  private async readCachedScripture(
    resourceKey: string,
    bookId: string
  ): Promise<ProcessedScripture | null> {
    if (this.useUsjPipeline) {
      const usjKey = usjScriptureKey(resourceKey, bookId)
      try {
        const usjCached = await this.cacheAdapter.get(usjKey)
        if (usjCached?.content) {
          const adapted = processedFromUsjCache(
            usjCached.content,
            bookId,
            this.usjProcessor
          )
          if (adapted) {
            if (this.debug) {
              console.log(`Cache hit (USJ SoT) for ${usjKey}`)
            }
            return adapted
          }
          if (isUsjScriptureCacheContent(usjCached.content)) {
            if (this.debug) {
              console.warn(
                `[ScriptureLoader] Refusing mismatched USJ cache version at ${usjKey}; will reprocess`
              )
            }
            await this.cacheAdapter.delete(usjKey)
          }
        }
      } catch (err) {
        console.warn('[ScriptureLoader] USJ cache error:', err)
      }

      // Dual-read: legacy ProcessedScripture still opens (migrate on next USFM fetch)
      const legacyKey = legacyScriptureKey(resourceKey, bookId)
      try {
        const legacy = await this.cacheAdapter.get(legacyKey)
        if (legacy?.content && isProcessedScriptureContent(legacy.content)) {
          if (this.debug) {
            console.log(
              `Cache hit (legacy scripture) for ${legacyKey} — serving; USJ migrate on re-fetch`
            )
          }
          return legacy.content
        }
      } catch (err) {
        console.warn('[ScriptureLoader] Legacy cache error:', err)
      }
      return null
    }

    // Flag off — legacy only
    const cacheKey = legacyScriptureKey(resourceKey, bookId)
    try {
      const cached = await this.cacheAdapter.get(cacheKey)
      if (!cached) return null
      const content = cached.content
      if (isProcessedScriptureContent(content)) {
        if (this.debug) {
          console.log(`Cache hit for ${cacheKey}`)
        }
        return content
      }
      if (content && (content as { usfm?: string }).usfm) {
        if (this.debug) {
          console.log('⚠️ Cached content is old raw USFM format, reprocessing...')
        }
        return this.processAndCache((content as { usfm: string }).usfm, resourceKey, bookId)
      }
      if (this.debug) {
        console.warn('⚠️ Invalid cached content format, deleting and refetching')
      }
      await this.cacheAdapter.delete(cacheKey)
    } catch (err) {
      console.warn('[ScriptureLoader] Cache error:', err)
    }
    return null
  }

  private async hasUsableCache(resourceKey: string, bookId: string): Promise<boolean> {
    if (this.useUsjPipeline) {
      try {
        const usjCached = await this.cacheAdapter.get(usjScriptureKey(resourceKey, bookId))
        if (
          usjCached?.content &&
          processedFromUsjCache(usjCached.content, bookId, this.usjProcessor)
        ) {
          return true
        }
      } catch { /* ignore */ }
    }
    try {
      const legacy = await this.cacheAdapter.get(legacyScriptureKey(resourceKey, bookId))
      return Boolean(legacy?.content && isProcessedScriptureContent(legacy.content))
    } catch {
      return false
    }
  }

  get resourceType(): string {
    return 'scripture'
  }

  canHandle(metadata: ResourceMetadata): boolean {
    const subjects = ['Bible', 'Aligned Bible', 'Greek New Testament', 'Hebrew Old Testament']
    return subjects.includes(metadata.subject)
  }

  async loadContent(resourceKey: string, bookId: string): Promise<unknown> {
    const fromCache = await this.readCachedScripture(resourceKey, bookId)
    if (fromCache) return fromCache

    if (this.debug) {
      console.log(`Cache miss, fetching ${resourceKey}/${bookId} from Door43...`)
    }

    try {
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
        throw new Error(`Invalid resourceKey format: ${resourceKey} (expected owner/language/resourceId)`)
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
        console.log(
          `🔍 Step 5: Processing USFM with ${this.useUsjPipeline ? 'USJProcessor' : 'USFMProcessor'}`
        )
      }

      const processedScripture = await this.processAndCache(usfmContent, resourceKey, bookId)

      if (this.debug) {
        console.log('🔍 Step 6: Processed scripture', {
          hasMetadata: !!processedScripture.metadata,
          hasChapters: !!processedScripture.chapters,
          chaptersCount: processedScripture.chapters?.length,
          versesCount: processedScripture.metadata?.totalVerses,
          version: processedScripture.metadata?.version,
        })
      }

      return processedScripture
    } catch (err) {
      console.error(`[ScriptureLoader] Failed to load ${resourceKey}/${bookId}:`, describeError(err))
      if (err instanceof Error) {
        console.error('[ScriptureLoader] Stack:', err.stack)
      } else {
        try { console.error('[ScriptureLoader] Error value:', JSON.stringify(err, null, 2)) } catch { /* ignore */ }
      }

      const wrapped = new Error(
        `Scripture content not available for ${resourceKey}/${bookId}: ${describeError(err)}`
      );
      (wrapped as any).cause = err
      throw wrapped
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
        expectedEntryCount: ingredients.length
      }
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

    const zipballBuffer = await this.door43Client.downloadZipball(owner, repoName, ref)
    
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
              message: `Skipped ${bookId} (not in repo)`
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
