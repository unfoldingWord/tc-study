/**
 * Drizzle SQLite Storage Adapter
 * 
 * A React Native storage adapter using Drizzle ORM with expo-sqlite for structured data storage.
 * Integrates with the unified database system and provides full StorageAdapter interface compatibility.
 */

import { and, eq, inArray, lt, sql } from 'drizzle-orm';
import { DatabaseManager } from '../../../db/DatabaseManager';
import { resourceContent, resourceMetadata, storageStats } from '../../../db/schema/storage';
import {
    ProcessedContent,
    QuotaInfo,
    ResourceContent,
    ResourceMetadata,
    StorageAdapter,
    StorageInfo,
    StorageTransaction,
    TableOfContents
} from '../../types/context';

export class DrizzleSQLiteStorageAdapter implements StorageAdapter {
  private databaseManager: DatabaseManager;
  private isInitialized = false;

  constructor() {
    this.databaseManager = DatabaseManager.getInstance();
  }

  /**
   * Initialize the storage adapter
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    
    
    // Ensure database manager is initialized
    if (!this.databaseManager.isInitialized()) {
      await this.databaseManager.initialize();
    }
    
    // Initialize storage statistics if not exists
    await this.initializeStorageStats();
    
    this.isInitialized = true;
    
  }

  /**
   * Initialize storage statistics table
   */
  private async initializeStorageStats(): Promise<void> {
    const db = this.databaseManager.getDb();
    
    // Check if global stats exist, create if not
    const existingStats = await db
      .select()
      .from(storageStats)
      .where(eq(storageStats.key, 'global'))
      .limit(1);
    
    if (existingStats.length === 0) {
      await db.insert(storageStats).values({
        key: 'global',
        totalSize: 0,
        itemCount: 0,
        lastCleanup: new Date(),
      });
      
    }
  }

  /**
   * Get all resource metadata for a server/owner/language combination
   */
  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    const rows = await db
      .select()
      .from(resourceMetadata)
      .where(
        and(
          eq(resourceMetadata.server, server),
          eq(resourceMetadata.owner, owner),
          eq(resourceMetadata.language, language)
        )
      );

    // Convert stored data back to proper types
    const metadata: ResourceMetadata[] = rows.map(row => ({
      id: row.id,
      resourceKey: row.resourceKey,
      server: row.server,
      owner: row.owner,
      language: row.language,
      type: row.type as any, // ResourceType
      title: row.title,
      description: row.description || '',
      name: row.name,
      version: row.version,
      lastUpdated: row.lastUpdated,
      available: row.available,
      toc: row.toc ? JSON.parse(row.toc) as TableOfContents : { books: [] },
      isAnchor: row.isAnchor,
      
      // Language metadata
      languageDirection: row.languageDirection as 'rtl' | 'ltr' | undefined,
      languageTitle: row.languageTitle || undefined,
      languageIsGL: row.languageIsGL || undefined,
      
      // SHA-based change detection
      commitSha: row.commitSha || undefined,
      fileHashes: row.fileHashes ? JSON.parse(row.fileHashes) : undefined,
    }));

    
    if (metadata.length > 0) {
      
    }
    
    return metadata;
  }

  /**
   * Save resource metadata to storage
   */
  async saveResourceMetadata(metadata: ResourceMetadata[]): Promise<void> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    // Use transaction for batch insert
    await db.transaction(async (tx) => {
      for (const meta of metadata) {
        const resourceKey = `${meta.server}/${meta.owner}/${meta.language}/${meta.id}`;
        
        
        await tx
          .insert(resourceMetadata)
          .values({
            resourceKey,
            id: meta.id,
            server: meta.server,
            owner: meta.owner,
            language: meta.language,
            type: meta.type,
            title: meta.title,
            description: meta.description,
            name: meta.name,
            version: meta.version,
            lastUpdated: meta.lastUpdated,
            available: meta.available,
            isAnchor: meta.isAnchor,
            toc: meta.toc ? JSON.stringify(meta.toc) : null,
            languageDirection: meta.languageDirection || null,
            languageTitle: meta.languageTitle || null,
            languageIsGL: meta.languageIsGL || null,
            commitSha: meta.commitSha || null,
            fileHashes: meta.fileHashes ? JSON.stringify(meta.fileHashes) : null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: resourceMetadata.resourceKey,
            set: {
              title: meta.title,
              description: meta.description,
              name: meta.name,
              version: meta.version,
              lastUpdated: meta.lastUpdated,
              available: meta.available,
              isAnchor: meta.isAnchor,
              toc: meta.toc ? JSON.stringify(meta.toc) : null,
              languageDirection: meta.languageDirection || null,
              languageTitle: meta.languageTitle || null,
              languageIsGL: meta.languageIsGL || null,
              commitSha: meta.commitSha || null,
              fileHashes: meta.fileHashes ? JSON.stringify(meta.fileHashes) : null,
              updatedAt: new Date(),
            }
          });
      }
    });

    
  }

  /**
   * Get resource content by key
   */
  async getResourceContent(key: string): Promise<ResourceContent | null> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    const rows = await db
      .select()
      .from(resourceContent)
      .where(eq(resourceContent.key, key))
      .limit(1);

    if (rows.length === 0) {
      
      return null;
    }

    const row = rows[0];

    // Convert stored data back to proper types
    const content: ResourceContent = {
      key: row.key,
      resourceKey: row.resourceKey,
      resourceId: row.resourceId,
      server: row.server,
      owner: row.owner,
      language: row.language,
      type: row.type as any, // ResourceType
      bookCode: row.bookCode || undefined,
      articleId: row.articleId || undefined,
      content: JSON.parse(row.content) as ProcessedContent,
      lastFetched: row.lastFetched,
      cachedUntil: row.cachedUntil || undefined,
      checksum: row.checksum || undefined,
      size: row.size,
      sourceSha: row.sourceSha || undefined,
      sourceCommit: row.sourceCommit || undefined,
    };

    
    return content;
  }

  /**
   * Save resource content to storage
   */
  async saveResourceContent(content: ResourceContent): Promise<void> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    // Generate resourceKey from content key (remove bookCode from end)
    const keyParts = content.key.split('/');
    const resourceKey = keyParts.slice(0, -1).join('/'); // Remove last part (bookCode)

    await db
      .insert(resourceContent)
      .values({
        key: content.key,
        resourceKey,
        resourceId: content.resourceId,
        server: content.server,
        owner: content.owner,
        language: content.language,
        type: content.type,
        bookCode: content.bookCode || null,
        articleId: content.articleId || null,
        content: JSON.stringify(content.content),
        lastFetched: content.lastFetched,
        cachedUntil: content.cachedUntil || null,
        checksum: content.checksum || null,
        size: content.size,
        sourceSha: content.sourceSha || null,
        sourceCommit: content.sourceCommit || null,
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({
        target: resourceContent.key,
        set: {
          content: JSON.stringify(content.content),
          lastFetched: content.lastFetched,
          cachedUntil: content.cachedUntil || null,
          checksum: content.checksum || null,
          size: content.size,
          sourceSha: content.sourceSha || null,
          sourceCommit: content.sourceCommit || null,
          updatedAt: new Date(),
        }
      });

    // Update storage statistics
    await this.updateStorageStats();

    
  }

  /**
   * Get multiple content items by keys (batch operation)
   */
  async getMultipleContent(keys: string[]): Promise<ResourceContent[]> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    if (keys.length === 0) return [];

    

    const rows = await db
      .select()
      .from(resourceContent)
      .where(inArray(resourceContent.key, keys));

    const results: ResourceContent[] = rows.map(row => ({
      key: row.key,
      resourceKey: row.resourceKey,
      resourceId: row.resourceId,
      server: row.server,
      owner: row.owner,
      language: row.language,
      type: row.type as any, // ResourceType
      bookCode: row.bookCode || undefined,
      articleId: row.articleId || undefined,
      content: JSON.parse(row.content) as ProcessedContent,
      lastFetched: row.lastFetched,
      cachedUntil: row.cachedUntil || undefined,
      checksum: row.checksum || undefined,
      size: row.size,
      sourceSha: row.sourceSha || undefined,
      sourceCommit: row.sourceCommit || undefined,
    }));

    
    return results;
  }

  /**
   * Save multiple content items (batch operation with transaction)
   */
  async saveMultipleContent(contents: ResourceContent[]): Promise<void> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    if (contents.length === 0) return;

    

    await db.transaction(async (tx) => {
      for (const content of contents) {
        // Generate resourceKey from content key
        const keyParts = content.key.split('/');
        const resourceKey = keyParts.slice(0, -1).join('/');

        await tx
          .insert(resourceContent)
          .values({
            key: content.key,
            resourceKey,
            resourceId: content.resourceId,
            server: content.server,
            owner: content.owner,
            language: content.language,
            type: content.type,
            bookCode: content.bookCode || null,
            articleId: content.articleId || null,
            content: JSON.stringify(content.content),
            lastFetched: content.lastFetched,
            cachedUntil: content.cachedUntil || null,
            checksum: content.checksum || null,
            size: content.size,
            sourceSha: content.sourceSha || null,
            sourceCommit: content.sourceCommit || null,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: resourceContent.key,
            set: {
              content: JSON.stringify(content.content),
              lastFetched: content.lastFetched,
              cachedUntil: content.cachedUntil || null,
              checksum: content.checksum || null,
              size: content.size,
              sourceSha: content.sourceSha || null,
              sourceCommit: content.sourceCommit || null,
              updatedAt: new Date(),
            }
          });
      }
    });

    // Update storage statistics
    await this.updateStorageStats();

    
  }

  /**
   * Begin a transaction for atomic operations
   */
  async beginTransaction(): Promise<StorageTransaction> {
    await this.initialize();
    return new DrizzleSQLiteTransaction(this.databaseManager);
  }

  /**
   * Clear expired content based on cachedUntil timestamps
   */
  async clearExpiredContent(): Promise<void> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    const now = new Date();
    const result = await db
      .delete(resourceContent)
      .where(
        and(
          sql`${resourceContent.cachedUntil} IS NOT NULL`,
          lt(resourceContent.cachedUntil, now)
        )
      );

    // Update storage statistics
    await this.updateStorageStats();

    
  }

  /**
   * Clear all content (keep metadata)
   */
  async clearAllContent(): Promise<void> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    await db.delete(resourceContent);

    // Update storage statistics
    await this.updateStorageStats();

    
  }

  /**
   * Get storage information and statistics
   */
  async getStorageInfo(): Promise<StorageInfo> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    // Get current statistics
    const stats = await db
      .select({
        itemCount: sql<number>`COUNT(*)`,
        totalSize: sql<number>`COALESCE(SUM(${resourceContent.size}), 0)`,
      })
      .from(resourceContent);

    const statsRow = stats[0];

    // Get last cleanup time from storage stats
    const storageStatsRows = await db
      .select()
      .from(storageStats)
      .where(eq(storageStats.key, 'global'))
      .limit(1);

    const lastCleanup = storageStatsRows.length > 0 
      ? storageStatsRows[0].lastCleanup 
      : new Date();

    return {
      totalSize: statsRow.totalSize || 0,
      availableSpace: -1, // Will be calculated in checkQuota
      itemCount: statsRow.itemCount || 0,
      lastCleanup,
    };
  }

  /**
   * Check storage quota (simplified for mobile)
   */
  async checkQuota(): Promise<QuotaInfo> {
    const info = await this.getStorageInfo();
    const defaultQuota = 200 * 1024 * 1024; // 200MB default for mobile with Drizzle
    
    return {
      used: info.totalSize,
      available: Math.max(0, defaultQuota - info.totalSize),
      total: defaultQuota,
      nearLimit: info.totalSize > (defaultQuota * 0.8) // 80% threshold
    };
  }

  /**
   * Update storage statistics
   */
  private async updateStorageStats(): Promise<void> {
    const db = this.databaseManager.getDb();

    const stats = await db
      .select({
        itemCount: sql<number>`COUNT(*)`,
        totalSize: sql<number>`COALESCE(SUM(${resourceContent.size}), 0)`,
      })
      .from(resourceContent);

    const statsRow = stats[0];

    await db
      .update(storageStats)
      .set({
        totalSize: statsRow.totalSize || 0,
        itemCount: statsRow.itemCount || 0,
        updatedAt: new Date(),
      })
      .where(eq(storageStats.key, 'global'));
  }

  /**
   * Get all resource keys from metadata table
   */
  async getAllResourceKeys(): Promise<string[]> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    const rows = await db
      .select({ resourceKey: resourceMetadata.resourceKey })
      .from(resourceMetadata);

    return rows.map(row => row.resourceKey);
  }

  /**
   * Get all content keys from content table
   */
  async getAllContentKeys(): Promise<string[]> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    const rows = await db
      .select({ key: resourceContent.key })
      .from(resourceContent);

    return rows.map(row => row.key);
  }

  /**
   * Get metadata with versions for comparison
   */
  async getMetadataVersions(): Promise<Map<string, {version: string, lastUpdated: Date}>> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    const rows = await db
      .select({
        resourceKey: resourceMetadata.resourceKey,
        version: resourceMetadata.version,
        lastUpdated: resourceMetadata.lastUpdated,
      })
      .from(resourceMetadata);

    const versionMap = new Map<string, {version: string, lastUpdated: Date}>();

    for (const row of rows) {
      versionMap.set(row.resourceKey, {
        version: row.version,
        lastUpdated: row.lastUpdated,
      });
    }

    return versionMap;
  }

  /**
   * Close the database connection (delegates to DatabaseManager)
   */
  async close(): Promise<void> {
    
    // Note: We don't close the DatabaseManager here as it might be used by other services
    this.isInitialized = false;
  }

  /**
   * Delete all storage data (useful for testing)
   */
  async deleteAllData(): Promise<void> {
    await this.initialize();
    const db = this.databaseManager.getDb();

    

    await db.transaction(async (tx) => {
      await tx.delete(resourceContent);
      await tx.delete(resourceMetadata);
      await tx.delete(storageStats);
    });

    // Reinitialize storage stats
    await this.initializeStorageStats();

    
  }

  /**
   * Get the database name (useful for debugging)
   */
  getDatabaseName(): string {
    return 'unified-drizzle-database';
  }
}

/**
 * Drizzle SQLite Transaction implementation
 */
class DrizzleSQLiteTransaction implements StorageTransaction {
  private operations: (() => Promise<void>)[] = [];
  private isCommitted = false;
  private isRolledBack = false;

  constructor(private databaseManager: DatabaseManager) {}

  async save(content: ResourceContent): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations.push(async () => {
      const db = this.databaseManager.getDb();
      
      // Generate resourceKey from content key
      const keyParts = content.key.split('/');
      const resourceKey = keyParts.slice(0, -1).join('/');

      await db
        .insert(resourceContent)
        .values({
          key: content.key,
          resourceKey,
          resourceId: content.resourceId,
          server: content.server,
          owner: content.owner,
          language: content.language,
          type: content.type,
          bookCode: content.bookCode || null,
          articleId: content.articleId || null,
          content: JSON.stringify(content.content),
          lastFetched: content.lastFetched,
          cachedUntil: content.cachedUntil || null,
          checksum: content.checksum || null,
          size: content.size,
          sourceSha: content.sourceSha || null,
          sourceCommit: content.sourceCommit || null,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: resourceContent.key,
          set: {
            content: JSON.stringify(content.content),
            lastFetched: content.lastFetched,
            cachedUntil: content.cachedUntil || null,
            checksum: content.checksum || null,
            size: content.size,
            sourceSha: content.sourceSha || null,
            sourceCommit: content.sourceCommit || null,
            updatedAt: new Date(),
          }
        });
    });
  }

  async delete(key: string): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations.push(async () => {
      const db = this.databaseManager.getDb();
      await db
        .delete(resourceContent)
        .where(eq(resourceContent.key, key));
    });
  }

  async commit(): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    const db = this.databaseManager.getDb();

    await db.transaction(async (tx) => {
      // Execute all operations within the transaction
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
export const createDrizzleSQLiteStorage = (): DrizzleSQLiteStorageAdapter => {
  return new DrizzleSQLiteStorageAdapter();
};

export const createDrizzleStorageAdapter = (): DrizzleSQLiteStorageAdapter => {
  return new DrizzleSQLiteStorageAdapter();
};

// Export the main class as default
export default DrizzleSQLiteStorageAdapter;
