/**
 * Memory Storage Adapter
 * 
 * In-memory storage for testing and development
 */

import { BaseCatalogAdapter } from './base'
import type { ResourceMetadata } from '@bt-synergy/resource-catalog'

/**
 * Simple in-memory storage adapter
 * Perfect for testing and development
 */
export class MemoryCatalogAdapter extends BaseCatalogAdapter {
  private store: Map<string, ResourceMetadata> = new Map()
  
  async save(key: string, metadata: ResourceMetadata): Promise<void> {
    this.store.set(key, { ...metadata })
  }
  
  async get(key: string): Promise<ResourceMetadata | null> {
    const metadata = this.store.get(key)
    return metadata ? { ...metadata } : null
  }
  
  async has(key: string): Promise<boolean> {
    return this.store.has(key)
  }
  
  async delete(key: string): Promise<void> {
    this.store.delete(key)
  }
  
  async saveMany(items: Array<{ key: string; metadata: ResourceMetadata }>): Promise<void> {
    for (const item of items) {
      this.store.set(item.key, { ...item.metadata })
    }
  }
  
  async getAll(): Promise<Map<string, ResourceMetadata>> {
    // Return deep copy to prevent external modifications
    const copy = new Map<string, ResourceMetadata>()
    for (const [key, value] of this.store.entries()) {
      copy.set(key, { ...value })
    }
    return copy
  }
  
  async clear(): Promise<void> {
    this.store.clear()
  }
  
  async count(): Promise<number> {
    return this.store.size
  }
  
  // Additional methods for testing
  
  /**
   * Get current size (synchronous for testing)
   */
  size(): number {
    return this.store.size
  }
  
  /**
   * Reset adapter (synchronous for testing)
   */
  reset(): void {
    this.store.clear()
  }
}

