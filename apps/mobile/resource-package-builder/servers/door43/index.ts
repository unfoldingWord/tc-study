/**
 * Door43 Server Implementation
 * 
 * Main server interface for Door43 operations
 */

import { Door43Client, Door43ResourceMetadata, Door43SearchParams } from './Door43Client';
import { DOOR43_CONSTANTS } from './constants';

export interface ServerConfig {
  apiToken?: string;
  baseUrl?: string;
  rateLimit?: {
    requests: number;
    window: string;
  };
}

export interface ResourceConfig {
  owner: string;
  language: string;
  resourceId: string;
  version?: string;
  stage?: string;
}

export class Door43Server {
  private client: Door43Client;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = {
      baseUrl: DOOR43_CONSTANTS.BASE_URL,
      rateLimit: DOOR43_CONSTANTS.RATE_LIMIT,
      ...config
    };
    this.client = new Door43Client(config.apiToken);
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return {
      name: DOOR43_CONSTANTS.SERVER_NAME,
      baseUrl: this.config.baseUrl,
      apiVersion: DOOR43_CONSTANTS.API_VERSION,
      authRequired: DOOR43_CONSTANTS.AUTH.REQUIRED,
      rateLimit: this.config.rateLimit,
      supportedResourceTypes: Object.keys(DOOR43_CONSTANTS.RESOURCE_TYPES)
    };
  }

  /**
   * Search for resources
   */
  async searchResources(resourceConfig: ResourceConfig): Promise<Door43ResourceMetadata[]> {
    const searchParams: Door43SearchParams = {
      owner: resourceConfig.owner,
      language: resourceConfig.language,
      resourceId: resourceConfig.resourceId,
      stage: resourceConfig.stage || DOOR43_CONSTANTS.DEFAULTS.STAGE,
      version: resourceConfig.version || DOOR43_CONSTANTS.DEFAULTS.VERSION
    };

    return await this.client.searchResources(searchParams);
  }

  /**
   * Get specific resource metadata
   */
  async getResourceMetadata(resourceConfig: ResourceConfig): Promise<Door43ResourceMetadata> {
    const searchParams: Door43SearchParams = {
      owner: resourceConfig.owner,
      language: resourceConfig.language,
      resourceId: resourceConfig.resourceId,
      stage: resourceConfig.stage || DOOR43_CONSTANTS.DEFAULTS.STAGE,
      version: resourceConfig.version || DOOR43_CONSTANTS.DEFAULTS.VERSION
    };

    return await this.client.getResourceMetadata(searchParams);
  }

  /**
   * Download resource archive
   */
  async downloadResourceArchive(metadata: Door43ResourceMetadata, format: 'tarball' | 'zipball' = 'tarball'): Promise<Buffer> {
    const archiveUrl = format === 'tarball' 
      ? this.client.getTarballUrl(metadata)
      : this.client.getZipballUrl(metadata);

    return await this.client.downloadArchive(archiveUrl);
  }

  /**
   * Check if resource type is supported
   */
  isResourceTypeSupported(resourceId: string): boolean {
    return this.client.isResourceTypeSupported(resourceId);
  }

  /**
   * Get resource type category
   */
  getResourceType(resourceId: string): string {
    return this.client.getResourceType(resourceId);
  }

  /**
   * Get file pattern for resource type
   */
  getFilePattern(resourceId: string): string {
    return this.client.getFilePattern(resourceId);
  }

  /**
   * Get supported file extensions for resource type
   */
  getFileExtensions(resourceId: string): string[] {
    const pattern = this.getFilePattern(resourceId);
    return pattern.replace('*', '').split('|').filter(ext => ext);
  }

  /**
   * Validate resource configuration
   */
  validateResourceConfig(resourceConfig: ResourceConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!resourceConfig.owner) {
      errors.push('Owner is required');
    }

    if (!resourceConfig.language) {
      errors.push('Language is required');
    }

    if (!resourceConfig.resourceId) {
      errors.push('Resource ID is required');
    }

    if (resourceConfig.resourceId && !this.isResourceTypeSupported(resourceConfig.resourceId)) {
      errors.push(`Unsupported resource type: ${resourceConfig.resourceId}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export the client for direct use if needed
export { Door43Client } from './Door43Client';
export { DOOR43_CONSTANTS } from './constants';













