/**
 * SQLite Cache Storage Adapter
 * 
 * Persistent storage for mobile platforms using SQLite
 */

// Type declarations for cache (peer dependency)
interface CacheEntry {
  value: any
  size: number
  createdAt: number
  lastAccessed: number
  accessCount: number
  expiresAt?: number
  metadata?: Record<string, any>
}

interface CacheStorageAdapter {
  save(key: string, entry: CacheEntry): Promise<void>
  get(key: string): Promise<CacheEntry | null>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  clear(): Promise<void>
  keys(): Promise<string[]>
  size(): Promise<number>
  getExpiredKeys(): Promise<string[]>
  updateAccessTime(key: string): Promise<void>
}

// SQLite database interface (compatible with multiple libraries)
interface SQLiteDatabase {
  execAsync?(sql: string, params?: any[]): Promise<any>
  runAsync?(sql: string, params?: any[]): Promise<any>
  getAllAsync?<T>(sql: string, params?: any[]): Promise<T[]>
  getFirstAsync?<T>(sql: string, params?: any[]): Promise<T | null>
  
  // Sync methods (expo-sqlite v13+)
  execSync?(sql: string): void
  runSync?(sql: string, params?: any[]): any
  getAllSync?<T>(sql: string, params?: any[]): T[]
  getFirstSync?<T>(sql: string, params?: any[]): T | null
}

/**
 * SQLite adapter for cache storage
 * Works with expo-sqlite, react-native-sqlite-storage, better-sqlite3
 */
export class SQLiteCacheStorage implements CacheStorageAdapter {
  private db: SQLiteDatabase
  private tableName = 'cache_entries'
  private initialized = false
  
  constructor(database: SQLiteDatabase, tableName?: string) {
    this.db = database
    if (tableName) {
      this.tableName = tableName
    }
  }
  
  /**
   * Initialize database (create tables and indexes)
   */
  async init(): Promise<void> {
    if (this.initialized) return
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        key TEXT PRIMARY KEY,
        value BLOB NOT NULL,
        size INTEGER NOT NULL,
        createdAt INTEGER NOT NULL,
        lastAccessed INTEGER NOT NULL,
        accessCount INTEGER DEFAULT 1,
        expiresAt INTEGER,
        metadata TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_expires ON ${this.tableName}(expiresAt);
      CREATE INDEX IF NOT EXISTS idx_accessed ON ${this.tableName}(lastAccessed);
      CREATE INDEX IF NOT EXISTS idx_created ON ${this.tableName}(createdAt);
    `
    
    await this.dbExec(createTableSQL)
    this.initialized = true
  }
  
  // ============================================================================
  // BASIC CRUD
  // ============================================================================
  
  async save(key: string, entry: CacheEntry): Promise<void> {
    await this.init()
    
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName} (
        key, value, size, createdAt, lastAccessed, accessCount, expiresAt, metadata
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `
    
    const params = [
      key,
      this.serializeValue(entry.value),
      entry.size,
      entry.createdAt,
      entry.lastAccessed,
      entry.accessCount,
      entry.expiresAt || null,
      entry.metadata ? JSON.stringify(entry.metadata) : null,
    ]
    
    await this.dbRun(sql, params)
  }
  
  async get(key: string): Promise<CacheEntry | null> {
    await this.init()
    
    const sql = `SELECT * FROM ${this.tableName} WHERE key = ?`
    const row = await this.dbGetFirst<any>(sql, [key])
    
    if (!row) return null
    
    // Check if expired
    if (row.expiresAt && row.expiresAt < Date.now()) {
      await this.delete(key)
      return null
    }
    
    return this.rowToEntry(row)
  }
  
  async has(key: string): Promise<boolean> {
    await this.init()
    
    const sql = `
      SELECT 1 FROM ${this.tableName} 
      WHERE key = ? AND (expiresAt IS NULL OR expiresAt > ?)
      LIMIT 1
    `
    const row = await this.dbGetFirst<any>(sql, [key, Date.now()])
    
    return !!row
  }
  
  async delete(key: string): Promise<void> {
    await this.init()
    
    const sql = `DELETE FROM ${this.tableName} WHERE key = ?`
    await this.dbRun(sql, [key])
  }
  
  async clear(): Promise<void> {
    await this.init()
    
    const sql = `DELETE FROM ${this.tableName}`
    await this.dbRun(sql)
  }
  
  async keys(): Promise<string[]> {
    await this.init()
    
    const sql = `
      SELECT key FROM ${this.tableName}
      WHERE expiresAt IS NULL OR expiresAt > ?
    `
    const rows = await this.dbGetAll<{ key: string }>(sql, [Date.now()])
    
    return rows.map(row => row.key)
  }
  
  async size(): Promise<number> {
    await this.init()
    
    const sql = `
      SELECT COALESCE(SUM(size), 0) as totalSize 
      FROM ${this.tableName}
      WHERE expiresAt IS NULL OR expiresAt > ?
    `
    const row = await this.dbGetFirst<{ totalSize: number }>(sql, [Date.now()])
    
    return row?.totalSize || 0
  }
  
  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================
  
  async getExpiredKeys(): Promise<string[]> {
    await this.init()
    
    const sql = `
      SELECT key FROM ${this.tableName}
      WHERE expiresAt IS NOT NULL AND expiresAt <= ?
    `
    const rows = await this.dbGetAll<{ key: string }>(sql, [Date.now()])
    
    return rows.map(row => row.key)
  }
  
  async updateAccessTime(key: string): Promise<void> {
    await this.init()
    
    const sql = `
      UPDATE ${this.tableName}
      SET lastAccessed = ?, accessCount = accessCount + 1
      WHERE key = ?
    `
    await this.dbRun(sql, [Date.now(), key])
  }
  
  /**
   * Get entries sorted by last accessed (for LRU)
   */
  async getEntriesByLRU(limit?: number): Promise<Array<{ key: string; lastAccessed: number }>> {
    await this.init()
    
    const sql = `
      SELECT key, lastAccessed FROM ${this.tableName}
      WHERE expiresAt IS NULL OR expiresAt > ?
      ORDER BY lastAccessed ASC
      ${limit ? `LIMIT ${limit}` : ''}
    `
    const rows = await this.dbGetAll<{ key: string; lastAccessed: number }>(sql, [Date.now()])
    
    return rows
  }
  
  /**
   * Get entries sorted by access count (for LFU)
   */
  async getEntriesByLFU(limit?: number): Promise<Array<{ key: string; accessCount: number }>> {
    await this.init()
    
    const sql = `
      SELECT key, accessCount FROM ${this.tableName}
      WHERE expiresAt IS NULL OR expiresAt > ?
      ORDER BY accessCount ASC, lastAccessed ASC
      ${limit ? `LIMIT ${limit}` : ''}
    `
    const rows = await this.dbGetAll<{ key: string; accessCount: number }>(sql, [Date.now()])
    
    return rows
  }
  
  /**
   * Delete oldest entries by size (for eviction)
   */
  async deleteOldestBySize(bytesToFree: number): Promise<string[]> {
    await this.init()
    
    const sql = `
      SELECT key, size FROM ${this.tableName}
      WHERE expiresAt IS NULL OR expiresAt > ?
      ORDER BY lastAccessed ASC
    `
    const rows = await this.dbGetAll<{ key: string; size: number }>(sql, [Date.now()])
    
    let freed = 0
    const deleted: string[] = []
    
    for (const row of rows) {
      if (freed >= bytesToFree) break
      
      await this.delete(row.key)
      freed += row.size
      deleted.push(row.key)
    }
    
    return deleted
  }
  
  /**
   * Clean up expired entries
   */
  async cleanup(): Promise<number> {
    await this.init()
    
    const sql = `
      DELETE FROM ${this.tableName}
      WHERE expiresAt IS NOT NULL AND expiresAt <= ?
    `
    
    // For databases that support affected rows
    try {
      const result = await this.dbRun(sql, [Date.now()])
      return (result as any)?.changes || 0
    } catch {
      // Fallback: count before and after
      const beforeCount = await this.count()
      await this.dbRun(sql, [Date.now()])
      const afterCount = await this.count()
      return beforeCount - afterCount
    }
  }
  
  /**
   * Get total entry count
   */
  async count(): Promise<number> {
    await this.init()
    
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`
    const row = await this.dbGetFirst<{ count: number }>(sql)
    
    return row?.count || 0
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  /**
   * Convert database row to CacheEntry
   */
  private rowToEntry(row: any): CacheEntry {
    return {
      value: this.deserializeValue(row.value),
      size: row.size,
      createdAt: row.createdAt,
      lastAccessed: row.lastAccessed,
      accessCount: row.accessCount,
      expiresAt: row.expiresAt || undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    }
  }
  
  /**
   * Check if Buffer is available (Node.js/React Native)
   */
  private isBuffer(value: any): boolean {
    return (
      value &&
      typeof value === 'object' &&
      typeof value.constructor === 'function' &&
      typeof value.constructor.isBuffer === 'function' &&
      value.constructor.isBuffer(value)
    )
  }
  
  /**
   * Serialize value for storage
   * Supports strings, numbers, objects, ArrayBuffers, etc.
   */
  private serializeValue(value: any): any {
    if (typeof value === 'string') {
      return value
    }
    if (value instanceof ArrayBuffer || value instanceof Uint8Array) {
      // Store as-is (SQLite handles blobs)
      return value
    }
    // Check for Buffer if available (Node.js/React Native)
    if (this.isBuffer(value)) {
      return value
    }
    // For objects, arrays, etc., stringify
    return JSON.stringify(value)
  }
  
  /**
   * Deserialize value from storage
   */
  private deserializeValue(value: any): any {
    // Check for Buffer if available
    if (this.isBuffer(value)) {
      // Try to parse as JSON first
      try {
        const str = value.toString('utf-8')
        return JSON.parse(str)
      } catch {
        // Return as buffer/arraybuffer
        return value
      }
    }
    
    // Handle Uint8Array/ArrayBuffer
    if (value instanceof Uint8Array || value instanceof ArrayBuffer) {
      return value
    }
    
    if (typeof value === 'string') {
      // Try to parse as JSON
      try {
        return JSON.parse(value)
      } catch {
        // Return as string
        return value
      }
    }
    
    return value
  }
  
  // ============================================================================
  // DATABASE HELPERS (works with multiple SQLite libraries)
  // ============================================================================
  
  private async dbExec(sql: string): Promise<void> {
    if (this.db.execAsync) {
      await this.db.execAsync(sql)
    } else if (this.db.execSync) {
      this.db.execSync(sql)
    } else {
      throw new Error('Database does not support exec methods')
    }
  }
  
  private async dbRun(sql: string, params?: any[]): Promise<any> {
    if (this.db.runAsync) {
      return await this.db.runAsync(sql, params)
    } else if (this.db.runSync) {
      return this.db.runSync(sql, params)
    } else {
      throw new Error('Database does not support run methods')
    }
  }
  
  private async dbGetAll<T>(sql: string, params?: any[]): Promise<T[]> {
    if (this.db.getAllAsync) {
      return await this.db.getAllAsync<T>(sql, params)
    } else if (this.db.getAllSync) {
      return this.db.getAllSync<T>(sql, params)
    } else {
      throw new Error('Database does not support getAll methods')
    }
  }
  
  private async dbGetFirst<T>(sql: string, params?: any[]): Promise<T | null> {
    if (this.db.getFirstAsync) {
      return await this.db.getFirstAsync<T>(sql, params)
    } else if (this.db.getFirstSync) {
      return this.db.getFirstSync<T>(sql, params)
    } else {
      // Fallback to getAll and take first
      const rows = await this.dbGetAll<T>(sql, params)
      return rows.length > 0 ? rows[0] : null
    }
  }
}
