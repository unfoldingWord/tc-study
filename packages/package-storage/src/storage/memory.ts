/**
 * Memory Package Storage Adapter
 * 
 * In-memory storage for testing and development
 */

import type {
  ResourcePackage,
  PackageStorageAdapter,
  PackageFilters,
} from '../types/index'

/**
 * Simple in-memory package storage
 * Perfect for testing and development
 */
export class MemoryPackageStorage implements PackageStorageAdapter {
  private packages = new Map<string, ResourcePackage>()
  
  async save(pkg: ResourcePackage): Promise<void> {
    this.packages.set(pkg.id, { ...pkg })
  }
  
  async get(packageId: string): Promise<ResourcePackage | null> {
    const pkg = this.packages.get(packageId)
    return pkg ? { ...pkg } : null
  }
  
  async has(packageId: string): Promise<boolean> {
    return this.packages.has(packageId)
  }
  
  async delete(packageId: string): Promise<void> {
    this.packages.delete(packageId)
  }
  
  async getAll(): Promise<ResourcePackage[]> {
    return Array.from(this.packages.values()).map(pkg => ({ ...pkg }))
  }
  
  async query(filters: PackageFilters): Promise<ResourcePackage[]> {
    const all = await this.getAll()
    
    return all.filter(pkg => this.matchesFilters(pkg, filters))
  }
  
  async clear(): Promise<void> {
    this.packages.clear()
  }
  
  async count(): Promise<number> {
    return this.packages.size
  }
  
  // ===== HELPERS =====
  
  /**
   * Check if package matches filters
   */
  private matchesFilters(pkg: ResourcePackage, filters: PackageFilters): boolean {
    // Category filter
    if (filters.category && pkg.category !== filters.category) {
      return false
    }
    
    // Tags filter
    if (filters.tags && filters.tags.length > 0) {
      if (!pkg.tags) return false
      const hasAllTags = filters.tags.every(tag => pkg.tags!.includes(tag))
      if (!hasAllTags) return false
    }
    
    // Author filter
    if (filters.author && pkg.author !== filters.author) {
      return false
    }
    
    // Search filter (name or description)
    if (filters.search) {
      const searchLower = filters.search.toLowerCase()
      const nameMatch = pkg.name.toLowerCase().includes(searchLower)
      const descMatch = pkg.description?.toLowerCase().includes(searchLower)
      if (!nameMatch && !descMatch) return false
    }
    
    return true
  }
  
  // ===== TESTING HELPERS =====
  
  /**
   * Get current size (synchronous for testing)
   */
  size(): number {
    return this.packages.size
  }
  
  /**
   * Reset adapter (synchronous for testing)
   */
  reset(): void {
    this.packages.clear()
  }
}
