import * as fs from 'fs/promises';
import * as path from 'path';
import { ContentDiscovery } from './ContentDiscovery';
import { downloadConfig } from './config';
import { twlProcessor } from './twl-processor';

// Resource types (matches the app's enum)
enum ResourceType {
  SCRIPTURE = 'scripture',
  NOTES = 'notes',
  WORDS = 'words',
  WORDS_LINKS = 'words-links',
  ACADEMY = 'academy',
  QUESTIONS = 'questions'
}

// Import the real processors from the app
// We'll use dynamic imports to avoid TypeScript path issues
let notesProcessor: any;
let questionsProcessor: any;
let usfmProcessor: any;

// Utility function for concurrent processing with rate limiting
async function processConcurrently<T, R>(
  items: T[],
  processor: (item: T) => Promise<R>,
  concurrency: number = 3
): Promise<R[]> {
  const results: R[] = [];
  const executing: Promise<void>[] = [];
  
  for (const item of items) {
    const promise = processor(item).then(result => {
      results.push(result);
    });
    
    executing.push(promise);
    
    if (executing.length >= concurrency) {
      await Promise.race(executing);
      executing.splice(executing.findIndex(p => p === promise), 1);
    }
  }
  
  await Promise.all(executing);
  return results;
}

// Helper function for authenticated API requests
function createAuthenticatedFetch(apiToken?: string) {
  return (url: string, options: RequestInit = {}) => {
    const headers: Record<string, string> = {
      'User-Agent': 'Door43-Resource-Downloader/1.0.0',
      ...((options.headers as Record<string, string>) || {})
    };
    
    if (apiToken) {
      headers['Authorization'] = `token ${apiToken}`;
    }
    
    return fetch(url, {
      ...options,
      headers
    });
  };
}

// Dynamic imports to load the real processors
async function loadProcessors() {
  try {
    const notesModule = await import('../lib/services/notes-processor.js');
    const questionsModule = await import('../lib/services/questions-processor.js');
    const usfmModule = await import('../lib/services/usfm-processor.js');
    
    notesProcessor = notesModule.notesProcessor;
    questionsProcessor = questionsModule.questionsProcessor;
    usfmProcessor = usfmModule.usfmProcessor;
    
    console.log('✅ Real app processors loaded successfully');
  } catch (error) {
    console.warn('⚠️ Could not load real processors, using fallback processing', error);
  }
}

// Storage-compatible interfaces
interface ResourceMetadata {
  id: string;
  resourceKey: string;
  server: string;
  owner: string;
  language: string;
  type: ResourceType;
  title: string;
  description: string;
  name: string;
  version: string;
  lastUpdated: Date;
  available: boolean;
  toc?: any;
  isAnchor: boolean;
  languageDirection?: 'ltr' | 'rtl';
  languageTitle?: string;
  languageIsGL?: boolean;
}

interface ResourceContent {
  key: string;
  resourceKey: string;
  resourceId: string;
  server: string;
  owner: string;
  language: string;
  type: ResourceType;
  bookCode?: string;
  articleId?: string;
  content: any;
  lastFetched: Date;
  cachedUntil?: Date;
  checksum?: string;
  size: number;
  sourceSha?: string;
  sourceCommit?: string;
}

// Configuration for resources to download
// ResourceConfig now imported from ./config

// Book-organized resource adapter
class BookOrganizedAdapter {
  private resourceId: string;
  private contentDiscovery: ContentDiscovery;
  private fetch: (url: string, options?: RequestInit) => Promise<Response>;

  constructor(resourceId: string, authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>) {
    this.resourceId = resourceId;
    this.contentDiscovery = new ContentDiscovery();
    this.fetch = authenticatedFetch;
  }

  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata> {
    console.log(`📋 Fetching ${this.resourceId} metadata for ${owner}/${language} from ${server}`);
    
    const repoName = `${language}_${this.resourceId}`;
    const catalogUrl = `https://${server}/api/v1/catalog/search?repo=${repoName}&owner=${owner}&stage=prod`;
    
    const response = await this.fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
    }
    
    const catalogData = await response.json();
    if (!catalogData.ok || !catalogData.data || !Array.isArray(catalogData.data) || catalogData.data.length === 0) {
      throw new Error(`No ${this.resourceId} resource found for ${owner}/${language}`);
    }
    
    const resource = catalogData.data[0];
    console.log(`✅ Found ${this.resourceId.toUpperCase()} resource: ${resource.name}`);
    
    // Get available books
    const availableBooks = await this.getAvailableBooks(server, owner, language, resource);
    
    const resourceKey = `${server}/${owner}/${language}/${this.resourceId}`;
    
    return {
      id: this.resourceId,
      resourceKey,
      server,
      owner,
      language,
      type: this.getResourceType(),
      // Use same title/description fallback logic as real adapters
      title: resource.metadata?.dublin_core?.title || resource.title || `${this.resourceId.toUpperCase()} Scripture`,
      description: resource.metadata?.dublin_core?.description || resource.repo?.description || `${this.resourceId.toUpperCase()} scripture resource`,
      name: `${this.resourceId}-${language}`,
      version: resource.metadata?.dublin_core?.version || resource.release?.tag_name || '1.0.0',
      lastUpdated: new Date(resource.metadata?.dublin_core?.modified || resource.released || resource.repo?.updated_at || Date.now()),
      available: true,
      toc: { books: availableBooks },
      isAnchor: false,
      languageDirection: resource.language_direction as 'rtl' | 'ltr' || 'ltr',
      languageTitle: resource.language_title || language,
      languageIsGL: resource.language_is_gl || false
    };
  }

  async getAvailableBooks(server: string, owner: string, language: string, resource: any): Promise<any[]> {
    const repoName = `${language}_${this.resourceId}`;
    
    if (this.resourceId === 'ult' && resource.ingredients) {
      // For scripture, use catalog ingredients
      return resource.ingredients
        .filter((ingredient: any) => ingredient.identifier !== 'frt')
        .map((ingredient: any) => ({
          code: ingredient.identifier,
          name: ingredient.title,
          testament: this.getTestament(ingredient.identifier),
          fileName: ingredient.path.replace('./', '')
        }));
    } else {
      // For other resources, use repository contents API
      return await this.getAvailableBooksFromContents(server, owner, repoName);
    }
  }

  async getAvailableBooksFromContents(server: string, owner: string, repoName: string): Promise<any[]> {
    try {
      const contentsUrl = `https://${server}/api/v1/repos/${owner}/${repoName}/contents`;
      const response = await this.fetch(contentsUrl);
      
      if (!response.ok) {
        console.warn(`Could not fetch repository contents: ${response.status}`);
        return [];
      }
      
      const contents = await response.json();
      const books: any[] = [];
      
      for (const item of contents) {
        if (item.type === 'file' && this.isBookFile(item.name)) {
          const bookCode = this.extractBookCode(item.name);
          const bookName = this.getBookName(bookCode);
          
          books.push({
            code: bookCode,
            name: bookName,
            testament: this.getTestament(bookCode),
            fileName: item.name,
            size: item.size || 0,
            lastModified: new Date()
          });
        }
      }
      
      console.log(`📚 Found ${books.length} books in ${repoName}`);
      return books.sort((a, b) => a.code.localeCompare(b.code));
      
    } catch (error) {
      console.warn(`Could not fetch available books: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return [];
    }
  }

  async getBookContent(server: string, owner: string, language: string, bookCode: string, fileName: string): Promise<ResourceContent> {
    console.log(`📖 Fetching ${this.resourceId} content for ${bookCode} from ${owner}/${language}`);
    
    const repoName = `${language}_${this.resourceId}`;
    const fileUrl = `https://${server}/${owner}/${repoName}/raw/master/${fileName}`;
    
    const response = await this.fetch(fileUrl);
    if (!response.ok) {
      throw new Error(`File not found: ${response.status} ${response.statusText}`);
    }
    
    const rawContent = await response.text();
    
    // Process content based on resource type
    const processedContent = await this.processContent(rawContent, bookCode);
    
    // Generate storage-compatible content structure
    const resourceKey = `${server}/${owner}/${language}/${this.resourceId}`;
    const contentKey = `${resourceKey}/${bookCode}`;
    
    return {
      key: contentKey,
      resourceKey,
      resourceId: this.resourceId,
      server,
      owner,
      language,
      type: this.getResourceType(),
      bookCode,
      articleId: undefined, // Only for entry-organized content
      content: processedContent,
      lastFetched: new Date(),
      cachedUntil: undefined, // Could be set based on caching strategy
      checksum: undefined, // Could be calculated if needed
      size: JSON.stringify(processedContent).length,
      sourceSha: undefined, // Could be fetched from Git API
      sourceCommit: undefined // Could be fetched from Git API
    };
  }

  async processContent(content: string, bookCode: string): Promise<any> {
    const bookName = this.getBookName(bookCode);
    
    if (this.resourceId === 'ult' || this.resourceId === 'ust' || this.resourceId === 'uhb' || this.resourceId === 'ugnt') {
      console.log(`🔄 Processing USFM for ${bookCode} (${bookName})`);
      if (usfmProcessor) {
        // Determine the language based on resource type
        const language = this.resourceId === 'uhb' ? 'hbo' : 
                        this.resourceId === 'ugnt' ? 'el-x-koine' : 'en';
        return await usfmProcessor.processUSFMOptimized(content, bookCode, bookName, language);
      } else {
        // Fallback if processor not loaded
        return { id: bookCode, name: bookName, content, type: 'usfm' };
      }
    } else if (this.resourceId === 'tn') {
      if (notesProcessor) {
        return await notesProcessor.processNotes(content, bookCode, bookName);
      } else {
        return { id: bookCode, name: bookName, content, type: 'notes' };
      }
    } else if (this.resourceId === 'twl') {
      return await twlProcessor.processWordsLinks(content, bookCode, bookName);
    } else if (this.resourceId === 'tq') {
      if (questionsProcessor) {
        return await questionsProcessor.processQuestions(content, bookCode, bookName);
      } else {
        return { id: bookCode, name: bookName, content, type: 'questions' };
      }
    }
    
    throw new Error(`Unknown resource type: ${this.resourceId}`);
  }

  private getResourceType(): ResourceType {
    switch (this.resourceId) {
      case 'ult': return ResourceType.SCRIPTURE;
      case 'ust': return ResourceType.SCRIPTURE;
      case 'uhb': return ResourceType.SCRIPTURE;
      case 'ugnt': return ResourceType.SCRIPTURE;
      case 'tn': return ResourceType.NOTES;
      case 'twl': return ResourceType.WORDS_LINKS;
      case 'tq': return ResourceType.QUESTIONS;
      default: throw new Error(`Unknown resource type: ${this.resourceId}`);
    }
  }

  private isBookFile(fileName: string): boolean {
    if (this.resourceId === 'ult' || this.resourceId === 'ust' || this.resourceId === 'uhb' || this.resourceId === 'ugnt') {
      return fileName.endsWith('.usfm');
    } else if (this.resourceId === 'tn') {
      return fileName.startsWith('tn_') && fileName.endsWith('.tsv');
    } else if (this.resourceId === 'twl') {
      return fileName.startsWith('twl_') && fileName.endsWith('.tsv');
    } else if (this.resourceId === 'tq') {
      return fileName.startsWith('tq_') && fileName.endsWith('.tsv');
    }
    return false;
  }

  private extractBookCode(fileName: string): string {
    if (this.resourceId === 'ult' || this.resourceId === 'ust' || this.resourceId === 'uhb' || this.resourceId === 'ugnt') {
      const match = fileName.match(/\d+-(.+)\.usfm$/);
      return match ? match[1].toLowerCase() : fileName.replace('.usfm', '').toLowerCase();
    } else if (this.resourceId === 'tn') {
      return fileName.replace('tn_', '').replace('.tsv', '').toLowerCase();
    } else if (this.resourceId === 'twl') {
      return fileName.replace('twl_', '').replace('.tsv', '').toLowerCase();
    } else if (this.resourceId === 'tq') {
      return fileName.replace('tq_', '').replace('.tsv', '').toLowerCase();
    }
    return fileName.toLowerCase();
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

// Entry-organized resource adapter
class EntryOrganizedAdapter {
  private resourceId: string;
  private contentDiscovery: ContentDiscovery;
  private fetch: (url: string, options?: RequestInit) => Promise<Response>;

  constructor(resourceId: string, authenticatedFetch: (url: string, options?: RequestInit) => Promise<Response>) {
    this.resourceId = resourceId;
    this.contentDiscovery = new ContentDiscovery();
    this.fetch = authenticatedFetch;
  }

  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata> {
    console.log(`📋 Fetching ${this.resourceId} metadata for ${owner}/${language} from ${server}`);
    
    const repoName = `${language}_${this.resourceId}`;
    const catalogUrl = `https://${server}/api/v1/catalog/search?repo=${repoName}&owner=${owner}&stage=prod`;
    
    const response = await this.fetch(catalogUrl);
    if (!response.ok) {
      throw new Error(`Failed to fetch catalog: ${response.status} ${response.statusText}`);
    }
    
    const catalogData = await response.json();
    if (!catalogData.ok || !catalogData.data || !Array.isArray(catalogData.data) || catalogData.data.length === 0) {
      throw new Error(`No ${this.resourceId} resource found for ${owner}/${language}`);
    }
    
    const resource = catalogData.data[0];
    console.log(`✅ Found ${this.resourceId.toUpperCase()} resource: ${resource.name}`);
    
    // Get available entries using content discovery
    const discoveryResult = await this.contentDiscovery.discoverEntryContent(server, owner, language, this.resourceId);
    
    const resourceKey = `${server}/${owner}/${language}/${this.resourceId}`;
    
    return {
      id: this.resourceId,
      resourceKey,
      server,
      owner,
      language,
      type: this.getResourceType(),
      // Use same title/description fallback logic as real adapters
      title: resource.metadata?.dublin_core?.title || resource.title || this.getDefaultTitle(),
      description: resource.metadata?.dublin_core?.description || resource.repo?.description || this.getDefaultDescription(),
      name: `${this.resourceId}-${language}`,
      version: resource.metadata?.dublin_core?.version || resource.release?.tag_name || '1.0.0',
      lastUpdated: new Date(resource.metadata?.dublin_core?.modified || resource.released || resource.repo?.updated_at || Date.now()),
      available: true,
      toc: { entries: discoveryResult.files },
      isAnchor: false,
      languageDirection: resource.language_direction as 'rtl' | 'ltr' || 'ltr',
      languageTitle: resource.language_title || language,
      languageIsGL: resource.language_is_gl || false
    };
  }

  async getEntryContent(server: string, owner: string, language: string, entryId: string, branchOrTag: string): Promise<ResourceContent> {
    console.log(`📖 Fetching ${this.resourceId} content for ${entryId} from ${owner}/${language}`);
    
    // Process content based on resource type
    const processedContent = await this.processEntryContent(server, owner, language, entryId, branchOrTag);
    
    // Generate storage-compatible content structure
    const resourceKey = `${server}/${owner}/${language}/${this.resourceId}`;
    const contentKey = `${resourceKey}/${entryId}`;
    
    return {
      key: contentKey,
      resourceKey,
      resourceId: this.resourceId,
      server,
      owner,
      language,
      type: this.getResourceType(),
      bookCode: undefined, // Only for book-organized content
      articleId: entryId,
      content: processedContent,
      lastFetched: new Date(),
      cachedUntil: undefined, // Could be set based on caching strategy
      checksum: undefined, // Could be calculated if needed
      size: JSON.stringify(processedContent).length,
      sourceSha: undefined, // Could be fetched from Git API
      sourceCommit: undefined // Could be fetched from Git API
    };
  }

  async processEntryContent(server: string, owner: string, language: string, entryId: string, branchOrTag: string): Promise<any> {
    if (this.resourceId === 'tw') {
      // Translation Words processing
      const fileUrl = this.contentDiscovery.getFileContentUrl(
        server,
        owner,
        `${language}_${this.resourceId}`,
        `${entryId}.md`,
        branchOrTag
      );
      
      const response = await this.fetch(fileUrl);
      if (!response.ok) {
        throw new Error(`Failed to fetch ${entryId}: ${response.status}`);
      }
      
      const markdownContent = await response.text();
      
      // Extract title from markdown (first # heading)
      const titleMatch = markdownContent.match(/^#\s+(.+)$/m);
      const title = titleMatch ? titleMatch[1].trim() : entryId.split('/').pop() || entryId;
      
      // Extract definition from markdown (content under ## Definition)
      const definitionMatch = markdownContent.match(/##\s+Definition\s*\n\n([\s\S]*?)(?=\n##|\n$)/);
      const definition = definitionMatch ? definitionMatch[1].trim() : '';
      
      // Return in the format expected by the app
      return {
        word: {
          id: entryId,
          term: title,
          definition: definition || markdownContent
        }
      };
      
    } else if (this.resourceId === 'ta') {
      // Translation Academy processing
      const entryPath = entryId; // e.g., "checking/acceptable"
      
      const titleUrl = this.contentDiscovery.getFileContentUrl(
        server,
        owner,
        `${language}_${this.resourceId}`,
        `${entryPath}/title.md`,
        branchOrTag
      );
      const subtitleUrl = this.contentDiscovery.getFileContentUrl(
        server,
        owner,
        `${language}_${this.resourceId}`,
        `${entryPath}/sub-title.md`,
        branchOrTag
      );
      const contentUrl = this.contentDiscovery.getFileContentUrl(
        server,
        owner,
        `${language}_${this.resourceId}`,
        `${entryPath}/01.md`,
        branchOrTag
      );

      const [titleResponse, subtitleResponse, contentResponse] = await Promise.all([
        this.fetch(titleUrl),
        this.fetch(subtitleUrl),
        this.fetch(contentUrl)
      ]);

      if (!titleResponse.ok || !subtitleResponse.ok || !contentResponse.ok) {
        throw new Error(`Failed to fetch title.md, sub-title.md or 01.md for ${entryId}`);
      }

      const titleContent = await titleResponse.text();
      const subtitleContent = await subtitleResponse.text();
      const mainContent = await contentResponse.text();

      // Combine the three files into a single article
      const combinedContent = `# ${titleContent.trim()}\n## ${subtitleContent.trim()}\n\n${mainContent}`;

      // Return in the format expected by the app
      return {
        article: {
          id: entryId,
          title: titleContent.trim(),
          content: combinedContent,
          category: entryId.split('/')[0]
        }
      };
    }
    
    throw new Error(`Unknown entry resource type: ${this.resourceId}`);
  }

  private getResourceType(): ResourceType {
    switch (this.resourceId) {
      case 'tw': return ResourceType.WORDS;
      case 'ta': return ResourceType.ACADEMY;
      default: throw new Error(`Unknown resource type: ${this.resourceId}`);
    }
  }

  private getDefaultTitle(): string {
    switch (this.resourceId) {
      case 'tw': return 'Translation Words';
      case 'ta': return 'Translation Academy';
      default: return `${this.resourceId.toUpperCase()} Resource`;
    }
  }

  private getDefaultDescription(): string {
    switch (this.resourceId) {
      case 'tw': return 'Biblical term definitions and explanations';
      case 'ta': return 'Translation training articles and guidelines';
      default: return `${this.resourceId.toUpperCase()} resource`;
    }
  }
}

// Storage-compatible file organizer
class CompleteFileOrganizer {
  private baseDir: string;

  constructor(baseDir: string) {
    this.baseDir = baseDir;
  }

  async saveResourceMetadata(metadata: ResourceMetadata): Promise<void> {
    const metadataDir = path.join(this.baseDir, metadata.server, metadata.owner, metadata.language, metadata.id);
    const metadataPath = path.join(metadataDir, 'metadata.json');
    
    // Convert to storage format
    const storageMetadata = {
      ...metadata,
      lastUpdated: metadata.lastUpdated.getTime(),
      available: metadata.available ? 1 : 0,
      isAnchor: metadata.isAnchor ? 1 : 0,
      toc: metadata.toc ? JSON.stringify(metadata.toc) : undefined,
      updated_at: Date.now()
    };
    
    await fs.mkdir(path.dirname(metadataPath), { recursive: true });
    await fs.writeFile(metadataPath, JSON.stringify(storageMetadata, null, 2), 'utf-8');
    
    console.log(`💾 Saved metadata: ${metadataPath}`);
  }

  async saveResourceContent(content: ResourceContent): Promise<void> {
    const contentDir = path.join(this.baseDir, content.server, content.owner, content.language, content.resourceId, 'content');
    
    let filePath: string;
    if (content.bookCode) {
      // Book-organized content
      filePath = path.join(contentDir, `${content.bookCode}.json`);
    } else if (content.articleId) {
      // Entry-organized content
      const entryParts = content.articleId.split('/');
      const fileName = `${entryParts[entryParts.length - 1]}.json`;
      const dirParts = entryParts.slice(0, -1);
      const entryDir = path.join(contentDir, ...dirParts);
      await fs.mkdir(entryDir, { recursive: true });
      filePath = path.join(entryDir, fileName);
    } else {
      throw new Error('Content must have either bookCode or articleId');
    }
    
    // Convert to storage format - keep content as object, IndexedDB will stringify it
    const storageContent = {
      ...content,
      lastFetched: content.lastFetched.getTime(),
      updated_at: Date.now()
    };
    
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(storageContent, null, 2), 'utf-8');
    
    console.log(`💾 Saved content: ${filePath}`);
  }

  async checkFileExists(content: { bookCode?: string; articleId?: string; server: string; owner: string; language: string; resourceId: string }): Promise<boolean> {
    const contentDir = path.join(this.baseDir, content.server, content.owner, content.language, content.resourceId, 'content');
    
    let filePath: string;
    if (content.bookCode) {
      // Book-organized content
      filePath = path.join(contentDir, `${content.bookCode}.json`);
    } else if (content.articleId) {
      // Entry-organized content
      const entryParts = content.articleId.split('/');
      const fileName = `${entryParts[entryParts.length - 1]}.json`;
      const dirParts = entryParts.slice(0, -1);
      const entryDir = path.join(contentDir, ...dirParts);
      filePath = path.join(entryDir, fileName);
    } else {
      return false;
    }
    
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }
}

// Progress tracker
class ProgressTracker {
  private totalResources: number;
  private completedResources = 0;
  private totalFiles = 0;
  private totalSize = 0;
  private startTime: Date;
  private failedDownloads: {
    resource: string;
    item: string;
    error: string;
    type: 'book' | 'entry';
  }[] = [];

  constructor(totalResources: number) {
    this.totalResources = totalResources;
    this.startTime = new Date();
  }

  resourceCompleted(files: number, size: number): void {
    this.completedResources++;
    this.totalFiles += files;
    this.totalSize += size;
    
    const progress = (this.completedResources / this.totalResources * 100).toFixed(1);
    console.log(`📊 Progress: ${this.completedResources}/${this.totalResources} resources (${progress}%)`);
  }

  addFailure(resource: string, item: string, error: string, type: 'book' | 'entry'): void {
    this.failedDownloads.push({
      resource,
      item,
      error,
      type
    });
  }

  getFailureReport(): string {
    if (this.failedDownloads.length === 0) {
      return '✅ No failed downloads!';
    }

    const failuresByResource = this.failedDownloads.reduce((acc, failure) => {
      if (!acc[failure.resource]) {
        acc[failure.resource] = [];
      }
      acc[failure.resource].push(failure);
      return acc;
    }, {} as Record<string, typeof this.failedDownloads>);

    let report = `\n❌ Failed Downloads Report (${this.failedDownloads.length} total failures):\n`;
    report += '='.repeat(60) + '\n';

    for (const [resourceName, failures] of Object.entries(failuresByResource)) {
      report += `\n📚 ${resourceName} (${failures.length} failures):\n`;
      
      // Group by error type
      const errorGroups = failures.reduce((acc, failure) => {
        const errorKey = failure.error.includes('fetch failed') ? 'Rate Limit/Network' : 
                        failure.error.includes('404') ? 'Not Found' :
                        failure.error.includes('Failed to fetch') ? 'Network Error' : 'Other';
        if (!acc[errorKey]) acc[errorKey] = [];
        acc[errorKey].push(failure.item);
        return acc;
      }, {} as Record<string, string[]>);

      for (const [errorType, items] of Object.entries(errorGroups)) {
        report += `   ${errorType}: ${items.length} items\n`;
        if (items.length <= 5) {
          items.forEach(item => report += `     - ${item}\n`);
        } else {
          items.slice(0, 3).forEach(item => report += `     - ${item}\n`);
          report += `     ... and ${items.length - 3} more\n`;
        }
      }
    }

    report += '\n💡 Suggestions:\n';
    report += '   - Add API token to config.ts to increase rate limit (60 → 1000+ req/hour)\n';
    report += '   - Run the downloader again with skipExisting: true to retry failed items\n';
    report += '   - Check network connection for persistent failures\n';

    return report;
  }

  getSummary(): string {
    const duration = (new Date().getTime() - this.startTime.getTime()) / 1000;
    const successRate = this.totalFiles > 0 ? ((this.totalFiles - this.failedDownloads.length) / this.totalFiles * 100).toFixed(1) : '100.0';
    
    let summary = `
🎉 Complete Download Finished!
📊 Total resources: ${this.completedResources}
📊 Total files: ${this.totalFiles}
📦 Total size: ${(this.totalSize / 1024 / 1024).toFixed(2)} MB
⏱️  Duration: ${duration.toFixed(2)}s
✅ Success rate: ${successRate}% (${this.totalFiles - this.failedDownloads.length}/${this.totalFiles} files)
📁 Output: uw-translation-resources/
💾 Format: IndexedDB/SQLite compatible`;

    // Add failure report if there are failures
    summary += this.getFailureReport();
    
    return summary;
  }
}

// Main download function
async function downloadCompleteResources() {
  // Load the real app processors first
  await loadProcessors();
  
  // Load configuration from config file
  const { server, owner, language, outputDir, resources, concurrency = 3, apiToken, skipExisting = false } = downloadConfig;
  
  // Prepend 'exports/' to the outputDir to ensure all downloads go to exports directory
  const finalOutputDir = path.join('exports', outputDir);
  
  console.log('📋 Configuration loaded:');
  console.log(`   Server: ${server}`);
  console.log(`   Owner: ${owner}`);
  console.log(`   Language: ${language}`);
  console.log(`   Output: ${finalOutputDir}`);
  console.log(`   Resources: ${resources.length} configured`);
  console.log(`   ⚡ Concurrency: ${concurrency} simultaneous downloads`);
  console.log(`   🔐 Authentication: ${apiToken ? '✅ API Token (1000+ req/hour)' : '❌ Anonymous (60 req/hour)'}`);
  console.log(`   📁 Skip Existing: ${skipExisting ? '✅ Resume mode (skip downloaded files)' : '❌ Re-download all files'}`);
  
  const fileOrganizer = new CompleteFileOrganizer(finalOutputDir);
  const progressTracker = new ProgressTracker(resources.length);
  const authenticatedFetch = createAuthenticatedFetch(apiToken);
  
  console.log('🚀 Starting Complete Resource Download');
  console.log('=' .repeat(60));
  
  for (const resource of resources) {
    console.log(`\n📚 [${resources.indexOf(resource) + 1}/${resources.length}] Downloading ${resource.name} (${resource.id})`);
    console.log('   ' + '-'.repeat(50));
    
    // Use resource-specific owner and language if provided, otherwise use global settings
    const resourceOwner = resource.owner || owner;
    const resourceLanguage = resource.language || language;
    
    if (resource.owner || resource.language) {
      console.log(`   🔄 Using resource-specific settings: ${resourceOwner}/${resourceLanguage}`);
    }
    
    try {
      let resourceFiles = 0;
      let resourceSize = 0;
      
      if (resource.type === 'book') {
        // Handle book-organized resources
        const adapter = new BookOrganizedAdapter(resource.id, authenticatedFetch);
        
        // Get metadata and save it
        const metadata = await adapter.getResourceMetadata(server, resourceOwner, resourceLanguage);
        await fileOrganizer.saveResourceMetadata(metadata);
        
        const availableBooks = metadata.toc?.books || [];
        const booksToDownload = resource.maxBooks 
          ? availableBooks.slice(0, resource.maxBooks)
          : availableBooks;
          
        console.log(`   📖 Downloading ${booksToDownload.length}/${availableBooks.length} books (${concurrency} concurrent)`);
        
        // Process books concurrently
        const bookResults = await processConcurrently(
          booksToDownload,
          async (book) => {
            try {
              // Check if file already exists (for resume functionality)
              if (skipExisting) {
                const exists = await fileOrganizer.checkFileExists({
                  bookCode: book.code,
                  server,
                  owner: resourceOwner,
                  language: resourceLanguage,
                  resourceId: resource.id
                });
                
                if (exists) {
                  console.log(`     ⏭️ ${book.code} (already downloaded)`);
                  return { success: true, size: 0, book: book.code, skipped: true };
                }
              }
              
              console.log(`     📄 ${book.code} (${book.name})...`);
              
              const resourceContent = await adapter.getBookContent(
                server, resourceOwner, resourceLanguage, book.code, book.fileName
              );
              
              await fileOrganizer.saveResourceContent(resourceContent);
              
              console.log(`     ✅ ${book.code} -> ${(resourceContent.size / 1024).toFixed(1)}KB`);
              return { success: true, size: resourceContent.size, book: book.code };
              
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.log(`     ❌ ${book.code}: ${errorMessage}`);
              return { success: false, size: 0, book: book.code, error: errorMessage };
            }
          },
          concurrency
        );
        
        // Calculate totals from results
        const successfulBooks = bookResults.filter(r => r.success);
        const skippedBooks = bookResults.filter(r => r.success && (r as any).skipped);
        const failedBooks = bookResults.filter(r => !r.success);
        resourceFiles = successfulBooks.length;
        resourceSize = bookResults.reduce((sum, r) => sum + r.size, 0);
        
        // Track failures
        failedBooks.forEach(result => {
          progressTracker.addFailure(resource.name, (result as any).book, (result as any).error, 'book');
        });
        
        if (skippedBooks.length > 0) {
          console.log(`   ⏭️ Skipped ${skippedBooks.length} already downloaded books`);
        }
        if (failedBooks.length > 0) {
          console.log(`   ❌ Failed ${failedBooks.length} books (see end report for details)`);
        }
        
      } else if (resource.type === 'entry') {
        // Handle entry-organized resources
        const adapter = new EntryOrganizedAdapter(resource.id, authenticatedFetch);
        
        // Get metadata and save it
        const metadata = await adapter.getResourceMetadata(server, resourceOwner, resourceLanguage);
        await fileOrganizer.saveResourceMetadata(metadata);
        
        const availableEntries = metadata.toc?.entries || [];
        const entriesToDownload = resource.maxEntries 
          ? availableEntries.slice(0, resource.maxEntries)
          : availableEntries;
          
        console.log(`   📖 Downloading ${entriesToDownload.length}/${availableEntries.length} entries (${concurrency} concurrent)`);
        
        // Get branch/tag info for downloads
        const catalogUrl = `https://${server}/api/v1/catalog/search?repo=${resourceLanguage}_${resource.id}&owner=${resourceOwner}&stage=prod`;
        const catalogResponse = await authenticatedFetch(catalogUrl);
        const catalogData = await catalogResponse.json();
        const branchOrTag = catalogData.data?.[0]?.release?.tag_name || 'master';
        
        // Process entries concurrently
        const entryResults = await processConcurrently(
          entriesToDownload,
          async (entry) => {
            try {
              // Check if file already exists (for resume functionality)
              if (skipExisting) {
                const exists = await fileOrganizer.checkFileExists({
                  articleId: entry.entryId,
                  server,
                  owner: resourceOwner,
                  language: resourceLanguage,
                  resourceId: resource.id
                });
                
                if (exists) {
                  console.log(`     ⏭️ ${entry.entryId} (already downloaded)`);
                  return { success: true, size: 0, entry: entry.entryId, skipped: true };
                }
              }
              
              console.log(`     📄 ${entry.entryId}...`);
              
              const resourceContent = await adapter.getEntryContent(
                server, resourceOwner, resourceLanguage, entry.entryId, branchOrTag
              );
              
              await fileOrganizer.saveResourceContent(resourceContent);
              
              console.log(`     ✅ ${entry.entryId} -> ${(resourceContent.size / 1024).toFixed(1)}KB`);
              return { success: true, size: resourceContent.size, entry: entry.entryId };
              
            } catch (error) {
              const errorMessage = error instanceof Error ? error.message : 'Unknown error';
              console.log(`     ❌ ${entry.entryId}: ${errorMessage}`);
              return { success: false, size: 0, entry: entry.entryId, error: errorMessage };
            }
          },
          concurrency
        );
        
        // Calculate totals from results
        const successfulEntries = entryResults.filter(r => r.success);
        const skippedEntries = entryResults.filter(r => r.success && (r as any).skipped);
        const failedEntries = entryResults.filter(r => !r.success);
        resourceFiles = successfulEntries.length;
        resourceSize = entryResults.reduce((sum, r) => sum + r.size, 0);
        
        // Track failures
        failedEntries.forEach(result => {
          progressTracker.addFailure(resource.name, (result as any).entry, (result as any).error, 'entry');
        });
        
        if (skippedEntries.length > 0) {
          console.log(`   ⏭️ Skipped ${skippedEntries.length} already downloaded entries`);
        }
        if (failedEntries.length > 0) {
          console.log(`   ❌ Failed ${failedEntries.length} entries (see end report for details)`);
        }
      }
      
      console.log(`   📊 Downloaded ${resourceFiles} files (${(resourceSize / 1024).toFixed(1)}KB)`);
      progressTracker.resourceCompleted(resourceFiles, resourceSize);
      
    } catch (error) {
      console.error(`   ❌ Failed to download ${resource.name}:`, error);
      progressTracker.resourceCompleted(0, 0);
    }
  }
  
  console.log(progressTracker.getSummary());
}

// Run the download
downloadCompleteResources().catch(console.error);
