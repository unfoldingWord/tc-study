/**
 * UnfoldingWord Literal Text (uw_ult) Resource
 * 
 * Resource definition and configuration for ULT scripture
 */

import { Door43Server } from '../../servers/door43';

export interface UW_ULT_Config {
  owner: string;
  language: string;
  version?: string;
  stage?: string;
  maxBooks?: number;
}

export interface UW_ULT_Dependencies {
  // ULT doesn't typically depend on other resources
  // but could be used as a dependency for other resources
}

export class UW_ULT_Resource {
  public readonly id = 'uw_ult';
  public readonly name = 'UnfoldingWord Literal Text';
  public readonly description = 'Unlocked Literal Translation - word-for-word translation';
  public readonly type = 'scripture';
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
      fileExtensions: ['.usfm'],
      supportedLanguages: ['en', 'es', 'fr', 'de', 'pt', 'ru', 'ar', 'hi', 'zh', 'ja', 'ko'],
      organization: 'book' // Book-organized resource
    };
  }

  /**
   * Get dependency requirements
   */
  getDependencyRequirements(): UW_ULT_Dependencies {
    return {};
  }

  /**
   * Validate configuration
   */
  validateConfig(config: UW_ULT_Config): { valid: boolean; errors: string[] } {
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
      resourceId: 'ult',
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
