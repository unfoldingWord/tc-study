/**
 * MemoryCache - Simple LRU cache for ProcessedScripture
 */

export class MemoryCache<T> {
  private cache: Map<string, { value: T; timestamp: number }> = new Map()
  private maxSize: number

  constructor(maxSize: number = 50) {
    this.maxSize = maxSize
  }

  get(key: string): T | null {
    const entry = this.cache.get(key)
    if (!entry) return null
    
    // Update timestamp for LRU
    entry.timestamp = Date.now()
    return entry.value
  }

  set(key: string, value: T): void {
    // If cache is full, remove oldest entry
    if (this.cache.size >= this.maxSize && !this.cache.has(key)) {
      const oldestKey = this.getOldestKey()
      if (oldestKey) {
        this.cache.delete(oldestKey)
      }
    }

    this.cache.set(key, { value, timestamp: Date.now() })
  }

  has(key: string): boolean {
    return this.cache.has(key)
  }

  delete(key: string): boolean {
    return this.cache.delete(key)
  }

  clear(): void {
    this.cache.clear()
  }

  getStats() {
    return {
      size: this.cache.size,
      maxSize: this.maxSize,
      keys: Array.from(this.cache.keys()),
    }
  }

  private getOldestKey(): string | null {
    let oldestKey: string | null = null
    let oldestTime = Date.now()

    for (const [key, entry] of this.cache.entries()) {
      if (entry.timestamp < oldestTime) {
        oldestTime = entry.timestamp
        oldestKey = key
      }
    }

    return oldestKey
  }
}



