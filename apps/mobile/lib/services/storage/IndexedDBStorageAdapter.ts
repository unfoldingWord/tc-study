/**
 * IndexedDB Storage Adapter
 * 
 * A browser-native storage adapter using IndexedDB for structured data storage.
 * Mirrors the SQLiteStorageAdapter structure but uses IndexedDB's object stores
 * and transactions for optimal browser performance and offline capabilities.
 */

import { QuotaInfo, ResourceContent, ResourceMetadata, StorageAdapter, StorageInfo, StorageTransaction } from '../../types/context';

export class IndexedDBStorageAdapter implements StorageAdapter {
  private db: IDBDatabase | null = null;
  private dbName: string;
  private dbVersion = 1;
  private isInitialized = false;

  constructor(dbName = 'bt-studio-resources') {
    this.dbName = dbName;
  }

  /**
   * Initialize the IndexedDB database with proper schema
   */
  async initialize(): Promise<void> {
    if (this.isInitialized) return;

    
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onerror = () => {
        console.error('❌ Failed to open IndexedDB:', request.error);
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        
        resolve();
      };

      request.onupgradeneeded = (event) => {
        
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }

  private createObjectStores(db: IDBDatabase): void {
    // Resource Metadata object store (equivalent to SQLite table)
    if (!db.objectStoreNames.contains('resource_metadata')) {
      const metadataStore = db.createObjectStore('resource_metadata', { keyPath: 'resourceKey' });
      
      // Create indexes for efficient querying (equivalent to SQLite indexes)
      metadataStore.createIndex('server_owner_language', ['server', 'owner', 'language'], { unique: false });
      metadataStore.createIndex('type', 'type', { unique: false });
      metadataStore.createIndex('name', 'name', { unique: false });
      
      
    }

    // Resource Content object store (equivalent to SQLite table)
    if (!db.objectStoreNames.contains('resource_content')) {
      const contentStore = db.createObjectStore('resource_content', { keyPath: 'key' });
      
      // Create indexes for efficient querying
      contentStore.createIndex('resourceKey', 'resourceKey', { unique: false }); // Foreign key to metadata
      contentStore.createIndex('resourceId_type', ['resourceId', 'type'], { unique: false });
      contentStore.createIndex('bookCode', 'bookCode', { unique: false });
      contentStore.createIndex('cachedUntil', 'cachedUntil', { unique: false });
      contentStore.createIndex('server_owner_language', ['server', 'owner', 'language'], { unique: false });
      contentStore.createIndex('sourceSha', 'sourceSha', { unique: false });
      
      
    }

    
  }

  /**
   * Get all resource metadata for a server/owner/language combination
   */
  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_metadata'], 'readonly');
      const store = transaction.objectStore('resource_metadata');
      const index = store.index('server_owner_language');
      const request = index.getAll([server, owner, language]);

      request.onerror = () => {
        console.error('❌ Failed to fetch metadata:', request.error);
        reject(new Error(`Failed to fetch metadata: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const results = request.result || [];
        
        // Convert stored data back to proper types
        const metadata = results.map(row => ({
          ...row,
          lastUpdated: new Date(row.lastUpdated),
          available: Boolean(row.available),
          isAnchor: Boolean(row.isAnchor),
          toc: row.toc ? JSON.parse(row.toc) : undefined  // Parse JSON string back to object
        }));

        
        if (metadata.length > 0) {
          
        }
        resolve(metadata);
      };
    });
  }

  /**
   * Save resource metadata to storage
   */
  async saveResourceMetadata(metadata: ResourceMetadata[]): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_metadata'], 'readwrite');
      const store = transaction.objectStore('resource_metadata');

      transaction.onerror = () => {
        console.error('❌ Failed to save metadata:', transaction.error);
        reject(new Error(`Failed to save metadata: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        
        resolve();
      };

      // Save each metadata record
      for (const meta of metadata) {
        const resourceKey = `${meta.server}/${meta.owner}/${meta.language}/${meta.id}`;
        
        const dataToStore = {
          ...meta,
          resourceKey, // New composite key
          lastUpdated: meta.lastUpdated.getTime(), // Store as timestamp
          available: meta.available ? 1 : 0,        // Store as number for consistency
          isAnchor: meta.isAnchor ? 1 : 0,
          toc: meta.toc ? JSON.stringify(meta.toc) : undefined, // Store as JSON string
          updated_at: Date.now()
        };

        store.put(dataToStore);
      }
    });
  }

  /**
   * Get resource content by key
   */
  async getResourceContent(key: string): Promise<ResourceContent | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readonly');
      const store = transaction.objectStore('resource_content');
      const request = store.get(key);

      request.onerror = () => {
        console.error('❌ Failed to fetch content:', request.error);
        reject(new Error(`Failed to fetch content: ${request.error?.message}`));
      };

      request.onsuccess = () => {
        const row = request.result;
        
        if (!row) {
          
          resolve(null);
          return;
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
          content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
          lastFetched: new Date(row.lastFetched),
          cachedUntil: row.cachedUntil ? new Date(row.cachedUntil) : undefined,
          checksum: row.checksum || undefined,
          size: row.size,
          sourceSha: row.sourceSha || undefined,
          sourceCommit: row.sourceCommit || undefined
        };

        
        resolve(content);
      };
    });
  }

  /**
   * Save resource content to storage
   */
  async saveResourceContent(content: ResourceContent): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readwrite');
      const store = transaction.objectStore('resource_content');

      transaction.onerror = () => {
        console.error('❌ Failed to save content:', transaction.error);
        reject(new Error(`Failed to save content: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        
        resolve();
      };

      // Generate resourceKey from content key (remove bookCode from end)
      const keyParts = content.key.split('/');
      const resourceKey = keyParts.slice(0, -1).join('/'); // Remove last part (bookCode)
      
      const dataToStore = {
        ...content,
        resourceKey, // Foreign key to metadata
        content: JSON.stringify(content.content), // Store as JSON string
        lastFetched: content.lastFetched.getTime(),
        cachedUntil: content.cachedUntil?.getTime() || undefined,
        updated_at: Date.now()
      };

      store.put(dataToStore);
    });
  }

  /**
   * Get multiple content items by keys (batch operation)
   */
  async getMultipleContent(keys: string[]): Promise<ResourceContent[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    if (keys.length === 0) return [];

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readonly');
      const store = transaction.objectStore('resource_content');
      const results: ResourceContent[] = [];
      let completed = 0;

      transaction.onerror = () => {
        console.error('❌ Failed to fetch multiple content:', transaction.error);
        reject(new Error(`Failed to fetch multiple content: ${transaction.error?.message}`));
      };

      // Fetch each key individually (IndexedDB doesn't have a direct "IN" equivalent)
      for (const key of keys) {
        const request = store.get(key);
        
        request.onsuccess = () => {
          const row = request.result;
          
          if (row) {
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
              content: typeof row.content === 'string' ? JSON.parse(row.content) : row.content,
              lastFetched: new Date(row.lastFetched),
              cachedUntil: row.cachedUntil ? new Date(row.cachedUntil) : undefined,
              checksum: row.checksum || undefined,
              size: row.size,
              sourceSha: row.sourceSha || undefined,
              sourceCommit: row.sourceCommit || undefined
            };
            results.push(content);
          }

          completed++;
          if (completed === keys.length) {
            
            resolve(results);
          }
        };

        request.onerror = () => {
          completed++;
          if (completed === keys.length) {
            
            resolve(results);
          }
        };
      }
    });
  }

  /**
   * Save multiple content items (batch operation with transaction)
   */
  async saveMultipleContent(contents: ResourceContent[]): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    if (contents.length === 0) return;

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readwrite');
      const store = transaction.objectStore('resource_content');

      transaction.onerror = () => {
        console.error('❌ Failed to batch save content:', transaction.error);
        reject(new Error(`Failed to batch save content: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        
        resolve();
      };

      // Save each content item
      for (const content of contents) {
        const dataToStore = {
          ...content,
          content: JSON.stringify(content.content),
          lastFetched: content.lastFetched.getTime(),
          cachedUntil: content.cachedUntil?.getTime() || undefined,
          updated_at: Date.now()
        };

        store.put(dataToStore);
      }
    });
  }

  /**
   * Begin a transaction for atomic operations
   */
  async beginTransaction(): Promise<StorageTransaction> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new IndexedDBTransaction(this.db);
  }

  /**
   * Clear expired content based on cachedUntil timestamps
   */
  async clearExpiredContent(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readwrite');
      const store = transaction.objectStore('resource_content');
      const index = store.index('cachedUntil');
      const now = Date.now();
      let deletedCount = 0;

      transaction.onerror = () => {
        console.error('❌ Failed to clear expired content:', transaction.error);
        reject(new Error(`Failed to clear expired content: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        
        resolve();
      };

      // Use cursor to iterate through expired items
      const range = IDBKeyRange.upperBound(now);
      const request = index.openCursor(range);

      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          // Only delete if cachedUntil is set and expired
          if (cursor.value.cachedUntil && cursor.value.cachedUntil < now) {
            cursor.delete();
            deletedCount++;
          }
          cursor.continue();
        }
      };
    });
  }

  /**
   * Clear all content (keep metadata)
   */
  async clearAllContent(): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readwrite');
      const store = transaction.objectStore('resource_content');

      transaction.onerror = () => {
        console.error('❌ Failed to clear all content:', transaction.error);
        reject(new Error(`Failed to clear all content: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        
        resolve();
      };

      store.clear();
    });
  }

  /**
   * Get all resource keys from metadata store
   */
  async getAllResourceKeys(): Promise<string[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_metadata'], 'readonly');
      const store = transaction.objectStore('resource_metadata');
      const keys: string[] = [];

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(keys);

      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          keys.push(cursor.value.resourceKey);
          cursor.continue();
        }
      };
    });
  }

  /**
   * Get all content keys from content store
   */
  async getAllContentKeys(): Promise<string[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readonly');
      const store = transaction.objectStore('resource_content');
      const keys: string[] = [];

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(keys);

      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          keys.push(cursor.value.key);
          cursor.continue();
        }
      };
    });
  }

  /**
   * Get metadata with versions for comparison
   */
  async getMetadataVersions(): Promise<Map<string, {version: string, lastUpdated: Date}>> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_metadata'], 'readonly');
      const store = transaction.objectStore('resource_metadata');
      const versionMap = new Map<string, {version: string, lastUpdated: Date}>();

      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => resolve(versionMap);

      const request = store.openCursor();
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          const data = cursor.value;
          versionMap.set(data.resourceKey, {
            version: data.version,
            lastUpdated: new Date(data.lastUpdated)
          });
          cursor.continue();
        }
      };
    });
  }

  /**
   * Get storage information and statistics
   */
  async getStorageInfo(): Promise<StorageInfo> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');

    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction(['resource_content'], 'readonly');
      const store = transaction.objectStore('resource_content');

      transaction.onerror = () => {
        console.error('❌ Failed to get storage info:', transaction.error);
        reject(new Error(`Failed to get storage info: ${transaction.error?.message}`));
      };

      let totalSize = 0;
      let itemCount = 0;

      const request = store.openCursor();
      
      request.onsuccess = (event) => {
        const cursor = (event.target as IDBRequest).result;
        if (cursor) {
          totalSize += cursor.value.size || 0;
          itemCount++;
          cursor.continue();
        } else {
          // Cursor finished
          resolve({
            totalSize,
            availableSpace: -1, // Will be calculated in checkQuota
            itemCount,
            lastCleanup: new Date() // Could track this in metadata
          });
        }
      };

      request.onerror = () => {
        reject(new Error(`Failed to calculate storage info: ${request.error?.message}`));
      };
    });
  }

  /**
   * Check storage quota using Storage API
   */
  async checkQuota(): Promise<QuotaInfo> {
    let quota: QuotaInfo;

    try {
      // Use modern Storage API if available
      if ('storage' in navigator && 'estimate' in navigator.storage) {
        const estimate = await navigator.storage.estimate();
        const used = estimate.usage || 0;
        const total = estimate.quota || 0;
        const available = Math.max(0, total - used);

        quota = {
          used,
          available,
          total,
          nearLimit: used > (total * 0.8) // 80% threshold
        };
      } else {
        // Fallback for older browsers
        const info = await this.getStorageInfo();
        const defaultQuota = 50 * 1024 * 1024; // 50MB default
        
        quota = {
          used: info.totalSize,
          available: Math.max(0, defaultQuota - info.totalSize),
          total: defaultQuota,
          nearLimit: info.totalSize > (defaultQuota * 0.8)
        };
      }
    } catch (error) {
      console.warn('Could not get storage quota:', error);
      
      // Fallback quota info
      const info = await this.getStorageInfo();
      quota = {
        used: info.totalSize,
        available: -1,
        total: -1,
        nearLimit: false
      };
    }

    return quota;
  }

  /**
   * Close the database connection
   */
  async close(): Promise<void> {
    if (this.db) {
      
      this.db.close();
      this.db = null;
      this.isInitialized = false;
    }
  }

  /**
   * Delete the entire database (useful for testing)
   */
  async deleteDatabase(): Promise<void> {
    await this.close();
    
    return new Promise((resolve, reject) => {
      
      
      const deleteRequest = indexedDB.deleteDatabase(this.dbName);
      
      deleteRequest.onerror = () => {
        console.error('❌ Failed to delete database:', deleteRequest.error);
        reject(new Error(`Failed to delete database: ${deleteRequest.error?.message}`));
      };
      
      deleteRequest.onsuccess = () => {
        
        resolve();
      };
      
      deleteRequest.onblocked = () => {
        console.warn('⚠️ Database deletion blocked (close all tabs using this database)');
        // Still resolve as the deletion will complete when other connections close
        resolve();
      };
    });
  }

  /**
   * Get the database name (useful for debugging)
   */
  getDatabaseName(): string {
    return this.dbName;
  }
}

/**
 * IndexedDB Transaction implementation
 */
class IndexedDBTransaction implements StorageTransaction {
  private operations: (() => void)[] = [];
  private isCommitted = false;
  private isRolledBack = false;

  constructor(private db: IDBDatabase) {}

  async save(content: ResourceContent): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations.push(() => {
      const transaction = this.db.transaction(['resource_content'], 'readwrite');
      const store = transaction.objectStore('resource_content');

      const dataToStore = {
        ...content,
        content: JSON.stringify(content.content),
        lastFetched: content.lastFetched.getTime(),
        cachedUntil: content.cachedUntil?.getTime() || undefined,
        updated_at: Date.now()
      };

      store.put(dataToStore);
    });
  }

  async delete(key: string): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    this.operations.push(() => {
      const transaction = this.db.transaction(['resource_content'], 'readwrite');
      const store = transaction.objectStore('resource_content');
      store.delete(key);
    });
  }

  async commit(): Promise<void> {
    if (this.isCommitted || this.isRolledBack) {
      throw new Error('Transaction already completed');
    }

    return new Promise((resolve, reject) => {
      const transaction = this.db.transaction(['resource_content'], 'readwrite');
      
      transaction.onerror = () => {
        console.error('❌ Transaction failed:', transaction.error);
        reject(new Error(`Transaction failed: ${transaction.error?.message}`));
      };

      transaction.oncomplete = () => {
        this.isCommitted = true;
        
        resolve();
      };

      // Execute all operations within the transaction
      for (const operation of this.operations) {
        operation();
      }
    });
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
export const createIndexedDBStorage = (dbName?: string): IndexedDBStorageAdapter => {
  return new IndexedDBStorageAdapter(dbName);
};

export const createTempIndexedDBStorage = (): IndexedDBStorageAdapter => {
  const tempName = `bt-studio-temp-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  return new IndexedDBStorageAdapter(tempName);
};

