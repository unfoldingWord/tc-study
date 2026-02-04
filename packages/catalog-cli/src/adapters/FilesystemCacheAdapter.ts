/**
 * Filesystem-based cache storage adapter
 * Stores content files directly on disk
 */

import * as fs from 'fs/promises'
import * as path from 'path'

export interface CachedContent {
  content: string | any  // Can be string (raw) or object (processed)
  contentType: string
  cachedAt?: string
}

export class FilesystemCacheAdapter {
  private cacheDir: string

  constructor(cacheDir: string = './cache') {
    this.cacheDir = cacheDir
  }

  /**
   * Initialize cache directory
   */
  private async ensureDir(subDir?: string): Promise<void> {
    const dir = subDir ? path.join(this.cacheDir, subDir) : this.cacheDir
    await fs.mkdir(dir, { recursive: true })
  }

  /**
   * Get file path for cached content
   */
  private getFilePath(key: string, contentType?: string): string {
    // key format: "owner/language/resourceId/bookId"
    // Create subdirectories for better organization
    const parts = key.split('/')
    
    // Determine file extension based on content type
    const ext = contentType === 'usfm-json' ? '.json' : '.txt'
    
    if (parts.length >= 3) {
      const [owner, language, resourceId, ...rest] = parts
      const subDir = path.join(owner, language, resourceId)
      const fileName = rest.length > 0 ? rest.join('_') : 'content'
      return path.join(this.cacheDir, subDir, `${fileName}${ext}`)
    }
    
    // Fallback for simple keys
    const safeKey = key.replace(/\//g, '_')
    return path.join(this.cacheDir, `${safeKey}${ext}`)
  }

  /**
   * Set cached content (handles both string and object content)
   */
  async set(key: string, value: CachedContent): Promise<void> {
    const filePath = this.getFilePath(key, value.contentType)
    const dir = path.dirname(filePath)
    
    // Ensure directory exists
    await fs.mkdir(dir, { recursive: true })
    
    // Determine if content needs to be stringified
    const contentToWrite = typeof value.content === 'string'
      ? value.content
      : JSON.stringify(value.content, null, 2)
    
    // Store content
    await fs.writeFile(filePath, contentToWrite, 'utf-8')
    
    // Calculate size
    const contentSize = typeof value.content === 'string'
      ? value.content.length
      : JSON.stringify(value.content).length
    
    // Store metadata
    const metaPath = `${filePath}.meta.json`
    await fs.writeFile(metaPath, JSON.stringify({
      contentType: value.contentType,
      cachedAt: value.cachedAt || new Date().toISOString(),
      size: contentSize,
      format: typeof value.content === 'string' ? 'text' : 'json'
    }, null, 2), 'utf-8')
  }

  /**
   * Get cached content
   */
  async get(key: string): Promise<CachedContent | null> {
    try {
      // Try JSON first (structured format)
      try {
        const jsonPath = this.getFilePath(key, 'usfm-json')
        const jsonMetaPath = `${jsonPath}.meta.json`
        
        const content = await fs.readFile(jsonPath, 'utf-8')
        const metaContent = await fs.readFile(jsonMetaPath, 'utf-8')
        const meta = JSON.parse(metaContent)
        
        return {
          content: JSON.parse(content),  // Parse JSON content
          contentType: meta.contentType,
          cachedAt: meta.cachedAt
        }
      } catch {
        // Fall back to text format
        const textPath = this.getFilePath(key, 'usfm')
        const textMetaPath = `${textPath}.meta.json`
        
        const content = await fs.readFile(textPath, 'utf-8')
        
        let contentType = 'text/plain'
        let cachedAt: string | undefined
        
        try {
          const metaContent = await fs.readFile(textMetaPath, 'utf-8')
          const meta = JSON.parse(metaContent)
          contentType = meta.contentType || contentType
          cachedAt = meta.cachedAt
        } catch {
          // Metadata file doesn't exist or is invalid, use defaults
        }
        
        return {
          content,  // Return as string
          contentType,
          cachedAt
        }
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        return null
      }
      throw error
    }
  }

  /**
   * Check if content is cached
   */
  async has(key: string): Promise<boolean> {
    try {
      const filePath = this.getFilePath(key)
      await fs.access(filePath)
      return true
    } catch {
      return false
    }
  }

  /**
   * Delete cached content
   */
  async delete(key: string): Promise<void> {
    try {
      const filePath = this.getFilePath(key)
      const metaPath = `${filePath}.meta.json`
      
      await fs.unlink(filePath)
      
      try {
        await fs.unlink(metaPath)
      } catch {
        // Meta file might not exist, ignore
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * Clear all cached content
   */
  async clear(): Promise<void> {
    try {
      // Recursively delete cache directory
      await fs.rm(this.cacheDir, { recursive: true, force: true })
      // Recreate empty directory
      await this.ensureDir()
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        throw error
      }
    }
  }

  /**
   * Get cache size (total bytes)
   */
  async getSize(): Promise<number> {
    let totalSize = 0
    
    async function calculateSize(dir: string): Promise<number> {
      let size = 0
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          
          if (entry.isDirectory()) {
            size += await calculateSize(fullPath)
          } else if (entry.isFile()) {
            const stats = await fs.stat(fullPath)
            size += stats.size
          }
        }
      } catch {
        // Directory doesn't exist or not accessible
      }
      
      return size
    }
    
    totalSize = await calculateSize(this.cacheDir)
    return totalSize
  }

  /**
   * Get number of cached items
   */
  async count(): Promise<number> {
    let count = 0
    
    async function countFiles(dir: string): Promise<number> {
      let fileCount = 0
      try {
        const entries = await fs.readdir(dir, { withFileTypes: true })
        
        for (const entry of entries) {
          const fullPath = path.join(dir, entry.name)
          
          if (entry.isDirectory()) {
            fileCount += await countFiles(fullPath)
          } else if (entry.isFile() && (entry.name.endsWith('.txt') || entry.name.endsWith('.json'))) {
            fileCount++
          }
        }
      } catch {
        // Directory doesn't exist or not accessible
      }
      
      return fileCount
    }
    
    count = await countFiles(this.cacheDir)
    return count
  }
}
