/**
 * Resource Discovery Service
 * 
 * Provides discovery and search functionality for resources across Door43 catalog.
 * Supports caching for offline-first operation.
 * 
 * Uses @bt-synergy/door43-api for all Door43 API calls.
 */

import { getDoor43ApiClient, Door43Language, Door43Resource } from '@bt-synergy/door43-api';
import { ResourceType } from '../../types/context';
import {
  AvailabilityStatus,
  DiscoveredResource,
  LanguageInfo,
  OwnerInfo,
  ResourceIdentifier,
  ResourceSearchQuery,
  ResourceSearchResult,
  SearchFacets,
  VersionInfo
} from '../../types/resource-package';

/**
 * Cache entry with expiry
 */
interface CacheEntry<T> {
  data: T;
  cachedAt: number;
  expiresAt: number;
}

/**
 * Resource Discovery Service Interface
 */
export interface IResourceDiscoveryService {
  // Search functionality
  searchResources(query: ResourceSearchQuery): Promise<ResourceSearchResult>;
  
  // Browse by category
  getAvailableLanguages(): Promise<LanguageInfo[]>;
  getAvailableOwners(server?: string): Promise<OwnerInfo[]>;
  getResourcesForLanguage(language: string, server?: string): Promise<DiscoveredResource[]>;
  browseByType(type: ResourceType): Promise<DiscoveredResource[]>;
  
  // Resource details
  getResourceDetails(identifier: ResourceIdentifier): Promise<DiscoveredResource>;
  checkResourceAvailable(identifier: ResourceIdentifier): Promise<AvailabilityStatus>;
  getResourceVersions(identifier: ResourceIdentifier): Promise<VersionInfo[]>;
  
  // Cache management
  clearCache(): Promise<void>;
  getCacheStats(): { entries: number; size: number };
}

/**
 * Door43-specific implementation of Resource Discovery
 */
export class Door43ResourceDiscoveryService implements IResourceDiscoveryService {
  private baseUrl: string;
  private catalogCache = new Map<string, CacheEntry<any>>();
  private cacheExpiryMs = 60 * 60 * 1000; // 1 hour default
  
  constructor(baseUrl = 'https://git.door43.org', cacheExpiryMs?: number) {
    this.baseUrl = baseUrl;
    if (cacheExpiryMs !== undefined) {
      this.cacheExpiryMs = cacheExpiryMs;
    }
  }
  
  /**
   * Search for resources with filters
   */
  async searchResources(query: ResourceSearchQuery): Promise<ResourceSearchResult> {
    const cacheKey = `search:${JSON.stringify(query)}`;
    const cached = this.getCachedData<ResourceSearchResult>(cacheKey);
    if (cached) {
      console.log('🔍 Using cached search results');
      return cached;
    }
    
    try {
      // Build search parameters
      const params = new URLSearchParams();
      
      if (query.query) {
        params.append('q', query.query);
      }
      
      // Fetch from Door43 catalog
      const catalogUrl = `${this.baseUrl}/api/v1/catalog/search?${params.toString()}`;
      const response = await fetch(catalogUrl);
      const data = await response.json();
      
      if (!data.ok || !data.data) {
        throw new Error('Failed to fetch catalog data');
      }
      
      // Transform to DiscoveredResource[]
      let resources = this.transformCatalogResults(data.data);
      
      // Apply local filters
      resources = this.applyFilters(resources, query);
      
      // Build facets
      const facets = this.buildFacets(resources);
      
      // Pagination
      const page = query.page || 0;
      const pageSize = query.pageSize || 20;
      const startIdx = page * pageSize;
      const endIdx = startIdx + pageSize;
      
      const result: ResourceSearchResult = {
        resources: resources.slice(startIdx, endIdx),
        totalCount: resources.length,
        page,
        pageSize,
        facets
      };
      
      // Cache the result
      this.setCachedData(cacheKey, result);
      
      return result;
      
    } catch (error) {
      console.error('❌ Failed to search resources:', error);
      throw error;
    }
  }
  
  /**
   * Get all available languages
   */
  async getAvailableLanguages(): Promise<LanguageInfo[]> {
    const cacheKey = 'languages:all';
    const cached = this.getCachedData<LanguageInfo[]>(cacheKey);
    if (cached) {
      console.log('🌍 Using cached languages');
      return cached;
    }
    
    try {
      // Use Door43ApiClient for type-safe API calls
      const client = getDoor43ApiClient();
      const door43Languages = await client.getLanguages();
      
      console.log('📥 Received languages from Door43:', door43Languages.length);
      
      // Transform Door43Language[] to LanguageInfo[]
      // Filter out languages without code or name (API returns incomplete data)
      const languages: LanguageInfo[] = door43Languages
        .filter(lang => lang.code && lang.name)
        .map((lang) => ({
          code: lang.code,
          name: lang.name,
          nativeName: lang.anglicized_name || lang.name,
          direction: lang.direction,
          isGatewayLanguage: false, // Not in Door43Language type yet
          resourceCount: 0, // Will be calculated separately
          lastUpdated: undefined
        }));
      
      console.log('✅ Transformed languages:', languages.length);
      
      // If no valid languages returned, use fallback
      if (languages.length === 0) {
        console.warn('⚠️ No valid languages from API, using fallback');
        return this.getFallbackLanguages();
      }
      
      // Cache the result
      this.setCachedData(cacheKey, languages);
      
      return languages;
      
    } catch (error) {
      console.error('❌ Failed to get languages:', error);
      // Return fallback with common languages
      return this.getFallbackLanguages();
    }
  }
  
  /**
   * Get available owners/organizations
   */
  async getAvailableOwners(server?: string): Promise<OwnerInfo[]> {
    const cacheKey = `owners:${server || 'default'}`;
    const cached = this.getCachedData<OwnerInfo[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    // For now, return known owners
    // TODO: Implement actual API call when available
    const owners: OwnerInfo[] = [
      {
        id: 'unfoldingWord',
        name: 'unfoldingWord',
        description: 'Biblical content for every language',
        websiteUrl: 'https://www.unfoldingword.org',
        resourceCount: 100,
        languages: [] // Would be populated from API
      },
      {
        id: 'Door43-Catalog',
        name: 'Door43 Catalog',
        description: 'Community translations and resources',
        resourceCount: 50,
        languages: []
      }
    ];
    
    this.setCachedData(cacheKey, owners);
    return owners;
  }
  
  /**
   * Get resources for a specific language
   */
  async getResourcesForLanguage(language: string, server?: string): Promise<DiscoveredResource[]> {
    const cacheKey = `language:${language}:${server || 'default'}`;
    const cached = this.getCachedData<DiscoveredResource[]>(cacheKey);
    if (cached) {
      return cached;
    }
    
    const result = await this.searchResources({
      languages: [language],
      pageSize: 100
    });
    
    this.setCachedData(cacheKey, result.resources);
    return result.resources;
  }
  
  /**
   * Browse by resource type
   */
  async browseByType(type: ResourceType): Promise<DiscoveredResource[]> {
    const result = await this.searchResources({
      types: [type],
      pageSize: 100
    });
    
    return result.resources;
  }
  
  /**
   * Get resource details
   */
  async getResourceDetails(identifier: ResourceIdentifier): Promise<DiscoveredResource> {
    const cacheKey = `resource:${JSON.stringify(identifier)}`;
    const cached = this.getCachedData<DiscoveredResource>(cacheKey);
    if (cached) {
      return cached;
    }
    
    try {
      const repoName = `${identifier.language}_${identifier.resourceId}`;
      const catalogUrl = `${this.baseUrl}/api/v1/catalog/search?repo=${repoName}&owner=${identifier.owner}&stage=prod`;
      
      const response = await fetch(catalogUrl);
      const data = await response.json();
      
      if (!data.ok || !data.data || data.data.length === 0) {
        throw new Error(`Resource not found: ${repoName}`);
      }
      
      const resource = this.transformCatalogEntry(data.data[0]);
      this.setCachedData(cacheKey, resource);
      
      return resource;
      
    } catch (error) {
      console.error('❌ Failed to get resource details:', error);
      throw error;
    }
  }
  
  /**
   * Check if a resource is available
   */
  async checkResourceAvailable(identifier: ResourceIdentifier): Promise<AvailabilityStatus> {
    try {
      const resource = await this.getResourceDetails(identifier);
      return {
        available: resource.available,
        version: resource.version,
        lastChecked: new Date()
      };
    } catch (error) {
      return {
        available: false,
        lastChecked: new Date(),
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }
  
  /**
   * Get available versions for a resource
   */
  async getResourceVersions(identifier: ResourceIdentifier): Promise<VersionInfo[]> {
    // TODO: Implement when Door43 API provides version history
    // For now, return just the current version
    try {
      const resource = await this.getResourceDetails(identifier);
      return [
        {
          version: resource.version,
          releaseDate: resource.releaseDate || new Date(),
          commitSha: resource.commitSha || '',
          isLatest: true
        }
      ];
    } catch (error) {
      return [];
    }
  }
  
  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================
  
  /**
   * Transform Door43 catalog results to DiscoveredResource[]
   */
  private transformCatalogResults(catalogData: any[]): DiscoveredResource[] {
    return catalogData.map(entry => this.transformCatalogEntry(entry));
  }
  
  /**
   * Transform a single catalog entry
   */
  private transformCatalogEntry(entry: any): DiscoveredResource {
    // Extract resource ID from name (e.g., 'en_ult' -> 'ult')
    const resourceId = entry.name?.replace(/^[^_]+_/, '') || entry.id || '';
    
    // Extract language from name (e.g., 'en_ult' -> 'en')
    const language = entry.language || entry.name?.split('_')[0] || 'en';
    
    // Determine resource type from subject
    const type = this.inferResourceType(entry.subject, resourceId);
    
    return {
      id: resourceId,
      name: entry.name || `${entry.owner}_${resourceId}`,
      title: entry.title || `${resourceId.toUpperCase()} Resource`,
      description: entry.repo?.description || entry.description || '',
      server: 'git.door43.org',
      owner: entry.owner || 'unfoldingWord',
      language,
      languageName: entry.language_title,
      languageDirection: entry.language_direction as 'ltr' | 'rtl' | undefined,
      type,
      format: this.inferFormat(type),
      version: entry.release?.tag_name || entry.version || 'latest',
      releaseDate: entry.released ? new Date(entry.released) : undefined,
      commitSha: entry.commit_sha || entry.sha,
      available: true,
      tarballUrl: entry.tarball_url || entry.release?.tarball_url,
      zipballUrl: entry.zipball_url || entry.release?.zipball_url,
      estimatedSize: entry.size || entry.release?.size,
      books: entry.ingredients?.filter((i: any) => i.identifier !== 'frt').map((i: any) => ({
        code: i.identifier,
        name: i.title
      })),
      subjects: entry.subject ? [entry.subject] : [],
      keywords: entry.keywords || [],
      license: entry.license || 'CC BY-SA 4.0'
    };
  }
  
  /**
   * Infer resource type from subject and resource ID
   */
  private inferResourceType(subject: string, resourceId: string): ResourceType {
    // Check resource ID patterns first
    if (['ult', 'glt', 'ulb', 'ust', 'gst', 'uhb', 'ugnt'].includes(resourceId.toLowerCase())) {
      return ResourceType.SCRIPTURE;
    }
    if (resourceId.toLowerCase() === 'tn') {
      return ResourceType.NOTES;
    }
    if (resourceId.toLowerCase() === 'tw') {
      return ResourceType.WORDS;
    }
    if (resourceId.toLowerCase() === 'twl') {
      return ResourceType.WORDS_LINKS;
    }
    if (resourceId.toLowerCase() === 'tq') {
      return ResourceType.QUESTIONS;
    }
    if (resourceId.toLowerCase() === 'ta') {
      return ResourceType.ACADEMY;
    }
    
    // Fall back to subject matching
    const subjectLower = subject?.toLowerCase() || '';
    if (subjectLower.includes('bible') || subjectLower.includes('scripture')) {
      return ResourceType.SCRIPTURE;
    }
    if (subjectLower.includes('notes')) {
      return ResourceType.NOTES;
    }
    if (subjectLower.includes('words')) {
      return ResourceType.WORDS;
    }
    if (subjectLower.includes('questions')) {
      return ResourceType.QUESTIONS;
    }
    if (subjectLower.includes('academy')) {
      return ResourceType.ACADEMY;
    }
    
    // Default
    return ResourceType.SCRIPTURE;
  }
  
  /**
   * Infer format from resource type
   */
  private inferFormat(type: ResourceType): string {
    switch (type) {
      case ResourceType.SCRIPTURE:
        return 'usfm';
      case ResourceType.NOTES:
      case ResourceType.QUESTIONS:
        return 'tsv';
      case ResourceType.ACADEMY:
      case ResourceType.WORDS:
        return 'markdown';
      default:
        return 'unknown';
    }
  }
  
  /**
   * Apply filters to resources
   */
  private applyFilters(resources: DiscoveredResource[], query: ResourceSearchQuery): DiscoveredResource[] {
    let filtered = resources;
    
    // Filter by languages
    if (query.languages?.length) {
      filtered = filtered.filter(r => query.languages!.includes(r.language));
    }
    
    // Filter by owners
    if (query.owners?.length) {
      filtered = filtered.filter(r => query.owners!.includes(r.owner));
    }
    
    // Filter by types
    if (query.types?.length) {
      filtered = filtered.filter(r => query.types!.includes(r.type));
    }
    
    // Filter by servers
    if (query.servers?.length) {
      filtered = filtered.filter(r => query.servers!.includes(r.server));
    }
    
    // Text search in name/title/description
    if (query.query) {
      const searchLower = query.query.toLowerCase();
      filtered = filtered.filter(r =>
        r.name.toLowerCase().includes(searchLower) ||
        r.title.toLowerCase().includes(searchLower) ||
        r.description?.toLowerCase().includes(searchLower)
      );
    }
    
    // Sort
    if (query.sortBy) {
      filtered = this.sortResources(filtered, query.sortBy, query.sortOrder || 'asc');
    }
    
    return filtered;
  }
  
  /**
   * Sort resources
   */
  private sortResources(
    resources: DiscoveredResource[],
    sortBy: string,
    sortOrder: 'asc' | 'desc'
  ): DiscoveredResource[] {
    const sorted = [...resources];
    const multiplier = sortOrder === 'asc' ? 1 : -1;
    
    sorted.sort((a, b) => {
      let comparison = 0;
      
      switch (sortBy) {
        case 'name':
          comparison = a.name.localeCompare(b.name);
          break;
        case 'language':
          comparison = a.language.localeCompare(b.language);
          break;
        case 'updated':
          const dateA = a.releaseDate?.getTime() || 0;
          const dateB = b.releaseDate?.getTime() || 0;
          comparison = dateA - dateB;
          break;
        default:
          comparison = 0;
      }
      
      return comparison * multiplier;
    });
    
    return sorted;
  }
  
  /**
   * Build search facets
   */
  private buildFacets(resources: DiscoveredResource[]): SearchFacets {
    const languageCounts = new Map<string, { code: string; name: string; count: number }>();
    const ownerCounts = new Map<string, { id: string; name: string; count: number }>();
    const typeCounts = new Map<ResourceType, number>();
    
    for (const resource of resources) {
      // Language facets
      const langKey = resource.language;
      const existing = languageCounts.get(langKey);
      if (existing) {
        existing.count++;
      } else {
        languageCounts.set(langKey, {
          code: resource.language,
          name: resource.languageName || resource.language,
          count: 1
        });
      }
      
      // Owner facets
      const ownerKey = resource.owner;
      const existingOwner = ownerCounts.get(ownerKey);
      if (existingOwner) {
        existingOwner.count++;
      } else {
        ownerCounts.set(ownerKey, {
          id: resource.owner,
          name: resource.owner,
          count: 1
        });
      }
      
      // Type facets
      typeCounts.set(resource.type, (typeCounts.get(resource.type) || 0) + 1);
    }
    
    return {
      languages: Array.from(languageCounts.values()).sort((a, b) => b.count - a.count),
      owners: Array.from(ownerCounts.values()).sort((a, b) => b.count - a.count),
      types: Array.from(typeCounts.entries()).map(([type, count]) => ({ type, count }))
    };
  }
  
  /**
   * Get fallback languages (common ones)
   */
  private getFallbackLanguages(): LanguageInfo[] {
    return [
      { code: 'en', name: 'English', direction: 'ltr', isGatewayLanguage: true, resourceCount: 10 },
      { code: 'es-419', name: 'Spanish', direction: 'ltr', isGatewayLanguage: true, resourceCount: 8 },
      { code: 'fr', name: 'French', direction: 'ltr', isGatewayLanguage: true, resourceCount: 7 },
      { code: 'pt-br', name: 'Portuguese', direction: 'ltr', isGatewayLanguage: true, resourceCount: 5 },
      { code: 'ar', name: 'Arabic', direction: 'rtl', isGatewayLanguage: true, resourceCount: 4 },
      { code: 'hbo', name: 'Hebrew', direction: 'rtl', isGatewayLanguage: false, resourceCount: 1 },
      { code: 'el-x-koine', name: 'Greek', direction: 'ltr', isGatewayLanguage: false, resourceCount: 1 }
    ];
  }
  
  // ============================================================================
  // CACHE MANAGEMENT
  // ============================================================================
  
  /**
   * Get cached data if valid
   */
  private getCachedData<T>(key: string): T | null {
    const entry = this.catalogCache.get(key);
    if (!entry) {
      return null;
    }
    
    const now = Date.now();
    if (now > entry.expiresAt) {
      this.catalogCache.delete(key);
      return null;
    }
    
    return entry.data as T;
  }
  
  /**
   * Set cached data with expiry
   */
  private setCachedData<T>(key: string, data: T): void {
    const now = Date.now();
    this.catalogCache.set(key, {
      data,
      cachedAt: now,
      expiresAt: now + this.cacheExpiryMs
    });
  }
  
  /**
   * Clear all cached data
   */
  async clearCache(): Promise<void> {
    this.catalogCache.clear();
    console.log('🗑️ Discovery cache cleared');
  }
  
  /**
   * Get cache statistics
   */
  getCacheStats(): { entries: number; size: number } {
    return {
      entries: this.catalogCache.size,
      size: JSON.stringify(Array.from(this.catalogCache.values())).length
    };
  }
}

/**
 * Factory function to create discovery service
 */
export function createResourceDiscoveryService(
  server = 'https://git.door43.org',
  cacheExpiryMs?: number
): IResourceDiscoveryService {
  return new Door43ResourceDiscoveryService(server, cacheExpiryMs);
}



