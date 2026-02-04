/**
 * Resource Package Builder
 * 
 * Main orchestrator for building resource packages with localized resources
 */

import * as fs from 'fs/promises';
import * as path from 'path';
import { ServerConfigValidation, ServerConfigValidator } from './types/ServerConfig';

export interface PackageConfig {
  name: string;
  version: string;
  description: string;
  outputDir: string;
  // Package-level server configuration (inherited by all resources)
  server?: string;
  config?: Record<string, any>; // Server-specific configuration
  resources: ResourceConfig[];
  metadata?: {
    author?: string;
    license?: string;
    homepage?: string;
    description?: string;
  };
}

export interface ResourceConfig {
  id: string;
  server?: string; // Optional - inherits from package if not specified
  config?: Record<string, any>; // Optional - inherits from package if not specified
  dependencies?: DependencyConfig[];
}

export interface DependencyConfig {
  resourceId: string;
  purpose: string;
  required?: boolean;
}

export interface BuildOptions {
  skipExisting?: boolean;
  forceUpdate?: boolean;
  verbose?: boolean;
}

export interface BuildResult {
  success: boolean;
  outputDir: string;
  resources: ResourceResult[];
  statistics: {
    totalResources: number;
    totalFiles: number;
    totalSize: number;
    buildTime: number;
  };
  errors: string[];
}

export interface ResourceResult {
  id: string;
  success: boolean;
  files: number;
  size: number;
  processingTime: number;
  errors: string[];
}

export class PackageBuilder {
  private resourcesDir: string;
  private serversDir: string;
  private packagesDir: string;
  private configValidator: ServerConfigValidator;
  
  // Memoization caches
  private serverCache = new Map<string, any>();
  private resourceCache = new Map<string, any>();
  private configCache = new Map<string, any>();

  constructor(
    resourcesDir = './resources',
    serversDir = './servers', 
    packagesDir = './packages'
  ) {
    this.resourcesDir = resourcesDir;
    this.serversDir = serversDir;
    this.packagesDir = packagesDir;
    this.configValidator = new ServerConfigValidator();
  }

  /**
   * Build a resource package
   */
  async buildPackage(
    packageName: string,
    options: BuildOptions = {}
  ): Promise<BuildResult> {
    const startTime = Date.now();
    const errors: string[] = [];
    const resourceResults: ResourceResult[] = [];

    try {
      // Load package configuration
      const packageConfig = await this.loadPackageConfig(packageName);
      
      // Ensure output directory exists
      await fs.mkdir(packageConfig.outputDir, { recursive: true });

      // Process each resource
      for (const resourceConfig of packageConfig.resources) {
        try {
          const result = await this.processResource(resourceConfig, packageConfig, options);
          resourceResults.push(result);
        } catch (error: any) {
          errors.push(`Failed to process resource ${resourceConfig.id}: ${error.message}`);
          resourceResults.push({
            id: resourceConfig.id,
            success: false,
            files: 0,
            size: 0,
            processingTime: 0,
            errors: [error.message]
          });
        }
      }

      // Calculate statistics
      const statistics = this.calculateStatistics(resourceResults, Date.now() - startTime);

      return {
        success: errors.length === 0,
        outputDir: packageConfig.outputDir,
        resources: resourceResults,
        statistics,
        errors
      };

    } catch (error: any) {
      return {
        success: false,
        outputDir: '',
        resources: resourceResults,
        statistics: {
          totalResources: 0,
          totalFiles: 0,
          totalSize: 0,
          buildTime: Date.now() - startTime
        },
        errors: [error.message]
      };
    }
  }

  /**
   * Load package configuration
   */
  private async loadPackageConfig(packageName: string): Promise<PackageConfig> {
    const configPath = path.join(this.packagesDir, `${packageName}.json`);
    
    try {
      const content = await fs.readFile(configPath, 'utf-8');
      return JSON.parse(content);
    } catch (error: any) {
      throw new Error(`Failed to load package config: ${error.message}`);
    }
  }

  /**
   * Resolve resource configuration with inheritance
   */
  private resolveResourceConfig(resourceConfig: ResourceConfig, packageConfig: PackageConfig): {
    id: string;
    server: string;
    config: Record<string, any>;
    dependencies?: DependencyConfig[];
  } {
    // Inherit server from package if not specified
    const server = resourceConfig.server || packageConfig.server;
    if (!server) {
      throw new Error(`No server specified for resource ${resourceConfig.id} and no package-level server configured`);
    }

    // Merge configs: package config as base, resource config overrides
    const config = {
      ...(packageConfig.config || {}),
      ...(resourceConfig.config || {})
    };

    // Validate server configuration
    const validation = this.configValidator.validateConfig(server, config);
    if (!validation.valid) {
      throw new Error(`Invalid configuration for server '${server}': ${validation.errors.join(', ')}`);
    }

    // Log warnings if any
    if (validation.warnings.length > 0) {
      console.warn(`Configuration warnings for server '${server}': ${validation.warnings.join(', ')}`);
    }

    return {
      id: resourceConfig.id,
      server,
      config: validation.normalizedConfig,
      dependencies: resourceConfig.dependencies
    };
  }

  /**
   * Process individual resource
   */
  private async processResource(
    resourceConfig: ResourceConfig,
    packageConfig: PackageConfig,
    options: BuildOptions
  ): Promise<ResourceResult> {
    const startTime = Date.now();

    try {
      // Resolve resource configuration with inheritance
      const resolvedConfig = this.resolveResourceConfig(resourceConfig, packageConfig);
      
      // Load resource implementation
      const resource = await this.loadResource(resolvedConfig.id);
      
      // Validate configuration
      const validation = resource.validateConfig(resolvedConfig.config);
      if (!validation.valid) {
        throw new Error(`Invalid configuration: ${validation.errors.join(', ')}`);
      }

      // Get server (with memoization)
      const server = await this.getServer(resolvedConfig.server, resolvedConfig.config);
      
      // Create fetcher
      const fetcher = new (await this.loadResourceFetcher(resolvedConfig.id))(server);
      
      // Fetch resource
      const fetchedResource = await fetcher.fetchResource(resolvedConfig.config);
      
      // Process raw content
      const rawProcessor = new (await this.loadRawProcessor(resolvedConfig.id))();
      const rawResult = await rawProcessor.processRawContent(
        'dummy content', // Would be actual content from archive
        {
          resourceId: resolvedConfig.id,
          bookCode: 'gen',
          language: resolvedConfig.config.language,
          version: resolvedConfig.config.version || 'latest'
        }
      );

      // Save processed resource
      const outputPath = path.join(packageConfig.outputDir, resolvedConfig.id);
      await fs.mkdir(outputPath, { recursive: true });
      
      await fs.writeFile(
        path.join(outputPath, 'metadata.json'),
        JSON.stringify(fetchedResource.metadata, null, 2)
      );
      
      await fs.writeFile(
        path.join(outputPath, 'processed.json'),
        JSON.stringify(rawResult, null, 2)
      );

      return {
        id: resolvedConfig.id,
        success: true,
        files: rawResult.statistics.totalNotes,
        size: JSON.stringify(rawResult).length,
        processingTime: Date.now() - startTime,
        errors: []
      };

    } catch (error: any) {
      return {
        id: resourceConfig.id,
        success: false,
        files: 0,
        size: 0,
        processingTime: Date.now() - startTime,
        errors: [error.message]
      };
    }
  }

  /**
   * Get server instance with memoization
   */
  private async getServer(serverId: string, config: Record<string, any>): Promise<any> {
    const cacheKey = `${serverId}:${JSON.stringify(config)}`;
    
    if (this.serverCache.has(cacheKey)) {
      return this.serverCache.get(cacheKey);
    }

    const server = await this.loadServer(serverId, config);
    this.serverCache.set(cacheKey, server);
    return server;
  }

  /**
   * Load server implementation
   */
  private async loadServer(serverId: string, config: Record<string, any>): Promise<any> {
    const serverPath = path.join(this.serversDir, serverId, 'index.ts');
    
    try {
      const module = await import(serverPath);
      return new module.default(config);
    } catch (error: any) {
      throw new Error(`Failed to load server ${serverId}: ${error.message}`);
    }
  }

  /**
   * Load resource implementation with memoization
   */
  private async loadResource(resourceId: string): Promise<any> {
    if (this.resourceCache.has(resourceId)) {
      return this.resourceCache.get(resourceId);
    }

    const resource = await this.loadResourceImplementation(resourceId);
    this.resourceCache.set(resourceId, resource);
    return resource;
  }

  /**
   * Load resource implementation
   */
  private async loadResourceImplementation(resourceId: string): Promise<any> {
    const resourcePath = path.join(this.resourcesDir, resourceId, 'index.ts');
    
    try {
      const module = await import(resourcePath);
      return new module.default();
    } catch (error: any) {
      throw new Error(`Failed to load resource ${resourceId}: ${error.message}`);
    }
  }

  /**
   * Load resource fetcher
   */
  private async loadResourceFetcher(resourceId: string): Promise<any> {
    const fetcherPath = path.join(this.resourcesDir, resourceId, 'fetcher.ts');
    
    try {
      const module = await import(fetcherPath);
      return module.default;
    } catch (error: any) {
      throw new Error(`Failed to load fetcher for ${resourceId}: ${error.message}`);
    }
  }

  /**
   * Load raw processor
   */
  private async loadRawProcessor(resourceId: string): Promise<any> {
    const processorPath = path.join(this.resourcesDir, resourceId, 'raw-processor.ts');
    
    try {
      const module = await import(processorPath);
      return module.default;
    } catch (error: any) {
      throw new Error(`Failed to load raw processor for ${resourceId}: ${error.message}`);
    }
  }

  /**
   * Calculate build statistics
   */
  private calculateStatistics(results: ResourceResult[], buildTime: number) {
    return {
      totalResources: results.length,
      totalFiles: results.reduce((sum, r) => sum + r.files, 0),
      totalSize: results.reduce((sum, r) => sum + r.size, 0),
      buildTime
    };
  }

  /**
   * Clear all caches
   */
  clearCache(): void {
    this.serverCache.clear();
    this.resourceCache.clear();
    this.configCache.clear();
  }

  /**
   * Get cache statistics
   */
  getCacheStats(): {
    servers: number;
    resources: number;
    configs: number;
    total: number;
  } {
    return {
      servers: this.serverCache.size,
      resources: this.resourceCache.size,
      configs: this.configCache.size,
      total: this.serverCache.size + this.resourceCache.size + this.configCache.size
    };
  }

  /**
   * Get server configuration schema
   */
  getServerSchema(serverId: string) {
    return this.configValidator.getSchema(serverId);
  }

  /**
   * List all supported server types
   */
  listSupportedServers(): {
    id: string;
    name: string;
    requiredFields: string[];
    optionalFields: string[];
  }[] {
    return this.configValidator.listSchemas().map(schema => ({
      id: schema.serverId,
      name: schema.serverName,
      requiredFields: schema.requiredFields,
      optionalFields: schema.optionalFields
    }));
  }

  /**
   * Get configuration example for a server
   */
  getServerConfigExample(serverId: string): Record<string, any> | null {
    return this.configValidator.getConfigExample(serverId);
  }

  /**
   * Validate server configuration
   */
  validateServerConfig(serverId: string, config: Record<string, any>): ServerConfigValidation {
    return this.configValidator.validateConfig(serverId, config);
  }

  /**
   * List available packages
   */
  async listPackages(): Promise<string[]> {
    try {
      const files = await fs.readdir(this.packagesDir);
      return files
        .filter(file => file.endsWith('.json'))
        .map(file => file.replace('.json', ''));
    } catch {
      return [];
    }
  }

  /**
   * List available resources
   */
  async listResources(): Promise<string[]> {
    try {
      const dirs = await fs.readdir(this.resourcesDir);
      return dirs.filter(async (dir) => {
        const stat = await fs.stat(path.join(this.resourcesDir, dir));
        return stat.isDirectory();
      });
    } catch {
      return [];
    }
  }
}
