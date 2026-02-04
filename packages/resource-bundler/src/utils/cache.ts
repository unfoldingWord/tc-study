/**
 * Cache management utilities
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import * as crypto from 'crypto'
import { CacheStats } from '../types/index.js'

export class CacheManager {
  private cacheDir: string

  constructor(cacheDir: string = './.bt-cache') {
    this.cacheDir = cacheDir
  }

  /**
   * Get cache key for a resource
   */
  getCacheKey(owner: string, language: string, resourceId: string, version?: string): string {
    const parts = [owner, language, resourceId, version || 'latest']
    return crypto.createHash('sha256').update(parts.join('/')).digest('hex').substring(0, 16)
  }

  /**
   * Get cache file path
   */
  getCacheFilePath(owner: string, language: string, resourceId: string, version?: string): string {
    const key = this.getCacheKey(owner, language, resourceId, version)
    return path.join(this.cacheDir, `${key}.zip`)
  }

  /**
   * Check if resource is cached
   */
  async isCached(owner: string, language: string, resourceId: string, version?: string): Promise<boolean> {
    const filePath = this.getCacheFilePath(owner, language, resourceId, version)
    try {
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Get cached file path (if exists)
   */
  async getCached(owner: string, language: string, resourceId: string, version?: string): Promise<string | null> {
    const isCached = await this.isCached(owner, language, resourceId, version)
    if (isCached) {
      return this.getCacheFilePath(owner, language, resourceId, version)
    }
    return null
  }

  /**
   * Save to cache
   */
  async save(owner: string, language: string, resourceId: string, data: Buffer, version?: string): Promise<string> {
    await fs.mkdir(this.cacheDir, { recursive: true })
    const filePath = this.getCacheFilePath(owner, language, resourceId, version)
    await fs.writeFile(filePath, data)
    return filePath
  }

  /**
   * Clear all cache
   */
  async clear(): Promise<void> {
    try {
      await fs.rm(this.cacheDir, { recursive: true, force: true })
      await fs.mkdir(this.cacheDir, { recursive: true })
    } catch (error) {
      // Ignore errors if cache dir doesn't exist
    }
  }

  /**
   * Get cache statistics
   */
  async getStats(): Promise<CacheStats> {
    try {
      const files = await fs.readdir(this.cacheDir)
      let totalSize = 0
      let oldestFile: string | undefined
      let newestFile: string | undefined
      let oldestTime = Infinity
      let newestTime = 0

      for (const file of files) {
        const filePath = path.join(this.cacheDir, file)
        const stat = await fs.stat(filePath)
        totalSize += stat.size

        if (stat.mtimeMs < oldestTime) {
          oldestTime = stat.mtimeMs
          oldestFile = file
        }
        if (stat.mtimeMs > newestTime) {
          newestTime = stat.mtimeMs
          newestFile = file
        }
      }

      return {
        totalFiles: files.length,
        totalSize,
        oldestFile,
        newestFile
      }
    } catch {
      return {
        totalFiles: 0,
        totalSize: 0
      }
    }
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return this.cacheDir
  }

  /**
   * Ensure cache directory exists
   */
  async ensureCacheDir(): Promise<void> {
    await fs.mkdir(this.cacheDir, { recursive: true })
  }
}
