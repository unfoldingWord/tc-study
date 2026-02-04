# Developer Guide: Adding New Servers and Resources

This guide explains how to add new server types and resource types to the Resource Package Builder.

## 📋 Table of Contents

- [Adding New Servers](#adding-new-servers)
- [Adding New Resources](#adding-new-resources)
- [Server Configuration Schemas](#server-configuration-schemas)
- [Resource Dependencies](#resource-dependencies)
- [Testing Your Implementation](#testing-your-implementation)
- [Best Practices](#best-practices)

## 🖥️ Adding New Servers

### Step 1: Create Server Directory

```bash
mkdir servers/your_server_name
```

### Step 2: Define Server Constants

Create `servers/your_server_name/constants.ts`:

```typescript
/**
 * Your Server Constants
 * 
 * Reusable constants and configuration for your server
 */

export const YOUR_SERVER_CONSTANTS = {
  // Server Information
  SERVER_NAME: 'Your Server Name',
  BASE_URL: 'https://api.yourserver.com',
  API_VERSION: 'v1',
  
  // API Endpoints
  ENDPOINTS: {
    SEARCH: '/api/v1/search',
    RESOURCE_INFO: '/api/v1/resources/{id}',
    DOWNLOAD: '/api/v1/resources/{id}/download'
  },
  
  // Rate Limiting
  RATE_LIMIT: {
    REQUESTS: 1000,
    WINDOW: 'hour'
  },
  
  // Authentication
  AUTH: {
    REQUIRED: true,
    TYPE: 'bearer', // 'token', 'basic', 'bearer'
    HEADER: 'Authorization'
  },
  
  // Resource Types Mapping
  RESOURCE_TYPES: {
    'scripture': 'scripture',
    'notes': 'notes',
    'words': 'words'
  },
  
  // File Patterns
  FILE_PATTERNS: {
    SCRIPTURE: '*.usfm',
    NOTES: '*.tsv',
    WORDS: '*.md'
  },
  
  // Default Parameters
  DEFAULTS: {
    VERSION: 'latest',
    FORMAT: 'json'
  },
  
  // Error Messages
  ERRORS: {
    RESOURCE_NOT_FOUND: 'Resource not found on your server',
    INVALID_CREDENTIALS: 'Invalid authentication credentials',
    DOWNLOAD_FAILED: 'Failed to download resource',
    API_ERROR: 'Your server API error'
  }
} as const;

export type YourServerResourceType = keyof typeof YOUR_SERVER_CONSTANTS.RESOURCE_TYPES;
export type YourServerEndpoint = keyof typeof YOUR_SERVER_CONSTANTS.ENDPOINTS;
```

### Step 3: Create Server Client

Create `servers/your_server_name/YourServerClient.ts`:

```typescript
/**
 * Your Server API Client
 * 
 * Reusable client for interacting with your server
 */

import { YOUR_SERVER_CONSTANTS, YourServerResourceType, YourServerEndpoint } from './constants';

export interface YourServerSearchParams {
  query: string;
  type?: string;
  version?: string;
  limit?: number;
}

export interface YourServerResourceMetadata {
  id: string;
  name: string;
  title: string;
  description: string;
  version: string;
  type: string;
  downloadUrl: string;
  size: number;
  lastModified: string;
  checksum: string;
}

export class YourServerClient {
  private baseUrl: string;
  private apiKey?: string;

  constructor(apiKey?: string) {
    this.baseUrl = YOUR_SERVER_CONSTANTS.BASE_URL;
    this.apiKey = apiKey;
  }

  /**
   * Search for resources
   */
  async searchResources(params: YourServerSearchParams): Promise<YourServerResourceMetadata[]> {
    const url = this.buildUrl('SEARCH', params);
    const response = await this.makeRequest(url);
    
    if (!response.success || !response.data) {
      throw new Error(YOUR_SERVER_CONSTANTS.ERRORS.RESOURCE_NOT_FOUND);
    }

    return response.data.map(this.normalizeResourceMetadata);
  }

  /**
   * Get specific resource metadata
   */
  async getResourceMetadata(resourceId: string): Promise<YourServerResourceMetadata> {
    const url = this.buildUrl('RESOURCE_INFO', { id: resourceId });
    const response = await this.makeRequest(url);
    
    if (!response.success) {
      throw new Error(YOUR_SERVER_CONSTANTS.ERRORS.RESOURCE_NOT_FOUND);
    }

    return this.normalizeResourceMetadata(response.data);
  }

  /**
   * Download resource
   */
  async downloadResource(resourceId: string): Promise<Buffer> {
    const url = this.buildUrl('DOWNLOAD', { id: resourceId });
    const response = await this.makeRequest(url, { method: 'GET' });
    
    if (!response.success) {
      throw new Error(YOUR_SERVER_CONSTANTS.ERRORS.DOWNLOAD_FAILED);
    }

    return Buffer.from(response.data);
  }

  /**
   * Check if resource type is supported
   */
  isResourceTypeSupported(resourceId: string): resourceId is YourServerResourceType {
    return resourceId in YOUR_SERVER_CONSTANTS.RESOURCE_TYPES;
  }

  /**
   * Get resource type category
   */
  getResourceType(resourceId: string): string {
    return YOUR_SERVER_CONSTANTS.RESOURCE_TYPES[resourceId as YourServerResourceType] || 'unknown';
  }

  /**
   * Get file pattern for resource type
   */
  getFilePattern(resourceId: string): string {
    const resourceType = this.getResourceType(resourceId);
    return YOUR_SERVER_CONSTANTS.FILE_PATTERNS[resourceType as keyof typeof YOUR_SERVER_CONSTANTS.FILE_PATTERNS] || '*';
  }

  /**
   * Build API URL
   */
  private buildUrl(endpoint: YourServerEndpoint, params: Record<string, any> = {}): string {
    let url = `${this.baseUrl}${YOUR_SERVER_CONSTANTS.ENDPOINTS[endpoint]}`;
    
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
   * Make HTTP request
   */
  private async makeRequest(url: string, options: RequestInit = {}): Promise<any> {
    const headers: Record<string, string> = {
      'User-Agent': 'ResourcePackageBuilder/2.0.0',
      'Accept': 'application/json',
      ...((options.headers as Record<string, string>) || {})
    };

    if (this.apiKey) {
      headers[YOUR_SERVER_CONSTANTS.AUTH.HEADER] = `Bearer ${this.apiKey}`;
    }

    const response = await fetch(url, {
      ...options,
      headers
    });

    if (!response.ok) {
      throw new Error(`${YOUR_SERVER_CONSTANTS.ERRORS.API_ERROR}: ${response.status} ${response.statusText}`);
    }

    return await response.json();
  }

  /**
   * Normalize resource metadata from API response
   */
  private normalizeResourceMetadata(resource: any): YourServerResourceMetadata {
    return {
      id: resource.id || resource.resource_id,
      name: resource.name || resource.title,
      title: resource.title || resource.name || `${resource.id} Resource`,
      description: resource.description || `${resource.id} resource from Your Server`,
      version: resource.version || 'latest',
      type: resource.type || 'unknown',
      downloadUrl: resource.download_url || resource.url,
      size: resource.size || 0,
      lastModified: resource.last_modified || resource.updated_at || new Date().toISOString(),
      checksum: resource.checksum || resource.sha256 || ''
    };
  }
}
```

### Step 4: Create Server Interface

Create `servers/your_server_name/index.ts`:

```typescript
/**
 * Your Server Implementation
 * 
 * Main server interface for your server operations
 */

import { YourServerClient, YourServerResourceMetadata, YourServerSearchParams } from './YourServerClient';
import { YOUR_SERVER_CONSTANTS } from './constants';

export interface ServerConfig {
  apiKey?: string;
  baseUrl?: string;
  timeout?: number;
  retries?: number;
}

export interface ResourceConfig {
  query: string;
  type?: string;
  version?: string;
  limit?: number;
}

export class YourServer {
  private client: YourServerClient;
  private config: ServerConfig;

  constructor(config: ServerConfig = {}) {
    this.config = {
      baseUrl: YOUR_SERVER_CONSTANTS.BASE_URL,
      timeout: 30000,
      retries: 3,
      ...config
    };
    this.client = new YourServerClient(config.apiKey);
  }

  /**
   * Get server information
   */
  getServerInfo() {
    return {
      name: YOUR_SERVER_CONSTANTS.SERVER_NAME,
      baseUrl: this.config.baseUrl,
      apiVersion: YOUR_SERVER_CONSTANTS.API_VERSION,
      authRequired: YOUR_SERVER_CONSTANTS.AUTH.REQUIRED,
      rateLimit: YOUR_SERVER_CONSTANTS.RATE_LIMIT,
      supportedResourceTypes: Object.keys(YOUR_SERVER_CONSTANTS.RESOURCE_TYPES)
    };
  }

  /**
   * Search for resources
   */
  async searchResources(resourceConfig: ResourceConfig): Promise<YourServerResourceMetadata[]> {
    const searchParams: YourServerSearchParams = {
      query: resourceConfig.query,
      type: resourceConfig.type,
      version: resourceConfig.version || YOUR_SERVER_CONSTANTS.DEFAULTS.VERSION,
      limit: resourceConfig.limit || 100
    };

    return await this.client.searchResources(searchParams);
  }

  /**
   * Get specific resource metadata
   */
  async getResourceMetadata(resourceId: string): Promise<YourServerResourceMetadata> {
    return await this.client.getResourceMetadata(resourceId);
  }

  /**
   * Download resource
   */
  async downloadResource(resourceId: string): Promise<Buffer> {
    return await this.client.downloadResource(resourceId);
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
   * Validate resource configuration
   */
  validateResourceConfig(resourceConfig: ResourceConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!resourceConfig.query) {
      errors.push('Query is required');
    }

    if (resourceConfig.type && !this.isResourceTypeSupported(resourceConfig.type)) {
      errors.push(`Unsupported resource type: ${resourceConfig.type}`);
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }
}

// Export the client for direct use if needed
export { YourServerClient } from './YourServerClient';
export { YOUR_SERVER_CONSTANTS } from './constants';
```

### Step 5: Register Server Schema

Update `core/types/ServerConfig.ts` to add your server schema:

```typescript
// Add this to the registerDefaultSchemas() method
this.registerSchema({
  serverId: 'your_server_name',
  serverName: 'Your Server Name',
  requiredFields: ['query'],
  optionalFields: ['type', 'version', 'limit', 'apiKey', 'timeout', 'retries'],
  fieldTypes: {
    query: 'string',
    type: 'string',
    version: 'string',
    limit: 'number',
    apiKey: 'string',
    timeout: 'number',
    retries: 'number'
  },
  fieldDescriptions: {
    query: 'Search query for resources',
    type: 'Resource type filter',
    version: 'Resource version (e.g., "v1.0", "latest")',
    limit: 'Maximum number of results',
    apiKey: 'API authentication key',
    timeout: 'Request timeout in milliseconds',
    retries: 'Number of retry attempts'
  },
  examples: {
    query: 'bible',
    type: 'scripture',
    version: 'latest',
    limit: 100
  }
});
```

## 📚 Adding New Resources

### Step 1: Create Resource Directory

```bash
mkdir resources/your_resource_id
```

### Step 2: Define Resource Interface

Create `resources/your_resource_id/index.ts`:

```typescript
/**
 * Your Resource Implementation
 * 
 * Resource definition and configuration
 */

import { YourServer } from '../../servers/your_server_name';

export interface YourResourceConfig {
  query: string;
  type?: string;
  version?: string;
  limit?: number;
}

export interface YourResourceDependencies {
  originalScripture?: string[];
  linkTitles?: string[];
  crossReferences?: string[];
}

export class YourResource {
  public readonly id = 'your_resource_id';
  public readonly name = 'Your Resource Name';
  public readonly description = 'Description of your resource';
  public readonly type = 'your_type';
  public readonly version = '2.0.0';

  private server: YourServer;

  constructor(serverConfig?: any) {
    this.server = new YourServer(serverConfig);
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
      supportedServers: ['your_server_name'],
      dependencies: this.getDependencyRequirements(),
      fileExtensions: ['.json', '.xml'],
      supportedLanguages: ['en', 'es', 'fr']
    };
  }

  /**
   * Get dependency requirements
   */
  getDependencyRequirements(): YourResourceDependencies {
    return {
      originalScripture: ['uw_lt', 'uw_st'],
      linkTitles: ['uw_tw', 'uw_ta'],
      crossReferences: ['uw_tw', 'uw_ta']
    };
  }

  /**
   * Validate configuration
   */
  validateConfig(config: YourResourceConfig): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    if (!config.query) {
      errors.push('Query is required');
    }

    // Validate with server
    const serverValidation = this.server.validateResourceConfig(config);
    errors.push(...serverValidation.errors);

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Get server instance
   */
  getServer(): YourServer {
    return this.server;
  }

  /**
   * Get supported servers
   */
  getSupportedServers(): string[] {
    return ['your_server_name'];
  }

  /**
   * Check if server is supported
   */
  isServerSupported(serverId: string): boolean {
    return this.getSupportedServers().includes(serverId);
  }
}
```

### Step 3: Create Resource Fetcher

Create `resources/your_resource_id/fetcher.ts`:

```typescript
/**
 * Your Resource Fetcher
 * 
 * Handles fetching resources from supported servers
 */

import { YourServerResourceMetadata, YourServer } from '../../servers/your_server_name';
import { YourResourceConfig } from './index';

export interface FetchedResource {
  metadata: YourServerResourceMetadata;
  downloadUrl: string;
  filePattern: string;
  serverInfo: any;
}

export class YourResourceFetcher {
  private server: YourServer;

  constructor(server: YourServer) {
    this.server = server;
  }

  /**
   * Fetch resource metadata from server
   */
  async fetchMetadata(config: YourResourceConfig): Promise<YourServerResourceMetadata> {
    const resourceConfig = {
      query: config.query,
      type: config.type,
      version: config.version,
      limit: config.limit
    };

    const resources = await this.server.searchResources(resourceConfig);
    
    if (resources.length === 0) {
      throw new Error('No resources found');
    }

    return resources[0];
  }

  /**
   * Fetch complete resource data
   */
  async fetchResource(config: YourResourceConfig): Promise<FetchedResource> {
    // Get metadata
    const metadata = await this.fetchMetadata(config);

    // Get download URL
    const downloadUrl = metadata.downloadUrl;

    // Get file pattern
    const filePattern = this.server.getFilePattern(metadata.type);

    // Get server info
    const serverInfo = this.server.getServerInfo();

    return {
      metadata,
      downloadUrl,
      filePattern,
      serverInfo
    };
  }

  /**
   * Download resource
   */
  async downloadResource(config: YourResourceConfig): Promise<Buffer> {
    const metadata = await this.fetchMetadata(config);
    return await this.server.downloadResource(metadata.id);
  }

  /**
   * Get resource statistics
   */
  async getResourceStats(config: YourResourceConfig): Promise<{
    totalResources: number;
    totalSize: number;
    lastUpdated: string;
  }> {
    const metadata = await this.fetchMetadata(config);
    
    return {
      totalResources: 1,
      totalSize: metadata.size,
      lastUpdated: metadata.lastModified
    };
  }

  /**
   * Check if resource is available
   */
  async isAvailable(config: YourResourceConfig): Promise<boolean> {
    try {
      await this.fetchMetadata(config);
      return true;
    } catch (error) {
      return false;
    }
  }
}
```

### Step 4: Create Raw Processor

Create `resources/your_resource_id/raw-processor.ts`:

```typescript
/**
 * Your Resource Raw Processor
 * 
 * Processes raw resource data without dependencies
 */

export interface RawProcessedData {
  type: string;
  format: string;
  version: string;
  data: any[];
  statistics: {
    totalItems: number;
    processingTime: number;
  };
  metadata: {
    resourceId: string;
    version: string;
    lastUpdated: string;
  };
}

export class YourResourceRawProcessor {
  private version = '2.0.0';

  /**
   * Process raw content
   */
  async processRawContent(
    content: string,
    metadata: {
      resourceId: string;
      version: string;
    }
  ): Promise<RawProcessedData> {
    const startTime = Date.now();
    
    // Parse content based on your resource format
    const data = this.parseContent(content);

    const processingTime = Date.now() - startTime;

    return {
      type: 'your_type',
      format: 'json',
      version: this.version,
      data,
      statistics: {
        totalItems: data.length,
        processingTime
      },
      metadata: {
        resourceId: metadata.resourceId,
        version: metadata.version,
        lastUpdated: new Date().toISOString()
      }
    };
  }

  /**
   * Parse content based on your format
   */
  private parseContent(content: string): any[] {
    try {
      // Example: Parse JSON content
      const parsed = JSON.parse(content);
      return Array.isArray(parsed) ? parsed : [parsed];
    } catch (error) {
      // Fallback: Parse as line-delimited JSON
      return content.split('\n')
        .filter(line => line.trim())
        .map(line => JSON.parse(line));
    }
  }

  /**
   * Get processor information
   */
  getProcessorInfo() {
    return {
      name: 'YourResourceRawProcessor',
      version: this.version,
      description: 'Processes raw resource data',
      supportedFormats: ['json', 'xml'],
      dependencies: []
    };
  }
}
```

### Step 5: Create Dependency Processor

Create `resources/your_resource_id/dependency-processor.ts`:

```typescript
/**
 * Your Resource Dependency Processor
 * 
 * Enhances resource data with dependency information
 */

import { RawProcessedData } from './raw-processor';

export interface DependencyData {
  originalScripture?: any;
  linkTitles?: any;
  crossReferences?: any;
}

export interface EnhancedData extends RawProcessedData {
  enhancements: {
    originalScriptureLinked: number;
    linkTitlesEnhanced: number;
    crossReferencesAdded: number;
  };
}

export class YourResourceDependencyProcessor {
  private version = '2.0.0';

  /**
   * Process resource with dependencies
   */
  async processWithDependencies(
    rawData: RawProcessedData,
    dependencyData: DependencyData
  ): Promise<EnhancedData> {
    const startTime = Date.now();
    
    // Enhance data with dependency information
    const enhancedData = this.enhanceData(rawData.data, dependencyData);

    // Calculate enhancement statistics
    const enhancements = this.calculateEnhancements(enhancedData, dependencyData);

    return {
      ...rawData,
      data: enhancedData,
      enhancements,
      statistics: {
        ...rawData.statistics,
        processingTime: Date.now() - startTime
      }
    };
  }

  /**
   * Enhance data with dependency information
   */
  private enhanceData(data: any[], dependencyData: DependencyData): any[] {
    return data.map(item => {
      const enhanced = { ...item };

      // Add original scripture links
      if (dependencyData.originalScripture) {
        enhanced.originalScriptureLinks = this.addOriginalScriptureLinks(item, dependencyData.originalScripture);
      }

      // Add link titles
      if (dependencyData.linkTitles) {
        enhanced.linkTitles = this.addLinkTitles(item, dependencyData.linkTitles);
      }

      // Add cross-references
      if (dependencyData.crossReferences) {
        enhanced.crossReferences = this.addCrossReferences(item, dependencyData.crossReferences);
      }

      return enhanced;
    });
  }

  /**
   * Add original scripture links
   */
  private addOriginalScriptureLinks(item: any, originalScripture: any): any[] {
    // Implementation depends on your resource structure
    return [];
  }

  /**
   * Add link titles
   */
  private addLinkTitles(item: any, linkTitles: any): any[] {
    // Implementation depends on your resource structure
    return [];
  }

  /**
   * Add cross-references
   */
  private addCrossReferences(item: any, crossReferences: any): any[] {
    // Implementation depends on your resource structure
    return [];
  }

  /**
   * Calculate enhancement statistics
   */
  private calculateEnhancements(data: any[], dependencyData: DependencyData): EnhancedData['enhancements'] {
    let originalScriptureLinked = 0;
    let linkTitlesEnhanced = 0;
    let crossReferencesAdded = 0;

    data.forEach(item => {
      if (item.originalScriptureLinks) {
        originalScriptureLinked += item.originalScriptureLinks.length;
      }
      if (item.linkTitles) {
        linkTitlesEnhanced += item.linkTitles.length;
      }
      if (item.crossReferences) {
        crossReferencesAdded += item.crossReferences.length;
      }
    });

    return {
      originalScriptureLinked,
      linkTitlesEnhanced,
      crossReferencesAdded
    };
  }

  /**
   * Get processor information
   */
  getProcessorInfo() {
    return {
      name: 'YourResourceDependencyProcessor',
      version: this.version,
      description: 'Enhances resource data with dependencies',
      dependencies: ['originalScripture', 'linkTitles', 'crossReferences'],
      supportedEnhancements: [
        'original_scripture_links',
        'link_titles',
        'cross_references'
      ]
    };
  }
}
```

### Step 6: Create Resource Documentation

Create `resources/your_resource_id/README.md`:

```markdown
# Your Resource Name (your_resource_id)

Description of your resource and its purpose.

## Resource Information

- **ID**: `your_resource_id`
- **Name**: Your Resource Name
- **Type**: Your Type
- **Format**: JSON/XML/etc.
- **Version**: 2.0.0

## Dependencies

### Required Dependencies
- **Original Scripture**: `uw_lt`, `uw_st`
  - **Purpose**: Link to original scripture references
  - **Usage**: Provides context for translations

### Optional Dependencies
- **Link Titles**: `uw_tw`, `uw_ta`
  - **Purpose**: Extract titles for references
  - **Usage**: Enhances user experience

## Supported Servers

- **Your Server**: Primary server for this resource
  - **Resource ID**: `your_type`
  - **File Pattern**: `*.json`
  - **Format**: JSON

## Configuration

```json
{
  "id": "your_resource_id",
  "server": "your_server_name",
  "config": {
    "query": "your search query",
    "type": "your_type",
    "version": "latest"
  },
  "dependencies": [
    {
      "resourceId": "uw_lt",
      "purpose": "original_scripture_links",
      "required": true
    }
  ]
}
```

## Usage Examples

### Basic Usage

```typescript
import { YourResource } from './resources/your_resource_id';

const resource = new YourResource();
const config = {
  query: 'your search query'
};

// Validate configuration
const validation = resource.validateConfig(config);
if (!validation.valid) {
  console.error('Invalid config:', validation.errors);
}

// Get resource info
const info = resource.getResourceInfo();
console.log('Resource info:', info);
```

## Processing Pipeline

### 1. Raw Processing

- Parse JSON/XML content
- Extract basic data
- Generate statistics

### 2. Dependency Processing

- Link to original scripture
- Add link titles
- Add cross-references
- Calculate enhancement statistics

## Output Format

### Raw Processing Output

```typescript
{
  type: 'your_type',
  format: 'json',
  data: [
    {
      id: 'item1',
      content: '...',
      metadata: { ... }
    }
  ],
  statistics: {
    totalItems: 100,
    processingTime: 150
  }
}
```

### Enhanced Processing Output

```typescript
{
  // ... raw processing output
  data: [
    {
      // ... raw item data
      originalScriptureLinks: [
        {
          reference: '1:1',
          link: '...',
          context: '...'
        }
      ],
      linkTitles: [
        {
          ref: 'kt/creation',
          title: 'Creation'
        }
      ]
    }
  ],
  enhancements: {
    originalScriptureLinked: 50,
    linkTitlesEnhanced: 25,
    crossReferencesAdded: 10
  }
}
```

```

## 🔧 Server Configuration Schemas

### Adding New Server Schema

To add a new server schema, update `core/types/ServerConfig.ts`:

```typescript
// In the registerDefaultSchemas() method
this.registerSchema({
  serverId: 'your_server',
  serverName: 'Your Server Name',
  requiredFields: ['field1', 'field2'],
  optionalFields: ['field3', 'field4'],
  fieldTypes: {
    field1: 'string',
    field2: 'string',
    field3: 'number',
    field4: 'boolean'
  },
  fieldDescriptions: {
    field1: 'Description of field1',
    field2: 'Description of field2',
    field3: 'Description of field3',
    field4: 'Description of field4'
  },
  examples: {
    field1: 'example_value1',
    field2: 'example_value2',
    field3: 100,
    field4: true
  }
});
```

## 🔗 Resource Dependencies

### Defining Dependencies

In your resource's `index.ts`:

```typescript
getDependencyRequirements(): YourResourceDependencies {
  return {
    originalScripture: ['uw_lt', 'uw_st'],
    linkTitles: ['uw_tw', 'uw_ta'],
    crossReferences: ['uw_tw', 'uw_ta']
  };
}
```

### Processing Dependencies

In your dependency processor:

```typescript
async processWithDependencies(
  rawData: RawProcessedData,
  dependencyData: DependencyData
): Promise<EnhancedData> {
  // Access dependency data
  const originalScripture = dependencyData.originalScripture;
  const linkTitles = dependencyData.linkTitles;
  const crossReferences = dependencyData.crossReferences;
  
  // Process with dependencies
  // ...
}
```

## 🧪 Testing Your Implementation

### 1. Test Server Configuration

```bash
# Test server schema
npm run server-config your_server_name

# Validate configuration
npm run build cache --stats
```

### 2. Test Resource Processing

```typescript
// Create test package
const testPackage = {
  name: 'test-package',
  version: '1.0.0',
  description: 'Test package',
  outputDir: 'outputs/test',
  server: 'your_server_name',
  config: {
    // Your server config
  },
  resources: [
    {
      id: 'your_resource_id'
    }
  ]
};

// Test build
const builder = new PackageBuilder();
const result = await builder.buildPackage('test-package');
console.log('Build result:', result);
```

### 3. Test CLI Commands

```bash
# List servers
npm run list-servers

# List resources
npm run list-resources

# Build test package
npm run build test-package --verbose
```

## 📋 Best Practices

### Server Development

1. **Consistent API**: Follow RESTful conventions
2. **Error Handling**: Provide clear error messages
3. **Rate Limiting**: Respect server rate limits
4. **Authentication**: Support multiple auth methods
5. **Caching**: Implement appropriate caching strategies

### Resource Development

1. **Modular Design**: Keep fetcher, processors separate
2. **Error Handling**: Graceful failure with helpful messages
3. **Validation**: Validate inputs and outputs
4. **Documentation**: Comprehensive README files
5. **Testing**: Include test cases and examples

### Configuration

1. **Schema Validation**: Always validate server configs
2. **Default Values**: Provide sensible defaults
3. **Type Safety**: Use TypeScript for type safety
4. **Documentation**: Document all configuration options
5. **Examples**: Provide working examples

### Dependencies

1. **Clear Purpose**: Define why each dependency is needed
2. **Optional Dependencies**: Mark non-critical dependencies
3. **Version Compatibility**: Specify version requirements
4. **Fallback Handling**: Handle missing dependencies gracefully
5. **Performance**: Consider dependency processing performance

## 🚀 Next Steps

1. **Implement Your Server**: Follow the server development guide
2. **Create Your Resource**: Follow the resource development guide
3. **Test Thoroughly**: Use the testing guidelines
4. **Document Everything**: Create comprehensive documentation
5. **Submit for Review**: Share your implementation for feedback

## 📞 Getting Help

- **Issues**: Create GitHub issues for bugs or questions
- **Discussions**: Use GitHub discussions for general questions
- **Documentation**: Check existing documentation first
- **Examples**: Look at existing servers and resources for patterns

Happy coding! 🎉
