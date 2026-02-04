/**
 * Door43 Translation Notes Adapter
 * Fetches Translation Notes (TN) content from Door43 API
 * Supports TSV format parsing and markdown processing
 */

import { AdapterConfig, BookInfo, BookOrganizedAdapter, NotesMetadata, ResourceAdapterInfo, ResourceType } from '../../types/context';
import { notesProcessor, ProcessedNotes } from '../notes-processor';
import { getDoor43ApiClient } from '@bt-synergy/door43-api';

export interface Door43NotesConfig {
  resourceId: string;              // 'tn' for Translation Notes
  serverId?: string;              // Default: 'git.door43.org'
  markdownProcessor?: 'basic' | 'advanced'; // Markdown processing level
  timeout?: number;               // Request timeout (default: 30000)
  retryAttempts?: number;         // Retry attempts (default: 3)
  retryDelay?: number;            // Retry delay (default: 1000)
  validateContent?: boolean;      // Validate content (default: true)
}



export class Door43NotesAdapter implements BookOrganizedAdapter {
  resourceType = ResourceType.NOTES;
  organizationType = 'book' as const;
  serverId: string;
  resourceId: string;
  
  private config: AdapterConfig;
  private notesConfig: Door43NotesConfig;

  constructor(config: Door43NotesConfig) {
    this.notesConfig = {
      serverId: 'git.door43.org',
      markdownProcessor: 'basic',
      timeout: 30000,
      retryAttempts: 3,
      retryDelay: 1000,
      validateContent: true,
      ...config
    };

    this.serverId = this.notesConfig.serverId!;
    this.resourceId = this.notesConfig.resourceId;
    
    

    this.config = {
      timeout: this.notesConfig.timeout!,
      retryAttempts: this.notesConfig.retryAttempts!,
      retryDelay: this.notesConfig.retryDelay!,
      fallbackOptions: [this.resourceId],
      processingCapabilities: ['tsv', 'markdown', 'references']
    };
  }

  async getResourceMetadata(server: string, owner: string, language: string): Promise<NotesMetadata> {
    
    
    try {
      const repoName = `${language}_${this.resourceId}`; // e.g., "en_tn"
      
      // Use Door43ApiClient for catalog search
      const client = getDoor43ApiClient();
      const resource = await client.findRepository(owner, repoName);
      
      if (!resource) {
        throw new Error(`No notes resources found for ${repoName}`);
      }
      
      
      // Get available books by checking the repository structure
      const availableBooks = await this.getAvailableBooks(server, owner, repoName);
      
      const metadata: NotesMetadata = {
        id: this.resourceId,
        server,
        owner,
        language,
        title: resource.title || this.getResourceTitle(this.resourceId, language),
        description: resource.description || `Translation Notes for ${language}`,
        name: `${this.resourceId}-${language}`,
        version: resource.release?.tag_name || '1.0.0',
        type: ResourceType.NOTES,
        available: true,
        lastUpdated: resource.released ? new Date(resource.released) : new Date(),
        toc: { books: availableBooks },
        isAnchor: false,
        
        // Language metadata from Door43 API
        languageDirection: resource.language_direction as 'rtl' | 'ltr' || 'ltr',
        languageTitle: resource.language_title || language,
        languageIsGL: resource.language_is_gl || false,
        
        // Notes-specific metadata
        resourceId: this.resourceId,
        repoName: resource.name,
        fullName: resource.full_name,
        htmlUrl: resource.html_url,
        cloneUrl: resource.clone_url,
        defaultBranch: resource.default_branch || 'master',
        availableBooks,
        format: 'tsv',
        markdownSupport: this.notesConfig.markdownProcessor !== undefined
      };
      
      
      return metadata;
      
    } catch (error) {
      console.error(`❌ Failed to fetch notes metadata:`, error);
      throw error;
    }
  }

  async getBookContent(server: string, owner: string, language: string, bookCode: string): Promise<ProcessedNotes> {
    
    
    try {
      const repoName = `${language}_${this.resourceId}`;
      const fileName = this.getBookFileName(bookCode);
      
      // Use Door43ApiClient for content fetching
      const client = getDoor43ApiClient();
      const tsvContent = await client.fetchTextContent(owner, repoName, fileName);
      
      
      // Process the TSV content
      const processedNotes = await this.processTSVContent(tsvContent, bookCode);
      
      
      return processedNotes;
      
    } catch (error) {
      console.error(`❌ Failed to fetch notes for ${bookCode}:`, error);
      throw error;
    }
  }

  getResourceInfo(): ResourceAdapterInfo {
    return {
      adapterId: `door43-notes-${this.resourceId}`,
      resourceType: this.resourceType,
      organizationType: this.organizationType,
      serverId: this.serverId,
      resourceId: this.resourceId,
      resourcePriority: [this.resourceId],
      config: this.config
    };
  }

  private async processTSVContent(tsvContent: string, bookCode: string): Promise<ProcessedNotes> {
    
    
    const bookName = this.getBookName(bookCode);
    
    // Use the notes processor to handle TSV parsing and structuring
    const processedNotes = await notesProcessor.processNotes(tsvContent, bookCode, bookName);
    
    
    return processedNotes;
  }


  private async getAvailableBooks(server: string, owner: string, repoName: string): Promise<BookInfo[]> {
    try {
      const contentsUrl = `https://${server}/api/v1/repos/${owner}/${repoName}/contents`;
      const response = await this.fetchWithTimeout(contentsUrl, 10000);
      
      if (!response.ok) {
        console.warn(`Could not fetch repository contents: ${response.status}`);
        return [];
      }
      
      const contents = await response.json();
      const books: BookInfo[] = [];
      
      for (const item of contents) {
        if (item.type === 'file' && item.name.endsWith('.tsv')) {
          const bookCode = item.name.replace('.tsv', '');
          const bookName = this.getBookName(bookCode);
          
          books.push({
            bookCode,
            bookName,
            fileName: item.name,
            size: item.size || 0,
            lastModified: new Date() // TSV files don't have detailed timestamps in this API
          });
        }
      }
      
      
      return books.sort((a, b) => a.bookCode.localeCompare(b.bookCode));
      
    } catch (error) {
      console.warn(`Could not fetch available books: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  private getBookFileName(bookCode: string): string {
    return `tn_${bookCode.toUpperCase()}.tsv`;
  }

  private getBookName(bookCode: string): string {
    const bookNames: Record<string, string> = {
      'gen': 'Genesis', 'exo': 'Exodus', 'lev': 'Leviticus', 'num': 'Numbers', 'deu': 'Deuteronomy',
      'jos': 'Joshua', 'jdg': 'Judges', 'rut': 'Ruth', '1sa': '1 Samuel', '2sa': '2 Samuel',
      '1ki': '1 Kings', '2ki': '2 Kings', '1ch': '1 Chronicles', '2ch': '2 Chronicles',
      'ezr': 'Ezra', 'neh': 'Nehemiah', 'est': 'Esther', 'job': 'Job', 'psa': 'Psalms',
      'pro': 'Proverbs', 'ecc': 'Ecclesiastes', 'sng': 'Song of Songs', 'isa': 'Isaiah',
      'jer': 'Jeremiah', 'lam': 'Lamentations', 'ezk': 'Ezekiel', 'dan': 'Daniel',
      'hos': 'Hosea', 'jol': 'Joel', 'amo': 'Amos', 'oba': 'Obadiah', 'jon': 'Jonah',
      'mic': 'Micah', 'nam': 'Nahum', 'hab': 'Habakkuk', 'zep': 'Zephaniah', 'hag': 'Haggai',
      'zec': 'Zechariah', 'mal': 'Malachi',
      'mat': 'Matthew', 'mrk': 'Mark', 'luk': 'Luke', 'jhn': 'John', 'act': 'Acts',
      'rom': 'Romans', '1co': '1 Corinthians', '2co': '2 Corinthians', 'gal': 'Galatians',
      'eph': 'Ephesians', 'php': 'Philippians', 'col': 'Colossians', '1th': '1 Thessalonians',
      '2th': '2 Thessalonians', '1ti': '1 Timothy', '2ti': '2 Timothy', 'tit': 'Titus',
      'phm': 'Philemon', 'heb': 'Hebrews', 'jas': 'James', '1pe': '1 Peter', '2pe': '2 Peter',
      '1jn': '1 John', '2jn': '2 John', '3jn': '3 John', 'jud': 'Jude', 'rev': 'Revelation'
    };
    
    return bookNames[bookCode.toLowerCase()] || bookCode.toUpperCase();
  }

  private getResourceTitle(resourceId: string, language: string): string {
    const titles: Record<string, string> = {
      'tn': 'Translation Notes'
    };
    
    const baseTitle = titles[resourceId] || resourceId.toUpperCase();
    return `${baseTitle} (${language.toUpperCase()})`;
  }

  private async fetchWithTimeout(url: string, timeout: number): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
      const response = await fetch(url, { signal: controller.signal });
      clearTimeout(timeoutId);
      return response;
    } catch (error) {
      clearTimeout(timeoutId);
      throw error;
    }
  }
}
