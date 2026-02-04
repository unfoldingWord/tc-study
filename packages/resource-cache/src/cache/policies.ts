/**
 * Cache Eviction Policies
 */

import type { CacheEntry } from '../types'

export class LRUCachePolicy {
  shouldEvict(_entry: CacheEntry): boolean {
    return false
  }
}

export class LFUCachePolicy {
  shouldEvict(_entry: CacheEntry): boolean {
    return false
  }
}

export class TTLCachePolicy {
  private ttl: number

  constructor(ttl: number) {
    this.ttl = ttl
  }

  shouldEvict(entry: CacheEntry): boolean {
    if (!entry.expiresAt) return false
    return new Date(entry.expiresAt) < new Date()
  }
}

export class SizeCachePolicy {
  private maxSize: number

  constructor(maxSize: number) {
    this.maxSize = maxSize
  }

  shouldEvict(_entry: CacheEntry): boolean {
    // TODO: Implement size-based eviction
    return false
  }
}

export { }

