#!/usr/bin/env node

/**
 * App Database Converter
 * 
 * Converts downloaded resource files to match the bt-synergy app's
 * SQLite database schema (SimplifiedDrizzleStorageAdapter).
 * 
 * Similar to json-exporter.ts and sqlite-builder.ts but produces
 * SQLite-compatible output for the app's database.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { glob } from 'glob';
import { downloadConfig } from './config.js';
import Database from 'better-sqlite3';

interface ResourceDownloaderMetadata {
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
}

interface ResourceDownloaderContent {
  key: string;
  resourceKey: string;
  resourceId: string;
  server: string;
  owner: string;
  language: string;
  type: string;
  bookCode?: string;
  articleId?: string;
  content: string; // JSON string
  lastFetched: number;
  cachedUntil?: number;
  checksum?: string;
  size: number;
  sourceSha?: string;
  sourceCommit?: string;
  updated_at: number;
}

class AppDatabaseConverter {
  private baseDir: string;
  private outputFile: string;
  private db: Database.Database | null = null;

  constructor(baseDir: string, outputFile: string) {
    this.baseDir = baseDir;
    this.outputFile = outputFile;
  }

  async convertToAppDatabase(): Promise<void> {
    console.log('🔄 Converting resources to app database format...');
    console.log(`📁 Source: ${this.baseDir}`);
    console.log(`💾 Output: ${this.outputFile}`);
    
    const startTime = new Date();
    
    // Create SQLite database
    this.db = new Database(this.outputFile);
    
    try {
      // Create tables that match the app's database schema
      await this.createTables();
      
      // Find all metadata and content files
      const metadataFiles = await this.findFiles('**/metadata.json');
      const contentFiles = await this.findFiles('**/content/**/*.json');
      
      console.log(`📋 Found ${metadataFiles.length} metadata files`);
      console.log(`📄 Found ${contentFiles.length} content files`);
      
      // Process metadata files
      const metadataRecords: ResourceDownloaderMetadata[] = [];
      for (const file of metadataFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const metadata = JSON.parse(content);
          metadataRecords.push(metadata);
          console.log(`✅ Processed metadata: ${metadata.resourceKey}`);
        } catch (error) {
          console.warn(`⚠️ Failed to process metadata file ${file}:`, error);
        }
      }
      
      // Process content files
      const contentRecords: ResourceDownloaderContent[] = [];
      for (const file of contentFiles) {
        try {
          const content = await fs.readFile(file, 'utf-8');
          const resourceContent = JSON.parse(content);
          contentRecords.push(resourceContent);
          console.log(`✅ Processed content: ${resourceContent.key}`);
        } catch (error) {
          console.warn(`⚠️ Failed to process content file ${file}:`, error);
        }
      }
      
      // Insert data into the database
      await this.insertData(metadataRecords, contentRecords);
      
      const duration = (new Date().getTime() - startTime.getTime()) / 1000;
      
      console.log('\n' + '='.repeat(60));
      console.log('🎉 App Database Conversion Complete!');
      console.log(`📊 Metadata records: ${metadataRecords.length}`);
      console.log(`📊 Content records: ${contentRecords.length}`);
      console.log(`💾 Output file: ${this.outputFile}`);
      console.log(`⏱️  Duration: ${duration.toFixed(2)}s`);
      console.log('\n📋 To use in your app:');
      console.log(`   Copy ${this.outputFile} to your app's assets directory`);
      
    } finally {
      // Close the database connection
      if (this.db) {
        this.db.close();
      }
    }
  }

  private async findFiles(pattern: string): Promise<string[]> {
    const fullPattern = path.join(this.baseDir, pattern).replace(/\\/g, '/');
    return await glob(fullPattern);
  }

  private async createTables(): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Create resource_metadata table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resource_metadata (
        resource_key TEXT PRIMARY KEY,
        id TEXT NOT NULL,
        server TEXT NOT NULL,
        owner TEXT NOT NULL,
        language TEXT NOT NULL,
        type TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT,
        name TEXT NOT NULL,
        version TEXT NOT NULL,
        last_updated INTEGER NOT NULL,
        available INTEGER NOT NULL DEFAULT 1,
        is_anchor INTEGER NOT NULL DEFAULT 0,
        toc TEXT,
        language_direction TEXT,
        language_title TEXT,
        language_is_gl INTEGER,
        commit_sha TEXT,
        file_hashes TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );
    `);

    // Create resource_content table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS resource_content (
        key TEXT PRIMARY KEY,
        resource_key TEXT NOT NULL,
        resource_id TEXT NOT NULL,
        server TEXT NOT NULL,
        owner TEXT NOT NULL,
        language TEXT NOT NULL,
        type TEXT NOT NULL,
        book_code TEXT,
        article_id TEXT,
        content TEXT NOT NULL,
        last_fetched INTEGER NOT NULL,
        cached_until INTEGER,
        checksum TEXT,
        size INTEGER NOT NULL,
        source_sha TEXT,
        source_commit TEXT,
        created_at INTEGER DEFAULT (unixepoch()),
        updated_at INTEGER DEFAULT (unixepoch())
      );
    `);

    // Create indexes for efficient querying
    this.db.exec(`
      CREATE INDEX IF NOT EXISTS idx_resource_metadata_server_owner_language 
      ON resource_metadata(server, owner, language);

      CREATE INDEX IF NOT EXISTS idx_resource_content_resource_key 
      ON resource_content(resource_key);

      CREATE INDEX IF NOT EXISTS idx_resource_content_book_code 
      ON resource_content(book_code);

      CREATE INDEX IF NOT EXISTS idx_resource_content_article_id 
      ON resource_content(article_id);

      CREATE INDEX IF NOT EXISTS idx_resource_content_type 
      ON resource_content(type);
    `);
  }

  private async insertData(
    metadataRecords: ResourceDownloaderMetadata[], 
    contentRecords: ResourceDownloaderContent[]
  ): Promise<void> {
    if (!this.db) {
      throw new Error('Database not initialized');
    }

    // Prepare statements for better performance
    const insertMetadata = this.db.prepare(`
      INSERT OR REPLACE INTO resource_metadata 
      (resource_key, id, server, owner, language, type, title, description, name, version, 
       last_updated, available, is_anchor, toc, language_direction, language_title, 
       language_is_gl, commit_sha, file_hashes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const insertContent = this.db.prepare(`
      INSERT OR REPLACE INTO resource_content 
      (key, resource_key, resource_id, server, owner, language, type, book_code, 
       article_id, content, last_fetched, cached_until, checksum, size, 
       source_sha, source_commit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    // Insert metadata records
    console.log('📝 Inserting metadata records...');
    for (const metadata of metadataRecords) {
      insertMetadata.run(
        metadata.resourceKey,
        metadata.id,
        metadata.server,
        metadata.owner,
        metadata.language,
        metadata.type,
        metadata.title,
        metadata.description || null,
        metadata.name,
        metadata.version || '1.0.0',
        metadata.lastUpdated || Date.now(),
        metadata.available || 1,
        metadata.isAnchor || 0,
        metadata.toc || null,
        metadata.languageDirection || null,
        metadata.languageTitle || null,
        metadata.languageIsGL ? 1 : 0,
        null, // commit_sha
        null, // file_hashes
        Math.floor(Date.now() / 1000), // created_at
        metadata.updated_at || Date.now()
      );
    }

    // Insert content records
    console.log('📝 Inserting content records...');
    for (const content of contentRecords) {
      insertContent.run(
        content.key,
        content.resourceKey,
        content.resourceId,
        content.server,
        content.owner,
        content.language,
        content.type,
        content.bookCode || null,
        content.articleId || null,
        typeof content.content === 'string' ? content.content : JSON.stringify(content.content),
        content.lastFetched || Date.now(),
        content.cachedUntil || null,
        content.checksum || null,
        content.size || 0,
        content.sourceSha || null,
        content.sourceCommit || null,
        Math.floor(Date.now() / 1000), // created_at
        content.updated_at || Date.now()
      );
    }
  }

}

// Main function to convert the database
async function convertToAppDatabase() {
  // Use the same output directory as other exporters
  const sourceDir = path.join('exports', downloadConfig.outputDir);
  const outputFile = `${downloadConfig.owner}-${downloadConfig.language}-app-database.db`;
  
  console.log(`📋 Converting resource-downloader output to app database format...`);
  console.log(`📁 Source: ${sourceDir}`);
  console.log(`📄 Output: ${outputFile}`);
  
  // Check if source directory exists
  try {
    await fs.access(sourceDir);
  } catch (error) {
    console.error(`❌ Source directory not found: ${sourceDir}`);
    console.log('💡 Make sure to run the complete-downloader first to generate the data.');
    process.exit(1);
  }
  
  const converter = new AppDatabaseConverter(sourceDir, outputFile);
  await converter.convertToAppDatabase();
}

// Run the converter
convertToAppDatabase().catch(console.error);
