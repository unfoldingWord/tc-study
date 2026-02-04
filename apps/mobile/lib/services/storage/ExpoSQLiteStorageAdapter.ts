/**
 * Expo SQLite Storage Adapter
 * 
 * A React Native storage adapter using expo-sqlite for structured data storage.
 * Mirrors the IndexedDB structure but uses SQLite for mobile-optimized performance.
 */

import * as SQLite from 'expo-sqlite';
import { QuotaInfo, ResourceContent, ResourceMetadata, StorageAdapter, StorageInfo, StorageTransaction } from '../../types/context';

export class ExpoSQLiteStorageAdapter implements StorageAdapter {
  private db: SQLite.SQLiteDatabase | null = null;
  private dbName: string;
  private isInitialized = false;

  constructor(dbName = 'bt-synergy-resources') {
    this.dbName = dbName;
  }

  /**
   * Initialize the SQLite database with proper schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    
    
    try {
      this.db = await SQLite.openDatabaseAsync(this.dbName);
      
      // Create tables with the same structure as IndexedDB
      await this.createTables();
      
      this.isInitialized = true;
      
    } catch (error) {
      console.error('❌ Failed to open Expo SQLite:', error);
      throw new Error(`Failed to open Expo SQLite: ${error}`);
    }
  }

  private async createTables(): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    // Resource Metadata table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS resource_metadata (
        resourceKey TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        server TEXT NOT NULL,
        owner TEXT NOT NULL,
        language TEXT NOT NULL,
        type TEXT NOT NULL,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        lastUpdated INTEGER NOT NULL,
        available INTEGER NOT NULL,
        isAnchor INTEGER NOT NULL,
        toc TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now'))
      );
    `);

    // Create indexes for efficient querying
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_resource_metadata_server_owner_language 
      ON resource_metadata(server, owner, language);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_resource_metadata_type 
      ON resource_metadata(type);
    `);

    // Resource Content table
    await this.db.execAsync(`
      CREATE TABLE IF NOT EXISTS resource_content (
        key TEXT PRIMARY KEY,
        resourceKey TEXT NOT NULL,
        resourceId TEXT NOT NULL,
        server TEXT NOT NULL,
        owner TEXT NOT NULL,
        language TEXT NOT NULL,
        type TEXT NOT NULL,
        bookCode TEXT,
        articleId TEXT,
        content TEXT NOT NULL,
        lastFetched INTEGER NOT NULL,
        cachedUntil INTEGER,
        checksum TEXT,
        size INTEGER NOT NULL,
        sourceSha TEXT,
        sourceCommit TEXT,
        updated_at INTEGER DEFAULT (strftime('%s', 'now')),
        FOREIGN KEY (resourceKey) REFERENCES resource_metadata(resourceKey)
      );
    `);

    // Create indexes for efficient querying
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_resource_content_resourceKey 
      ON resource_content(resourceKey);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_resource_content_resourceId_type 
      ON resource_content(resourceId, type);
    `);
    await this.db.execAsync(`
      CREATE INDEX IF NOT EXISTS idx_resource_content_bookCode 
      ON resource_content(bookCode);
    `);

    
  }

  /**
   * Get all resource metadata for a server/owner/language combination
   */
  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    const rows = await this.db.getAllAsync(
      'SELECT * FROM resource_metadata WHERE server = ? AND owner = ? AND language = ?',
      [server, owner, language]
    );

    // Convert stored data back to proper types
    const metadata = rows.map((row: any) => ({
      ...row,
      lastUpdated: new Date(row.lastUpdated),
      available: Boolean(row.available),
      isAnchor: Boolean(row.isAnchor),
      toc: row.toc ? JSON.parse(row.toc) : undefined
    }));

    
    return metadata;
  }

  /**
   * Save resource metadata to storage
   */
  async saveResourceMetadata(metadata: ResourceMetadata[]): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    for (const meta of metadata) {
      const resourceKey = `${meta.server}/${meta.owner}/${meta.language}/${meta.id}`;
      
      await this.db.runAsync(
        `INSERT OR REPLACE INTO resource_metadata 
         (resourceKey, id, server, owner, language, type, name, version, lastUpdated, available, isAnchor, toc, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          resourceKey,
          meta.id,
          meta.server,
          meta.owner,
          meta.language,
          meta.type,
          meta.name,
          meta.version,
          meta.lastUpdated.getTime(),
          meta.available ? 1 : 0,
          meta.isAnchor ? 1 : 0,
          meta.toc ? JSON.stringify(meta.toc) : null,
          Date.now()
        ]
      );
    }

    
  }

  /**
   * Get resource content by key
   */
  async getResourceContent(key: string): Promise<ResourceContent | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    const row = await this.db.getFirstAsync(
      'SELECT * FROM resource_content WHERE key = ?',
      [key]
    ) as any;

    if (!row) {
      
      return null;
    }

    // Convert stored data back to proper types
    const content: ResourceContent = {
      key: row.key,
      resourceKey: row.resourceKey,
      resourceId: row.resourceId,
      server: row.server,
      owner: row.owner,
      language: row.language,
      type: row.type,
      bookCode: row.bookCode || undefined,
      articleId: row.articleId || undefined,
      content: JSON.parse(row.content),
      lastFetched: new Date(row.lastFetched),
      cachedUntil: row.cachedUntil ? new Date(row.cachedUntil) : undefined,
      checksum: row.checksum || undefined,
      size: row.size,
      sourceSha: row.sourceSha || undefined,
      sourceCommit: row.sourceCommit || undefined
    };

    
    return content;
  }

  /**
   * Save resource content to storage
   */
  async saveResourceContent(content: ResourceContent): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    const resourceKey = content.key.split('/').slice(0, -1).join('/');
    
    await this.db.runAsync(
      `INSERT OR REPLACE INTO resource_content 
       (key, resourceKey, resourceId, server, owner, language, type, bookCode, articleId, content, lastFetched, cachedUntil, checksum, size, sourceSha, sourceCommit, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        content.key,
        resourceKey,
        content.resourceId,
        content.server,
        content.owner,
        content.language,
        content.type,
        content.bookCode || null,
        content.articleId || null,
        JSON.stringify(content.content),
        content.lastFetched.getTime(),
        content.cachedUntil?.getTime() || null,
        content.checksum || null,
        content.size,
        content.sourceSha || null,
        content.sourceCommit || null,
        Date.now()
      ]
    );

    
  }

  /**
   * Get multiple content items by keys (batch operation)
   */
  async getMultipleContent(keys: string[]): Promise<ResourceContent[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    if (keys.length === 0) return [];

    

    const placeholders = keys.map(() => '?').join(',');
    const rows = await this.db.getAllAsync(
      `SELECT * FROM resource_content WHERE key IN (${placeholders})`,
      keys
    );

    const results = rows.map((row: any) => ({
      key: row.key,
      resourceKey: row.resourceKey,
      resourceId: row.resourceId,
      server: row.server,
      owner: row.owner,
      language: row.language,
      type: row.type,
      bookCode: row.bookCode || undefined,
      articleId: row.articleId || undefined,
      content: JSON.parse(row.content),
      lastFetched: new Date(row.lastFetched),
      cachedUntil: row.cachedUntil ? new Date(row.cachedUntil) : undefined,
      checksum: row.checksum || undefined,
      size: row.size,
      sourceSha: row.sourceSha || undefined,
      sourceCommit: row.sourceCommit || undefined
    }));

    
    return results;
  }

  /**
   * Save multiple content items (batch operation)
   */
  async saveMultipleContent(contents: ResourceContent[]): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    if (contents.length === 0) return;

    

    await this.db.withTransactionAsync(async () => {
      for (const content of contents) {
        const resourceKey = content.key.split('/').slice(0, -1).join('/');
        
        await this.db!.runAsync(
          `INSERT OR REPLACE INTO resource_content 
           (key, resourceKey, resourceId, server, owner, language, type, bookCode, articleId, content, lastFetched, cachedUntil, checksum, size, sourceSha, sourceCommit, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [
            content.key,
            resourceKey,
            content.resourceId,
            content.server,
            content.owner,
            content.language,
            content.type,
            content.bookCode || null,
            content.articleId || null,
            JSON.stringify(content.content),
            content.lastFetched.getTime(),
            content.cachedUntil?.getTime() || null,
            content.checksum || null,
            content.size,
            content.sourceSha || null,
            content.sourceCommit || null,
            Date.now()
          ]
        );
      }
    });

    
  }

  /**
   * Begin a transaction for atomic operations
   */
  async beginTransaction(): Promise<StorageTransaction> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new ExpoSQLiteTransaction(this.db);
  }

  /**
   * Clear expired content based on cachedUntil timestamps
   */
  async clearExpiredContent(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    const result = await this.db.runAsync(
      'DELETE FROM resource_content WHERE cachedUntil IS NOT NULL AND cachedUntil < ?',
      [Date.now()]
    );

    
  }

  /**
   * Clear all content (keep metadata)
   */
  async clearAllContent(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    await this.db.runAsync('DELETE FROM resource_content');
    
  }

  /**
   * Clear all data (metadata and content)
   */
  async clearAllData(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    await this.db.runAsync('DELETE FROM resource_metadata');
    await this.db.runAsync('DELETE FROM resource_content');
    
  }

  /**
   * Get all resource keys from metadata table
   */
  async getAllResourceKeys(): Promise<string[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT resourceKey FROM resource_metadata');
    return rows.map((row: any) => row.resourceKey);
  }

  /**
   * Get all content keys from content table
   */
  async getAllContentKeys(): Promise<string[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT key FROM resource_content');
    return rows.map((row: any) => row.key);
  }

  /**
   * Get metadata with versions for comparison
   */
  async getMetadataVersions(): Promise<Map<string, {version: string, lastUpdated: Date}>> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const rows = await this.db.getAllAsync('SELECT resourceKey, version, lastUpdated FROM resource_metadata');
    const versionMap = new Map<string, {version: string, lastUpdated: Date}>();

    for (const row of rows as any[]) {
      versionMap.set(row.resourceKey, {
        version: row.version,
        lastUpdated: new Date(row.lastUpdated)
      });
    }

    return versionMap;
  }

  /**
   * Get storage information and statistics
   */
  async getStorageInfo(): Promise<StorageInfo> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    const result = await this.db.getFirstAsync(
      'SELECT COUNT(*) as itemCount, SUM(size) as totalSize FROM resource_content'
    ) as any;

    return {
      totalSize: result.totalSize || 0,
      availableSpace: -1, // Will be calculated in checkQuota
      itemCount: result.itemCount || 0,
      lastCleanup: new Date()
    };
  }

  /**
   * Check storage quota (simplified for mobile)
   */
  async checkQuota(): Promise<QuotaInfo> {
    const info = await this.getStorageInfo();
    const defaultQuota = 100 * 1024 * 1024; // 100MB default for mobile
    
    return {
      used: info.totalSize,
      available: Math.max(0, defaultQuota - info.totalSize),
      total: defaultQuota,
      nearLimit: info.totalSize > (defaultQuota * 0.8)
    };
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      
      await this.db.closeAsync();
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Delete the entire database (useful for testing)
   */
  async deleteDatabase(): Promise<void> {
    await this.close();
    
    // Note: expo-sqlite doesn't have a direct delete method
    // The database will be recreated on next initialization
  }

  /**
   * Get the database name (useful for debugging)
   */
  getDatabaseName(): string {
    return this.dbName;
  }
}

/**
 * Expo SQLite Transaction implementation
 */
class ExpoSQLiteTransaction implements StorageTransaction {
  private operations: (() => Promise<void>)[] = [];
  private isCommitted = false;
  private isRolledBack = false;

  constructor(private db: SQLite.SQLiteDatabase) {}

  async save(content: ResourceContent): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations.push(async () => {
      const resourceKey = content.key.split('/').slice(0, -1).join('/');
      
      await this.db.runAsync(
        `INSERT OR REPLACE INTO resource_content 
         (key, resourceKey, resourceId, server, owner, language, type, bookCode, articleId, content, lastFetched, cachedUntil, checksum, size, sourceSha, sourceCommit, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          content.key,
          resourceKey,
          content.resourceId,
          content.server,
          content.owner,
          content.language,
          content.type,
          content.bookCode || null,
          content.articleId || null,
          JSON.stringify(content.content),
          content.lastFetched.getTime(),
          content.cachedUntil?.getTime() || null,
          content.checksum || null,
          content.size,
          content.sourceSha || null,
          content.sourceCommit || null,
          Date.now()
        ]
      );
    });
  }

  async delete(key: string): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations.push(async () => {
      await this.db.runAsync('DELETE FROM resource_content WHERE key = ?', [key]);
    });
  }

  async commit(): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    await this.db.withTransactionAsync(async () => {
      for (const operation of this.operations) {
        await operation();
      }
    });

    this.isCommitted = true;
    
  }

  async rollback(): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations = [];
    this.isRolledBack = true;
    
  }
}

// Export factory functions for easy usage
export const createExpoSQLiteStorage = (dbName?: string): ExpoSQLiteStorageAdapter => {
  return new ExpoSQLiteStorageAdapter(dbName);
};

export const createTempExpoSQLiteStorage = (): ExpoSQLiteStorageAdapter => {
  const tempName = `bt-synergy-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return new ExpoSQLiteStorageAdapter(tempName);
};
