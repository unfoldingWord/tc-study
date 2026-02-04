/**
 * Door43 Scripture Adapter
 * Fetches USFM content from Door43 API with configurable resource fallback
 * Supports ULT, GLT, ULB, UST, GST and other scripture resources
 */

import { AdapterConfig, BookInfo, BookOrganizedAdapter, ResourceAdapterInfo, ResourceType, ScriptureMetadata } from '../../types/context';
import { OptimizedScripture, usfmProcessor } from '../usfm-processor';
import { getDoor43ApiClient } from '@bt-synergy/door43-api';

export interface Door43ScriptureConfig {
  resourceIds: string[];          // Priority list: ['ult', 'glt', 'ulb'] or ['ust', 'gst']
  serverId?: string;             // Default: 'git.door43.org'
  includeAlignments?: boolean;   // Include word alignments (default: true)
  includeSections?: boolean;     // Include section markers (default: true)
  usfmVersion?: string;         // Expected USFM version (default: '3.0')
  timeout?: number;             // Request timeout (default: 30000)
  retryAttempts?: number;       // Retry attempts (default: 3)
  retryDelay?: number;          // Retry delay (default: 1000)
  validateContent?: boolean;    // Validate content (default: true)
}

export class Door43ScriptureAdapter implements BookOrganizedAdapter {
  resourceType = ResourceType.SCRIPTURE;
  organizationType = 'book' as const;
  serverId: string;
  resourceId: string; // Will be set to the first resourceId in the priority list
  
  private config: AdapterConfig;
  private scriptureConfig: Door43ScriptureConfig;

  // Priority order for scripture resources (configurable)
  private readonly resourcePriority: string[];
  
  // Public getter for resource IDs (used by ResourceManager)
  get resourceIds(): string[] {
    return [...this.resourcePriority];
  }

  constructor(config: Door43ScriptureConfig) {
    this.scriptureConfig = {
      serverId: 'git.door43.org',
      includeAlignments: true,
      includeSections: true,
      usfmVersion: '3.0',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true,
      ...config
    };

    this.serverId = this.scriptureConfig.serverId!;
    this.resourcePriority = [...this.scriptureConfig.resourceIds];
    this.resourceId = this.resourcePriority[0]; // Use first resource as primary ID
    
    

    this.config = {
      timeout: this.scriptureConfig.timeout!,
      retryAttempts: this.scriptureConfig.retryAttempts!,
      retryDelay: this.scriptureConfig.retryDelay!,
      fallbackOptions: this.resourcePriority,
      processingCapabilities: ['usfm', 'sections', 'alignments', 'paragraphs']
    };
  }

  async getResourceMetadata(server: string, owner: string, language: string): Promise<ScriptureMetadata> {
    
    
    try {
      // Step 1: Try to find scripture resources using configured priority list
      const client = getDoor43ApiClient();
      let selectedResource = null;
      let selectedType = '';
      
      for (const resourceType of this.resourcePriority) {
        const repoName = `${language}_${resourceType}`; // e.g., "es-419_glt", "en_ult"
        
        try {
          const resource = await client.findRepository(owner, repoName);
          
          if (resource) {
            // Found a resource!
            selectedResource = resource;
            selectedType = resourceType;
            break;
          }
          
        } catch (error) {
          
          continue;
        }
      }
      
      if (!selectedResource) {
        throw new Error(`No scripture resource (${this.resourcePriority.join(', ')}) found for ${owner}/${language}. Tried repo names: ${this.resourcePriority.map(type => `${language}_${type}`).join(', ')}`);
      }
      
      // Step 3: Get repository manifest for detailed info
      const repoName = selectedResource.name; // e.g., "en_ult" or "es-419_glt"
      const manifestUrl = `https://${server}/api/v1/repos/${owner}/${repoName}/contents/manifest.yaml`;
      
      try {
        const manifestResponse = await this.fetchWithTimeout(manifestUrl, 10000);
        if (manifestResponse.ok) {
          // For now, we'll parse this as a simple structure
          // In a full implementation, use a YAML parser to extract book list
          
        }
      } catch (error) {
        console.warn(`⚠️ Could not load manifest, using catalog data only:`, error);
      }
      
      // Step 4: Build metadata from catalog information
      // Extract books from ingredients array
      const books = selectedResource.ingredients
        ?.filter((ingredient: { identifier: string }) => ingredient.identifier !== 'frt') // Skip front matter
        ?.map((ingredient: { identifier: string; title: string }) => ({
          code: ingredient.identifier,
          name: ingredient.title,
          testament: this.getTestament(ingredient.identifier)
          // Note: chapters and verses will be determined from processed content, not metadata
        })) || this.getAvailableBooks(server, owner, language);
      
      const metadata: ScriptureMetadata = {
        id: selectedType, // e.g., 'ult', 'glt'
        server,
        owner,
        language,
        type: ResourceType.SCRIPTURE,
        title: selectedResource.title || `${selectedType.toUpperCase()} Scripture`,
        description: selectedResource.repo?.description || `${selectedType.toUpperCase()} scripture resource`,
        name: `${selectedType}-${language}`,
        version: selectedResource.release?.tag_name || '1.0.0',
        lastUpdated: new Date(selectedResource.released || selectedResource.repo?.updated_at || Date.now()),
        available: true,
        toc: { books },
        isAnchor: selectedType === this.resourcePriority[0], // First resource in priority is anchor
        
        // Language metadata from Door43 API
        languageDirection: selectedResource.language_direction as 'rtl' | 'ltr' || 'ltr',
        languageTitle: selectedResource.language_title || language,
        languageIsGL: selectedResource.language_is_gl || false,
        
        // Scripture-specific metadata
        books,
        hasAlignments: this.scriptureConfig.includeAlignments!,
        hasSections: this.scriptureConfig.includeSections!,
        usfmVersion: selectedResource.metadata_version || '3.0',
        processingVersion: '1.0.0-web'
      };

      
      return metadata;
    } catch (error) {
      console.error(`❌ Failed to fetch literal text metadata:`, error);
      throw new Error(`Failed to fetch literal text metadata: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  async getBookContent(server: string, owner: string, language: string, bookCode: string): Promise<OptimizedScripture> {
    
    
    try {
      // Step 1: Find the best available scripture resource using configured priority list
      const client = getDoor43ApiClient();
      let selectedResource = null;
      let selectedType = '';
      
      for (const resourceType of this.resourcePriority) {
        const repoName = `${language}_${resourceType}`; // e.g., "es-419_glt", "en_ult"
        
        try {
          const resource = await client.findRepository(owner, repoName);
          
          if (resource) {
            // Found a resource!
            selectedResource = resource;
            selectedType = resourceType;
            break;
          }
          
        } catch (error) {
          
          continue;
        }
      }
      
      if (!selectedResource) {
        throw new Error(`No scripture resource (${this.resourcePriority.join(', ')}) found for ${owner}/${language}. Tried repo names: ${this.resourcePriority.map(type => `${language}_${type}`).join(', ')}`);
      }
      
      const repoName = selectedResource.name; // e.g., "en_ult" or "es-419_glt"
      
      // Step 2: Find the exact file path from catalog ingredients
      const ingredient = selectedResource.ingredients?.find((ing: { identifier: string }) => ing.identifier === bookCode.toLowerCase());
      
      if (!ingredient) {
        const availableBooks = selectedResource.ingredients?.map((ing: { identifier: string }) => ing.identifier) || [];
        throw new Error(`Book ${bookCode} not found in ${repoName}. Available: ${availableBooks.join(', ')}`);
      }
      
      // Step 3: Use the exact path from catalog (e.g., "./01-GEN.usfm")
      const filePath = ingredient.path.replace('./', ''); // Remove leading "./"
      
      // Use Door43ApiClient for content fetching
      const usfmContent = await client.fetchTextContent(owner, repoName, filePath);
      
      if (!usfmContent || usfmContent.trim().length === 0) {
        throw new Error(`Empty USFM content received from ${filePath}`);
      }
      
      
      
      // Step 4: Process USFM using our local processor
      const bookName = this.getBookName(bookCode);
      
      
      const processingResult = await usfmProcessor.processUSFMOptimized(usfmContent, bookCode, bookName, language);
      
      
      
      
      
      
      
      
      // Return the optimized scripture directly
      return processingResult;
      
    } catch (error) {
      console.error(`❌ Failed to fetch scripture content for ${bookCode}:`, error);
      throw new Error(`Failed to fetch scripture content for ${bookCode}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  getAvailableBooks(server: string, owner: string, language: string): BookInfo[] {
    // For now, return a basic set of books (fallback only)
    // In a full implementation, this would fetch from Door43 API manifest
    // Note: chapters and verses will be determined from processed content, not metadata
    return [
      { code: 'gen', name: 'Genesis', testament: 'OT' },
      { code: 'exo', name: 'Exodus', testament: 'OT' },
      { code: 'mat', name: 'Matthew', testament: 'NT' },
      { code: 'jhn', name: 'John', testament: 'NT' },
      { code: 'rom', name: 'Romans', testament: 'NT' }
    ];
  }

  async isBookAvailable(server: string, owner: string, language: string, bookCode: string): Promise<boolean> {
    const books = this.getAvailableBooks(server, owner, language);
    return books.some(book => book.code === bookCode);
  }

  async isResourceAvailable(server: string, owner: string, language: string): Promise<boolean> {
    try {
      // Check if any of the configured resources exist
      const client = getDoor43ApiClient();
      
      for (const resourceType of this.resourcePriority) {
        const repoName = `${language}_${resourceType}`;
        const resource = await client.findRepository(owner, repoName);
        
        if (resource) {
          return true;
        }
      }
      
      return false;
    } catch {
      return false;
    }
  }

  getResourceInfo(): ResourceAdapterInfo {
    return {
      name: 'Door43 Scripture Adapter',
      description: `Fetches USFM content from Door43 scripture repositories (${this.resourcePriority.join(', ')}) with configurable fallback`,
      supportedServers: [this.serverId],
      fallbackOptions: this.config.fallbackOptions || [],
      processingCapabilities: this.config.processingCapabilities || []
    };
  }

    configure(config: AdapterConfig): void {
    this.config = { ...this.config, ...config };
  }

  // Helper methods
  private async fetchWithTimeout(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { 
        signal: controller.signal,
        headers: {
          'Accept': 'text/plain',
          'User-Agent': 'BT-Studio/1.0.0'
        }
      });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }

  private getBookName(bookCode: string): string {
    const bookNames: Record<string, string> = {
      'gen': 'Genesis',
      'exo': 'Exodus',
      'lev': 'Leviticus',
      'num': 'Numbers',
      'deu': 'Deuteronomy',
      'mat': 'Matthew',
      'mrk': 'Mark',
      'luk': 'Luke',
      'jhn': 'John',
      'act': 'Acts',
      'rom': 'Romans',
      '1co': '1 Corinthians',
      '2co': '2 Corinthians',
      'gal': 'Galatians',
      'eph': 'Ephesians',
      'php': 'Philippians',
      'col': 'Colossians',
      '1th': '1 Thessalonians',
      '2th': '2 Thessalonians',
      '1ti': '1 Timothy',
      '2ti': '2 Timothy',
      'tit': 'Titus',
      'phm': 'Philemon',
      'heb': 'Hebrews',
      'jas': 'James',
      '1pe': '1 Peter',
      '2pe': '2 Peter',
      '1jn': '1 John',
      '2jn': '2 John',
      '3jn': '3 John',
      'jud': 'Jude',
      'rev': 'Revelation'
    };
    
    return bookNames[bookCode.toLowerCase()] || bookCode.toUpperCase();
  }



  private getTestament(bookCode: string): 'OT' | 'NT' {
    const otBooks = [
      'gen', 'exo', 'lev', 'num', 'deu', 'jos', 'jdg', 'rut', '1sa', '2sa',
      '1ki', '2ki', '1ch', '2ch', 'ezr', 'neh', 'est', 'job', 'psa', 'pro',
      'ecc', 'sng', 'isa', 'jer', 'lam', 'ezk', 'dan', 'hos', 'jol', 'amo',
      'oba', 'jon', 'mic', 'nam', 'hab', 'zep', 'hag', 'zec', 'mal'
    ];
    
    return otBooks.includes(bookCode.toLowerCase()) ? 'OT' : 'NT';
  }
}

// Export factory function for creating configured instances
export function createDoor43ScriptureAdapter(config: Door43ScriptureConfig): Door43ScriptureAdapter {
  return new Door43ScriptureAdapter(config);
}

// Export default instances for backward compatibility
export const door43LiteralTextAdapter = new Door43ScriptureAdapter({
  resourceIds: ['ult', 'glt', 'ulb']
});

export const door43SimplifiedTextAdapter = new Door43ScriptureAdapter({
  resourceIds: ['ust', 'gst'],
  includeAlignments: false // Simplified text typically doesn't need alignments
});

// Keep backward compatibility
export const door43ULTAdapter = door43LiteralTextAdapter;
