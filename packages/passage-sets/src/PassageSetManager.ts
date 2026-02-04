/**
 * Passage Set Manager - Main API for passage set operations
 */

import { PassageSetStorage } from './storage/PassageSetStorage'
import type {
  PassageSet,
  PassageSetMetadata,
  PassageSetSearchOptions,
  PassageSetStats,
  PassageSetCollection,
  BCVReference,
  ValidationResult,
  PassageSetNode,
  PassageGroup,
  PassageLeaf,
  Passage,
} from './types'

export class PassageSetManager {
  private storage: PassageSetStorage

  constructor() {
    this.storage = new PassageSetStorage()
  }

  /**
   * Create a new passage set
   */
  async create(data: Omit<PassageSet, 'id' | 'createdAt' | 'updatedAt'>): Promise<PassageSet> {
    const now = new Date().toISOString()
    
    // Ensure version is set
    const version = data.version || '1.0.0'
    
    const passageSet: PassageSet = {
      id: `ps-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      ...data,
      version,
      createdAt: now,
      updatedAt: now,
    }

    const validation = this.validate(passageSet)
    if (!validation.valid) {
      throw new Error(`Invalid passage set: ${validation.errors.join(', ')}`)
    }

    await this.storage.save(passageSet)
    return passageSet
  }

  /**
   * Get a passage set by ID
   */
  async get(id: string): Promise<PassageSet | null> {
    return this.storage.get(id)
  }

  /**
   * Get all passage sets
   */
  async getAll(): Promise<PassageSet[]> {
    return this.storage.getAll()
  }

  /**
   * Get all passage set metadata (lightweight)
   */
  async getAllMetadata(): Promise<PassageSetMetadata[]> {
    return this.storage.getAllMetadata()
  }

  /**
   * Update a passage set
   */
  async update(id: string, updates: Partial<Omit<PassageSet, 'id' | 'createdAt'>>): Promise<PassageSet> {
    const existing = await this.storage.get(id)
    if (!existing) {
      throw new Error(`Passage set not found: ${id}`)
    }

    const updated: PassageSet = {
      ...existing,
      ...updates,
      updatedAt: new Date().toISOString(),
    }

    const validation = this.validate(updated)
    if (!validation.valid) {
      throw new Error(`Invalid passage set: ${validation.errors.join(', ')}`)
    }

    await this.storage.save(updated)
    return updated
  }

  /**
   * Delete a passage set
   */
  async delete(id: string): Promise<void> {
    await this.storage.delete(id)
  }

  /**
   * Search passage sets
   */
  async search(options: PassageSetSearchOptions): Promise<PassageSet[]> {
    let results = await this.storage.getAll()

    // Filter by query
    if (options.query) {
      const lowerQuery = options.query.toLowerCase()
      results = results.filter(ps =>
        ps.name.toLowerCase().includes(lowerQuery) ||
        ps.description?.toLowerCase().includes(lowerQuery) ||
        ps.metadata?.tags?.some((t: string) => t.toLowerCase().includes(lowerQuery))
      )
    }

    // Filter by category
    if (options.category) {
      results = results.filter(ps => ps.metadata?.category === options.category)
    }

    // Filter by tags
    if (options.tags && options.tags.length > 0) {
      results = results.filter(ps =>
        options.tags!.some(tag => ps.metadata?.tags?.includes(tag))
      )
    }

    // Filter by author
    if (options.author) {
      results = results.filter(ps => ps.metadata?.author === options.author)
    }

    // Pagination
    if (options.offset !== undefined) {
      results = results.slice(options.offset)
    }
    if (options.limit !== undefined) {
      results = results.slice(0, options.limit)
    }

    return results
  }

  /**
   * Get statistics
   */
  async getStats(): Promise<PassageSetStats> {
    return this.storage.getStats()
  }

  /**
   * Validate a passage set
   */
  validate(passageSet: PassageSet): ValidationResult {
    const errors: string[] = []

    if (!passageSet.name || passageSet.name.trim().length === 0) {
      errors.push('Name is required')
    }

    if (!passageSet.version || passageSet.version.trim().length === 0) {
      errors.push('Version is required')
    }

    if (!passageSet.root || passageSet.root.length === 0) {
      errors.push('At least one root node is required')
    }

    // Validate hierarchy
    const validateNode = (node: PassageSetNode, path: string) => {
      if (!node.id || node.id.trim().length === 0) {
        errors.push(`${path}: Node ID is required`)
      }

      if (!node.label || node.label.trim().length === 0) {
        errors.push(`${path}: Node label is required`)
      }

      if (node.type === 'group') {
        const group = node as PassageGroup
        if (!group.children || group.children.length === 0) {
          errors.push(`${path}: Group must have at least one child`)
        } else {
          group.children.forEach((child, idx) => {
            validateNode(child, `${path}/[${idx}]`)
          })
        }
      } else if (node.type === 'passage') {
        const leaf = node as PassageLeaf
        if (!leaf.passages || leaf.passages.length === 0) {
          errors.push(`${path}: Passage leaf must have at least one passage`)
        } else {
          leaf.passages.forEach((passage, idx) => {
            this.validatePassage(passage, `${path}/passage[${idx}]`, errors)
          })
        }
      } else {
        errors.push(`${path}: Unknown node type: ${node.type}`)
      }
    }

    passageSet.root.forEach((node, idx) => {
      validateNode(node, `root[${idx}]`)
    })

    return {
      valid: errors.length === 0,
      errors,
    }
  }

  /**
   * Validate a single passage
   */
  private validatePassage(passage: Passage, path: string, errors: string[]) {
    if (!passage.bookCode || passage.bookCode.trim().length === 0) {
      errors.push(`${path}: Book code is required`)
    }

    if (!passage.ref) {
      errors.push(`${path}: Reference is required`)
      return
    }

    if (typeof passage.ref === 'string') {
      // Validate simple ref format
      if (!/^\d+(:\d+)?(-(\d+:)?\d+)?$/.test(passage.ref)) {
        errors.push(`${path}: Invalid reference format: ${passage.ref}`)
      }
    } else {
      // Validate RefRange
      if (!passage.ref.startChapter || passage.ref.startChapter < 1) {
        errors.push(`${path}: Invalid start chapter`)
      }

      if (passage.ref.endChapter && passage.ref.endChapter < passage.ref.startChapter) {
        errors.push(`${path}: End chapter cannot be before start chapter`)
      }

      if (
        passage.ref.endVerse &&
        !passage.ref.endChapter &&
        passage.ref.startVerse &&
        passage.ref.endVerse < passage.ref.startVerse
      ) {
        errors.push(`${path}: End verse cannot be before start verse`)
      }
    }
  }

  /**
   * Export a passage set as JSON
   */
  async export(id: string): Promise<string> {
    const passageSet = await this.storage.get(id)
    if (!passageSet) {
      throw new Error(`Passage set not found: ${id}`)
    }
    return JSON.stringify(passageSet, null, 2)
  }

  /**
   * Export all passage sets
   */
  async exportAll(): Promise<string> {
    return this.storage.exportAll()
  }

  /**
   * Export as a collection
   */
  async exportAsCollection(
    ids: string[],
    name: string,
    description?: string
  ): Promise<string> {
    const passageSets = await Promise.all(
      ids.map(id => this.storage.get(id))
    )

    const filtered = passageSets.filter((ps): ps is PassageSet => ps !== null)

    const collection: PassageSetCollection = {
      id: `psc-${Date.now()}`,
      name,
      description,
      passageSets: filtered,
      createdAt: new Date().toISOString(),
      version: '1.0.0',
    }

    return JSON.stringify(collection, null, 2)
  }

  /**
   * Import a passage set from JSON
   */
  async import(json: string): Promise<PassageSet> {
    const passageSet = JSON.parse(json) as PassageSet

    const validation = this.validate(passageSet)
    if (!validation.valid) {
      throw new Error(`Invalid passage set: ${validation.errors.join(', ')}`)
    }

    // Generate new ID to avoid conflicts
    passageSet.id = `ps-${Date.now()}-${Math.random().toString(36).substring(7)}`
    passageSet.updatedAt = new Date().toISOString()

    await this.storage.save(passageSet)
    return passageSet
  }

  /**
   * Import multiple passage sets
   */
  async importMany(json: string): Promise<PassageSet[]> {
    const data = JSON.parse(json)

    // Handle collection format
    if (data.passageSets && Array.isArray(data.passageSets)) {
      const collection = data as PassageSetCollection
      const imported: PassageSet[] = []

      for (const ps of collection.passageSets) {
        const validation = this.validate(ps)
        if (validation.valid) {
          ps.id = `ps-${Date.now()}-${Math.random().toString(36).substring(7)}`
          ps.updatedAt = new Date().toISOString()
          await this.storage.save(ps)
          imported.push(ps)
        }
      }

      return imported
    }

    // Handle array format
    if (Array.isArray(data)) {
      const imported: PassageSet[] = []

      for (const ps of data) {
        const validation = this.validate(ps)
        if (validation.valid) {
          ps.id = `ps-${Date.now()}-${Math.random().toString(36).substring(7)}`
          ps.updatedAt = new Date().toISOString()
          await this.storage.save(ps)
          imported.push(ps)
        }
      }

      return imported
    }

    throw new Error('Invalid import format')
  }

  /**
   * Duplicate a passage set
   */
  async duplicate(id: string, newName?: string): Promise<PassageSet> {
    const original = await this.storage.get(id)
    if (!original) {
      throw new Error(`Passage set not found: ${id}`)
    }

    const now = new Date().toISOString()
    const duplicated: PassageSet = {
      ...original,
      id: `ps-${Date.now()}-${Math.random().toString(36).substring(7)}`,
      name: newName || `${original.name} (Copy)`,
      createdAt: now,
      updatedAt: now,
    }

    await this.storage.save(duplicated)
    return duplicated
  }

  /**
   * Clear all passage sets
   */
  async clearAll(): Promise<void> {
    await this.storage.clear()
  }

  /**
   * Format passage reference as text
   */
  formatReference(passage: Passage): string {
    const book = passage.bookCode.toUpperCase()
    
    if (typeof passage.ref === 'string') {
      return `${book} ${passage.ref}`
    }

    const ref = passage.ref
    let result = `${book} ${ref.startChapter}`

    if (ref.startVerse) {
      result += `:${ref.startVerse}`
    }

    if (ref.endChapter && ref.endChapter !== ref.startChapter) {
      result += `-${ref.endChapter}`
      if (ref.endVerse) {
        result += `:${ref.endVerse}`
      }
    } else if (ref.endVerse && ref.endVerse !== ref.startVerse) {
      result += `-${ref.endVerse}`
    }

    return result
  }

  /**
   * Format legacy BCV reference as text (for backward compatibility)
   */
  formatBCVReference(ref: BCVReference): string {
    const book = ref.book.toUpperCase()
    
    if (ref.endChapter && ref.endVerse) {
      return `${book} ${ref.chapter}:${ref.verse}-${ref.endChapter}:${ref.endVerse}`
    } else if (ref.endVerse) {
      return `${book} ${ref.chapter}:${ref.verse}-${ref.endVerse}`
    } else {
      return `${book} ${ref.chapter}:${ref.verse}`
    }
  }

  /**
   * Format passage set as text
   */
  formatPassageSet(passageSet: PassageSet): string {
    const header = `${passageSet.name}\n${'='.repeat(passageSet.name.length)}\n`
    const description = passageSet.description ? `${passageSet.description}\n\n` : '\n'
    
    const formatNode = (node: PassageSetNode, indent = 0): string => {
      const prefix = '  '.repeat(indent)
      let result = `${prefix}- ${node.label}\n`

      if (node.type === 'group') {
        const group = node as PassageGroup
        for (const child of group.children) {
          result += formatNode(child, indent + 1)
        }
      } else {
        const leaf = node as PassageLeaf
        for (const passage of leaf.passages) {
          result += `${prefix}  ${this.formatReference(passage)}\n`
        }
      }

      return result
    }

    const content = passageSet.root
      .map(node => formatNode(node))
      .join('')

    return header + description + content
  }
}
