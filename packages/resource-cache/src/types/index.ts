/**
 * Resource Cache Type Definitions
 */

export type CacheSource = 'memory' | 'storage' | 'network'

export interface CacheEntryMetadata {
  [key: string]: any
}

export interface CacheEntry {
  content: any
  metadata?: CacheEntryMetadata
  cachedAt?: string
  expiresAt?: string
  timestamp?: number
  type?: string
  source?: CacheSource
}

export interface CacheOptions {
  ttl?: number
  priority?: CachePriority
  [key: string]: any
}

export interface SetOptions extends CacheOptions {
  overwrite?: boolean
}

export interface GetOptions {
  ignoreExpiration?: boolean
  [key: string]: any
}

export type CachePriority = 'low' | 'normal' | 'high'

export interface NetworkSecurityOptions {
  allowHttp?: boolean
  allowedOrigins?: string[]
  requireSecureConnection?: boolean
}

export interface NetworkFetcher {
  fetch(url: string): Promise<any>
}

export interface NetworkStatus {
  online: boolean
}

export interface CachePolicy {
  shouldEvict(entry: CacheEntry): boolean
}

export interface CacheStorageAdapter {
  get(key: string): Promise<CacheEntry | null>
  set(key: string, entry: CacheEntry): Promise<void>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<boolean | void>
  clear(): Promise<void>
  keys?(): Promise<string[]>
  prune?(options?: any, keyPattern?: any): Promise<number>
  getMany?(keys: string[]): Promise<Map<string, CacheEntry>>
  setMany?(entries: Array<{ key: string; entry: CacheEntry }>): Promise<void>
  deleteMany?(keys: string[]): Promise<void>
  readonly size?: number
  readonly count?: number
  optimize?(): Promise<void>
}

export interface CacheStats {
  size?: number
  totalEntries: number
  totalSize: number
  hitRate: number
  missRate: number
  [key: string]: any
}

export interface CacheExport {
  entries: Array<[string, CacheEntry]>
  exportedAt: string
}

export interface ImportOptions {
  overwrite?: boolean
  validateEntries?: boolean
}

export { }

