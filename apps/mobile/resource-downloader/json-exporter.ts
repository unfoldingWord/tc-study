#!/usr/bin/env node

/**
 * Optimized JSON Database Exporter
 * 
 * Creates a highly compressed JSON export from downloaded resource files.
 * Features:
 * - Minified JSON structure with short property names
 * - Gzip compression for maximum file size reduction
 * - Optimized data structure to eliminate redundancy
 * - Efficient import format for IndexedDB
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { downloadConfig } from './config.js';

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);

// Optimized export format with minimal property names
interface OptimizedExportData {
  v: number; // version
  ts: string; // timestamp
  srv: string; // server
  own: string; // owner
  lng: string; // language
  meta: CompressedMetadata[]; // metadata
  cont: CompressedContent[]; // content
}

interface CompressedMetadata {
  k: string; // resourceKey
  i: string; // id
  s: string; // server
  o: string; // owner
  l: string; // language
  t: string; // type
  ti: string; // title
  d?: string; // description
  n: string; // name
  v?: string; // version
  lu?: number; // lastUpdated
  a?: number; // available
  toc?: any; // toc (keep as object for efficiency)
  ia?: number; // isAnchor
  ld?: string; // languageDirection
  lt?: string; // languageTitle
  lg?: number; // languageIsGL
  ua?: number; // updated_at
}

interface CompressedContent {
  k: string; // key
  rk: string; // resourceKey
  ri: string; // resourceId
  s: string; // server
  o: string; // owner
  l: string; // language
  t: string; // type
  bc?: string; // bookCode
  ai?: string; // articleId
  c: any; // content (keep as object)
  lf?: number; // lastFetched
  cu?: number; // cachedUntil
  cs?: string; // checksum
  sz?: number; // size
  sh?: string; // sourceSha
  sc?: string; // sourceCommit
  ua?: number; // updated_at
}

class OptimizedJSONExporter {
  private baseDir: string;
  private outputFile: string;

  constructor(baseDir: string, outputFile: string) {
    this.baseDir = baseDir;
    this.outputFile = outputFile;
  }

  async exportToJSON(): Promise<void> {
    console.log('📦 Exporting resources to optimized JSON format...');
    console.log(`📁 Source: ${this.baseDir}`);
    console.log(`💾 Output: ${this.outputFile}`);

    const exportData: OptimizedExportData = {
      v: 1, // version
      ts: new Date().toISOString(),
      srv: downloadConfig.server,
      own: downloadConfig.owner,
      lng: downloadConfig.language,
      meta: [],
      cont: []
    };

    // Find all metadata files
    const metadataFiles = await this.findFiles(this.baseDir, 'metadata.json');
    console.log(`📋 Found ${metadataFiles.length} metadata files`);

    // Process metadata files with compression
    for (const metadataFile of metadataFiles) {
      try {
        const content = await fs.readFile(metadataFile, 'utf-8');
        const metadata = JSON.parse(content);
        const compressed = this.compressMetadata(metadata);
        exportData.meta.push(compressed);
        console.log(`✅ Compressed metadata: ${metadata.resourceKey}`);
      } catch (error) {
        console.warn(`❌ Failed to process metadata file: ${metadataFile}`, error);
      }
    }

    // Find all content files
    const contentFiles = await this.findFiles(this.baseDir, '*.json', ['metadata.json']);
    console.log(`📄 Found ${contentFiles.length} content files`);

    // Process content files with compression
    for (const contentFile of contentFiles) {
      try {
        const content = await fs.readFile(contentFile, 'utf-8');
        const resourceContent = JSON.parse(content);
        const compressed = this.compressContent(resourceContent);
        exportData.cont.push(compressed);
        
        // Extract identifier for logging
        const identifier = resourceContent.bookCode || resourceContent.articleId || 'unknown';
        console.log(`✅ Compressed content: ${resourceContent.resourceKey}/${identifier}`);
      } catch (error) {
        console.warn(`❌ Failed to process content file: ${contentFile}`, error);
      }
    }

    // Create multiple export formats
    await this.writeOptimizedFormats(exportData);
    
  }

  private compressMetadata(metadata: any): CompressedMetadata {
    return {
      k: metadata.resourceKey,
      i: metadata.id,
      s: metadata.server,
      o: metadata.owner,
      l: metadata.language,
      t: metadata.type,
      ti: metadata.title,
      d: metadata.description || undefined,
      n: metadata.name,
      v: metadata.version || undefined,
      lu: metadata.lastUpdated?.getTime ? metadata.lastUpdated.getTime() : metadata.lastUpdated,
      a: metadata.available ? 1 : 0,
      toc: typeof metadata.toc === 'string' ? JSON.parse(metadata.toc) : metadata.toc,
      ia: metadata.isAnchor ? 1 : 0,
      ld: metadata.languageDirection || undefined,
      lt: metadata.languageTitle || undefined,
      lg: metadata.languageIsGL ? 1 : 0,
      ua: metadata.updated_at
    };
  }

  private compressContent(content: any): CompressedContent {
    return {
      k: content.key,
      rk: content.resourceKey,
      ri: content.resourceId,
      s: content.server,
      o: content.owner,
      l: content.language,
      t: content.type,
      bc: content.bookCode || undefined,
      ai: content.articleId || undefined,
      c: content.content,
      lf: content.lastFetched?.getTime ? content.lastFetched.getTime() : content.lastFetched,
      cu: content.cachedUntil?.getTime ? content.cachedUntil.getTime() : content.cachedUntil,
      cs: content.checksum || undefined,
      sz: content.size,
      sh: content.sourceSha || undefined,
      sc: content.sourceCommit || undefined,
      ua: content.updated_at
    };
  }

  private async writeOptimizedFormats(exportData: OptimizedExportData): Promise<void> {
    const baseFileName = this.outputFile.replace('.json', '');
    
    // 1. Minified JSON (no spaces)
    const minifiedJson = JSON.stringify(exportData);
    const minifiedFile = `${baseFileName}.min.json`;
    await fs.writeFile(minifiedFile, minifiedJson, 'utf-8');
    const minifiedSize = (await fs.stat(minifiedFile)).size;
    console.log(`💾 Minified JSON: ${minifiedFile} (${(minifiedSize / 1024 / 1024).toFixed(2)} MB)`);

    // 2. Gzip compressed
    const gzipFile = `${baseFileName}.min.json.gz`;
    const gzipped = await gzip(Buffer.from(minifiedJson, 'utf-8'));
    await fs.writeFile(gzipFile, gzipped);
    const gzipSize = (await fs.stat(gzipFile)).size;
    console.log(`🗜️  Gzip compressed: ${gzipFile} (${(gzipSize / 1024 / 1024).toFixed(2)} MB, ${((1 - gzipSize / minifiedSize) * 100).toFixed(1)}% smaller)`);

    // 3. Deflate compressed (alternative)
    const deflateFile = `${baseFileName}.min.json.deflate`;
    const deflated = await deflate(Buffer.from(minifiedJson, 'utf-8'));
    await fs.writeFile(deflateFile, deflated);
    const deflateSize = (await fs.stat(deflateFile)).size;
    console.log(`📦 Deflate compressed: ${deflateFile} (${(deflateSize / 1024 / 1024).toFixed(2)} MB, ${((1 - deflateSize / minifiedSize) * 100).toFixed(1)}% smaller)`);

    // Summary
    console.log(`
============================================================
🎉 Optimized JSON Export Complete!
📊 Metadata records: ${exportData.meta.length}
📊 Content records: ${exportData.cont.length}

📁 Export Files:
   📄 Minified: ${minifiedFile} (${(minifiedSize / 1024 / 1024).toFixed(2)} MB)
   🗜️  Gzipped:  ${gzipFile} (${(gzipSize / 1024 / 1024).toFixed(2)} MB) ⭐ RECOMMENDED
   📦 Deflate:  ${deflateFile} (${(deflateSize / 1024 / 1024).toFixed(2)} MB)

📋 To import into bt-studio:
   1. Go to Settings → Import Database
   2. Upload the ${gzipFile} file (smallest)
   3. Resources will be loaded into IndexedDB

🔧 Optimizations applied:
   ✅ Short property names (resourceKey → k)
   ✅ Removed undefined/null values
   ✅ Timestamp compression (Date → number)
   ✅ Boolean compression (true/false → 1/0)
   ✅ Gzip compression (~70-80% size reduction)
`);
  }

  private async findFiles(dir: string, pattern: string, exclude: string[] = []): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          // Recursively search subdirectories
          const subFiles = await this.findFiles(fullPath, pattern, exclude);
          files.push(...subFiles);
        } else if (entry.isFile()) {
          // Check if file matches pattern and is not excluded
          const shouldInclude = this.matchesPattern(entry.name, pattern) && 
                               !exclude.some(ex => this.matchesPattern(entry.name, ex));
          
          if (shouldInclude) {
            files.push(fullPath);
          }
        }
      }
    } catch (error) {
      console.warn(`Failed to read directory: ${dir}`, error);
    }
    
    return files;
  }

  private matchesPattern(filename: string, pattern: string): boolean {
    if (pattern === '*.json') {
      return filename.endsWith('.json');
    }
    return filename === pattern;
  }
}

// Main function
async function exportToJSON() {
  // Prepend 'exports/' to the outputDir to match the download location
  const sourceDir = path.join('exports', downloadConfig.outputDir);
  const outputFile = `${downloadConfig.owner}-${downloadConfig.language}-resources.json`;
  
  const exporter = new OptimizedJSONExporter(sourceDir, outputFile);
  await exporter.exportToJSON();
}

// Run the exporter
exportToJSON().catch(console.error);
