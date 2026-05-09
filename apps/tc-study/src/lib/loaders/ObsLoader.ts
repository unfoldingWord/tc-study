/**
 * ObsLoader — loads Open Bible Stories markdown per story from Door43 / cache.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ProgressCallback, ResourceLoader } from '@bt-synergy/resource-types'
import {
  normalizeObsStoryId,
  parseObsStoryMarkdown,
  type ParsedObsStory,
} from '../obs/parseObsMarkdown'

function getStoryPath(metadata: ResourceMetadata, storyId: string): string | null {
  const ingredients = metadata.contentMetadata?.ingredients
  if (!ingredients || !Array.isArray(ingredients)) return null

  const padded = normalizeObsStoryId(storyId)
  const unpadded = String(parseInt(padded, 10))

  for (const ing of ingredients as { identifier?: string; path?: string }[]) {
    const id = ing.identifier?.toLowerCase()
    if (!id || !ing.path) continue
    if (id === padded || id === unpadded) return ing.path ?? null
    if (/^\d+$/.test(id) && parseInt(id, 10) === parseInt(padded, 10)) return ing.path ?? null
  }

  // Fallback: path ending in NN.md
  for (const ing of ingredients as { path?: string }[]) {
    const p = ing.path?.toLowerCase() || ''
    if (p.endsWith(`${padded}.md`) || p.endsWith(`/${padded}.md`)) return ing.path ?? null
  }

  // Directory fallback: many OBS repos list a single directory ingredient
  // (e.g. {identifier: "obs", path: "./content", isDir: true}).
  // Story files live at <dir>/<NN>.md relative to the repo root.
  // Check both camelCase (stored ResourceIngredient) and snake_case (raw catalog API).
  for (const ing of ingredients as { identifier?: string; path?: string; isDir?: boolean; is_dir?: boolean }[]) {
    if ((ing.isDir || ing.is_dir) && ing.path) {
      const dir = ing.path.replace(/\/+$/, '') // strip trailing slash
      return `${dir}/${padded}.md`
    }
  }

  // Last resort: if there's exactly one ingredient whose path looks like a directory
  // (no .md extension), treat it as the content dir.
  if (ingredients.length === 1) {
    const sole = ingredients[0] as { path?: string }
    if (sole.path && !sole.path.endsWith('.md')) {
      const dir = sole.path.replace(/\/+$/, '')
      return `${dir}/${padded}.md`
    }
  }

  return null
}

export class ObsLoader implements ResourceLoader {
  private cacheAdapter: any
  private catalogAdapter: any
  private door43Client: any
  private debug: boolean

  constructor(config: any) {
    this.cacheAdapter = config.cacheAdapter
    this.catalogAdapter = config.catalogAdapter
    this.door43Client = config.door43Client
    this.debug = config.debug ?? false
  }

  get resourceType(): string {
    return 'obs'
  }

  canHandle(metadata: ResourceMetadata): boolean {
    return (
      metadata.subject === 'Open Bible Stories' ||
      metadata.resourceId?.toLowerCase() === 'obs'
    )
  }

  async getMetadata(resourceKey: string): Promise<ResourceMetadata> {
    if (this.catalogAdapter) {
      const meta = await this.catalogAdapter.get(resourceKey)
      if (meta) return meta
    }
    throw new Error(`OBS metadata not found for ${resourceKey}`)
  }

  async loadContent(resourceKey: string, storyId: string): Promise<ParsedObsStory> {
    const padded = normalizeObsStoryId(storyId)
    const storyNum = parseInt(padded, 10)
    const cacheKey = `obs:${resourceKey}:${padded}`

    try {
      const cached = await this.cacheAdapter.get(cacheKey)
      if (cached?.content) {
        return cached.content as ParsedObsStory
      }
    } catch {
      /* ignore */
    }

    const metadata = await this.getMetadata(resourceKey)
    const storyPath = getStoryPath(metadata, padded)
    if (!storyPath) {
      throw new Error(`Story "${padded}" not found in OBS ingredients for ${resourceKey}`)
    }

    const parts = resourceKey.split('/')
    if (parts.length !== 3) {
      throw new Error(`Invalid resourceKey: ${resourceKey}`)
    }
    const [owner, language, resourceId] = parts
    const repoName = `${language}_${resourceId}`

    const repo = await this.door43Client.findRepository(owner, repoName, 'prod')
    if (!repo) {
      throw new Error(`Repository not found for ${owner}/${repoName}`)
    }

    const ref = repo.release?.tag_name || repo.default_branch || 'master'
    const md = await this.door43Client.fetchTextContent(owner, repoName, storyPath, ref)
    const parsed = parseObsStoryMarkdown(storyNum, md)

    const baseUrl = this.door43Client?.config?.baseUrl || 'https://git.door43.org'
    const isTag = /^v\d/.test(ref)
    const rawSeg = isTag ? `raw/tag/${ref}` : `raw/branch/${ref}`
    const storyDir =
      storyPath.includes('/') ? `${storyPath.slice(0, storyPath.lastIndexOf('/') + 1)}` : ''
    const urlBase = `${baseUrl}/${owner}/${repoName}/${rawSeg}/${storyDir}`

    for (const frame of parsed.frames) {
      const src = frame.imageUrl.trim()
      if (src.startsWith('http://') || src.startsWith('https://')) {
        frame.resolvedSrc = src
      } else {
        try {
          frame.resolvedSrc = new URL(src, urlBase).href
        } catch {
          frame.resolvedSrc = src
        }
      }
    }

    try {
      await this.cacheAdapter.set(cacheKey, {
        content: parsed,
        timestamp: Date.now(),
        resourceKey,
        storyId: padded,
      })
    } catch {
      /* ignore */
    }

    if (this.debug) {
      console.log(`[ObsLoader] Loaded ${resourceKey} story ${padded}`, parsed.frames.length, 'frames')
    }

    return parsed
  }

  /**
   * Prefetch all 50 OBS stories for offline use.
   * Called by the background-download pipeline after Phase 2 metadata is loaded.
   * Mirrors the pattern used by TSV loaders (which iterate book ingredients).
   */
  async downloadResource(
    resourceKey: string,
    _options?: { method?: 'individual' | 'zip' | 'tar'; skipExisting?: boolean },
    _onProgress?: ProgressCallback
  ): Promise<void> {
    const metadata = await this.getMetadata(resourceKey)
    const ingredients = metadata.contentMetadata?.ingredients
    if (!ingredients || !Array.isArray(ingredients)) {
      if (this.debug) console.log(`[ObsLoader] No ingredients for ${resourceKey}, skipping download`)
      return
    }

    if (this.debug) {
      console.log(`[ObsLoader] Prefetching ${ingredients.length} stories for ${resourceKey}`)
    }

    const storyIds: string[] = []
    for (const ing of ingredients as { identifier?: string }[]) {
      if (ing.identifier && /^\d+$/.test(String(ing.identifier))) {
        storyIds.push(String(ing.identifier))
      }
    }

    // Fallback: iterate 1–50 if ingredients don't have numeric identifiers
    const toFetch = storyIds.length > 0 ? storyIds : Array.from({ length: 50 }, (_, i) => String(i + 1))

    let loaded = 0
    let failed = 0
    for (const storyId of toFetch) {
      try {
        await this.loadContent(resourceKey, storyId)
        loaded++
      } catch (err) {
        failed++
        if (this.debug) {
          console.warn(`[ObsLoader] Failed to prefetch story ${storyId} for ${resourceKey}:`, err)
        }
      }
    }

    if (this.debug) {
      console.log(`[ObsLoader] Prefetch complete for ${resourceKey}: ${loaded} loaded, ${failed} failed`)
    }
  }
}
