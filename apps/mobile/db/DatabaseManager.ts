/**
 * Database Manager for unified SQLite database using Drizzle ORM
 * Handles initialization, migrations, and provides database instance
 */

import { drizzle } from 'drizzle-orm/expo-sqlite';
import { Directory, File, Paths } from 'expo-file-system';
import * as SQLite from 'expo-sqlite';
import * as pako from 'pako';
import { getAppConfig } from '../lib/config/global-config';
import * as schema from './schema';

export class DatabaseManager {
  private static instance: DatabaseManager;
  private db: ReturnType<typeof drizzle> | null = null;
  private sqliteDb: SQLite.SQLiteDatabase | null = null;

  /**
   * Developer flag: Set to true to force re-extraction of resources archive
   * even if the directory already exists
   */
  private static FORCE_REEXTRACT = false;

  private constructor() {}

  public static getInstance(): DatabaseManager {
    if (!DatabaseManager.instance) {
      DatabaseManager.instance = new DatabaseManager();
    }
    return DatabaseManager.instance;
  }

  /**
   * Initialize the database connection and run migrations
   */
  public async initialize(db: SQLite.SQLiteDatabase): Promise<void> {
    try {
      
      
      // Open SQLite database
      this.sqliteDb = db;
      
      // Create Drizzle instance with schema
      this.db = drizzle(this.sqliteDb, { schema });
      
      // Ensure database tables exist
      await this.ensureTables();
      
      
    } catch (error) {
      console.error('Failed to initialize database:', error);
      throw error;
    }
  }

  /**
   * Create database tables if they don't exist
   * This is a simplified approach for React Native where we create tables manually
   */
  private async ensureTables(): Promise<void> {
    if (!this.sqliteDb) {
      throw new Error('SQLite database not initialized');
    }

    try {
      
      
      // Create tables using raw SQL to avoid migration issues in React Native
      await this.sqliteDb.execAsync(`
        CREATE TABLE IF NOT EXISTS users (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          username TEXT NOT NULL UNIQUE,
          email TEXT UNIQUE,
          display_name TEXT,
          avatar TEXT,
          preferences TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      await this.sqliteDb.execAsync(`
        CREATE TABLE IF NOT EXISTS workspaces (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          description TEXT,
          owner_id INTEGER REFERENCES users(id),
          is_default INTEGER DEFAULT 0,
          settings TEXT,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      await this.sqliteDb.execAsync(`
        CREATE TABLE IF NOT EXISTS resources (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          workspace_id INTEGER REFERENCES workspaces(id),
          resource_id TEXT NOT NULL,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          language TEXT NOT NULL,
          language_direction TEXT,
          version TEXT,
          source TEXT,
          metadata TEXT,
          content TEXT,
          is_active INTEGER DEFAULT 1,
          last_accessed INTEGER,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      await this.sqliteDb.execAsync(`
        CREATE TABLE IF NOT EXISTS settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT NOT NULL,
          type TEXT NOT NULL,
          category TEXT,
          description TEXT,
          is_user_configurable INTEGER DEFAULT 1,
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      // Storage tables for the new storage adapter
      await this.sqliteDb.execAsync(`
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

      await this.sqliteDb.execAsync(`
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

      await this.sqliteDb.execAsync(`
        CREATE TABLE IF NOT EXISTS storage_stats (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          total_size INTEGER NOT NULL DEFAULT 0,
          item_count INTEGER NOT NULL DEFAULT 0,
          last_cleanup INTEGER DEFAULT (unixepoch()),
          created_at INTEGER DEFAULT (unixepoch()),
          updated_at INTEGER DEFAULT (unixepoch())
        );
      `);

      // Create indexes for better performance
      await this.sqliteDb.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_resource_metadata_server_owner_language 
        ON resource_metadata(server, owner, language);
      `);

      await this.sqliteDb.execAsync(`
        CREATE INDEX IF NOT EXISTS idx_resource_content_resource_key 
        ON resource_content(resource_key);
      `);

      
    } catch (error) {
      console.error('Failed to ensure database tables:', error);
      throw error;
    }
  }

  /**
   * Get the Drizzle database instance
   */
  public getDb(): ReturnType<typeof drizzle> {
    if (!this.db) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.db;
  }

  /**
   * Get the raw SQLite database instance
   */
  public getSqliteDb(): SQLite.SQLiteDatabase {
    if (!this.sqliteDb) {
      throw new Error('Database not initialized. Call initialize() first.');
    }
    return this.sqliteDb;
  }

  /**
   * Close the database connection
   */
  public async close(): Promise<void> {
    if (this.sqliteDb) {
      await this.sqliteDb.closeAsync();
      this.sqliteDb = null;
      this.db = null;
      
    }
  }

  /**
   * Check if database is initialized
   */
  public isInitialized(): boolean {
    return this.db !== null && this.sqliteDb !== null;
  }

  /**
   * Execute raw SQL query (use with caution)
   */
  public async executeRaw(sql: string, params?: any[]): Promise<any> {
    if (!this.sqliteDb) {
      throw new Error('Database not initialized');
    }

    try {
      if (params && params.length > 0) {
        return await this.sqliteDb.runAsync(sql, params);
      } else {
        return await this.sqliteDb.execAsync(sql);
      }
    } catch (error) {
      console.error('Failed to execute raw SQL:', error);
      throw error;
    }
  }

  /**
   * Set the force re-extraction flag
   * @param force - If true, resources will be re-extracted even if they already exist
   */
  public static setForceReextract(force: boolean): void {
    DatabaseManager.FORCE_REEXTRACT = force;
    console.log(`🔧 FORCE_REEXTRACT flag set to: ${force}`);
  }

  /**
   * Get the current force re-extraction flag value
   */
  public static getForceReextract(): boolean {
    return DatabaseManager.FORCE_REEXTRACT;
  }

  /**
   * Recursively delete a directory and all its contents
   */
  private async deleteDirectoryRecursive(dir: Directory): Promise<void> {
    if (!dir.exists) {
      return;
    }

    try {
      // List all entries in the directory
      const entries = await dir.list();
      
      // Delete each entry
      for (const entry of entries) {
        if (entry instanceof Directory) {
          // Recursively delete subdirectory
          await this.deleteDirectoryRecursive(entry);
        } else {
          // Delete file
          entry.delete();
        }
      }
      
      // Finally, delete the empty directory itself
      dir.delete();
    } catch (error) {
      console.error('Error deleting directory:', error);
      throw error;
    }
  }

  /**
   * Load initial resources from a bundled ZIP archive
   * Extracts resources from bundled ZIP files to document directory for on-demand loading
   */
  public async loadInitialResourcesFromJSON(): Promise<void> {
    if (!this.sqliteDb) {
      throw new Error('Database not initialized');
    }

    try {
      console.log('🔄 Checking for initial resources...');

      // Check if resources already extracted to document directory
      const resourcesDir = new Directory(Paths.document, 'uw-translation-resources');
      
      if (resourcesDir.exists && !DatabaseManager.FORCE_REEXTRACT) {
        console.log('✅ Resources already extracted to document directory');
        console.log('💡 Ready for on-demand loading from:', resourcesDir.uri);
        console.log('💡 Individual .json.zip files will be decompressed as needed');
        return;
      }
      
      // Try to extract from bundled assets
      console.log('🔄 Attempting to extract bundled resources...');
      await this.extractBundledResources();
      
    } catch (error) {
      console.error('Failed to load initial resources:', error);
      // Don't throw error - allow app to continue with network-only mode
      console.log('💡 App will continue with network-only resource loading');
    }
  }

  /**
   * Extract bundled resources from ZIP archives
   * Uses the new bundled-resource-loader that handles multiple smaller ZIP files
   */
  private async extractBundledResources(): Promise<void> {
    try {
      console.log('🔄 Loading bundled resources from individual ZIP files...');
      
      // Dynamically import the bundled resource loader
      const bundledResourceLoader = await import('../lib/services/resources/bundled-resource-loader');
      
      // Load all bundled resources with progress tracking
      await bundledResourceLoader.loadAllBundledResources((current, total, resourceId) => {
        console.log(`📦 Extracting resources: ${current}/${total} - ${resourceId}`);
      });
      
      console.log('✅ Successfully extracted all bundled resources');
      
    } catch (error) {
      console.error('❌ Failed to extract bundled resources:', error);
      console.log('💡 App will use network-only resource loading');
      throw error;
    }
  }

  /**
   * Load resource metadata from extracted JSON files on-demand
   * File structure: uw-translation-resources/[server]/[owner]/[language]/[resourceId]/metadata.json.zip
   * Decompresses .json.zip files on-the-fly for minimal memory usage
   */
  public async loadMetadataFromExtractedFiles(
    resourceId: string, 
    server?: string,
    owner?: string,
    language?: string
  ): Promise<any | null> {
    try {
      // Use app config defaults if not provided
      const appConfig = getAppConfig();
      const finalServer = server || appConfig.defaultServer;
      const finalOwner = owner || appConfig.defaultOwner;
      const finalLanguage = language || appConfig.defaultLanguage;

      const resourcesDir = new Directory(Paths.document, 'uw-translation-resources');
      
      if (!resourcesDir.exists) {
        console.warn('⚠️ Resources directory does not exist');
        return null;
      }

      // Structure: [server]/[owner]/[language]/[resourceId]/metadata.json.zip
      const metadataPath = `${finalServer}/${finalOwner}/${finalLanguage}/${resourceId}/metadata.json.zip`;
      
      try {
        const manifestFile = new File(resourcesDir.uri, metadataPath);
        
        if (manifestFile.exists) {
          console.log(`📖 Loading and decompressing metadata from: ${metadataPath}`);
          
          // Read compressed file as bytes
          const compressedData = await manifestFile.bytes();
          
          // Decompress using inflate (ZIP algorithm)
          const jsonString = await this.decompressZipFile(compressedData);
          
          // Parse JSON
          const metadata = JSON.parse(jsonString);
          return metadata;
        } else {
          console.warn(`⚠️ Metadata file does not exist: ${metadataPath}`);
        }
      } catch (error) {
        console.error(`Failed to read metadata file ${metadataPath}:`, error);
      }

      console.warn(`⚠️ No manifest found for resource: ${resourceId}`);
      return null;
      
    } catch (error) {
      console.error(`Failed to load metadata for ${resourceId}:`, error);
      return null;
    }
  }

  /**
   * Load resource content from extracted JSON files on-demand
   * File structure: 
   *   - Book resources: uw-translation-resources/[server]/[owner]/[language]/[resourceId]/content/[bookCode].json.zip
   *   - Entry resources: uw-translation-resources/[server]/[owner]/[language]/[resourceId]/content/[category]/[entry].json.zip
   * Decompresses .json.zip files on-the-fly for minimal memory usage
   */
  public async loadContentFromExtractedFiles(
    resourceId: string, 
    bookCode: string,
    server?: string,
    owner?: string,
    language?: string
  ): Promise<any | null> {
    try {
      // Use app config defaults if not provided
      const appConfig = getAppConfig();
      const finalServer = server || appConfig.defaultServer;
      const finalOwner = owner || appConfig.defaultOwner;
      const finalLanguage = language || appConfig.defaultLanguage;

      const resourcesDir = new Directory(Paths.document, 'uw-translation-resources');
      
      if (!resourcesDir.exists) {
        console.warn('⚠️ Resources directory does not exist');
        return null;
      }

      // Structure differs for book vs entry-organized resources:
      // - Book: [server]/[owner]/[language]/[resourceId]/content/[bookCode].json.zip
      // - Entry: [server]/[owner]/[language]/[resourceId]/content/[category]/[entry].json.zip
      // The bookCode parameter already contains the full path (including subdirectories for entry resources)
      const contentPath = `${finalServer}/${finalOwner}/${finalLanguage}/${resourceId}/content/${bookCode}.json.zip`;
      
      try {
        const contentFile = new File(resourcesDir.uri, contentPath);
        
        if (contentFile.exists) {
          console.log(`📖 Loading and decompressing content from: ${contentPath}`);
          
          // Read compressed file as bytes
          const compressedData = await contentFile.bytes();
          
          // Decompress using inflate (ZIP algorithm)
          const jsonString = await this.decompressZipFile(compressedData);
          
          // Parse JSON
          const data = JSON.parse(jsonString);
          
          // The .json.zip files contain complete ResourceContent objects
          // Return the entire object (it's already in the correct format for the database)
          return data;
        } else {
          console.warn(`⚠️ Content file does not exist: ${contentPath}`);
        }
      } catch (error) {
        console.error(`Failed to read content file ${contentPath}:`, error);
      }

      console.warn(`⚠️ No content found for ${resourceId}/${bookCode}`);
      return null;
      
    } catch (error) {
      console.error(`Failed to load content for ${resourceId}/${bookCode}:`, error);
      return null;
    }
  }

  /**
   * List all extracted resources to help with discovery
   */
  public async listExtractedResources(): Promise<string[]> {
    try {
      const resourcesDir = new Directory(Paths.document, 'uw-translation-resources');
      
      if (!resourcesDir.exists) {
        console.warn('⚠️ Resources directory does not exist yet');
        return [];
      }

      console.log(`📂 Listing resources in: ${resourcesDir.uri}`);
      
      // List all entries in the directory
      const entries = await resourcesDir.list();
      console.log(`📋 Found ${entries.length} total entries in root`);
      
      // Filter for directories only (Directory instances have the isDirectory property)
      const resourceDirs = entries.filter(entry => entry instanceof Directory);
      
      const dirNames = resourceDirs.map(dir => dir.name);
      console.log(`📁 Root directories: ${dirNames.length}`, dirNames);
      
      // If we found directories, explore deeper
      if (resourceDirs.length > 0) {
        // Navigate into the configured server/owner/language to find resources
        try {
          const appConfig = getAppConfig();
          const serverDir = new Directory(resourcesDir.uri, appConfig.defaultServer);
          if (serverDir.exists) {
            const ownerDir = new Directory(serverDir.uri, appConfig.defaultOwner);
            if (ownerDir.exists) {
              const langDir = new Directory(ownerDir.uri, appConfig.defaultLanguage);
              if (langDir.exists) {
                const langEntries = await langDir.list();
                const langResources = langEntries.filter(e => e instanceof Directory).map(d => d.name);
                console.log(`📚 Found resources in ${appConfig.defaultLanguage}/:`, langResources);
                return langResources;
              }
            }
          }
        } catch (error) {
          console.warn('⚠️ Error navigating directory structure:', error);
        }
      }
      
      // If no directories found, list files to understand structure
      if (dirNames.length === 0 && entries.length > 0) {
        console.log('📄 No subdirectories found, listing first 10 files:');
        entries.slice(0, 10).forEach(entry => {
          console.log(`  - ${entry instanceof Directory ? '[DIR]' : '[FILE]'} ${entry.name}`);
        });
      }
      
      return dirNames;
      
    } catch (error) {
      console.error('Failed to list extracted resources:', error);
      return [];
    }
  }

  /**
   * Convert base64 string to Uint8Array
   */
  private base64ToUint8Array(base64: string): Uint8Array {
    const binaryString = atob(base64);
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return bytes;
  }

  /**
   * Process large JSON file in chunks to avoid memory issues
   */
  private async processLargeJSONFile(uri: string): Promise<void> {
    try {
      console.log('📦 Processing large JSON file in chunks...');
      
      // First, get the file size to determine chunk size
      const response = await fetch(uri);
      const contentLength = response.headers.get('content-length');
      const fileSize = contentLength ? parseInt(contentLength, 10) : 0;
      
      console.log(`📏 File size: ${(fileSize / 1024 / 1024).toFixed(2)} MB`);
      
      // For very large files, we'll process them differently
      if (fileSize > 50 * 1024 * 1024) { // 50MB
        console.log('⚠️ Large file detected, using streaming approach...');
        await this.processJSONFileStreaming(uri);
      } else {
        // For smaller files, use the original approach but with memory management
        await this.processJSONFileStandard(uri);
      }
      
    } catch (error) {
      console.error('Failed to process JSON file:', error);
      throw error;
    }
  }

  /**
   * Process JSON file using standard approach with memory management
   */
  private async processJSONFileStandard(uri: string): Promise<void> {
    try {
      console.log('🔄 Starting memory-efficient JSON processing...');
      
      // For now, let's try a different approach - use the original large file
      // but implement a streaming decompression
      await this.processJSONWithStreamingDecompression(uri);
      
    } catch (error) {
      console.error('Failed to process JSON file standard:', error);
      throw error;
    }
  }

  /**
   * Process JSON with streaming decompression to avoid memory issues
   */
  private async processJSONWithStreamingDecompression(uri: string): Promise<void> {
    try {
      console.log('🌊 Using streaming decompression approach...');
      
      // First, let's try to process the file without loading it all into memory
      // We'll use a different strategy - process the file in smaller chunks
      
      // For now, let's implement a simple approach that works with the test file
      const response = await fetch(uri);
      const compressedData = await response.arrayBuffer();
      
      console.log(`📦 Compressed data size: ${(compressedData.byteLength / 1024 / 1024).toFixed(2)} MB`);
      
      // Use standard decompression with pako - it handles large files efficiently
      console.log('🔄 Processing with pako decompression...');
      await this.decompressAndProcessStandard(compressedData);
      
    } catch (error) {
      console.error('Failed to process JSON with streaming decompression:', error);
      throw error;
    }
  }

  /**
   * Standard decompression for small files
   */
  private async decompressAndProcessStandard(compressedData: ArrayBuffer): Promise<void> {
    try {
      console.log(`🔍 Compressed data size: ${compressedData.byteLength} bytes`);
      
      // First, let's check if the data is actually gzipped
      const uint8Array = new Uint8Array(compressedData);
      const isGzipped = uint8Array[0] === 0x1f && uint8Array[1] === 0x8b;
      console.log(`🔍 Is gzipped: ${isGzipped}`);
      
      let jsonText: string;
      
      if (isGzipped) {
        console.log('🔄 Decompressing gzipped data...');
        // Decompress using Web API
        const decompressedData = await this.decompressGzip(compressedData);
        console.log(`🔍 Decompressed data size: ${decompressedData.length} bytes`);
        jsonText = new TextDecoder().decode(decompressedData);
      } else {
        console.log('📄 Data appears to be uncompressed, using directly...');
        jsonText = new TextDecoder().decode(compressedData);
      }
      
      // Log first 200 characters to debug
      console.log(`🔍 First 200 chars: ${jsonText.substring(0, 200)}`);
      
      const jsonData = JSON.parse(jsonText);
      
      console.log(`📊 Loaded JSON with ${jsonData.meta?.length || 0} metadata and ${jsonData.cont?.length || 0} content records`);
      
      // Insert metadata records
      if (jsonData.meta && jsonData.meta.length > 0) {
        await this.insertMetadataFromJSON(jsonData.meta);
      }
      
      // Insert content records in smaller batches
      if (jsonData.cont && jsonData.cont.length > 0) {
        await this.insertContentFromJSONInBatches(jsonData.cont);
      }
      
    } catch (error) {
      console.error('Failed to decompress and process standard:', error);
      throw error;
    }
  }

  /**
   * Chunked decompression for large files
   */
  private async decompressAndProcessChunked(compressedData: ArrayBuffer): Promise<void> {
    try {
      console.log('🔧 Implementing chunked processing for large file...');
      
      // For now, let's try a different approach - use a smaller subset of the data
      // In a production app, you'd implement a proper streaming JSON parser
      
      // Let's try to decompress in smaller chunks
      const chunkSize = 1024 * 1024; // 1MB chunks
      const totalChunks = Math.ceil(compressedData.byteLength / chunkSize);
      
      console.log(`📦 Processing ${totalChunks} chunks of ${(chunkSize / 1024 / 1024).toFixed(2)} MB each...`);
      
      // For now, let's fall back to the standard approach but with memory management
      await this.decompressAndProcessStandard(compressedData);
      
    } catch (error) {
      console.error('Failed to decompress and process chunked:', error);
      throw error;
    }
  }

  /**
   * Process JSON file using streaming approach for very large files
   */
  private async processJSONFileStreaming(uri: string): Promise<void> {
    try {
      console.log('🌊 Using streaming approach for large file...');
      
      // For now, fall back to standard approach but with smaller chunks
      // In a production app, you might want to implement a proper streaming JSON parser
      await this.processJSONFileStandard(uri);
      
    } catch (error) {
      console.error('Failed to process JSON file streaming:', error);
      throw error;
    }
  }

  /**
   * Insert content records in batches to avoid memory issues
   */
  private async insertContentFromJSONInBatches(contentArray: any[]): Promise<void> {
    const batchSize = 1000; // Process 1000 records at a time
    const totalRecords = contentArray.length;
    
    console.log(`📝 Processing ${totalRecords} content records in batches of ${batchSize}...`);
    
    for (let i = 0; i < totalRecords; i += batchSize) {
      const batch = contentArray.slice(i, i + batchSize);
      await this.insertContentFromJSON(batch);
      
      // Log progress
      const progress = Math.round((i / totalRecords) * 100);
      console.log(`📊 Progress: ${progress}% (${i + batch.length}/${totalRecords} records)`);
      
      // Small delay to allow garbage collection
      await new Promise(resolve => setTimeout(resolve, 10));
    }
    
    console.log('✅ All content records processed successfully');
  }

  /**
   * Decompress gzipped data using pako library
   */
  private async decompressGzip(compressedData: ArrayBuffer): Promise<Uint8Array> {
    try {
      console.log('🔄 Decompressing with pako...');
      const uint8Array = new Uint8Array(compressedData);
      const decompressed = pako.ungzip(uint8Array);
      console.log(`✅ Decompression successful: ${decompressed.length} bytes`);
      return decompressed;
    } catch (error) {
      console.error('❌ Pako decompression failed:', error);
      throw error;
    }
  }

  /**
   * Decompress individual .json.zip files using pako inflate
   * Used for on-demand decompression of pre-compressed JSON files
   */
  private async decompressZipFile(compressedData: Uint8Array): Promise<string> {
    try {
      // Use pako.inflate for DEFLATE decompression (ZIP algorithm)
      const decompressed = pako.inflate(compressedData);
      
      // Convert Uint8Array to string
      const decoder = new TextDecoder('utf-8');
      const jsonString = decoder.decode(decompressed);
      
      return jsonString;
    } catch (error) {
      console.error('❌ ZIP file decompression failed:', error);
      throw error;
    }
  }

  /**
   * Insert metadata records from JSON data
   */
  private async insertMetadataFromJSON(metadataArray: any[]): Promise<void> {
    console.log(`📝 Inserting ${metadataArray.length} metadata records...`);
    
    const insertSQL = `
      INSERT OR REPLACE INTO resource_metadata 
      (resource_key, id, server, owner, language, type, title, description, name, version, 
       last_updated, available, is_anchor, toc, language_direction, language_title, 
       language_is_gl, commit_sha, file_hashes, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const meta of metadataArray) {
      await this.sqliteDb!.runAsync(
        insertSQL,
        meta.k, // resource_key
        meta.i, // id
        meta.s, // server
        meta.o, // owner
        meta.l, // language
        meta.t, // type
        meta.ti, // title
        meta.d || null, // description
        meta.n, // name
        meta.v || '1.0.0', // version
        meta.lu || Date.now(), // last_updated
        meta.a || 1, // available
        meta.ia || 0, // is_anchor
        meta.toc ? JSON.stringify(meta.toc) : null, // toc
        meta.ld || null, // language_direction
        meta.lt || null, // language_title
        meta.lg || 0, // language_is_gl
        null, // commit_sha
        null, // file_hashes
        Math.floor(Date.now() / 1000), // created_at
        meta.ua || Date.now() // updated_at
      );
    }
  }

  /**
   * Insert content records from JSON data
   */
  private async insertContentFromJSON(contentArray: any[]): Promise<void> {
    console.log(`📝 Inserting ${contentArray.length} content records...`);
    
    const insertSQL = `
      INSERT OR REPLACE INTO resource_content 
      (key, resource_key, resource_id, server, owner, language, type, book_code, 
       article_id, content, last_fetched, cached_until, checksum, size, 
       source_sha, source_commit, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

    for (const content of contentArray) {
      await this.sqliteDb!.runAsync(
        insertSQL,
        content.k, // key
        content.rk, // resource_key
        content.ri, // resource_id
        content.s, // server
        content.o, // owner
        content.l, // language
        content.t, // type
        content.bc || null, // book_code
        content.ai || null, // article_id
        typeof content.c === 'string' ? content.c : JSON.stringify(content.c), // content
        content.lf || Date.now(), // last_fetched
        content.cu || null, // cached_until
        content.cs || null, // checksum
        content.sz || 0, // size
        content.sh || null, // source_sha
        content.sc || null, // source_commit
        Math.floor(Date.now() / 1000), // created_at
        content.ua || Date.now() // updated_at
      );
    }
  }

  /**
   * Reset the database and reload initial resources
   * This can be called from a settings screen
   */
  public async resetAndReloadResources(): Promise<void> {
    if (!this.sqliteDb) {
      throw new Error('Database not initialized');
    }

    try {
      console.log('🔄 Resetting database and reloading resources...');
      
      // Clear existing data
      await this.sqliteDb.execAsync('DELETE FROM resource_content');
      await this.sqliteDb.execAsync('DELETE FROM resource_metadata');
      
      // Reload from JSON
      await this.loadInitialResourcesFromJSON();
      
      console.log('✅ Database reset and resources reloaded successfully');
      
    } catch (error) {
      console.error('Failed to reset and reload resources:', error);
      throw error;
    }
  }

  /**
   * Get database statistics
   */
  public async getStats(): Promise<{
    size: number;
    tables: string[];
    version: string;
  }> {
    if (!this.sqliteDb) {
      throw new Error('Database not initialized');
    }

    try {
      // Get database size (this is a simplified version, actual implementation may vary)
      const sizeResult = await this.sqliteDb.getFirstAsync<{ size: number }>(
        "SELECT page_count * page_size as size FROM pragma_page_count(), pragma_page_size();"
      );

      // Get table names
      const tablesResult = await this.sqliteDb.getAllAsync<{ name: string }>(
        "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%';"
      );

      // Get SQLite version
      const versionResult = await this.sqliteDb.getFirstAsync<{ version: string }>(
        "SELECT sqlite_version() as version;"
      );

      return {
        size: sizeResult?.size || 0,
        tables: tablesResult?.map(t => t.name) || [],
        version: versionResult?.version || 'unknown'
      };
    } catch (error) {
      console.error('Failed to get database stats:', error);
      throw error;
    }
  }
}
