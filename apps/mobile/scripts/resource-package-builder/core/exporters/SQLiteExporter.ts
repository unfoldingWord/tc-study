/**
 * SQLite Database Exporter
 * 
 * Creates a SQLite database from processed resource data.
 * Compatible with the IndexedDBStorageAdapter structure.
 */

import Database from 'better-sqlite3';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface DatabaseRecord {
  // For resource_metadata table
  metadata?: {
    resourceKey: string;
    id: string;
    server: string;
    owner: string;
    language: string;
    type: string;
    title: string;
    description: string;
    name: string;
    version: string;
    lastUpdated: number;
    available: number;
    toc?: string;
    isAnchor: number;
    languageDirection?: string;
    languageTitle?: string;
    languageIsGL?: boolean;
    updated_at: number;
  };
  
  // For resource_content table
  content?: {
    key: string;
    resourceKey: string;
    resourceId: string;
    server: string;
    owner: string;
    language: string;
    type: string;
    bookCode?: string;
    articleId?: string;
    content: string;
    lastFetched: number;
    size: number;
    updated_at: number;
  };
}

export interface ExportOptions {
  outputDir: string;
  databaseName?: string;
  compress?: boolean;
  includeMetadata?: boolean;
  includeContent?: boolean;
}

export class SQLiteExporter {
  private db: Database.Database | null = null;
  private options: ExportOptions;

  constructor(options: ExportOptions) {
    this.options = {
      databaseName: 'resources.db',
      compress: false,
      includeMetadata: true,
      includeContent: true,
      ...options
    };
  }

  /**
   * Export processed resources to SQLite database
   */
  async exportResources(resources: any[]): Promise<string> {
    const dbPath = path.join(this.options.outputDir, this.options.databaseName!);
    
    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });

    // Initialize database
    await this.initializeDatabase(dbPath);

    // Export each resource
    for (const resource of resources) {
      await this.exportResource(resource);
    }

    // Close database
    if (this.db) {
      this.db.close();
    }

    console.log(`📊 SQLite database exported to: ${dbPath}`);
    return dbPath;
  }

  /**
   * Initialize SQLite database with schema
   */
  private async initializeDatabase(dbPath: string): Promise<void> {
    this.db = new Database(dbPath);

    // Create resource_metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resource_metadata (
        resourceKey TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        server TEXT NOT NULL,
        owner TEXT NOT NULL,
        language TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        name TEXT NOT NULL,
        version TEXT,
        lastUpdated INTEGER NOT NULL,
        available INTEGER NOT NULL DEFAULT 1,
        toc TEXT,
        isAnchor INTEGER NOT NULL DEFAULT 0,
        languageDirection TEXT,
        languageTitle TEXT,
        languageIsGL INTEGER DEFAULT 0,
        updated_at INTEGER NOT NULL
      )
    `);

    // Create resource_content table
    this.db.exec(`
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
        size INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (resourceKey) REFERENCES resource_metadata (resourceKey)
      )
    `);

    // Create indexes for better performance
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resource_metadata_type ON resource_metadata (type);
      CREATE INDEX IF NOT EXISTS idx_resource_metadata_language ON resource_metadata (language);
      CREATE INDEX IF NOT EXISTS idx_resource_content_resourceKey ON resource_content (resourceKey);
      CREATE INDEX IF NOT EXISTS idx_resource_content_bookCode ON resource_content (bookCode);
      CREATE INDEX IF NOT EXISTS idx_resource_content_articleId ON resource_content (articleId);
    `);
  }

  /**
   * Export individual resource
   */
  private async exportResource(resource: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const resourceKey = `${resource.metadata?.server || 'unknown'}_${resource.metadata?.owner || 'unknown'}_${resource.metadata?.language || 'unknown'}_${resource.metadata?.id || 'unknown'}`;
    
    // Export metadata
    if (this.options.includeMetadata && resource.metadata) {
      const metadataStmt = this.db.prepare(`
        INSERT OR REPLACE INTO resource_metadata (
          resourceKey, id, server, owner, language, type, title, description, name, version,
          lastUpdated, available, toc, isAnchor, languageDirection, languageTitle, languageIsGL, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      metadataStmt.run(
        resourceKey,
        resource.metadata.id,
        resource.metadata.server || 'door43',
        resource.metadata.owner || 'unfoldingWord',
        resource.metadata.language || 'en',
        resource.metadata.type || 'unknown',
        resource.metadata.title || resource.metadata.name || 'Unknown Resource',
        resource.metadata.description || '',
        resource.metadata.name || resource.metadata.id,
        resource.metadata.version || 'latest',
        resource.metadata.lastUpdated || Date.now(),
        resource.metadata.available || 1,
        resource.metadata.toc ? JSON.stringify(resource.metadata.toc) : null,
        resource.metadata.isAnchor || 0,
        resource.metadata.languageDirection || null,
        resource.metadata.languageTitle || null,
        resource.metadata.languageIsGL || 0,
        resource.metadata.updated_at || Date.now()
      );
    }

    // Export content
    if (this.options.includeContent && resource.content) {
      await this.exportResourceContent(resourceKey, resource);
    }
  }

  /**
   * Export resource content
   */
  private async exportResourceContent(resourceKey: string, resource: any): Promise<void> {
    if (!this.db) throw new Error('Database not initialized');

    const contentStmt = this.db.prepare(`
      INSERT OR REPLACE INTO resource_content (
        key, resourceKey, resourceId, server, owner, language, type,
        bookCode, articleId, content, lastFetched, size, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Handle different resource types
    if (resource.type === 'scripture' && resource.books) {
      // Export scripture books
      for (const book of resource.books) {
        const bookKey = `${resourceKey}_${book.bookCode}`;
        const bookContent = JSON.stringify(book);
        
        contentStmt.run(
          bookKey,
          resourceKey,
          resource.metadata?.id || 'unknown',
          resource.metadata?.server || 'door43',
          resource.metadata?.owner || 'unfoldingWord',
          resource.metadata?.language || 'en',
          'scripture',
          book.bookCode,
          null,
          bookContent,
          Date.now(),
          Buffer.byteLength(bookContent, 'utf8'),
          Date.now()
        );
      }
    } else if (resource.type === 'notes' && resource.notes) {
      // Export translation notes
      for (const note of resource.notes) {
        const noteKey = `${resourceKey}_${note.bookCode || 'unknown'}_${note.chapter || 0}_${note.verse || 0}`;
        const noteContent = JSON.stringify(note);
        
        contentStmt.run(
          noteKey,
          resourceKey,
          resource.metadata?.id || 'unknown',
          resource.metadata?.server || 'door43',
          resource.metadata?.owner || 'unfoldingWord',
          resource.metadata?.language || 'en',
          'notes',
          note.bookCode,
          null,
          noteContent,
          Date.now(),
          Buffer.byteLength(noteContent, 'utf8'),
          Date.now()
        );
      }
    } else {
      // Generic content export
      const contentKey = `${resourceKey}_content`;
      const content = JSON.stringify(resource);
      
      contentStmt.run(
        contentKey,
        resourceKey,
        resource.metadata?.id || 'unknown',
        resource.metadata?.server || 'door43',
        resource.metadata?.owner || 'unfoldingWord',
        resource.metadata?.language || 'en',
        resource.type || 'unknown',
        null,
        null,
        content,
        Date.now(),
        Buffer.byteLength(content, 'utf8'),
        Date.now()
      );
    }
  }

  /**
   * Get database statistics
   */
  async getStatistics(): Promise<{
    metadataCount: number;
    contentCount: number;
    totalSize: number;
  }> {
    if (!this.db) throw new Error('Database not initialized');

    const metadataCount = this.db.prepare('SELECT COUNT(*) as count FROM resource_metadata').get() as { count: number };
    const contentCount = this.db.prepare('SELECT COUNT(*) as count FROM resource_content').get() as { count: number };
    const totalSize = this.db.prepare('SELECT SUM(size) as total FROM resource_content').get() as { total: number };

    return {
      metadataCount: metadataCount.count,
      contentCount: contentCount.count,
      totalSize: totalSize.total || 0
    };
  }
}
