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
import { obsStoryCacheKey, resolveObsStoryIds } from '../obs/obsStoryIds'

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

type ObsCacheAdapter = {
  get: (key: string) => Promise<{ content?: unknown } | null | undefined>
  set: (key: string, value: unknown) => Promise<void>
}

type ObsCatalogAdapter = {
  get: (resourceKey: string) => Promise<ResourceMetadata | null | undefined>
}

type ObsDoor43Client = {
  findRepository: (
    owner: string,
    repoName: string,
    stage: string
  ) => Promise<{ release?: { tag_name?: string }; default_branch?: string } | null>
  fetchTextContent: (
    owner: string,
    repoName: string,
    path: string,
    ref: string
  ) => Promise<string>
  config?: { baseUrl?: string }
}

export class ObsLoader implements ResourceLoader {
  private cacheAdapter: ObsCacheAdapter
  private catalogAdapter: ObsCatalogAdapter
  private door43Client: ObsDoor43Client
  private debug: boolean

  constructor(config: {
    cacheAdapter: unknown
    catalogAdapter: unknown
    door43Client: unknown
    debug?: boolean
  }) {
    this.cacheAdapter = config.cacheAdapter as ObsCacheAdapter
    this.catalogAdapter = config.catalogAdapter as ObsCatalogAdapter
    this.door43Client = config.door43Client as ObsDoor43Client
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
    const cacheKey = obsStoryCacheKey(resourceKey, padded)

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

    return parsed
  }

  /**
   * Prefetch all OBS stories for offline use.
   * Called by the background-download pipeline after Phase 2 metadata is loaded.
   * Honors skipExisting: when every story blob is already cached, returns without
   * network work (completeness expands the same story list via resolveObsStoryIds).
   */
  async downloadResource(
    resourceKey: string,
    options?: { method?: 'individual' | 'zip' | 'tar'; skipExisting?: boolean },
    onProgress?: ProgressCallback
  ): Promise<void> {
    const metadata = await this.getMetadata(resourceKey)
    const ingredients = metadata.contentMetadata?.ingredients
    if (!ingredients || !Array.isArray(ingredients)) {
      return
    }

    const toFetch = resolveObsStoryIds(ingredients as { identifier?: string }[])
    const total = toFetch.length
    if (total === 0) return

    const skipExisting = options?.skipExisting !== false
    let remaining = toFetch
    if (skipExisting) {
      remaining = []
      for (const storyId of toFetch) {
        const cached = await this.cacheAdapter.get(obsStoryCacheKey(resourceKey, storyId))
        if (!cached?.content) remaining.push(storyId)
      }
      if (remaining.length === 0) {
        onProgress?.({
          loaded: total,
          total,
          percentage: 100,
          message: 'Skipped (already cached)',
        })
        return
      }
    }

    let loaded = total - remaining.length
    for (const storyId of remaining) {
      try {
        await this.loadContent(resourceKey, storyId)
        loaded++
        onProgress?.({
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100),
          message: `Processed ${storyId}`,
        })
      } catch (err) {
        loaded++
        onProgress?.({
          loaded,
          total,
          percentage: Math.round((loaded / total) * 100),
          message: `Failed: ${storyId}`,
        })
        if (this.debug) {
          console.warn(`[ObsLoader] Failed to prefetch story ${storyId} for ${resourceKey}:`, err)
        }
      }
    }
  }
}
