/**
 * Filesystem-based catalog storage adapter
 * Stores resource metadata as JSON files on disk
 */

import * as fs from 'fs/promises'
import * as path from 'path'
import type { CatalogAdapter } from '@bt-synergy/catalog-manager'
import type { ResourceMetadata, SearchFilters } from '@bt-synergy/catalog-manager'

function keyToFilename(resourceKey: string): string {
  return resourceKey.replace(/\//g, '_') + '.json'
}

function filenameToKey(filename: string): string {
  if (!filename.endsWith('.json')) return ''
  return filename.slice(0, -5).replace(/_/g, '/')
}

export class FilesystemCatalogAdapter implements CatalogAdapter {
  private catalogDir: string

  constructor(catalogDir: string) {
    this.catalogDir = catalogDir
  }

  private async ensureDir(): Promise<void> {
    await fs.mkdir(this.catalogDir, { recursive: true })
  }

  private getFilePath(resourceKey: string): string {
    return path.join(this.catalogDir, keyToFilename(resourceKey))
  }

  async get(resourceKey: string): Promise<ResourceMetadata | null> {
    try {
      const filePath = this.getFilePath(resourceKey)
      const content = await fs.readFile(filePath, 'utf-8')
      return JSON.parse(content) as ResourceMetadata
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code === 'ENOENT') return null
      throw err
    }
  }

  async set(resourceKey: string, metadata: ResourceMetadata): Promise<void> {
    await this.ensureDir()
    const filePath = this.getFilePath(resourceKey)
    await fs.writeFile(filePath, JSON.stringify(metadata, null, 2), 'utf-8')
  }

  async delete(resourceKey: string): Promise<void> {
    try {
      await fs.unlink(this.getFilePath(resourceKey))
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
  }

  async getAll(): Promise<string[]> {
    await this.ensureDir()
    const names = await fs.readdir(this.catalogDir)
    return names
      .filter((n) => n.endsWith('.json'))
      .map(filenameToKey)
      .filter(Boolean)
  }

  async search(filters: SearchFilters): Promise<ResourceMetadata[]> {
    const keys = await this.getAll()
    const results: ResourceMetadata[] = []
    for (const key of keys) {
      const meta = await this.get(key)
      if (!meta) continue
      if (filters.type != null && meta.type !== filters.type) continue
      if (filters.language != null && meta.language !== filters.language) continue
      if (filters.owner != null && meta.owner !== filters.owner) continue
      if (filters.query) {
        const q = filters.query.toLowerCase()
        const title = (meta.title ?? '').toLowerCase()
        const desc = (meta.description ?? '').toLowerCase()
        if (!title.includes(q) && !desc.includes(q)) continue
      }
      results.push(meta)
      if (filters.limit != null && results.length >= filters.limit) break
    }
    if (filters.offset != null && filters.offset > 0) {
      return results.slice(filters.offset)
    }
    return results
  }

  async clear(): Promise<void> {
    try {
      await fs.rm(this.catalogDir, { recursive: true, force: true })
    } catch (err) {
      if ((err as NodeJS.ErrnoException).code !== 'ENOENT') throw err
    }
    await this.ensureDir()
  }
}
