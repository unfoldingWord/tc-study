/**
 * UnfoldingWord Translation Notes (uw_tn) Resource
 * 
 * Resource definition and configuration for TN
 */

import { Door43Server } from '../../servers/door43';

export interface UW_TN_Config {
  owner: string;
  language: string;
  version?: string;
  stage?: string;
  maxBooks?: number;
}

export interface UW_TN_Dependencies {
  originalScripture?: string[]; // ['uw_ult', 'uw_ust', 'uw_uhb', 'uw_ugnt']
  linkTitles?: string[];       // ['uw_tw', 'uw_ta']
  crossReferences?: string[];  // ['uw_tw', 'uw_ta']
}

export class UW_TN_Resource {
  public readonly id = 'uw_tn';
  public readonly name = 'UnfoldingWord Translation Notes';
  public readonly description = 'Translation Notes with support for original quotes and link titles';
  public readonly type = 'notes';
  public readonly version = '2.0.0';

  private server: Door43Server;

  constructor(serverConfig?: any) {
    this.server = new Door43Server(serverConfig);
  }

  /**
   * Get resource information
   */
  getResourceInfo() {
    return {
      id: this.id,
      name: this.name,
      description: this.description,
      type: this.type,
      version: this.version,
      supportedServers: ['door43'],
      dependencies: this.getDependencyRequirements(),
      fileExtensions: ['.tsv'],
      supportedLanguages: ['en', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko'],
      organization: 'book' // Book-organized resource
    };
  }

  /**
   * Get dependency requirements
   */
  getDependencyRequirements(): UW_TN_Dependencies {
    return {
      originalScripture: ['uw_ult', 'uw_ust', 'uw_uhb', 'uw_ugnt'],
      linkTitles: ['uw_tw', 'uw_ta'],
      crossReferences: ['uw_tw', 'uw_ta']
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: UW_TN_Config): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.owner) {
      errors.push('Owner is required');
    }

    if (!config.language) {
      errors.push('Language is required');
    }

    // Validate with server
    const serverValidation = this.server.validateResourceConfig({
      owner: config.owner,
      language: config.language,
      resourceId: 'tn',
      version: config.version,
      stage: config.stage
    });

    errors.push(...serverValidation.errors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get server instance
   */
  getServer(): Door43Server {
    return this.server;
  }

  /**
   * Get supported servers
   */
  getSupportedServers(): string[] {
    return ['door43'];
  }

  /**
   * Check if server is supported
   */
  isServerSupported(serverId: string): boolean {
    return this.getSupportedServers().includes(serverId);
  }
}