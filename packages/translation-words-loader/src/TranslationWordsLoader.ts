/**
 * TranslationWordsLoader - Loads Translation Words resources
 * Implements ResourceLoader interface for plugin architecture
 */

import type {
  ProgressCallback,
  ResourceLoader,
  ResourceMetadata
} from '@bt-synergy/catalog-manager'
import { Door43ServerAdapter } from '@bt-synergy/resource-catalog'
import JSZip from 'jszip'
import { generateTWIngredients } from './ingredients-generator'
import type {
  EntryInfo,
  TranslationWord,
  TranslationWordsLoaderConfig
} from './types'

export class TranslationWordsLoader implements ResourceLoader {
  readonly resourceType = 'words'
  
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean
  private serverAdapter: Door43ServerAdapter

  constructor(config: TranslationWordsLoaderConfig) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug ?? false
    this.serverAdapter = new Door43ServerAdapter()

    if (this.debug) {
      console.log('📝 TranslationWordsLoader initialized with Door43 adapter')
    }
  }

  /**
   * Check if this loader can handle a resource
   */
  canHandle(metadata: ResourceMetadata): boolean {
    return (
      metadata.type === 'words' ||
      metadata.subject === 'Translation Words' ||
      metadata.resourceId === 'tw'
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

      // Only use release tag - throw if missing
      if (!repo.release?.tag_name) {
        throw new Error(
          `Resource ${owner}/${language}/${resourceId} has no release tag. ` +
          `Only released resources are currently supported.`
        )
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
          name: repo.title || 'Translation Words',
          owner,
          language,
          subject: 'Translation Words',
          version: repo.release.tag_name, // Already validated above
          content_format: 'markdown',
          flavor: 'x-TranslationWords',
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
   * Load Translation Word content
   */
  async loadContent(resourceKey: string, entryId: string): Promise<TranslationWord> {
    const cacheKey = `${resourceKey}/${entryId}`

    try {
      // Try cache first
      const cached = await this.cacheAdapter.get(cacheKey)
      if (cached) {
        if (this.debug) {
          console.log(`✨ [TW] Cache hit: ${cacheKey}`)
        }
        return this.parseWord(cached, entryId)
      }
      
      if (this.debug) {
        console.log(`🌐 [TW] Cache miss, fetching from remote: ${cacheKey}`)
      }

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

      const content = await this.fetchWordFromDoor43(owner, language, resourceId, entryId, ref)

      // Cache it
      await this.cacheAdapter.set(cacheKey, content)

      if (this.debug) {
        console.log(`✅ Loaded and cached: ${cacheKey} from ${ref}`)
      }

      return this.parseWord(content, entryId)
    } catch (error) {
      console.error(`❌ Failed to load content for ${cacheKey}:`, error)
      throw error
    }
  }

  /**
   * Download entire Translation Words resource
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
   * Fetch word from Door43
   * 
   * @param ref - Git reference (tag, branch, or commit) to use. Defaults to 'master'.
   *              Should match the release tag from the resource metadata.
   */
  private async fetchWordFromDoor43(
    owner: string,
    language: string,
    resourceId: string,
    entryId: string,
    ref: string = 'master'
  ): Promise<string> {
    // Log incoming parameters for debugging
    console.log(`[fetchWordFromDoor43] Called with: owner=${owner}, language=${language}, resourceId=${resourceId} (type: ${typeof resourceId}), entryId=${entryId}, ref=${ref}`)
    
    // Validate parameters - check for both undefined value and string "undefined"
    if (!owner || !language || !resourceId || resourceId === 'undefined' || resourceId === undefined || typeof resourceId !== 'string' || resourceId.trim() === '') {
      console.error(`[fetchWordFromDoor43] Invalid parameters: owner=${owner}, language=${language}, resourceId=${resourceId} (type: ${typeof resourceId})`)
      throw new Error(`Invalid parameters for fetchWordFromDoor43: owner=${owner}, language=${language}, resourceId=${resourceId} (type: ${typeof resourceId})`)
    }
    
    // Entry format: "bible/kt/god" -> fetch from "bible/kt/god.md" (don't append .md if already present, e.g. from [text](../kt/bless.md))
    const filePath = entryId.endsWith('.md') ? entryId : `${entryId}.md`
    
    // Final check - if resourceId is still undefined or invalid, try to extract it from language
    if (!resourceId || resourceId === 'undefined' || resourceId === undefined) {
      console.error(`[fetchWordFromDoor43] resourceId is invalid: ${resourceId}. Attempting to extract from language: ${language}`)
      if (language && language.includes('_')) {
        const lastUnderscoreIndex = language.lastIndexOf('_')
        if (lastUnderscoreIndex > 0) {
          resourceId = language.substring(lastUnderscoreIndex + 1)
          language = language.substring(0, lastUnderscoreIndex)
          console.log(`[fetchWordFromDoor43] Extracted: language=${language}, resourceId=${resourceId}`)
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
    
    console.log(`📥 fetchWordFromDoor43: owner=${owner}, repoName=${repoName}, filePath=${filePath}, ref=${ref}`)

    const content = await this.door43Client.fetchTextContent(owner, repoName, filePath, ref)
    return content
  }

  /**
   * Parse markdown content into TranslationWord
   */
  private parseWord(markdown: string, entryId: string): TranslationWord {
    // Extract title (first # heading)
    const titleMatch = markdown.match(/^#\s+(.+)$/m)
    const term = titleMatch ? titleMatch[1].trim() : entryId.split('/').pop() || entryId

    // Extract definition: first paragraph after the first ## heading
    // Structure: # Title \n [optional intro] \n ## Heading \n Definition paragraph
    // Stop at: blank line, next heading, bullet points, or end of file
    let definition = ''
    
    // Find the first ## heading and extract ONLY content until stopping point
    // Stops at: \n\n (blank line), \n## (next heading), \n* or \n- (bullets), or end
    const firstSecondHeadingMatch = markdown.match(/##\s+.+?\n+(.*?)(?=\n\n|\n##|\n[*\-+]\s|$)/s)
    if (firstSecondHeadingMatch) {
      // Captured content is just the first paragraph (until stopping point)
      definition = firstSecondHeadingMatch[1].trim()
    } else {
      // No ## heading found, fall back to first paragraph after title
      const afterTitleMatch = markdown.match(/^#\s+.+$\n+(.*?)(?=\n\n|\n[*\-+]\s|$)/ms)
      if (afterTitleMatch) {
        definition = afterTitleMatch[1].trim()
      }
    }

    return {
      id: entryId,
      term,
      definition,
      content: markdown
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
              
              // Extract category from path or use from ingredient
              const categoryMatch = entryId.match(/bible\/([^/]+)/)
              const category = ingredient.categories?.[0] || (categoryMatch ? categoryMatch[1] : 'other')
              
              entries.push({
                id: entryId,
                title: ingredient.title || entryId.split('/').pop() || entryId,
                category,
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
      const result = await generateTWIngredients({
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

      // Convert TWIngredient format to EntryInfo format
      for (const ingredient of result.ingredients) {
        const category = ingredient.categories?.[0] || 'other'
        
        entries.push({
          id: ingredient.identifier,
          title: ingredient.title,
          category,
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

    // Extract all markdown files from bible/kt/, bible/names/, bible/other/
    const files = Object.keys(zip.files).filter(name => 
      name.includes('/bible/') && name.endsWith('.md')
    )

    for (let i = 0; i < files.length; i++) {
      const fileName = files[i]
      const file = zip.files[fileName]

      if (!file.dir) {
        const content = await file.async('string')
        
        // Extract entry ID from path
        const match = fileName.match(/bible\/(kt|names|other)\/(.+)\.md$/)
        if (match) {
          const [, category, termId] = match
          const entryId = `bible/${category}/${termId}`
          const cacheKey = `${resourceKey}/${entryId}`

          await this.cacheAdapter.set(cacheKey, content)
        }
      }

      if (onProgress) {
        onProgress({
          loaded: i + 1,
          total: files.length,
          percentage: ((i + 1) / files.length) * 100,
          message: `Extracting ${fileName}`
        })
      }
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
        const content = await this.fetchWordFromDoor43(owner, language, resourceId, entryId, ref)
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
