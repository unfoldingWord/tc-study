/**
 * SQLite Catalog Storage Adapter
 * 
 * Persistent storage for mobile platforms using SQLite
 */

// Type declarations for catalog (peer dependency)
interface ResourceMetadata {
  server: string
  owner: string
  language: string
  resourceId: string
  title: string
  description?: string
  subject: string
  version: string
  type: string
  format: string
  contentType: string
  availability: {
    online: boolean
    offline: boolean
    bundled: boolean
  }
  locations: Array<{
    type: string
    path: string
    priority: number
    verified?: boolean
    lastChecked?: string
  }>
  contentMetadata?: any
  quality?: any
  license?: any
  contributors?: any[]
  catalogedAt: string
  updatedAt?: string
  accessedAt?: string
  accessCount?: number
  urls?: any
}

interface CatalogQuery {
  server?: string | string[]
  owner?: string | string[]
  language?: string | string[]
  resourceId?: string | string[]
  subject?: string | string[]
  version?: string
  type?: string | string[]
  format?: string | string[]
  availableOnline?: boolean
  availableOffline?: boolean
  bundled?: boolean
  locationType?: string | string[]
  hasBooks?: boolean
  book?: string
  testament?: 'ot' | 'nt' | 'both'
  hasRelations?: boolean
  relationType?: string
  checkingLevel?: string
  status?: string
}

interface CatalogStats {
  totalResources: number
  totalServers: number
  totalOwners: number
  totalLanguages: number
  bySubject: Record<string, number>
  byLanguage: Record<string, number>
  byOwner: Record<string, number>
  byType: Record<string, number>
  byFormat: Record<string, number>
  availableOffline: number
  availableOnline: number
  bundledResources: number
  totalSize?: number
  oldestResource?: string
  newestResource?: string
  mostAccessed?: string
}

interface ImportOptions {
  overwrite?: boolean
  skipExisting?: boolean
}

interface CatalogStorageAdapter {
  save(key: string, metadata: ResourceMetadata): Promise<void>
  get(key: string): Promise<ResourceMetadata | null>
  has(key: string): Promise<boolean>
  delete(key: string): Promise<void>
  getAll(): Promise<Map<string, ResourceMetadata>>
  clear(): Promise<void>
  count(): Promise<number>
  query(filters: CatalogQuery): Promise<ResourceMetadata[]>
  getStats(): Promise<CatalogStats>
  exportAll(): Promise<string>
  importAll(json: string, options?: ImportOptions): Promise<void>
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
 * SQLite adapter for catalog storage
 * Works with expo-sqlite, react-native-sqlite-storage, better-sqlite3
 */
export class SQLiteCatalogAdapter implements CatalogStorageAdapter {
  private db: SQLiteDatabase
  private tableName = 'catalog_resources'
  private initialized = false
  
  constructor(database: SQLiteDatabase) {
    this.db = database
  }
  
  /**
   * Initialize database (create tables and indexes)
   */
  async init(): Promise<void> {
    if (this.initialized) return
    
    const createTableSQL = `
      CREATE TABLE IF NOT EXISTS ${this.tableName} (
        id TEXT PRIMARY KEY,
        server TEXT NOT NULL,
        owner TEXT NOT NULL,
        language TEXT NOT NULL,
        resourceId TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        subject TEXT NOT NULL,
        version TEXT NOT NULL,
        type TEXT NOT NULL,
        format TEXT NOT NULL,
        contentType TEXT NOT NULL,
        availability TEXT NOT NULL,
        locations TEXT NOT NULL,
        contentMetadata TEXT,
        quality TEXT,
        license TEXT,
        contributors TEXT,
        catalogedAt TEXT NOT NULL,
        updatedAt TEXT,
        accessedAt TEXT,
        accessCount INTEGER DEFAULT 0,
        urls TEXT
      );
      
      CREATE INDEX IF NOT EXISTS idx_server_owner_lang ON ${this.tableName}(server, owner, language);
      CREATE INDEX IF NOT EXISTS idx_language ON ${this.tableName}(language);
      CREATE INDEX IF NOT EXISTS idx_owner ON ${this.tableName}(owner);
      CREATE INDEX IF NOT EXISTS idx_subject ON ${this.tableName}(subject);
      CREATE INDEX IF NOT EXISTS idx_type ON ${this.tableName}(type);
      CREATE INDEX IF NOT EXISTS idx_format ON ${this.tableName}(format);
    `
    
    await this.dbExec(createTableSQL)
    this.initialized = true
  }
  
  // ============================================================================
  // BASIC CRUD
  // ============================================================================
  
  async save(key: string, metadata: ResourceMetadata): Promise<void> {
    await this.init()
    
    const sql = `
      INSERT OR REPLACE INTO ${this.tableName} (
        id, server, owner, language, resourceId, title, description, subject, version,
        type, format, contentType, availability, locations, contentMetadata, quality,
        license, contributors, catalogedAt, updatedAt, accessedAt, accessCount, urls
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `
    
    const params = [
      key,
      metadata.server,
      metadata.owner,
      metadata.language,
      metadata.resourceId,
      metadata.title,
      metadata.description || null,
      metadata.subject,
      metadata.version,
      metadata.type,
      metadata.format,
      metadata.contentType,
      JSON.stringify(metadata.availability),
      JSON.stringify(metadata.locations),
      metadata.contentMetadata ? JSON.stringify(metadata.contentMetadata) : null,
      metadata.quality ? JSON.stringify(metadata.quality) : null,
      metadata.license ? JSON.stringify(metadata.license) : null,
      metadata.contributors ? JSON.stringify(metadata.contributors) : null,
      metadata.catalogedAt,
      metadata.updatedAt || null,
      metadata.accessedAt || null,
      metadata.accessCount || 0,
      metadata.urls ? JSON.stringify(metadata.urls) : null,
    ]
    
    await this.dbRun(sql, params)
  }
  
  async get(key: string): Promise<ResourceMetadata | null> {
    await this.init()
    
    const sql = `SELECT * FROM ${this.tableName} WHERE id = ?`
    const row = await this.dbGetFirst<any>(sql, [key])
    
    return row ? this.rowToMetadata(row) : null
  }
  
  async has(key: string): Promise<boolean> {
    await this.init()
    
    const sql = `SELECT 1 FROM ${this.tableName} WHERE id = ? LIMIT 1`
    const row = await this.dbGetFirst<any>(sql, [key])
    
    return !!row
  }
  
  async delete(key: string): Promise<void> {
    await this.init()
    
    const sql = `DELETE FROM ${this.tableName} WHERE id = ?`
    await this.dbRun(sql, [key])
  }
  
  async getAll(): Promise<Map<string, ResourceMetadata>> {
    await this.init()
    
    const sql = `SELECT * FROM ${this.tableName}`
    const rows = await this.dbGetAll<any>(sql)
    
    const map = new Map<string, ResourceMetadata>()
    for (const row of rows) {
      map.set(row.id, this.rowToMetadata(row))
    }
    
    return map
  }
  
  async clear(): Promise<void> {
    await this.init()
    
    const sql = `DELETE FROM ${this.tableName}`
    await this.dbRun(sql)
  }
  
  async count(): Promise<number> {
    await this.init()
    
    const sql = `SELECT COUNT(*) as count FROM ${this.tableName}`
    const row = await this.dbGetFirst<{ count: number }>(sql)
    
    return row?.count || 0
  }
  
  // ============================================================================
  // QUERIES
  // ============================================================================
  
  async query(filters: CatalogQuery): Promise<ResourceMetadata[]> {
    await this.init()
    
    const { sql, params } = this.buildQuerySQL(filters)
    const rows = await this.dbGetAll<any>(sql, params)
    
    return rows.map(row => this.rowToMetadata(row))
  }
  
  async getStats(): Promise<CatalogStats> {
    await this.init()
    
    const rows = await this.dbGetAll<any>(`SELECT * FROM ${this.tableName}`)
    const resources = rows.map(row => this.rowToMetadata(row))
    
    const servers = new Set<string>()
    const owners = new Set<string>()
    const languages = new Set<string>()
    const bySubject: Record<string, number> = {}
    const byLanguage: Record<string, number> = {}
    const byOwner: Record<string, number> = {}
    const byType: Record<string, number> = {}
    const byFormat: Record<string, number> = {}
    
    let oldestDate: string | undefined
    let newestDate: string | undefined
    let mostAccessedResource: string | undefined
    let maxAccessCount = 0
    let totalSize = 0
    let availableOffline = 0
    let availableOnline = 0
    let bundledResources = 0
    
    for (const resource of resources) {
      servers.add(resource.server)
      owners.add(resource.owner)
      languages.add(resource.language)
      
      bySubject[resource.subject] = (bySubject[resource.subject] || 0) + 1
      byLanguage[resource.language] = (byLanguage[resource.language] || 0) + 1
      byOwner[resource.owner] = (byOwner[resource.owner] || 0) + 1
      byType[resource.type] = (byType[resource.type] || 0) + 1
      byFormat[resource.format] = (byFormat[resource.format] || 0) + 1
      
      if (resource.availability.offline) availableOffline++
      if (resource.availability.online) availableOnline++
      if (resource.availability.bundled) bundledResources++
      
      if (resource.contentMetadata?.size) {
        totalSize += resource.contentMetadata.size
      }
      
      if (resource.accessCount && resource.accessCount > maxAccessCount) {
        maxAccessCount = resource.accessCount
        mostAccessedResource = `${resource.server}/${resource.owner}/${resource.language}/${resource.resourceId}`
      }
      
      if (!oldestDate || resource.catalogedAt < oldestDate) {
        oldestDate = resource.catalogedAt
      }
      if (!newestDate || resource.catalogedAt > newestDate) {
        newestDate = resource.catalogedAt
      }
    }
    
    return {
      totalResources: resources.length,
      totalServers: servers.size,
      totalOwners: owners.size,
      totalLanguages: languages.size,
      bySubject,
      byLanguage,
      byOwner,
      byType,
      byFormat,
      availableOffline,
      availableOnline,
      bundledResources,
      totalSize: totalSize > 0 ? totalSize : undefined,
      oldestResource: oldestDate,
      newestResource: newestDate,
      mostAccessed: mostAccessedResource,
    }
  }
  
  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================
  
  async exportAll(): Promise<string> {
    const map = await this.getAll()
    const resources = Array.from(map.values())
    return JSON.stringify(resources, null, 2)
  }
  
  async importAll(json: string, options: ImportOptions = {}): Promise<void> {
    const resources: ResourceMetadata[] = JSON.parse(json)
    
    for (const resource of resources) {
      const key = `${resource.server}/${resource.owner}/${resource.language}/${resource.resourceId}`
      
      if (options.skipExisting) {
        const exists = await this.has(key)
        if (exists) continue
      }
      
      await this.save(key, resource)
    }
  }
  
  // ============================================================================
  // HELPERS
  // ============================================================================
  
  /**
   * Build SQL query from filters
   */
  private buildQuerySQL(filters: CatalogQuery): { sql: string; params: any[] } {
    const conditions: string[] = []
    const params: any[] = []
    
    // Simple filters
    if (filters.server) {
      const servers = Array.isArray(filters.server) ? filters.server : [filters.server]
      conditions.push(`server IN (${servers.map(() => '?').join(',')})`)
      params.push(...servers)
    }
    
    if (filters.owner) {
      const owners = Array.isArray(filters.owner) ? filters.owner : [filters.owner]
      conditions.push(`owner IN (${owners.map(() => '?').join(',')})`)
      params.push(...owners)
    }
    
    if (filters.language) {
      const languages = Array.isArray(filters.language) ? filters.language : [filters.language]
      conditions.push(`language IN (${languages.map(() => '?').join(',')})`)
      params.push(...languages)
    }
    
    if (filters.resourceId) {
      const ids = Array.isArray(filters.resourceId) ? filters.resourceId : [filters.resourceId]
      conditions.push(`resourceId IN (${ids.map(() => '?').join(',')})`)
      params.push(...ids)
    }
    
    if (filters.subject) {
      const subjects = Array.isArray(filters.subject) ? filters.subject : [filters.subject]
      conditions.push(`subject IN (${subjects.map(() => '?').join(',')})`)
      params.push(...subjects)
    }
    
    if (filters.version) {
      conditions.push('version = ?')
      params.push(filters.version)
    }
    
    if (filters.type) {
      const types = Array.isArray(filters.type) ? filters.type : [filters.type]
      conditions.push(`type IN (${types.map(() => '?').join(',')})`)
      params.push(...types)
    }
    
    if (filters.format) {
      const formats = Array.isArray(filters.format) ? filters.format : [filters.format]
      conditions.push(`format IN (${formats.map(() => '?').join(',')})`)
      params.push(...formats)
    }
    
    // JSON filters (require parsing)
    if (filters.availableOffline !== undefined) {
      conditions.push(`json_extract(availability, '$.offline') = ?`)
      params.push(filters.availableOffline ? 1 : 0)
    }
    
    if (filters.availableOnline !== undefined) {
      conditions.push(`json_extract(availability, '$.online') = ?`)
      params.push(filters.availableOnline ? 1 : 0)
    }
    
    if (filters.bundled !== undefined) {
      conditions.push(`json_extract(availability, '$.bundled') = ?`)
      params.push(filters.bundled ? 1 : 0)
    }
    
    const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : ''
    const sql = `SELECT * FROM ${this.tableName} ${whereClause}`
    
    return { sql, params }
  }
  
  /**
   * Convert database row to ResourceMetadata
   */
  private rowToMetadata(row: any): ResourceMetadata {
    return {
      server: row.server,
      owner: row.owner,
      language: row.language,
      resourceId: row.resourceId,
      title: row.title,
      description: row.description || undefined,
      subject: row.subject,
      version: row.version,
      type: row.type,
      format: row.format,
      contentType: row.contentType,
      availability: JSON.parse(row.availability),
      locations: JSON.parse(row.locations),
      contentMetadata: row.contentMetadata ? JSON.parse(row.contentMetadata) : undefined,
      quality: row.quality ? JSON.parse(row.quality) : undefined,
      license: row.license ? JSON.parse(row.license) : undefined,
      contributors: row.contributors ? JSON.parse(row.contributors) : undefined,
      catalogedAt: row.catalogedAt,
      updatedAt: row.updatedAt || undefined,
      accessedAt: row.accessedAt || undefined,
      accessCount: row.accessCount || 0,
      urls: row.urls ? JSON.parse(row.urls) : undefined,
    }
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
  
  private async dbRun(sql: string, params?: any[]): Promise<void> {
    if (this.db.runAsync) {
      await this.db.runAsync(sql, params)
    } else if (this.db.runSync) {
      this.db.runSync(sql, params)
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
