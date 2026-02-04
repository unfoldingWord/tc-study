/**
 * TranslationAcademyLoader - Loads Translation Academy resources
 * Implements ResourceLoader interface for plugin architecture
 */

import type {
  ProgressCallback,
  ResourceLoader,
  ResourceMetadata
} from '@bt-synergy/catalog-manager'
import { Door43ServerAdapter } from '@bt-synergy/resource-catalog'
import JSZip from 'jszip'
import { generateTAIngredients } from './ingredients-generator'
import type {
  EntryInfo,
  TranslationAcademyArticle,
  TranslationAcademyLoaderConfig
} from './types'

export class TranslationAcademyLoader implements ResourceLoader {
  readonly resourceType = 'ta'
  
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean
  private serverAdapter: Door43ServerAdapter

  constructor(config: TranslationAcademyLoaderConfig) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug ?? false
    this.serverAdapter = new Door43ServerAdapter()

    if (this.debug) {
      console.log('📚 TranslationAcademyLoader initialized with Door43 adapter')
    }
  }

  /**
   * Check if this loader can handle a resource
   */
  canHandle(metadata: ResourceMetadata): boolean {
    return (
      metadata.subject === 'Translation Academy' ||
      metadata.resourceId === 'ta'
    )
  }

  /**
   * Get resource metadata
   */
  async getMetadata(resourceKey: string): Promise<ResourceMetadata> {
    try {
      // Try catalog first - this prevents regenerating ingredients on every entry load
      const catalogMeta = await this.catalogAdapter.get(resourceKey)
      const existingIngredientsCount = catalogMeta?.contentMetadata?.ingredients?.length || 0
      
      // If we have cached metadata with substantial ingredients, return it
      // (substantial = more than just a directory listing from Door43 API)
      if (catalogMeta && existingIngredientsCount > 10) {
        if (this.debug) {
          console.log(`✨ Cache hit in getMetadata: ${resourceKey} (${existingIngredientsCount} ingredients)`)
        }
        return catalogMeta
      }
      
      // If we have cached metadata but with incomplete ingredients, we'll generate and update
      let metadata = catalogMeta
      if (metadata) {
        if (this.debug) {
          console.log(`🔄 Found cached metadata with incomplete ingredients (${existingIngredientsCount}), will generate and update`)
        }
      } else {
        if (this.debug) {
          console.log(`📦 Cache miss in getMetadata: ${resourceKey} - will generate metadata and ingredients`)
        }
      }

      // Parse resourceKey using adapter (expects 3-part format: owner/language/resourceId)
      const { owner, language, resourceId } = this.serverAdapter.parseResourceKey(resourceKey)

      // Fetch from Door43
      // Door43 repository names follow the pattern: language_resourceId
      const repoName = `${language}_${resourceId}`
      const repo = await this.door43Client.findRepository(owner, repoName, 'prod')
      if (!repo) {
        throw new Error(`Resource not found: ${owner}/${repoName}`)
      }

      // Get available entries for contentMetadata
      // Only use release tag - throw if missing (non-released resources will be supported in the future)
      if (!repo.release?.tag_name) {
        throw new Error(
          `Resource ${owner}/${language}/${resourceId} has no release tag. ` +
          `Only released resources are currently supported. ` +
          `Future versions will support non-released resources using commit SHA and last updated timestamp.`
        );
      }
      const ref = repo.release.tag_name
      const entries = await this.getAvailableEntries(owner, language, resourceId, ref)

      // If we have existing metadata, mutate it with new ingredients
      // Otherwise, create new metadata
      if (metadata) {
        // Mutate existing metadata: update ingredients with generated ones
        if (!metadata.contentMetadata) {
          metadata.contentMetadata = {}
        }
        metadata.contentMetadata.ingredients = entries.map(e => ({
          identifier: e.id,
          title: e.title,
          path: e.path,
          categories: [e.category]
        }))
        console.log(`🔄 Updated existing metadata with ${entries.length} generated ingredients`)
      } else {
        // Transform Door43 metadata using adapter (create new metadata)
        metadata = await this.serverAdapter.transformMetadata({
          id: resourceId,
          name: repo.title || 'Translation Academy',
          owner,
          language,
          subject: 'Translation Academy',
          version: repo.release.tag_name, // Already validated above
          content_format: 'markdown',
          flavor: 'x-TranslationAcademy',
          ingredients: entries.map(e => ({
            identifier: e.id,
            title: e.title,
            categories: [e.category]
          })),
          release: repo.release,
          metadata: { description: repo.description }
        })

        // Add entry-specific metadata
        if (metadata.contentMetadata) {
          metadata.contentMetadata.ingredients = entries.map(e => ({
            identifier: e.id,
            title: e.title,
            path: e.path,
            categories: [e.category]
          }))
        }
      }

      // ✅ contentStructure is auto-detected by adapter as 'entry'

      // Save to catalog so we don't regenerate ingredients on every entry load
      try {
        await this.catalogAdapter.set(resourceKey, metadata)
        console.log(`💾 Saved metadata to catalog: ${resourceKey} (${metadata.contentMetadata?.ingredients?.length || 0} ingredients)`)
      } catch (saveError) {
        // Log but don't fail - metadata is still valid even if catalog save fails
        console.warn(`⚠️ Failed to save metadata to catalog: ${saveError}`)
      }

      return metadata
    } catch (error) {
      console.error(`❌ Failed to get metadata for ${resourceKey}:`, error)
      throw error
    }
  }

  /**
   * Load Translation Academy article content
   */
  async loadContent(resourceKey: string, entryId: string): Promise<TranslationAcademyArticle> {
    const cacheKey = `${resourceKey}/${entryId}`

    try {
      // Try cache first
      console.log(`🔍 [TA Cache] Checking cache for: ${cacheKey}`)
      const cached = await this.cacheAdapter.get(cacheKey)
      if (cached) {
        console.log(`✨ [TA Cache] Cache HIT: ${cacheKey}`)
        return this.parseArticle(cached, entryId)
      }
      console.log(`❌ [TA Cache] Cache MISS: ${cacheKey} - fetching from remote`)

      // Get metadata to retrieve the release tag/version
      const metadata = await this.getMetadata(resourceKey)
      
      // Parse resourceKey to get identifiers (expects 3-part format: owner/language/resourceId)
      const { owner, language, resourceId } = this.serverAdapter.parseResourceKey(resourceKey)
      
      // Get release tag from metadata
      let ref = metadata.release?.tag_name
      
      if (!ref) {
        // Fetch fresh repository info from Door43 to get release tag
        const repoName = `${language}_${resourceId}`
        const repo = await this.door43Client.findRepository(owner, repoName, 'prod')
        if (repo?.release?.tag_name) {
          ref = repo.release.tag_name
        } else {
          throw new Error(
            `Resource ${owner}/${language}/${resourceId} has no release tag. ` +
            `Only released resources are currently supported.`
          )
        }
      }

      const content = await this.fetchArticleFromDoor43(owner, language, resourceId, entryId, ref)

      // Cache it
      await this.cacheAdapter.set(cacheKey, content)

      if (this.debug) {
        console.log(`✅ Loaded and cached: ${cacheKey} from ${ref}`)
      }

      return this.parseArticle(content, entryId)
    } catch (error) {
      console.error(`❌ Failed to load content for ${cacheKey}:`, error)
      throw error
    }
  }

  /**
   * Download entire Translation Academy resource
   */
  async downloadResource(
    resourceKey: string,
    options?: { method?: 'individual' | 'zip'; skipExisting?: boolean },
    onProgress?: ProgressCallback
  ): Promise<void> {
    const method = options?.method || 'zip'

    if (method === 'zip') {
      await this.downloadViaZip(resourceKey, onProgress)
    } else {
      await this.downloadIndividual(resourceKey, options?.skipExisting, onProgress)
    }

    // Mark resource as fully downloaded
    const resourceCacheKey = `resource:${resourceKey}`
    await this.cacheAdapter.set(resourceCacheKey, {
      content: { downloaded: true },
      metadata: {
        downloadComplete: true,
        downloadCompletedAt: new Date().toISOString(),
        downloadMethod: method
      }
    })
  }

  /**
   * Fetch article from Door43
   * 
   * TA articles are structured as directories containing three files:
   * - title.md: The article title
   * - sub-title.md: The subtitle/question
   * - 01.md: The main content
   * 
   * This method fetches all three files and combines them into a single markdown string.
   * 
   * @param ref - Git reference (tag, branch, or commit) to use. Defaults to 'master'.
   *              Should match the release tag from the resource metadata.
   */
  private async fetchArticleFromDoor43(
    owner: string,
    language: string,
    resourceId: string,
    entryId: string,
    ref: string = 'master'
  ): Promise<string> {
    // Log incoming parameters for debugging
    console.log(`[fetchArticleFromDoor43] Called with: owner=${owner}, language=${language}, resourceId=${resourceId} (type: ${typeof resourceId}), entryId=${entryId}, ref=${ref}`)
    
    // Validate parameters - check for both undefined value and string "undefined"
    if (!owner || !language || !resourceId || resourceId === 'undefined' || resourceId === undefined || typeof resourceId !== 'string' || resourceId.trim() === '') {
      console.error(`[fetchArticleFromDoor43] Invalid parameters: owner=${owner}, language=${language}, resourceId=${resourceId} (type: ${typeof resourceId})`)
      throw new Error(`Invalid parameters for fetchArticleFromDoor43: owner=${owner}, language=${language}, resourceId=${resourceId} (type: ${typeof resourceId})`)
    }
    
    // Final check - if resourceId is still undefined or invalid, try to extract it from language
    if (!resourceId || resourceId === 'undefined' || resourceId === undefined) {
      console.error(`[fetchArticleFromDoor43] resourceId is invalid: ${resourceId}. Attempting to extract from language: ${language}`)
      if (language && language.includes('_')) {
        const lastUnderscoreIndex = language.lastIndexOf('_')
        if (lastUnderscoreIndex > 0) {
          resourceId = language.substring(lastUnderscoreIndex + 1)
          language = language.substring(0, lastUnderscoreIndex)
          console.log(`[fetchArticleFromDoor43] Extracted: language=${language}, resourceId=${resourceId}`)
        }
      }
    }
    
    // Final validation - throw error if still invalid
    if (!resourceId || resourceId === 'undefined' || resourceId === undefined || typeof resourceId !== 'string') {
      throw new Error(`Invalid resourceId: ${resourceId} (type: ${typeof resourceId}). Cannot construct repo name. owner=${owner}, language=${language}`)
    }
    
    const repoName = `${language}_${resourceId}`
    
    // Validate repoName doesn't contain "undefined"
    if (repoName.includes('undefined')) {
      throw new Error(`Invalid repoName constructed: ${repoName}. owner=${owner}, language=${language}, resourceId=${resourceId}`)
    }
    
    // TA structure: entryId is "translate/figs-metaphor" (directory path)
    // We need to fetch three files from this directory:
    // - translate/figs-metaphor/title.md
    // - translate/figs-metaphor/sub-title.md
    // - translate/figs-metaphor/01.md
    
    const titlePath = `${entryId}/title.md`
    const subtitlePath = `${entryId}/sub-title.md`
    const contentPath = `${entryId}/01.md`
    
    console.log(`📥 fetchArticleFromDoor43: owner=${owner}, repoName=${repoName}, entryId=${entryId}, ref=${ref}`)
    console.log(`   Fetching: ${titlePath}, ${subtitlePath}, ${contentPath}`)

    try {
      // Fetch all three files in parallel
      const [titleContent, subtitleContent, mainContent] = await Promise.all([
        this.door43Client.fetchTextContent(owner, repoName, titlePath, ref).catch(err => {
          console.warn(`⚠️  Failed to fetch ${titlePath}:`, err)
          return '' // Optional file
        }),
        this.door43Client.fetchTextContent(owner, repoName, subtitlePath, ref).catch(err => {
          console.warn(`⚠️  Failed to fetch ${subtitlePath}:`, err)
          return '' // Optional file
        }),
        this.door43Client.fetchTextContent(owner, repoName, contentPath, ref)
      ])

      // Combine into a single markdown document
      // The title and subtitle are typically plain text, not markdown headings
      // We'll format them as markdown headings for consistency
      let combined = ''
      
      if (titleContent.trim()) {
        // Remove any existing # symbols and add single #
        const cleanTitle = titleContent.trim().replace(/^#+\s*/, '')
        combined += `# ${cleanTitle}\n\n`
      }
      
      if (subtitleContent.trim()) {
        // Remove any existing # symbols and add ##
        const cleanSubtitle = subtitleContent.trim().replace(/^#+\s*/, '')
        combined += `## ${cleanSubtitle}\n\n`
      }
      
      if (mainContent.trim()) {
        combined += mainContent.trim()
      }

      return combined
    } catch (error) {
      console.error(`❌ Failed to fetch TA article files for ${entryId}:`, error)
      throw new Error(`Failed to fetch article ${entryId}: ${error}`)
    }
  }

  /**
   * Parse markdown content into TranslationAcademyArticle
   */
  private parseArticle(markdown: string, entryId: string): TranslationAcademyArticle {
    // Extract title
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const title = titleMatch ? titleMatch[1].trim() : entryId.split('/').pop() || entryId

    // Extract question (if present) - often after title
    const questionMatch = markdown.match(/###?\s+This page answers the question:\s*(.+?)$/m)
    const question = questionMatch ? questionMatch[1].trim() : undefined

    // Extract related articles links (see also section)
    const relatedMatch = markdown.match(/###?\s+(?:See|See Also)\s*\n\n([\s\S]*?)(?=\n##|\n###|\n$)/)
    const relatedArticles = relatedMatch 
      ? relatedMatch[1].split('\n').filter(l => l.trim()).map(l => l.replace(/^[*-]\s+/, ''))
      : []

    return {
      id: entryId,
      title,
      content: markdown,
      question,
      relatedArticles: relatedArticles.length > 0 ? relatedArticles : undefined
    }
  }

  /**
   * Get list of available entries by checking TOC file first, then falling back to recursive scan
   * 
   * This method first attempts to load a TOC file (toc.json) from the repository root.
   * If found, it uses the ingredients from the TOC file (which have proper titles).
   * If not found, it falls back to recursively scanning the repository for .md files.
   * 
   * @param ref - Git reference (tag, branch, or commit) to use. Defaults to 'master'.
   *              Should match the release tag from the Door43 catalog API.
   */
  private async getAvailableEntries(
    owner: string,
    language: string,
    resourceId: string,
    ref: string = 'master'
  ): Promise<EntryInfo[]> {
    // Validate and fix resourceId if needed
    let finalLanguage = language
    let finalResourceId = resourceId
    
    if (!finalResourceId || finalResourceId === 'undefined' || finalResourceId === undefined) {
      console.error(`[getAvailableEntries] resourceId is invalid: ${finalResourceId}. Attempting to extract from language: ${finalLanguage}`)
      if (finalLanguage && finalLanguage.includes('_')) {
        const lastUnderscoreIndex = finalLanguage.lastIndexOf('_')
        if (lastUnderscoreIndex > 0) {
          finalResourceId = finalLanguage.substring(lastUnderscoreIndex + 1)
          finalLanguage = finalLanguage.substring(0, lastUnderscoreIndex)
          console.log(`[getAvailableEntries] Extracted: language=${finalLanguage}, resourceId=${finalResourceId}`)
        }
      }
    }
    
    if (!finalResourceId || finalResourceId === 'undefined' || finalResourceId === undefined) {
      throw new Error(`Invalid resourceId in getAvailableEntries: ${finalResourceId}. owner=${owner}, language=${finalLanguage}`)
    }
    
    const repoName = `${finalLanguage}_${finalResourceId}`
    
    // Validate repoName doesn't contain "undefined"
    if (repoName.includes('undefined')) {
      throw new Error(`Invalid repoName in getAvailableEntries: ${repoName}. owner=${owner}, language=${finalLanguage}, resourceId=${finalResourceId}`)
    }
    
    const entries: EntryInfo[] = []

    try {
      // Step 1: Try to load TOC file first
      if (this.debug) {
        console.log(`🔍 Checking for TOC file in ${owner}/${repoName}@${ref}...`)
      }

      try {
        const tocContent = await this.door43Client.fetchTextContent(
          owner,
          repoName,
          'toc.json',
          ref
        )

        if (tocContent) {
          const tocData = JSON.parse(tocContent)
          
          if (tocData.ingredients && Array.isArray(tocData.ingredients)) {
            if (this.debug) {
              console.log(`✅ Found TOC file with ${tocData.ingredients.length} ingredients`)
            }

            // Convert TOC ingredients to EntryInfo format
            for (const ingredient of tocData.ingredients) {
              const entryId = ingredient.identifier || ingredient.path?.replace(/\.md$/, '') || ''
              const path = ingredient.path || `${entryId}.md`
              
              // Extract manual from path or use from ingredient
              const manualMatch = entryId.match(/^([^/]+)/)
              const manual = ingredient.categories?.[0] || (manualMatch ? manualMatch[1] : 'other')
              
              entries.push({
                id: entryId,
                title: ingredient.title || entryId.split('/').pop() || entryId,
                category: manual,
                path
              })
            }

            if (this.debug) {
              console.log(`✅ Loaded ${entries.length} entries from TOC file`)
              const categories = new Set(entries.map(e => e.category))
              console.log(`   Categories: ${Array.from(categories).join(', ')}`)
            }

            return entries
          }
        }
      } catch (tocError) {
        // TOC file not found or invalid - fall through to recursive scan
        if (this.debug) {
          console.log(`ℹ️  TOC file not found, falling back to recursive scan`)
        }
      }

      // Step 2: Generate ingredients using shared generator (uses zipball for release tags, recursive for branches)
      if (this.debug) {
        console.log(`🔍 Generating ingredients for ${owner}/${repoName}@${ref}...`)
      }

      // Use the shared ingredients generator
      // This automatically uses zipball for release tags (fast) or recursive scan for branches
      const result = await generateTAIngredients({
        owner,
        language,
        resourceId,
        ref,
        door43Client: this.door43Client,
        debug: this.debug,
      })

      if (this.debug) {
        console.log(`✅ Generated ${result.ingredients.length} ingredients using ${result.method} method`)
        console.log(`   Processed ${result.fileCount} files`)
      }

      // Convert TAIngredient format to EntryInfo format
      for (const ingredient of result.ingredients) {
        const manual = ingredient.categories?.[0] || 'other'
        
        entries.push({
          id: ingredient.identifier,
          title: ingredient.title,
          category: manual,
          path: ingredient.path,
        })
      }

      if (this.debug) {
        const categories = new Set(entries.map(e => e.category))
        console.log(`   Categories found: ${Array.from(categories).join(', ')}`)
      }
    } catch (error) {
      console.error(`❌ Failed to get available entries for ${owner}/${repoName}:`, error)
      // Return empty array on error rather than throwing, to allow graceful degradation
      return []
    }

    return entries
  }


  /**
   * Download via ZIP
   */
  private async downloadViaZip(resourceKey: string, onProgress?: ProgressCallback): Promise<void> {
    const parts = resourceKey.split('/')
    const [owner, language, resourceId] = parts

    const metadata = await this.getMetadata(resourceKey)
    const zipUrl = metadata.release?.zipball_url

    if (!zipUrl) {
      throw new Error('No zipball URL available, falling back to individual downloads')
    }

    // Download and extract ZIP
    const response = await fetch(zipUrl)
    if (!response.ok) {
      throw new Error(`Failed to download ZIP: ${response.statusText}`)
    }

    const arrayBuffer = await response.arrayBuffer()
    const zip = await JSZip.loadAsync(arrayBuffer)

    // Detect the repo prefix in the ZIP (e.g., "es-419_ta/")
    const allFiles = Object.keys(zip.files)
    const firstFile = allFiles.find(f => !zip.files[f].dir)
    const repoPrefix = firstFile ? firstFile.split('/')[0] + '/' : ''
    
    if (this.debug) {
      console.log(`📂 Detected repo prefix: "${repoPrefix}"`)
    }
    
    // Group files by entry directory (e.g., "checking/vol2-backtranslation-who")
    // TA entries consist of 3 files: title.md, sub-title.md, 01.md
    const entryDirs = new Set<string>()
    const manualPrefixes = ['translate/', 'checking/', 'intro/', 'process/']
    
    for (const fileName of allFiles) {
      if (fileName.endsWith('.md') && !zip.files[fileName].dir) {
        // Remove repo prefix
        const pathWithoutPrefix = repoPrefix ? fileName.replace(repoPrefix, '') : fileName
        
        // Check if it's in a manual directory
        const matchingPrefix = manualPrefixes.find(prefix => pathWithoutPrefix.startsWith(prefix))
        if (matchingPrefix) {
          // Extract entry directory (e.g., "checking/vol2-backtranslation-who")
          const pathParts = pathWithoutPrefix.split('/')
          if (pathParts.length >= 3) {
            const entryDir = `${pathParts[0]}/${pathParts[1]}`
            entryDirs.add(entryDir)
          }
        }
      }
    }
    
    const entryDirArray = Array.from(entryDirs)
    if (this.debug) {
      console.log(`📚 Found ${entryDirArray.length} TA entry directories`)
    }
    
    // Process each entry directory
    for (let i = 0; i < entryDirArray.length; i++) {
      const entryId = entryDirArray[i]
      
      try {
        // Fetch the 3 files for this entry
        const titlePath = repoPrefix + `${entryId}/title.md`
        const subtitlePath = repoPrefix + `${entryId}/sub-title.md`
        const contentPath = repoPrefix + `${entryId}/01.md`
        
        const titleFile = zip.files[titlePath]
        const subtitleFile = zip.files[subtitlePath]
        const contentFile = zip.files[contentPath]
        
        if (titleFile && contentFile) {
          // Read file contents
          const titleContent = await titleFile.async('string')
          const subtitleContent = subtitleFile ? await subtitleFile.async('string') : ''
          const mainContent = await contentFile.async('string')
          
          // Combine into article format (same as fetchArticleFromDoor43)
          let combinedContent = `# ${titleContent.trim()}\n\n`
          if (subtitleContent) {
            combinedContent += `## ${subtitleContent.trim()}\n\n`
          }
          combinedContent += mainContent
          
          // Cache the combined article
          const cacheKey = `${resourceKey}/${entryId}`
          await this.cacheAdapter.set(cacheKey, combinedContent)
          
          if (i < 3) {
            console.log(`✅ [BG-DL] Cached TA entry: ${cacheKey}`)
          }
        } else if (this.debug) {
          console.warn(`⚠️ Missing files for entry: ${entryId}`)
        }
      } catch (error) {
        console.warn(`⚠️ Failed to process entry ${entryId}:`, error)
      }

      if (onProgress) {
        onProgress({
          loaded: i + 1,
          total: entryDirArray.length,
          percentage: ((i + 1) / entryDirArray.length) * 100,
          message: `Processing ${entryId}`
        })
      }
    }
    
    console.log(`✅ [BG-DL] Processed and cached ${entryDirArray.length} TA entries from zipball`)
    if (entryDirArray.length > 0 && this.debug) {
      console.log(`📋 [BG-DL] Sample entries cached:`, entryDirArray.slice(0, 5))
    }

    // Update availability
    await this.updateAvailability(resourceKey, true)
  }

  /**
   * Download individual entries
   */
  private async downloadIndividual(
    resourceKey: string,
    skipExisting?: boolean,
    onProgress?: ProgressCallback
  ): Promise<void> {
    let metadata = await this.getMetadata(resourceKey)
    const entries = metadata.contentMetadata?.ingredients || []
    const parts = resourceKey.split('/')
    const [owner, language, resourceId] = parts
    
    // Get release tag - if not in metadata, fetch fresh from Door43
    let ref = metadata.release?.tag_name
    if (!ref) {
      if (this.debug) {
        console.log(`⚠️ Metadata from catalog missing release tag, fetching fresh from Door43...`)
      }
      
      // Fetch fresh repository info from Door43 to get release tag
      const repoName = `${language}_${resourceId}`
      const repo = await this.door43Client.findRepository(owner, repoName, 'prod')
      if (repo?.release?.tag_name) {
        ref = repo.release.tag_name
        if (this.debug) {
          console.log(`✅ Found release tag from Door43: ${ref}`)
        }
      } else {
        // Throw if no release tag found - non-released resources will be supported in the future
        throw new Error(
          `Resource ${owner}/${language}/${resourceId} has no release tag. ` +
          `Only released resources are currently supported. ` +
          `Future versions will support non-released resources using commit SHA and last updated timestamp.`
        )
      }
    }

    for (let i = 0; i < entries.length; i++) {
      const entry = entries[i]
      const entryId = entry.identifier
      const cacheKey = `${resourceKey}/${entryId}`

      if (skipExisting) {
        const existing = await this.cacheAdapter.get(cacheKey)
        if (existing) continue
      }

      try {
        const content = await this.fetchArticleFromDoor43(owner, language, resourceId, entryId, ref)
        await this.cacheAdapter.set(cacheKey, content)

        if (onProgress) {
          onProgress({
            loaded: i + 1,
            total: entries.length,
            percentage: ((i + 1) / entries.length) * 100,
            message: `Downloading ${entry.title}`
          })
        }
      } catch (error) {
        console.error(`Failed to download ${entryId}:`, error)
      }
    }

    // Update availability
    await this.updateAvailability(resourceKey, true)
  }

  /**
   * Update resource availability status
   */
  private async updateAvailability(resourceKey: string, offline: boolean): Promise<void> {
    const metadata = await this.catalogAdapter.get(resourceKey)
    if (metadata) {
      metadata.availability.offline = offline
      await this.catalogAdapter.set(resourceKey, metadata)
    }
  }
}
