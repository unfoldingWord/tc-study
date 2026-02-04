import * as fs from 'fs/promises';
import * as path from 'path';
import glob from 'glob';
import { downloadConfig } from './config.js';

/**
 * SQLite Database Builder
 * 
 * Creates a SQLite database from the downloaded and processed resource files.
 * The database schema matches the IndexedDBStorageAdapter structure for compatibility.
 */

interface DatabaseRecord {
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

export class SQLiteBuilder {
  private sourceDir: string;
  private outputFile: string;

  constructor(sourceDir: string, outputFile: string) {
    this.sourceDir = sourceDir;
    this.outputFile = outputFile;
  }

  async buildDatabase(): Promise<void> {
    console.log('🗄️  Building SQLite database from downloaded resources...');
    console.log(`📁 Source: ${this.sourceDir}`);
    console.log(`💾 Output: ${this.outputFile}`);
    
    const startTime = new Date();
    
    // Collect all metadata and content files
    const metadataFiles = await this.findFiles('**/metadata.json');
    const contentFiles = await this.findFiles('**/content/**/*.json');
    
    console.log(`📋 Found ${metadataFiles.length} metadata files`);
    console.log(`📄 Found ${contentFiles.length} content files`);
    
    // Process metadata files
    const metadataRecords: DatabaseRecord['metadata'][] = [];
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
    const contentRecords: DatabaseRecord['content'][] = [];
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
    
    // Generate SQL statements
    const sqlStatements = this.generateSQL(metadataRecords, contentRecords);
    
    // Write SQL file
    await this.writeSQLFile(sqlStatements);
    
    const duration = (new Date().getTime() - startTime.getTime()) / 1000;
    
    console.log('\n' + '=' .repeat(60));
    console.log('🎉 SQLite Database Build Complete!');
    console.log(`📊 Metadata records: ${metadataRecords.length}`);
    console.log(`📊 Content records: ${contentRecords.length}`);
    console.log(`💾 Output file: ${this.outputFile}`);
    console.log(`⏱️  Duration: ${duration.toFixed(2)}s`);
    console.log('\n📋 To import into SQLite:');
    console.log(`   sqlite3 database.db < ${this.outputFile}`);
  }

  private async findFiles(pattern: string): Promise<string[]> {
    const fullPattern = path.join(this.sourceDir, pattern).replace(/\\/g, '/');
    return new Promise((resolve, reject) => {
      glob(fullPattern, (err, files) => {
        if (err) reject(err);
        else resolve(files);
      });
    });
  }

  private generateSQL(metadataRecords: DatabaseRecord['metadata'][], contentRecords: DatabaseRecord['content'][]): string[] {
    const statements: string[] = [];
    
    // Create tables (matching IndexedDBStorageAdapter schema)
    statements.push(`
-- Resource Metadata Table
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
  lastUpdated INTEGER,
  available INTEGER DEFAULT 1,
  toc TEXT,
  isAnchor INTEGER DEFAULT 0,
  languageDirection TEXT,
  languageTitle TEXT,
  languageIsGL INTEGER,
  updated_at INTEGER
);`);

    statements.push(`
-- Resource Content Table
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
  lastFetched INTEGER,
  cachedUntil INTEGER,
  checksum TEXT,
  size INTEGER,
  sourceSha TEXT,
  sourceCommit TEXT,
  updated_at INTEGER,
  FOREIGN KEY (resourceKey) REFERENCES resource_metadata(resourceKey)
);`);

    // Create indexes for efficient querying
    statements.push(`
-- Indexes for efficient querying
CREATE INDEX IF NOT EXISTS idx_metadata_server_owner_language ON resource_metadata(server, owner, language);
CREATE INDEX IF NOT EXISTS idx_metadata_type ON resource_metadata(type);
CREATE INDEX IF NOT EXISTS idx_content_resourceKey ON resource_content(resourceKey);
CREATE INDEX IF NOT EXISTS idx_content_bookCode ON resource_content(bookCode);
CREATE INDEX IF NOT EXISTS idx_content_articleId ON resource_content(articleId);
CREATE INDEX IF NOT EXISTS idx_content_type ON resource_content(type);`);

    // Insert metadata records
    statements.push('\n-- Insert Resource Metadata');
    for (const metadata of metadataRecords) {
      const values = [
        this.escapeSQL(metadata.resourceKey),
        this.escapeSQL(metadata.id),
        this.escapeSQL(metadata.server),
        this.escapeSQL(metadata.owner),
        this.escapeSQL(metadata.language),
        this.escapeSQL(metadata.type),
        this.escapeSQL(metadata.title),
        this.escapeSQL(metadata.description || ''),
        this.escapeSQL(metadata.name),
        this.escapeSQL(metadata.version || ''),
        metadata.lastUpdated || 0,
        metadata.available || 1,
        metadata.toc ? this.escapeSQL(metadata.toc) : 'NULL',
        metadata.isAnchor || 0,
        metadata.languageDirection ? this.escapeSQL(metadata.languageDirection) : 'NULL',
        metadata.languageTitle ? this.escapeSQL(metadata.languageTitle) : 'NULL',
        metadata.languageIsGL ? 1 : 0,
        metadata.updated_at || Date.now()
      ];
      
      statements.push(`INSERT OR REPLACE INTO resource_metadata VALUES (${values.join(', ')});`);
    }

    // Insert content records
    statements.push('\n-- Insert Resource Content');
    for (const content of contentRecords) {
      const values = [
        this.escapeSQL(content.key),
        this.escapeSQL(content.resourceKey),
        this.escapeSQL(content.resourceId),
        this.escapeSQL(content.server),
        this.escapeSQL(content.owner),
        this.escapeSQL(content.language),
        this.escapeSQL(content.type),
        content.bookCode ? this.escapeSQL(content.bookCode) : 'NULL',
        content.articleId ? this.escapeSQL(content.articleId) : 'NULL',
        this.escapeSQL(JSON.stringify(content.content)),
        content.lastFetched || Date.now(),
        content.cachedUntil || 'NULL',
        content.checksum ? this.escapeSQL(content.checksum) : 'NULL',
        content.size || 0,
        content.sourceSha ? this.escapeSQL(content.sourceSha) : 'NULL',
        content.sourceCommit ? this.escapeSQL(content.sourceCommit) : 'NULL',
        content.updated_at || Date.now()
      ];
      
      statements.push(`INSERT OR REPLACE INTO resource_content VALUES (${values.join(', ')});`);
    }

    return statements;
  }

  private escapeSQL(value: string): string {
    if (value === null || value === undefined) {
      return 'NULL';
    }
    return `'${value.replace(/'/g, "''")}'`;
  }

  private async writeSQLFile(statements: string[]): Promise<void> {
    const sqlContent = statements.join('\n\n');
    await fs.writeFile(this.outputFile, sqlContent, 'utf-8');
    console.log(`💾 SQL file written: ${this.outputFile}`);
  }
}

// Main function to build the database
async function buildSQLiteDatabase() {
  // Prepend 'exports/' to the outputDir to match the download location
  const sourceDir = path.join('exports', downloadConfig.outputDir);
  const outputFile = `${downloadConfig.owner}-${downloadConfig.language}-resources.sql`;
  
  console.log(`📋 Building SQLite database from: ${sourceDir}`);
  console.log(`📄 Output file: ${outputFile}`);
  
  const builder = new SQLiteBuilder(sourceDir, outputFile);
  await builder.buildDatabase();
}

// Run the builder
buildSQLiteDatabase().catch(console.error);
