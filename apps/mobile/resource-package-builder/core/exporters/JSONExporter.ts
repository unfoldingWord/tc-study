/**
 * JSON Database Exporter
 * 
 * Creates a highly compressed JSON export from processed resource data.
 * Compatible with the IndexedDBStorageAdapter structure.
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import * as zlib from 'zlib';
import { promisify } from 'util';

const gzip = promisify(zlib.gzip);
const deflate = promisify(zlib.deflate);

export interface ExportOptions {
  outputDir: string;
  fileName?: string;
  compress?: boolean;
  compressionLevel?: number;
  minify?: boolean;
  includeMetadata?: boolean;
  includeContent?: boolean;
}

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
  lig?: number; // languageIsGL
  ua: number; // updated_at
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
  c: string; // content
  lf: number; // lastFetched
  sz: number; // size
  ua: number; // updated_at
}

export class JSONExporter {
  private options: ExportOptions;

  constructor(options: ExportOptions) {
    this.options = {
      fileName: 'resources.json',
      compress: true,
      compressionLevel: 9,
      minify: true,
      includeMetadata: true,
      includeContent: true,
      ...options
    };
  }

  /**
   * Export processed resources to JSON
   */
  async exportResources(resources: any[]): Promise<string> {
    const fileName = this.options.fileName!;
    const outputPath = path.join(this.options.outputDir, fileName);
    
    // Ensure output directory exists
    await fs.mkdir(this.options.outputDir, { recursive: true });

    // Process resources
    const exportData = await this.processResources(resources);

    // Convert to JSON
    const jsonString = this.options.minify 
      ? JSON.stringify(exportData)
      : JSON.stringify(exportData, null, 2);

    // Compress if requested
    let finalData: Buffer;
    if (this.options.compress) {
      finalData = await gzip(Buffer.from(jsonString, 'utf8'), {
        level: this.options.compressionLevel
      });
    } else {
      finalData = Buffer.from(jsonString, 'utf8');
    }

    // Write to file
    await fs.writeFile(outputPath, finalData);

    const sizeMB = (finalData.length / 1024 / 1024).toFixed(2);
    console.log(`📊 JSON export completed: ${outputPath} (${sizeMB} MB)`);

    return outputPath;
  }

  /**
   * Process resources into optimized format
   */
  private async processResources(resources: any[]): Promise<OptimizedExportData> {
    const metadata: CompressedMetadata[] = [];
    const content: CompressedContent[] = [];

    for (const resource of resources) {
      // Process metadata
      if (this.options.includeMetadata && resource.metadata) {
        metadata.push(this.compressMetadata(resource.metadata));
      }

      // Process content
      if (this.options.includeContent && resource.content) {
        const contentItems = await this.compressContent(resource);
        content.push(...contentItems);
      }
    }

    return {
      v: 2, // version
      ts: new Date().toISOString(),
      srv: 'door43',
      own: 'unfoldingWord',
      lng: 'en',
      meta: metadata,
      cont: content
    };
  }

  /**
   * Compress metadata object
   */
  private compressMetadata(metadata: any): CompressedMetadata {
    const resourceKey = `${metadata.server || 'door43'}_${metadata.owner || 'unfoldingWord'}_${metadata.language || 'en'}_${metadata.id || 'unknown'}`;
    
    return {
      k: resourceKey,
      i: metadata.id || 'unknown',
      s: metadata.server || 'door43',
      o: metadata.owner || 'unfoldingWord',
      l: metadata.language || 'en',
      t: metadata.type || 'unknown',
      ti: metadata.title || metadata.name || 'Unknown Resource',
      d: metadata.description || undefined,
      n: metadata.name || metadata.id || 'unknown',
      v: metadata.version || undefined,
      lu: metadata.lastUpdated || Date.now(),
      a: metadata.available || 1,
      toc: metadata.toc || undefined,
      ia: metadata.isAnchor || 0,
      ld: metadata.languageDirection || undefined,
      lt: metadata.languageTitle || undefined,
      lig: metadata.languageIsGL || 0,
      ua: metadata.updated_at || Date.now()
    };
  }

  /**
   * Compress content objects
   */
  private async compressContent(resource: any): Promise<CompressedContent[]> {
    const content: CompressedContent[] = [];
    const resourceKey = `${resource.metadata?.server || 'door43'}_${resource.metadata?.owner || 'unfoldingWord'}_${resource.metadata?.language || 'en'}_${resource.metadata?.id || 'unknown'}`;

    // Handle different resource types
    if (resource.type === 'scripture' && resource.books) {
      // Export scripture books
      for (const book of resource.books) {
        const bookKey = `${resourceKey}_${book.bookCode}`;
        const bookContent = this.options.minify 
          ? JSON.stringify(book)
          : JSON.stringify(book, null, 2);
        
        content.push({
          k: bookKey,
          rk: resourceKey,
          ri: resource.metadata?.id || 'unknown',
          s: resource.metadata?.server || 'door43',
          o: resource.metadata?.owner || 'unfoldingWord',
          l: resource.metadata?.language || 'en',
          t: 'scripture',
          bc: book.bookCode,
          ai: undefined,
          c: bookContent,
          lf: Date.now(),
          sz: Buffer.byteLength(bookContent, 'utf8'),
          ua: Date.now()
        });
      }
    } else if (resource.type === 'notes' && resource.notes) {
      // Export translation notes
      for (const note of resource.notes) {
        const noteKey = `${resourceKey}_${note.bookCode || 'unknown'}_${note.chapter || 0}_${note.verse || 0}`;
        const noteContent = this.options.minify 
          ? JSON.stringify(note)
          : JSON.stringify(note, null, 2);
        
        content.push({
          k: noteKey,
          rk: resourceKey,
          ri: resource.metadata?.id || 'unknown',
          s: resource.metadata?.server || 'door43',
          o: resource.metadata?.owner || 'unfoldingWord',
          l: resource.metadata?.language || 'en',
          t: 'notes',
          bc: note.bookCode,
          ai: undefined,
          c: noteContent,
          lf: Date.now(),
          sz: Buffer.byteLength(noteContent, 'utf8'),
          ua: Date.now()
        });
      });
    } else {
      // Generic content export
      const contentKey = `${resourceKey}_content`;
      const contentData = this.options.minify 
        ? JSON.stringify(resource)
        : JSON.stringify(resource, null, 2);
      
      content.push({
        k: contentKey,
        rk: resourceKey,
        ri: resource.metadata?.id || 'unknown',
        s: resource.metadata?.server || 'door43',
        o: resource.metadata?.owner || 'unfoldingWord',
        l: resource.metadata?.language || 'en',
        t: resource.type || 'unknown',
        bc: undefined,
        ai: undefined,
        c: contentData,
        lf: Date.now(),
        sz: Buffer.byteLength(contentData, 'utf8'),
        ua: Date.now()
      });
    }

    return content;
  }

  /**
   * Get export statistics
   */
  async getStatistics(resources: any[]): Promise<{
    resourceCount: number;
    metadataCount: number;
    contentCount: number;
    estimatedSize: number;
  }> {
    let metadataCount = 0;
    let contentCount = 0;
    let estimatedSize = 0;

    for (const resource of resources) {
      if (resource.metadata) metadataCount++;
      
      if (resource.books) {
        contentCount += resource.books.length;
        estimatedSize += resource.books.reduce((sum: number, book: any) => 
          sum + Buffer.byteLength(JSON.stringify(book), 'utf8'), 0);
      } else if (resource.notes) {
        contentCount += resource.notes.length;
        estimatedSize += resource.notes.reduce((sum: number, note: any) => 
          sum + Buffer.byteLength(JSON.stringify(note), 'utf8'), 0);
      } else {
        contentCount++;
        estimatedSize += Buffer.byteLength(JSON.stringify(resource), 'utf8');
      }
    }

    return {
      resourceCount: resources.length,
      metadataCount,
      contentCount,
      estimatedSize
    };
  }
}
















