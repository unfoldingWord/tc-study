/**
 * UW_ULT Fetcher
 * 
 * Handles fetching ULT from Door43 using tarball archives
 */

import { Readable } from 'stream';
import * as tar from 'tar';
import * as zlib from 'zlib';
import { Door43ResourceMetadata, Door43Server } from '../../servers/door43';
import { UW_ULT_Config } from './index';

export interface FetchedResource {
  metadata: Door43ResourceMetadata;
  archiveUrl: string;
  archiveFormat: 'tarball' | 'zipball';
  filePattern: string;
  serverInfo: any;
  extractedFiles: Map<string, string>; // filePath -> content
}

export class UW_ULT_Fetcher {
  private server: Door43Server;

  constructor(server: Door43Server) {
    this.server = server;
  }

  /**
   * Fetch resource metadata from server
   */
  async fetchMetadata(config: UW_ULT_Config): Promise<Door43ResourceMetadata> {
    const resourceConfig = {
      owner: config.owner,
      language: config.language,
      resourceId: 'ult', // Door43 resource ID
      version: config.version,
      stage: config.stage
    };

    return await this.server.getResourceMetadata(resourceConfig);
  }

  /**
   * Fetch complete resource data including extracted files
   */
  async fetchResource(config: UW_ULT_Config): Promise<FetchedResource> {
    // Get metadata
    const metadata = await this.fetchMetadata(config);

    // Get archive URL
    const archiveUrl = this.server.getTarballUrl(metadata);
    const archiveFormat = 'tarball' as const;

    // Get file pattern
    const filePattern = this.server.getFilePattern('ult');

    // Get server info
    const serverInfo = this.server.getServerInfo();

    // Download and extract archive
    const extractedFiles = await this.downloadAndExtractArchive(archiveUrl, config);

    return {
      metadata,
      archiveUrl,
      archiveFormat,
      filePattern,
      serverInfo,
      extractedFiles
    };
  }

  /**
   * Download and extract tarball archive
   */
  private async downloadAndExtractArchive(archiveUrl: string, config: UW_ULT_Config): Promise<Map<string, string>> {
    console.log(`📦 Downloading archive: ${archiveUrl}`);
    
    // Download the tarball
    const response = await fetch(archiveUrl);
    if (!response.ok) {
      throw new Error(`Failed to download archive: ${response.status} ${response.statusText}`);
    }

    const archiveBuffer = Buffer.from(await response.arrayBuffer());
    console.log(`📦 Downloaded ${archiveBuffer.length} bytes`);

    // Extract the tarball
    const extractedFiles = new Map<string, string>();
    
    return new Promise((resolve, reject) => {
      const gunzip = zlib.createGunzip();
      const extract = tar.Parse();
      
      extract.on('entry', (entry: any) => {
        const filePath = entry.path;
        
        // Filter for USFM files only
        if (filePath.endsWith('.usfm') && !filePath.includes('/.git/')) {
          let content = '';
          
          entry.on('data', (chunk: Buffer) => {
            content += chunk.toString('utf8');
          });
          
          entry.on('end', () => {
            extractedFiles.set(filePath, content);
          });
        } else {
          // Skip non-USFM files
          entry.resume();
        }
      });
      
      extract.on('end', () => {
        console.log(`📦 Extracted ${extractedFiles.size} USFM files`);
        resolve(extractedFiles);
      });
      
      extract.on('error', (error: Error) => {
        reject(new Error(`Archive extraction failed: ${error.message}`));
      });
      
      // Pipe the archive through gunzip and tar
      Readable.from(archiveBuffer)
        .pipe(gunzip)
        .pipe(extract);
    });
  }

  /**
   * Download resource archive
   */
  async downloadArchive(config: UW_ULT_Config, format: 'tarball' | 'zipball' = 'tarball'): Promise<Buffer> {
    const metadata = await this.fetchMetadata(config);
    return await this.server.downloadResourceArchive(metadata, format);
  }

  /**
   * Get resource statistics
   */
  async getResourceStats(config: UW_ULT_Config): Promise<{
    totalFiles: number;
    totalSize: number;
    books: string[];
    lastUpdated: string;
  }> {
    const metadata = await this.fetchMetadata(config);
    
    return {
      totalFiles: metadata.ingredients.length,
      totalSize: metadata.ingredients.reduce((sum, ing) => sum + ing.size, 0),
      books: metadata.ingredients
        .filter(ing => ing.identifier && ing.identifier !== 'frt')
        .map(ing => ing.identifier),
      lastUpdated: metadata.pushedAt
    };
  }

  /**
   * Check if resource is available
   */
  async isAvailable(config: UW_ULT_Config): Promise<boolean> {
    try {
      await this.fetchMetadata(config);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get available versions
   */
  async getAvailableVersions(config: UW_ULT_Config): Promise<string[]> {
    const metadata = await this.fetchMetadata(config);
    return [metadata.version];
  }
}