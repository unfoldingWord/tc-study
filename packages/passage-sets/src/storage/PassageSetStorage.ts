/**
 * Passage Set Storage - IndexedDB persistence layer
 */

import { openDB, type IDBPDatabase } from 'idb'
import type { PassageSet, PassageSetMetadata } from '../types'

const DB_NAME = 'bt-synergy-passage-sets'
const DB_VERSION = 1
const STORE_NAME = 'passage-sets'

interface PassageSetsDB {
  'passage-sets': {
    key: string
    value: PassageSet
    indexes: {
      'by-category': string | undefined
      'by-author': string | undefined
      'by-created': string
    }
  }
}

export class PassageSetStorage {
  private dbPromise: Promise<IDBPDatabase<PassageSetsDB>>

  constructor() {
    this.dbPromise = this.initDB()
  }

  private async initDB(): Promise<IDBPDatabase<PassageSetsDB>> {
    return openDB<PassageSetsDB>(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: 'id' })
          store.createIndex('by-category', 'metadata.category')
          store.createIndex('by-author', 'metadata.author')
          store.createIndex('by-created', 'createdAt')
        }
      },
    })
  }

  /**
   * Save a passage set
   */
  async save(passageSet: PassageSet): Promise<void> {
    const db = await this.dbPromise
    await db.put(STORE_NAME, passageSet)
  }

  /**
   * Get a passage set by ID
   */
  async get(id: string): Promise<PassageSet | null> {
    const db = await this.dbPromise
    const result = await db.get(STORE_NAME, id)
    return result || null
  }

  /**
   * Get all passage sets
   */
  async getAll(): Promise<PassageSet[]> {
    const db = await this.dbPromise
    return db.getAll(STORE_NAME)
  }

  /**
   * Get passage sets by category
   */
  async getByCategory(category: string): Promise<PassageSet[]> {
    const db = await this.dbPromise
    return db.getAllFromIndex(STORE_NAME, 'by-category', category)
  }

  /**
   * Get passage sets by author
   */
  async getByAuthor(author: string): Promise<PassageSet[]> {
    const db = await this.dbPromise
    return db.getAllFromIndex(STORE_NAME, 'by-author', author)
  }

  /**
   * Search passage sets
   */
  async search(query: string): Promise<PassageSet[]> {
    const all = await this.getAll()
    const lowerQuery = query.toLowerCase()
    
    return all.filter(ps =>
      ps.name.toLowerCase().includes(lowerQuery) ||
      ps.description?.toLowerCase().includes(lowerQuery) ||
      ps.metadata?.tags?.some((t: string) => t.toLowerCase().includes(lowerQuery))
    )
  }

  /**
   * Delete a passage set
   */
  async delete(id: string): Promise<void> {
    const db = await this.dbPromise
    await db.delete(STORE_NAME, id)
  }

  /**
   * Clear all passage sets
   */
  async clear(): Promise<void> {
    const db = await this.dbPromise
    await db.clear(STORE_NAME)
  }

  /**
   * Get metadata for all passage sets (without full passage data)
   */
  async getAllMetadata(): Promise<PassageSetMetadata[]> {
    const all = await this.getAll()
    return all.map(ps => ({
      id: ps.id,
      name: ps.name,
      description: ps.description,
      passageCount: ps.metadata?.passageCount || this.countPassagesInSet(ps),
      tags: ps.metadata?.tags,
      category: ps.metadata?.category,
      author: ps.metadata?.author,
      createdAt: ps.createdAt,
      updatedAt: ps.updatedAt,
    }))
  }

  /**
   * Count passages in a passage set
   */
  private countPassagesInSet(ps: PassageSet): number {
    let count = 0

    const countNode = (node: any): void => {
      if (node.type === 'passage') {
        count += node.passages?.length || 0
      } else if (node.type === 'group' && node.children) {
        node.children.forEach(countNode)
      }
    }

    ps.root.forEach(countNode)
    return count
  }

  /**
   * Get storage statistics
   */
  async getStats() {
    const all = await this.getAll()
    
    const categories = new Set<string>()
    const tags = new Set<string>()
    let totalPassages = 0

    all.forEach(ps => {
      if (ps.metadata?.category) categories.add(ps.metadata.category)
      ps.metadata?.tags?.forEach((t: string) => tags.add(t))
      totalPassages += ps.metadata?.passageCount || this.countPassagesInSet(ps)
    })

    return {
      totalSets: all.length,
      totalPassages,
      categories: Array.from(categories),
      tags: Array.from(tags),
    }
  }

  /**
   * Export all passage sets as JSON
   */
  async exportAll(): Promise<string> {
    const all = await this.getAll()
    return JSON.stringify(all, null, 2)
  }

  /**
   * Import passage sets from JSON
   */
  async importFromJSON(json: string): Promise<number> {
    const passageSets = JSON.parse(json) as PassageSet[]
    
    for (const ps of passageSets) {
      await this.save(ps)
    }
    
    return passageSets.length
  }
}
