/**
 * Resource Downloader - Downloads zipball archives from Door43
 */

import * as fs from 'fs/promises'
import fetch from 'node-fetch'
import { ResourceSpec, DownloadResult } from '../types/index.js'
import { CacheManager } from '../utils/cache.js'
import { logger } from '../utils/logger.js'

export class ResourceDownloader {
  private cacheManager: CacheManager
  private baseUrl: string
  private userAgent: string

  constructor(cacheManager: CacheManager, baseUrl = 'https://git.door43.org', userAgent = 'bt-synergy-resource-bundler/1.0') {
    this.cacheManager = cacheManager
    this.baseUrl = baseUrl
    this.userAgent = userAgent
  }

  /**
   * Download resource zipball
   */
  async download(spec: ResourceSpec): Promise<DownloadResult> {
    const { owner, language, resourceId, version, stage = 'prod' } = spec

    try {
      // Check cache first
      const cached = await this.cacheManager.getCached(owner, language, resourceId, version)
      if (cached) {
        logger.debug(`Using cached ${resourceId} from ${cached}`)
        const stat = await fs.stat(cached)
        return {
          success: true,
          filePath: cached,
          size: stat.size,
          fromCache: true
        }
      }

      // Build zipball URL
      const zipballUrl = this.buildZipballUrl(owner, language, resourceId, version, stage)
      logger.debug(`Downloading from ${zipballUrl}`)

      // Download
      const response = await fetch(zipballUrl, {
        headers: {
          'User-Agent': this.userAgent
        },
        redirect: 'follow'
      })

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`)
      }

      // Get content
      const arrayBuffer = await response.arrayBuffer()
      const buffer = Buffer.from(arrayBuffer)

      // Save to cache
      const filePath = await this.cacheManager.save(owner, language, resourceId, buffer, version)
      logger.debug(`Cached ${resourceId} to ${filePath}`)

      return {
        success: true,
        filePath,
        size: buffer.length,
        fromCache: false
      }

    } catch (error: any) {
      logger.error(`Failed to download ${resourceId}: ${error.message}`)
      return {
        success: false,
        filePath: '',
        size: 0,
        fromCache: false,
        error: error.message
      }
    }
  }

  /**
   * Build zipball download URL
   * 
   * Door43 URL structure:
   * https://git.door43.org/{owner}/{language}_{resourceId}/archive/{version}.zip
   * 
   * Example:
   * https://git.door43.org/unfoldingWord/el-x-koine_ugnt/archive/v0.30.zip
   */
  private buildZipballUrl(owner: string, language: string, resourceId: string, version?: string, stage?: string): string {
    const repoName = `${language}_${resourceId}`
    const versionTag = version || 'master'
    
    // For Door43, the zipball URL is:
    // {baseUrl}/{owner}/{repo}/archive/{tag}.zip
    return `${this.baseUrl}/${owner}/${repoName}/archive/${versionTag}.zip`
  }

  /**
   * Download multiple resources in parallel
   */
  async downloadAll(specs: ResourceSpec[], parallel = true): Promise<DownloadResult[]> {
    if (parallel) {
      return await Promise.all(specs.map(spec => this.download(spec)))
    } else {
      const results: DownloadResult[] = []
      for (const spec of specs) {
        const result = await this.download(spec)
        results.push(result)
      }
      return results
    }
  }

  /**
   * Clear download cache
   */
  async clearCache(): Promise<void> {
    await this.cacheManager.clear()
    logger.info('Cache cleared')
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.cacheManager.getStats()
  }
}
