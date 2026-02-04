/**
 * Door43 API Client
 * 
 * Reusable client for interacting with Door43 server
 */

import { DOOR43_CONSTANTS, Door43Endpoint, Door43ResourceType } from './constants';

export interface Door43SearchParams {
  owner: string;
  language: string;
  resourceId: string;
  stage?: string;
  version?: string;
}

export interface Door43ResourceMetadata {
  id: string;
  name: string;
  title: string;
  description: string;
  version: string;
  language: string;
  owner: string;
  stage: string;
  commitSha: string;
  tarballUrl: string;
  zipballUrl: string;
  releasedAt: string;
  pushedAt: string;
  ingredients: Array<{
    identifier: string;
    title: string;
    path: string;
    size: number;
  }>;
  subject: string;
  languageDirection?: 'ltr' | 'rtl';
  languageTitle?: string;
  languageIsGL?: boolean;
  catalogEntry?: {
    isAnchor: boolean;
  };
}

export class Door43Client {
  private baseUrl: string;
  private apiToken?: string;

  constructor(apiToken?: string) {
    this.baseUrl = DOOR43_CONSTANTS.BASE_URL;
    this.apiToken = apiToken;
  }

  /**
   * Search for resources on Door43
   */
  async searchResources(params: Door43SearchParams): Promise<Door43ResourceMetadata[]> {
    const url = this.buildUrl('CATALOG_SEARCH', {
      repo: `${params.language}_${params.resourceId}`,
      owner: params.owner,
      stage: params.stage || DOOR43_CONSTANTS.DEFAULTS.STAGE,
      version: params.version || DOOR43_CONSTANTS.DEFAULTS.VERSION
    });

    const response = await this.makeRequest(url);
    
    if (!response.ok || !response.data) {
      throw new Error(DOOR43_CONSTANTS.ERRORS.RESOURCE_NOT_FOUND);
    }

    return response.data.map(this.normalizeResourceMetadata);
  }

  /**
   * Get specific resource metadata
   */
  async getResourceMetadata(params: Door43SearchParams): Promise<Door43ResourceMetadata> {
    const resources = await this.searchResources(params);
    
    if (resources.length === 0) {
      throw new Error(DOOR43_CONSTANTS.ERRORS.RESOURCE_NOT_FOUND);
    }

    return resources[0];
  }

  /**
   * Download resource archive
   */
  async downloadArchive(archiveUrl: string): Promise<Buffer> {
    const response = await this.makeRequest(archiveUrl, { method: 'GET' });
    
    if (!response.ok) {
      throw new Error(DOOR43_CONSTANTS.ERRORS.DOWNLOAD_FAILED);
    }

    return Buffer.from(await response.arrayBuffer());
  }

  /**
   * Get tarball URL for resource
   */
  getTarballUrl(metadata: Door43ResourceMetadata): string {
    return metadata.tarballUrl || this.buildArchiveUrl(metadata, 'tarball');
  }

  /**
   * Get zipball URL for resource
   */
  getZipballUrl(metadata: Door43ResourceMetadata): string {
    return metadata.zipballUrl || this.buildArchiveUrl(metadata, 'zipball');
  }

  /**
   * Check if resource type is supported
   */
  isResourceTypeSupported(resourceId: string): resourceId is Door43ResourceType {
    return resourceId in DOOR43_CONSTANTS.RESOURCE_TYPES;
  }

  /**
   * Get resource type category
   */
  getResourceType(resourceId: string): string {
    return DOOR43_CONSTANTS.RESOURCE_TYPES[resourceId as Door43ResourceType] || 'unknown';
  }

  /**
   * Get file pattern for resource type
   */
  getFilePattern(resourceId: string): string {
    const resourceType = this.getResourceType(resourceId);
    return DOOR43_CONSTANTS.FILE_PATTERNS[resourceType as keyof typeof DOOR43_CONSTANTS.FILE_PATTERNS] || '*';
  }

  /**
   * Build API URL
   */
  private buildUrl(endpoint: Door43Endpoint, params: Record<string, any> = {}): string {
    let url = `${this.baseUrl}${DOOR43_CONSTANTS.ENDPOINTS[endpoint]}`;
    
    // Replace path parameters
    for (const [key, value] of Object.entries(params)) {
      url = url.replace(`{${key}}`, value);
    }

    // Add query parameters
    const queryParams = new URLSearchParams();
    for (const [key, value] of Object.entries(params)) {
      if (!url.includes(`{${key}}`)) {
        queryParams.append(key, value);
      }
    }

    if (queryParams.toString()) {
      url += `?${queryParams.toString()}`;
    }

    return url;
  }

  /**
   * Build archive URL
   */
  private buildArchiveUrl(metadata: Door43ResourceMetadata, format: 'tarball' | 'zipball'): string {
    const endpoint = format === 'tarball' ? 'TARBALL' : 'ZIPBALL';
    return this.buildUrl(endpoint, {
      owner: metadata.owner,
      repo: `${metadata.language}_${metadata.id}`,
      ref: metadata.commitSha
    });
  }

  /**
   * Make HTTP request
   */
  private async makeRequest(url: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'User-Agent': 'ResourcePackageBuilder/2.0.0',
      'Accept': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (this.apiToken) {
      headers[DOOR43_CONSTANTS.AUTH.HEADER] = `token ${this.apiToken}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`${DOOR43_CONSTANTS.ERRORS.API_ERROR}: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Normalize resource metadata from API response
   */
  private normalizeResourceMetadata(resource: any): Door43ResourceMetadata {
    // Normalize version - default to "latest" if not specified
    let version = resource.release?.tag_name || resource.version || 'master';
    if (version === 'master' || version === 'main' || !version) {
      version = 'latest';
    }

    return {
      id: resource.name?.replace(/^[^_]+_/, '') || resource.id,
      name: resource.name || `${resource.owner}_${resource.id}`,
      title: resource.title || resource.name || `${resource.id.toUpperCase()} Resource`,
      description: resource.description || `${resource.id.toUpperCase()} resource from Door43`,
      version,
      language: resource.language || 'en',
      owner: resource.owner || DOOR43_CONSTANTS.DEFAULTS.OWNER,
      stage: resource.stage || DOOR43_CONSTANTS.DEFAULTS.STAGE,
      commitSha: resource.commit_sha || resource.sha || '',
      tarballUrl: resource.tarball_url || resource.release?.tarball_url || '',
      zipballUrl: resource.zipball_url || resource.release?.zipball_url || '',
      releasedAt: resource.released_at || resource.created_at || new Date().toISOString(),
      pushedAt: resource.pushed_at || resource.updated_at || new Date().toISOString(),
      ingredients: resource.ingredients || [],
      subject: resource.subject || '',
      languageDirection: resource.language_direction,
      languageTitle: resource.language_title,
      languageIsGL: resource.language_is_gl,
      catalogEntry: resource.catalog_entry
    };
  }
}
