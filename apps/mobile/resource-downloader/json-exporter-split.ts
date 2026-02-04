#!/usr/bin/env node

/**
 * Split JSON Database Exporter
 * 
 * Creates multiple smaller gzipped JSON files to avoid memory issues
 * when loading on mobile devices.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';
import { downloadConfig } from './config.js';

const gzip = promisify(zlib.gzip);

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

class SplitJSONExporter {
  private baseDir: string;
  private outputDir: string;
  private maxRecordsPerFile: number;

  constructor(baseDir: string, outputDir: string, maxRecordsPerFile: number = 100) {
    this.baseDir = baseDir;
    this.outputDir = outputDir;
    this.maxRecordsPerFile = maxRecordsPerFile;
  }

  async exportToJSON(): Promise<void> {
    console.log('📦 Exporting resources to split JSON format...');
    console.log(`📁 Source: ${this.baseDir}`);
    console.log(`💾 Output: ${this.outputDir}`);
    console.log(`📊 Max records per file: ${this.maxRecordsPerFile}`);

    // Create output directory
    await fs.mkdir(this.outputDir, { recursive: true });

    const metadata: CompressedMetadata[] = [];
    const content: CompressedContent[] = [];

    // Find all metadata files
    const metadataFiles = await this.findFiles(this.baseDir, 'metadata.json');
    console.log(`📋 Found ${metadataFiles.length} metadata files`);

    // Process metadata files
    for (const metadataFile of metadataFiles) {
      try {
        const fileContent = await fs.readFile(metadataFile, 'utf-8');
        const meta = JSON.parse(fileContent);
        const compressed = this.compressMetadata(meta);
        metadata.push(compressed);
      } catch (error) {
        console.warn(`❌ Failed to process metadata file: ${metadataFile}`, error);
      }
    }

    // Find all content files
    const contentFiles = await this.findFiles(this.baseDir, '*.json', ['metadata.json']);
    console.log(`📄 Found ${contentFiles.length} content files`);

    // Process content files
    for (const contentFile of contentFiles) {
      try {
        const fileContent = await fs.readFile(contentFile, 'utf-8');
        const resourceContent = JSON.parse(fileContent);
        const compressed = this.compressContent(resourceContent);
        content.push(compressed);
      } catch (error) {
        console.warn(`❌ Failed to process content file: ${contentFile}`, error);
      }
    }

    // Write manifest file
    const manifest = {
      v: 1,
      ts: new Date().toISOString(),
      srv: downloadConfig.server,
      own: downloadConfig.owner,
      lng: downloadConfig.language,
      totalMeta: metadata.length,
      totalCont: content.length,
      metaFiles: Math.ceil(metadata.length / this.maxRecordsPerFile),
      contFiles: Math.ceil(content.length / this.maxRecordsPerFile)
    };

    await this.writeGzippedFile(
      path.join(this.outputDir, 'manifest.json.gz'),
      JSON.stringify(manifest)
    );

    console.log(`\n📋 Manifest created: ${manifest.metaFiles} metadata files, ${manifest.contFiles} content files`);

    // Split and write metadata files
    await this.writeSplitFiles(metadata, 'meta', this.outputDir);

    // Split and write content files
    await this.writeSplitFiles(content, 'cont', this.outputDir);

    // Create index file for the app
    const indexData = {
      manifest: 'manifest.json.gz',
      metaFiles: Array.from({ length: manifest.metaFiles }, (_, i) => `meta-${i}.json.gz`),
      contFiles: Array.from({ length: manifest.contFiles }, (_, i) => `cont-${i}.json.gz`)
    };

    await this.writeGzippedFile(
      path.join(this.outputDir, 'index.json.gz'),
      JSON.stringify(indexData)
    );

    console.log(`\n✅ Export complete! Files written to: ${this.outputDir}`);
    console.log(`📊 Total files: ${manifest.metaFiles + manifest.contFiles + 2} (+ manifest + index)`);
  }

  private async writeSplitFiles(
    records: any[],
    prefix: string,
    outputDir: string
  ): Promise<void> {
    const chunks = this.chunkArray(records, this.maxRecordsPerFile);
    
    for (let i = 0; i < chunks.length; i++) {
      const chunk = chunks[i];
      const filename = path.join(outputDir, `${prefix}-${i}.json.gz`);
      const data = JSON.stringify(chunk);
      
      await this.writeGzippedFile(filename, data);
      
      const stats = await fs.stat(filename);
      console.log(`✅ ${prefix}-${i}.json.gz: ${chunk.length} records, ${(stats.size / 1024).toFixed(2)} KB`);
    }
  }

  private async writeGzippedFile(filepath: string, data: string): Promise<void> {
    const compressed = await gzip(Buffer.from(data, 'utf-8'));
    await fs.writeFile(filepath, compressed);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
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

  private async findFiles(dir: string, pattern: string, exclude: string[] = []): Promise<string[]> {
    const files: string[] = [];
    
    try {
      const entries = await fs.readdir(dir, { withFileTypes: true });
      
      for (const entry of entries) {
        const fullPath = path.join(dir, entry.name);
        
        if (entry.isDirectory()) {
          const subFiles = await this.findFiles(fullPath, pattern, exclude);
          files.push(...subFiles);
        } else if (entry.isFile()) {
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
  const sourceDir = path.join('exports', downloadConfig.outputDir);
  const outputDir = path.join('split-exports');
  
  const exporter = new SplitJSONExporter(sourceDir, outputDir, 100); // 100 records per file
  await exporter.exportToJSON();
  
  console.log(`
============================================================
🎉 Split JSON Export Complete!

📁 Output directory: ${outputDir}
📋 Files: manifest.json.gz, index.json.gz, meta-*.json.gz, cont-*.json.gz

📱 To use in your app:
   1. Copy the split-exports folder to bt-synergy/assets/
   2. The app will load files one by one to avoid memory issues
   3. Progress will be shown during loading

🔧 Benefits:
   ✅ No memory issues - files loaded one at a time
   ✅ Progress tracking - see which file is loading
   ✅ Faster parsing - smaller JSON files
   ✅ Better error handling - one file failure doesn't break everything
============================================================
`);
}

// Run the exporter
exportToJSON().catch(console.error);







