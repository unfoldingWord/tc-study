/**
 * Server Configuration Types
 * 
 * Defines configuration schemas for different server types
 */

export interface ServerConfigSchema {
  serverId: string;
  serverName: string;
  requiredFields: string[];
  optionalFields: string[];
  fieldTypes: Record<string, 'string' | 'number' | 'boolean' | 'object' | 'array'>;
  fieldDescriptions: Record<string, string>;
  examples: Record<string, any>;
}

export interface ServerConfigValidation {
  valid: boolean;
  errors: string[];
  warnings: string[];
  normalizedConfig: Record<string, any>;
}

export class ServerConfigValidator {
  private schemas = new Map<string, ServerConfigSchema>();

  constructor() {
    this.registerDefaultSchemas();
  }

  /**
   * Register a server configuration schema
   */
  registerSchema(schema: ServerConfigSchema): void {
    this.schemas.set(schema.serverId, schema);
  }

  /**
   * Validate server configuration
   */
  validateConfig(serverId: string, config: Record<string, any>): ServerConfigValidation {
    const schema = this.schemas.get(serverId);
    if (!schema) {
      return {
        valid: false,
        errors: [`Unknown server type: ${serverId}`],
        warnings: [],
        normalizedConfig: config
      };
    }

    const errors: string[] = [];
    const warnings: string[] = [];
    const normalizedConfig: Record<string, any> = { ...config };

    // Check required fields
    for (const field of schema.requiredFields) {
      if (!(field in config) || config[field] === undefined || config[field] === null) {
        errors.push(`Required field '${field}' is missing for server '${serverId}'`);
      }
    }

    // Validate field types
    for (const [field, value] of Object.entries(config)) {
      if (value === undefined || value === null) continue;

      const expectedType = schema.fieldTypes[field];
      if (expectedType) {
        const actualType = this.getType(value);
        if (actualType !== expectedType) {
          errors.push(`Field '${field}' should be ${expectedType}, got ${actualType}`);
        }
      } else {
        warnings.push(`Unknown field '${field}' for server '${serverId}'`);
      }
    }

    // Apply server-specific normalization
    normalizedConfig.version = this.normalizeVersion(normalizedConfig.version);

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      normalizedConfig
    };
  }

  /**
   * Get server configuration schema
   */
  getSchema(serverId: string): ServerConfigSchema | undefined {
    return this.schemas.get(serverId);
  }

  /**
   * List all registered server schemas
   */
  listSchemas(): ServerConfigSchema[] {
    return Array.from(this.schemas.values());
  }

  /**
   * Get configuration example for a server
   */
  getConfigExample(serverId: string): Record<string, any> | null {
    const schema = this.schemas.get(serverId);
    return schema ? schema.examples : null;
  }

  private getType(value: any): string {
    if (value === null) return 'null';
    if (Array.isArray(value)) return 'array';
    return typeof value;
  }

  private normalizeVersion(version: any): string {
    if (version === undefined || version === null || version === 'master' || version === 'main') {
      return 'latest';
    }
    return String(version);
  }

  private registerDefaultSchemas(): void {
    // Door43 Server Schema
    this.registerSchema({
      serverId: 'door43',
      serverName: 'Door43 Content Server',
      requiredFields: ['owner', 'language'],
      optionalFields: ['version', 'stage', 'apiToken', 'baseUrl'],
      fieldTypes: {
        owner: 'string',
        language: 'string',
        version: 'string',
        stage: 'string',
        apiToken: 'string',
        baseUrl: 'string'
      },
      fieldDescriptions: {
        owner: 'Repository owner (e.g., "unfoldingWord")',
        language: 'Language code (e.g., "en", "es", "fr")',
        version: 'Resource version (e.g., "v86", "latest")',
        stage: 'Deployment stage (e.g., "prod", "preprod")',
        apiToken: 'API authentication token',
        baseUrl: 'Custom base URL for the server'
      },
      examples: {
        owner: 'unfoldingWord',
        language: 'en',
        version: 'v86',
        stage: 'prod'
      }
    });

    // GitHub Server Schema
    this.registerSchema({
      serverId: 'github',
      serverName: 'GitHub Repository Server',
      requiredFields: ['owner', 'repo'],
      optionalFields: ['branch', 'tag', 'token', 'baseUrl'],
      fieldTypes: {
        owner: 'string',
        repo: 'string',
        branch: 'string',
        tag: 'string',
        token: 'string',
        baseUrl: 'string'
      },
      fieldDescriptions: {
        owner: 'GitHub username or organization',
        repo: 'Repository name',
        branch: 'Branch name (e.g., "main", "master")',
        tag: 'Release tag (e.g., "v1.0.0")',
        token: 'GitHub personal access token',
        baseUrl: 'Custom GitHub API base URL'
      },
      examples: {
        owner: 'myorg',
        repo: 'my-resource',
        branch: 'main',
        tag: 'v1.0.0'
      }
    });

    // Custom API Server Schema
    this.registerSchema({
      serverId: 'custom_api',
      serverName: 'Custom API Server',
      requiredFields: ['baseUrl', 'endpoint'],
      optionalFields: ['apiKey', 'headers', 'timeout', 'retries'],
      fieldTypes: {
        baseUrl: 'string',
        endpoint: 'string',
        apiKey: 'string',
        headers: 'object',
        timeout: 'number',
        retries: 'number'
      },
      fieldDescriptions: {
        baseUrl: 'Base URL of the API server',
        endpoint: 'API endpoint path',
        apiKey: 'API authentication key',
        headers: 'Additional HTTP headers',
        timeout: 'Request timeout in milliseconds',
        retries: 'Number of retry attempts'
      },
      examples: {
        baseUrl: 'https://api.example.com',
        endpoint: '/resources',
        apiKey: 'your-api-key',
        timeout: 30000,
        retries: 3
      }
    });
  }
}
