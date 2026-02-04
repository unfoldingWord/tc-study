/**
 * Door43 API Client
 * 
 * Centralized, testable API client for all Door43.org requests.
 * Ensures consistent error handling, typing, and request validation.
 * 
 * @see .cursorrules for Door43 API guidelines
 */

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Encode string to base64 (works in both Node.js and browser)
 */
function encodeBase64(str: string): string {
  if (typeof Buffer !== 'undefined') {
    // Node.js environment
    return Buffer.from(str, 'utf-8').toString('base64');
  } else {
    // Browser environment - use btoa with UTF-8 handling
    // Convert UTF-8 string to binary string
    const utf8Bytes = new TextEncoder().encode(str);
    let binary = '';
    for (let i = 0; i < utf8Bytes.length; i++) {
      binary += String.fromCharCode(utf8Bytes[i]);
    }
    return btoa(binary);
  }
}

// ============================================================================
// TYPES
// ============================================================================

export interface Door43ApiConfig {
  baseUrl?: string;
  timeout?: number;
  headers?: Record<string, string>;
  debug?: boolean;
  // Authentication for write operations
  username?: string;
  password?: string;
  token?: string; // Personal access token (preferred over username/password)
}

export interface Door43Language {
  code: string;
  name: string;
  direction: 'ltr' | 'rtl';
  anglicized_name?: string;
}

export interface Door43ResourceRelation {
  full_relation: string;
  lang: string;
  identifier: string;
  version: string;
}

export interface Door43Ingredient {
  identifier: string;
  title: string;
  categories?: string[];
  sort?: number;
  path?: string;
  size?: number;
  alignment_count?: number;
  versification?: string;
  exists?: boolean;
  is_dir?: boolean;
}

export interface Door43Resource {
  id: string;
  name: string;
  title?: string;
  owner: string;
  language: string;
  language_title?: string;
  language_direction?: 'ltr' | 'rtl';
  language_is_gl?: boolean; // Is gateway language
  subject: string;
  version: string;
  format?: string;
  content_format?: string; // File format (usfm, markdown, tsv)
  flavor_type?: string; // Resource flavor type (scripture, help, etc)
  flavor?: string; // Specific flavor (textTranslation, etc)
  checking_level?: string; // Quality checking level
  metadata_type?: string; // Metadata format type (rc, etc)
  metadata_version?: string; // Metadata format version
  
  // URLs from catalog (guaranteed)
  metadata_url?: string; // Direct URL to manifest.yaml
  metadata_json_url?: string; // API endpoint for metadata JSON
  metadata_api_contents_url?: string; // API endpoint for manifest.yaml
  contents_url?: string; // API to browse repo contents
  
  html_url?: string;
  commit_sha?: string;
  released?: string;
  description?: string; // Short description from repo
  license?: string; // License information
  repo_name?: string; // Repository name for URL construction
  relations?: Door43ResourceRelation[];
  books?: string[];
  ingredients?: Door43Ingredient[];
  release?: {
    tag_name: string;
    zipball_url: string;
    tarball_url: string;
    published_at: string;
    html_url?: string;
  };
  metadata?: Record<string, any>;
}

export interface Door43Catalog {
  languages: Door43Language[];
  resources: Door43Resource[];
}

export interface Door43ApiError {
  message: string;
  code: string;
  status?: number;
  details?: any;
}

export interface Door43Organization {
  id: string;
  username: string;
  full_name?: string;
  description?: string;
  avatar_url?: string;
  website?: string;
}

// Door43Owner is an alias for Door43Organization
export type Door43Owner = Door43Organization

export interface Door43ResourceMetadata {
  id: string;
  type: string;
  subjects: string[];
  books?: Array<{ code: string; name: string }>;
  articles?: Array<{ id: string; title: string }>;
  ingredients?: Door43Ingredient[];
  version: string;
  size: number;
  lastUpdated: Date;
  owner: string;
  language: string;
  format?: string;
}

// ============================================================================
// API CLIENT
// ============================================================================

export class Door43ApiClient {
  private config: Required<Omit<Door43ApiConfig, 'username' | 'password' | 'token'>> & {
    username?: string;
    password?: string;
    token?: string;
  };
  
  constructor(config: Door43ApiConfig = {}) {
    this.config = {
      baseUrl: config.baseUrl || 'https://git.door43.org',
      timeout: config.timeout || 30000,
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/json',
        ...config.headers,
      },
      debug: config.debug || false,
      username: config.username,
      password: config.password,
      token: config.token,
    };
  }

  /**
   * Get authentication headers for API requests
   * Uses token if available, otherwise Basic Auth with username/password
   */
  private getAuthHeaders(): Record<string, string> {
    const headers: Record<string, string> = {};
    
    if (this.config.token) {
      // Use token authentication (preferred)
      headers['Authorization'] = `token ${this.config.token}`;
    } else if (this.config.username && this.config.password) {
      // Use Basic Auth
      const credentials = encodeBase64(`${this.config.username}:${this.config.password}`);
      headers['Authorization'] = `Basic ${credentials}`;
    }
    
    return headers;
  }

  // ==========================================================================
  // CATALOG ENDPOINTS
  // ==========================================================================

  /**
   * Get available languages
   * @param filters Optional filters to get only languages with published packages
   * @returns List of languages with metadata
   */
  async getLanguages(filters?: {
    subjects?: string[]
    stage?: string
    topic?: string
  }): Promise<Door43Language[]> {
    const params = new URLSearchParams()
    
    // Add multiple subjects (each as a separate parameter)
    if (filters?.subjects && filters.subjects.length > 0) {
      filters.subjects.forEach(subject => {
        params.append('subject', subject)
      })
    }
    if (filters?.stage) {
      params.append('stage', filters.stage)
    }
    if (filters?.topic) {
      params.append('topic', filters.topic)
    }
    
    const queryString = params.toString()
    const endpoint = queryString 
      ? `/api/v1/catalog/list/languages?${queryString}`
      : '/api/v1/catalog/list/languages'
    
    // Simplified log: just show the request type and key filters
    const filterSummary = filters?.subjects 
      ? `${filters.subjects.length} subjects` 
      : 'all subjects'
    const stageSummary = filters?.stage || 'all stages'
    const topicSummary = filters?.topic ? `, ${filters.topic}` : ''
    console.log(`📡 Fetching languages (${filterSummary}, ${stageSummary}${topicSummary})`)
    
    const response = await this.request<{ ok: boolean; data: any[] }>(endpoint);
    
    if (!response.ok || !Array.isArray(response.data)) {
      return [];
    }
    
    // Transform API response to Door43Language[]
    // API returns: lc (language code), ln (native name), ang (anglicized name), ld (direction)
    return response.data.map((lang: any) => ({
      code: lang.lc || lang.identifier || lang.code,
      name: lang.ln || lang.name || lang.ang || lang.title, // Prioritize native name (ln)
      direction: (lang.ld || lang.direction || 'ltr') as 'ltr' | 'rtl',
      anglicized_name: lang.ang || lang.anglicized_name, // Keep English name separate
    }));
  }

  /**
   * Get full Door43 catalog (combined languages and resources)
   * Note: This is a convenience method that makes multiple API calls
   * @returns Complete catalog with languages and resources
   */
  async getCatalog(): Promise<Door43Catalog> {
    const languages = await this.getLanguages();
    const resources: Door43Resource[] = []; // Would need to fetch from search
    
    return {
      languages,
      resources
    };
  }

  /**
   * Get all organizations/owners from Door43
   * @returns List of organizations
   */
  /**
   * Get organizations (owners) that have resources matching the filters
   * @param filters Optional filters to get only orgs with published packages
   * @returns List of organizations
   */
  async getOrganizations(filters?: {
    languages?: string[]
    subjects?: string[]
    stage?: string
    topic?: string
  }): Promise<Door43Organization[]> {
    return this.getOwners(filters)
  }

  /**
   * Get owners (organizations) that have resources
   * @param filters Optional filters to get only orgs with published packages
   * @returns List of owners/organizations
   */
  async getOwners(filters?: {
    languages?: string[]
    subjects?: string[]
    stage?: string
    topic?: string
  }): Promise<Door43Owner[]> {
    try {
      const params = new URLSearchParams()
      
      // Add multiple languages
      if (filters?.languages && filters.languages.length > 0) {
        filters.languages.forEach(lang => {
          params.append('lang', lang)
        })
      }
      
      // Add multiple subjects
      if (filters?.subjects && filters.subjects.length > 0) {
        filters.subjects.forEach(subject => {
          params.append('subject', subject)
        })
      }
      
      if (filters?.stage) {
        params.append('stage', filters.stage)
      }
      if (filters?.topic) {
        params.append('topic', filters.topic)
      }
      
      const queryString = params.toString()
      const endpoint = queryString 
        ? `/api/v1/catalog/list/owners?${queryString}`
        : '/api/v1/catalog/list/owners'
      
      const response = await this.request<{ ok: boolean; data: any[] }>(endpoint);
      
      if (!response.ok || !Array.isArray(response.data)) {
        return [];
      }
      
      // Transform API response
      // API returns: username (owner name)
      return response.data.map((org: any) => ({
        id: String(org.id || org.username || org),
        username: typeof org === 'string' ? org : (org.username || org.login || String(org.id)),
        full_name: org.full_name || (typeof org === 'string' ? org : org.username),
        description: org.description,
        avatar_url: org.avatar_url,
        website: org.website,
      })).filter(org => org.username); // Filter out invalid entries
    } catch (error) {
      console.warn('Failed to fetch organizations:', error);
      return [];
    }
  }

  /**
   * Get resources for a specific language
   * @param languageCode - ISO 639 language code (e.g., 'en', 'es')
   * @returns Resources available in that language
   */
  async getResourcesByLanguage(languageCode: string): Promise<Door43Resource[]> {
    if (!languageCode || typeof languageCode !== 'string') {
      throw this.createError('Invalid language code', 'INVALID_PARAM');
    }
    
    const results = await this.searchCatalog({ language: languageCode, stage: 'prod' });
    
    return results.map((item: any) => this.transformToResource(item));
  }

  /**
   * Get resources by owner and language
   * @param owner - Resource owner (e.g., 'unfoldingWord')
   * @param languageCode - ISO 639 language code
   * @returns Filtered resources
   */
  async getResourcesByOwnerAndLanguage(
    owner: string,
    languageCode: string,
    filters?: {
      subjects?: string[];
      stage?: string;
      topic?: string;
    }
  ): Promise<Door43Resource[]> {
    if (!owner || typeof owner !== 'string') {
      throw this.createError('Invalid owner', 'INVALID_PARAM');
    }
    if (!languageCode || typeof languageCode !== 'string') {
      throw this.createError('Invalid language code', 'INVALID_PARAM');
    }
    
    const searchParams: any = { 
      owner, 
      language: languageCode, 
      stage: filters?.stage || 'prod' 
    };
    
    // Add subjects if provided
    if (filters?.subjects && filters.subjects.length > 0) {
      searchParams.subject = filters.subjects;
    }
    
    // Add topic if provided
    if (filters?.topic) {
      searchParams.topic = filters.topic;
    }
    
    const results = await this.searchCatalog(searchParams);
    
    return results.map((item: any) => this.transformToResource(item));
  }

  /**
   * Alias for getResourcesByOwnerAndLanguage (organization = owner in Door43)
   * @param organization - Organization name (e.g., 'unfoldingWord')
   * @param languageCode - ISO 639 language code
   * @param filters - Optional filters (subjects, stage, topic)
   * @returns Filtered resources
   */
  async getResourcesByOrgAndLanguage(
    organization: string,
    languageCode: string,
    filters?: {
      subjects?: string[];
      stage?: string;
      topic?: string;
    }
  ): Promise<Door43Resource[]> {
    return this.getResourcesByOwnerAndLanguage(organization, languageCode, filters);
  }

  /**
   * Get resource subjects/categories for a specific resource
   * @param owner - Resource owner
   * @param languageCode - Language code
   * @param resourceId - Resource identifier (e.g., 'ult', 'tn')
   * @returns Array of subjects
   */
  async getResourceSubjects(
    owner: string,
    languageCode: string,
    resourceId: string
  ): Promise<string[]> {
    if (!owner || !languageCode || !resourceId) {
      throw this.createError('Missing required parameters', 'INVALID_PARAM');
    }

    const resource = await this.findResource(owner, languageCode, resourceId);
    
    if (!resource) {
      return [];
    }

    return resource.subject ? [resource.subject] : [];
  }

  /**
   * Get detailed resource metadata including books, articles, etc.
   * @param owner - Resource owner
   * @param languageCode - Language code
   * @param resourceId - Resource identifier
   * @returns Detailed metadata
   */
  async getResourceMetadata(
    owner: string,
    languageCode: string,
    resourceId: string
  ): Promise<Door43ResourceMetadata | null> {
    if (!owner || !languageCode || !resourceId) {
      throw this.createError('Missing required parameters', 'INVALID_PARAM');
    }

    const resource = await this.findResource(owner, languageCode, resourceId);
    
    if (!resource) {
      return null;
    }

    // Extract books from manifest if available (for scripture resources)
    let books: Array<{ code: string; name: string }> | undefined;
    let articles: Array<{ id: string; title: string }> | undefined;
    
    if (resource.metadata?.projects) {
      books = resource.metadata.projects.map((project: any) => ({
        code: project.identifier || project.path,
        name: project.title || project.identifier,
      }));
    }

    // For Translation Words/Academy, try to get article list from manifest
    if (resource.metadata?.projects) {
      const projectArticles = resource.metadata.projects.flatMap((project: any) => {
        if (project.articles) {
          return project.articles.map((article: any) => ({
            id: article.identifier || article.path,
            title: article.title || article.identifier,
          }));
        }
        return [];
      });
      
      if (projectArticles.length > 0) {
        articles = projectArticles;
      }
    }

    const lastUpdated = resource.release?.published_at 
      ? new Date(resource.release.published_at)
      : new Date();

    return {
      id: resource.id,
      type: this.inferResourceType(resource.id, resource.subject),
      subjects: resource.subject ? [resource.subject] : [],
      books,
      articles,
      ingredients: resource.ingredients,
      version: resource.version,
      size: 0, // Size would need to be calculated from release assets
      lastUpdated,
      owner: resource.owner,
      language: resource.language,
      format: resource.metadata?.format,
    };
  }

  /**
   * Find specific resource
   * @param owner - Resource owner
   * @param language - Language code
   * @param resourceId - Resource identifier (e.g., 'ult', 'tn')
   * @returns Resource if found, null otherwise
   */
  async findResource(
    owner: string,
    language: string,
    resourceId: string
  ): Promise<Door43Resource | null> {
    if (!owner || !language || !resourceId) {
      throw this.createError('Missing required parameters', 'INVALID_PARAM');
    }
    
    const resources = await this.getResourcesByOwnerAndLanguage(owner, language);
    return resources.find(r => r.id === resourceId) || null;
  }

  /**
   * Enrich resource metadata with license, README, and LICENSE file from manifest and repository
   * This fetches additional metadata not available in the catalog API
   * 
   * @param resource - Door43Resource to enrich
   * @returns Enriched metadata with license string, README, and LICENSE file content
   */
  /**
   * Enrich resource metadata with README and license from manifest.yaml
   * 
   * NOTE: Does NOT fetch ingredients - those come directly from the Door43 catalog API response.
   * Each resource type's loader can extend/modify ingredients as needed.
   */
  async enrichResourceMetadata(resource: Door43Resource): Promise<{
    license?: string;
    readme?: string;
    licenseFile?: string;
  }> {
    const enriched: { 
      license?: string; 
      readme?: string; 
      licenseFile?: string;
    } = {};
    
    if (!resource.metadata_url) {
      return enriched;
    }
    
    // Fetch manifest.yaml for README and license information
    // NOTE: Ingredients come from the Door43 catalog API response, not manifest.yaml
    try {
      if (this.config.debug) {
        console.log(`📄 Fetching manifest from: ${resource.metadata_url}`);
      }
      
      const manifestResponse = await fetch(resource.metadata_url);
      if (manifestResponse.ok) {
        const manifestText = await manifestResponse.text();
        
        // Simple YAML parsing for rights field
        const rightsMatch = manifestText.match(/rights:\s*['"]?([^'";\n]+)['"]?/i);
        if (rightsMatch) {
          enriched.license = rightsMatch[1].trim();
          
          if (this.config.debug) {
            console.log(`✅ Got license from manifest: ${enriched.license}`);
          }
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn(`⚠️  Failed to fetch manifest:`, error);
      }
    }
    
    // Fetch README.md for long description
    try {
      // Construct README URL from manifest URL
      const readmeUrl = resource.metadata_url.replace('manifest.yaml', 'README.md');
      
      if (this.config.debug) {
        console.log(`📖 Fetching README from: ${readmeUrl}`);
      }
      
      const readmeResponse = await fetch(readmeUrl);
      if (readmeResponse.ok) {
        const readmeText = await readmeResponse.text();
        if (readmeText && readmeText.length > 0) {
          enriched.readme = readmeText;
          
          if (this.config.debug) {
            console.log(`✅ Got README (${readmeText.length} chars)`);
          }
        }
      }
    } catch (error) {
      if (this.config.debug) {
        console.warn(`⚠️  Failed to fetch README:`, error);
      }
    }
    
    // Fetch LICENSE file (try multiple common names)
    const licenseFileNames = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'LICENCE.md'];
    for (const fileName of licenseFileNames) {
      try {
        const licenseUrl = resource.metadata_url.replace('manifest.yaml', fileName);
        
        if (this.config.debug) {
          console.log(`📜 Trying LICENSE file: ${licenseUrl}`);
        }
        
        const licenseResponse = await fetch(licenseUrl);
        if (licenseResponse.ok) {
          const licenseText = await licenseResponse.text();
          if (licenseText && licenseText.length > 0) {
            enriched.licenseFile = licenseText;
            
            if (this.config.debug) {
              console.log(`✅ Got LICENSE file (${licenseText.length} chars) from ${fileName}`);
            }
            break; // Found license file, stop trying
          }
        }
      } catch (error) {
        // Continue to next filename
        continue;
      }
    }
    
    if (this.config.debug && !enriched.licenseFile) {
      console.warn(`⚠️  No LICENSE file found`);
    }
    
    return enriched;
  }

  /**
   * Search catalog with specific filters
   * Used by resource adapters to find specific repositories
   * 
   * @param params - Search parameters
   * @returns Search results
   */
  async searchCatalog(params: {
    repo?: string;
    owner?: string | string[]; // Support comma-separated owners
    language?: string | string[]; // Support multiple languages
    subject?: string | string[];
    subjects?: string[]; // Add alias for subjects
    topic?: string;
    stage?: 'prod' | 'preprod' | 'draft' | 'latest';
    /** Max results to return; some catalog implementations support this. */
    limit?: number;
  }): Promise<any[]> {
    const queryParams = new URLSearchParams();
    
    if (params.repo) queryParams.append('repo', params.repo);
    
    // Handle multiple owners (comma-separated in single param)
    if (params.owner) {
      const owners = Array.isArray(params.owner) ? params.owner.join(',') : params.owner;
      queryParams.append('owner', owners);
    }
    
    // Handle multiple languages (multiple lang params)
    if (params.language) {
      const languages = Array.isArray(params.language) ? params.language : [params.language];
      languages.forEach(lang => {
        queryParams.append('lang', lang);
      });
    }
    
    // Handle multiple subjects (support both 'subject' and 'subjects')
    const subjectsParam = params.subject || params.subjects;
    if (subjectsParam) {
      const subjects = Array.isArray(subjectsParam) ? subjectsParam : [subjectsParam];
      subjects.forEach(subject => {
        queryParams.append('subject', subject);
      });
    }
    
    if (params.topic) queryParams.append('topic', params.topic);
    if (params.stage) queryParams.append('stage', params.stage);
    if (params.limit != null && params.limit > 0) queryParams.append('limit', String(params.limit));
    
    const queryString = queryParams.toString();
    const endpoint = `/api/v1/catalog/search?${queryString}`;
    
    if (this.config.debug) {
      console.log('📡 Door43 API searchCatalog()')
      console.log('   Endpoint:', this.config.baseUrl + endpoint)
      console.log('   Params:', params)
      console.log('   Query string:', queryString)
    }
    
    const response = await this.request<{ ok: boolean; data: any[] }>(endpoint);
    
    if (this.config.debug) {
      console.log('   Response:', response.ok ? `${response.data?.length || 0} results` : 'failed')
    }
    
    if (!response.ok || !Array.isArray(response.data)) {
      return [];
    }
    
    return response.data;
  }

  /**
   * Find repository information for a specific resource
   * @param owner - Repository owner (e.g., 'unfoldingWord')
   * @param repoName - Repository name (e.g., 'en_ult', 'en_tq')
   * @param stage - Release stage (default: 'prod') - currently unused, repo endpoint returns all stages
   * @returns Repository info or null if not found
   */
  async findRepository(
    owner: string,
    repoName: string,
    stage: 'prod' | 'preprod' | 'draft' | 'latest' = 'prod'
  ): Promise<any | null> {
    if (!owner || !repoName) {
      throw this.createError('Missing required parameters', 'INVALID_PARAM');
    }
    
    try {
      // Use repos endpoint - this is the correct endpoint that returns repository info
      // The catalog entry endpoint doesn't exist, use the standard Gitea API instead
      const endpoint = `/api/v1/repos/${owner}/${repoName}`;
      const repo = await this.request<any>(endpoint);
      
      // The repo object includes a 'catalog' field with prod/preprod/latest info
      // Extract the appropriate release based on stage
      if (repo && repo.catalog && repo.catalog[stage]) {
        // Merge catalog info into the release field for consistency
        const catalogStage = repo.catalog[stage];
        repo.release = {
          tag_name: catalogStage.branch_or_tag_name,
          zipball_url: catalogStage.zipball_url,
          tarball_url: catalogStage.tarball_url,
          published_at: catalogStage.released,
          html_url: catalogStage.release_url
        };
      }
      
      return repo;
    } catch (error) {
      // If not found, return null instead of throwing
      if ((error as any)?.status === 404) {
        return null;
      }
      throw error;
    }
  }

  // ==========================================================================
  // HELPER METHODS
  // ==========================================================================

  /**
   * Make HTTP request with error handling and timeout
   */
  private async request<T>(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<T> {
    const url = `${this.config.baseUrl}${endpoint}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        ...options,
        headers: {
          ...this.config.headers,
          ...options.headers,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw this.createError(
          `HTTP ${response.status}: ${response.statusText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json();
      return data as T;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error) {
        if (error.name === 'AbortError') {
          throw this.createError(
            `Request timeout after ${this.config.timeout}ms`,
            'TIMEOUT'
          );
        }
        throw this.createError(error.message, 'NETWORK_ERROR');
      }
      
      throw error;
    }
  }

  /**
   * Create standardized API error
   */
  private createError(
    message: string,
    code: string,
    status?: number
  ): Door43ApiError {
    return {
      message,
      code,
      status,
    };
  }

  /**
   * Validate response data (for testing/debugging)
   */
  validateCatalog(catalog: any): catalog is Door43Catalog {
    return (
      catalog &&
      typeof catalog === 'object' &&
      Array.isArray(catalog.languages) &&
      Array.isArray(catalog.resources)
    );
  }

  /**
   * Transform Door43 API response to Door43Resource
   * @private
   */
  private transformToResource(item: any): Door43Resource {
    // Debug: Log raw Door43 API response to see license field
    if (this.config.debug && item.identifier === 'ugnt') {
      console.log('🔍 Raw Door43 API response for UGNT:', item)
      console.log('🔍 Checking license in multiple locations:')
      console.log('   - item.license:', item.license)
      console.log('   - item.metadata?.dublin_core?.rights:', item.metadata?.dublin_core?.rights)
      console.log('   - item.metadata?.license:', item.metadata?.license)
      console.log('   - item.repo?.license:', item.repo?.license)
      console.log('   - item.repo?.metadata?.dublin_core?.rights:', item.repo?.metadata?.dublin_core?.rights)
    }
    
    // Handle owner field - can be string or object
    const owner = typeof item.owner === 'string' 
      ? item.owner 
      : (item.owner?.login || item.owner?.username || 'unknown');
    
    // Extract relations, books, and ingredients from catalog data
    const relations = item.repo?.relations || item.relations || []
    const books = item.books || item.repo?.books || []
    const ingredients = item.ingredients || item.repo?.ingredients || []
    
    // Extract license from various possible locations
    const license = item.license 
      || item.metadata?.dublin_core?.rights 
      || item.metadata?.license
      || item.repo?.license
      || item.repo?.metadata?.dublin_core?.rights
      || undefined
    
    // Require release tag - we only support released resources for now
    // In the future, we'll support non-released resources using commit SHA and last updated
    if (!item.release?.tag_name) {
      const resourceId = item.identifier || item.name?.split('_').pop() || item.name;
      throw this.createError(
        `Resource ${resourceId} does not have a release tag. Only released resources are currently supported.`,
        'NO_RELEASE_TAG'
      );
    }
    
    return {
      id: item.identifier || item.name?.split('_').pop() || item.name,
      name: item.title || item.name,
      owner,
      language: item.language || item.language_code || 'unknown',
      language_title: item.language_title,
      language_direction: item.language_direction as 'ltr' | 'rtl' | undefined,
      language_is_gl: item.language_is_gl || item.repo?.language_is_gl,
      subject: item.subject || '',
      // Only use release tag - never use metadata_version or dublin_core.version
      version: item.release.tag_name,
      format: item.format,
      content_format: item.content_format || item.repo?.content_format,
      flavor_type: item.flavor_type || item.repo?.flavor_type,
      flavor: item.flavor || item.repo?.flavor,
      checking_level: item.checking_level || item.repo?.checking_level,
      metadata_type: item.metadata_type || item.repo?.metadata_type,
      metadata_version: item.metadata_version || item.repo?.metadata_version,
      
      // URLs from catalog (guaranteed to exist)
      metadata_url: item.metadata_url,
      metadata_json_url: item.metadata_json_url,
      metadata_api_contents_url: item.metadata_api_contents_url,
      contents_url: item.contents_url,
      
      repo_name: item.name,
      description: item.repo?.description || item.description,
      license,
      relations: Array.isArray(relations) ? relations : undefined,
      books: Array.isArray(books) ? books : undefined,
      ingredients: Array.isArray(ingredients) ? ingredients.map((ing: any) => ({
        identifier: ing.identifier,
        title: ing.title,
        categories: ing.categories,
        sort: ing.sort,
        path: ing.path,
        size: ing.size,
        alignment_count: ing.alignment_count,
        versification: ing.versification,
        exists: ing.exists,
        is_dir: ing.is_dir,
      })) : undefined,
      release: item.release ? {
        tag_name: item.release.tag_name,
        zipball_url: item.release.zipball_url,
        tarball_url: item.release.tarball_url,
        published_at: item.released || item.release.published_at,
        html_url: item.release.html_url,
      } : undefined,
      metadata: item.metadata || {},
    };
  }

  /**
   * Infer resource type from ID and subject
   * @private
   */
  private inferResourceType(id: string, _subject: string): string {
    const typeMap: Record<string, string> = {
      'ult': 'scripture',
      'glt': 'scripture',
      'ust': 'scripture',
      'gst': 'scripture',
      'ulb': 'scripture',
      'udb': 'scripture',
      'ugnt': 'scripture',
      'uhb': 'scripture',
      'tn': 'notes',
      'tq': 'questions',
      'tw': 'words',
      'twl': 'words_links',
      'ta': 'academy',
      'obs': 'stories',
      'obs-tn': 'notes',
      'obs-tq': 'questions',
    };

    return typeMap[id.toLowerCase()] || 'unknown';
  }

  // ==========================================================================
  // CONTENT FETCHING (for resource adapters)
  // ==========================================================================

  /**
   * Fetch raw content from Door43 repository
   * Used by adapters to download actual resource files (TSV, USFM, Markdown, etc.)
   * Supports both branches and tags (release tags)
   * 
   * @param owner - Repository owner
   * @param repo - Repository name (e.g., 'en_tn', 'en_ult')
   * @param filePath - Path to file in repository
   * @param ref - Branch name or tag name (default: 'master')
   * @returns Response object
   */
  async fetchRawContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string = 'master'
  ): Promise<Response> {
    if (!owner || !repo || !filePath) {
      throw this.createError('Missing required parameters for content fetch', 'INVALID_PARAM');
    }

    // Determine if ref is a tag (starts with 'v' followed by numbers) or a branch
    // Tags typically look like: v37, v1.0.0, etc.
    // Branches typically look like: master, main, toc-update-*, etc.
    // Simple heuristic: if it starts with 'v' followed by a digit, it's likely a tag
    const isTag = /^v\d/.test(ref);
    
    // Use different endpoint format for branches vs tags
    // Branch: /raw/branch/{branch}/{filePath}
    // Tag: /raw/tag/{tag}/{filePath}
    const url = isTag
      ? `${this.config.baseUrl}/${owner}/${repo}/raw/tag/${ref}/${filePath}`
      : `${this.config.baseUrl}/${owner}/${repo}/raw/branch/${ref}/${filePath}`;
    
    if (this.config.debug) {
      console.log(`📥 Fetching ${isTag ? 'tag' : 'branch'} content: ${url}`);
    }
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers: this.config.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `Content fetch timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }
      throw this.createError('Failed to fetch content', 'NETWORK_ERROR');
    }
  }

  /**
   * Fetch text content from Door43 repository
   * Convenience method that returns text directly
   * Supports both branches and tags (release tags)
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param filePath - Path to file
   * @param ref - Branch name or tag name (default: 'master')
   * @returns File content as text
   */
  async fetchTextContent(
    owner: string,
    repo: string,
    filePath: string,
    ref: string = 'master'
  ): Promise<string> {
    const response = await this.fetchRawContent(owner, repo, filePath, ref);
    
    if (!response.ok) {
      throw this.createError(
        `Failed to fetch ${filePath}: ${response.status} ${response.statusText}`,
        'HTTP_ERROR',
        response.status
      );
    }
    
    return await response.text();
  }

  /**
   * Check if a file exists in a Door43 repository
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param filePath - Path to file
   * @param branch - Branch name (default: 'master')
   * @returns True if file exists
   */
  async checkFileExists(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'master'
  ): Promise<boolean> {
    try {
      const response = await this.fetchRawContent(owner, repo, filePath, branch);
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * List repository contents (files and directories) at a given path
   * Uses Door43/Gitea API to get directory listings
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param path - Directory path (default: '')
   * @param branch - Branch name (default: 'master')
   * @returns Array of file/directory entries
   */
  async listRepositoryContents(
    owner: string,
    repo: string,
    path: string = '',
    branch: string = 'master'
  ): Promise<Array<{
    name: string;
    path: string;
    type: 'file' | 'dir';
    size?: number;
  }>> {
    if (!owner || !repo) {
      throw this.createError('Missing required parameters for listing contents', 'INVALID_PARAM');
    }

    // Use Gitea API endpoint: /api/v1/repos/{owner}/{repo}/contents/{path}
    // Path should not have leading slash (e.g., "bible/kt" not "/bible/kt")
    const apiPath = path ? `/${path}` : '';
    const url = `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/contents${apiPath}?ref=${branch}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers: this.config.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        if (response.status === 404) {
          return []; // Directory doesn't exist, return empty array
        }
        throw this.createError(
          `Failed to list contents: ${response.status} ${response.statusText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const contents = await response.json();
      
      // Handle both single file and array responses
      const items = Array.isArray(contents) ? contents : [contents];
      
      return items.map((item: any) => ({
        name: item.name,
        path: item.path,
        type: item.type === 'dir' ? 'dir' : 'file',
        size: item.size,
      }));
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `List contents timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }
      
      if (error instanceof Error && error.message.includes('HTTP_ERROR')) {
        throw error;
      }
      
      throw this.createError('Failed to list repository contents', 'NETWORK_ERROR');
    }
  }

  /**
   * Recursively list all files in a repository directory
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param basePath - Base directory path to start from (default: '')
   * @param branch - Branch name (default: 'master')
   * @param filter - Optional filter function to include/exclude files
   * @returns Array of all files found recursively
   */
  async listRepositoryFilesRecursive(
    owner: string,
    repo: string,
    basePath: string = '',
    branch: string = 'master',
    filter?: (file: { name: string; path: string; type: 'file' | 'dir' }) => boolean
  ): Promise<Array<{
    name: string;
    path: string;
    type: 'file' | 'dir';
    size?: number;
  }>> {
    const allFiles: Array<{
      name: string;
      path: string;
      type: 'file' | 'dir';
      size?: number;
    }> = [];

    const traverse = async (currentPath: string): Promise<void> => {
      try {
        const contents = await this.listRepositoryContents(owner, repo, currentPath, branch);
        
        for (const item of contents) {
          if (item.type === 'dir') {
            // Recursively traverse subdirectories (don't filter directories - we need to traverse them)
            await traverse(item.path);
          } else {
            // For files, apply filter if provided, then add to results
            if (!filter || filter(item)) {
              allFiles.push(item);
            }
          }
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn(`⚠️  Failed to traverse ${currentPath}:`, error);
        }
        // Continue with other directories even if one fails
      }
    };

    await traverse(basePath);
    return allFiles;
  }

  /**
   * Get the commit SHA of a branch tip
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param branch - Branch name (default: 'master')
   * @returns Commit SHA of the branch tip
   */
  async getBranchSha(
    owner: string,
    repo: string,
    branch: string = 'master'
  ): Promise<string> {
    if (!owner || !repo || !branch) {
      throw this.createError('Missing required parameters for branch SHA lookup', 'INVALID_PARAM');
    }

    // Try multiple endpoints to get the branch SHA
    // Method 1: Git refs endpoint (most direct) - GET /api/v1/repos/{owner}/{repo}/git/refs/heads/{branch}
    // Method 2: Branches endpoint - GET /api/v1/repos/{owner}/{repo}/branches/{branch}
    // Method 3: Commits endpoint - GET /api/v1/repos/{owner}/{repo}/commits/{branch}
    
    const authHeaders = this.getAuthHeaders();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    if (this.config.debug) {
      console.log(`🔍 Getting branch SHA for '${branch}' in ${owner}/${repo}`);
    }

    const endpoints = [
      {
        name: 'git refs',
        url: `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/git/refs/heads/${encodeURIComponent(branch)}`,
        extractSha: (data: any) => {
          // Response can be an array or single object
          const ref = Array.isArray(data) ? data[0] : data;
          return ref?.object?.sha || ref?.sha;
        }
      },
      {
        name: 'branches',
        url: `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/branches/${encodeURIComponent(branch)}`,
        extractSha: (data: any) => data.commit?.sha || data.commit?.id
      },
      {
        name: 'commits',
        url: `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/commits/${encodeURIComponent(branch)}`,
        extractSha: (data: any) => {
          // Commits endpoint might return array or single commit
          const commit = Array.isArray(data) ? data[0] : data;
          return commit?.sha || commit?.commit?.sha;
        }
      }
    ];

    for (const endpoint of endpoints) {
      try {
        if (this.config.debug) {
          console.log(`🔍 Trying ${endpoint.name} endpoint: ${endpoint.url}`);
        }

        const response = await fetch(endpoint.url, {
          method: 'GET',
          headers: {
            ...this.config.headers,
            ...authHeaders,
          },
          signal: controller.signal,
        });

        if (response.ok) {
          const data = await response.json() as any;
          const commitSha = endpoint.extractSha(data);
          
          if (commitSha) {
            clearTimeout(timeoutId);
            if (this.config.debug) {
              console.log(`✅ Branch '${branch}' SHA: ${commitSha} (from ${endpoint.name} endpoint)`);
            }
            return commitSha;
          } else {
            if (this.config.debug) {
              console.log(`⚠️  ${endpoint.name} endpoint returned data but no SHA found:`, JSON.stringify(data, null, 2));
            }
          }
        } else {
          const errorText = await response.text().catch(() => '');
          if (this.config.debug) {
            console.log(`⚠️  ${endpoint.name} endpoint failed (${response.status}): ${errorText}`);
          }
        }
      } catch (error) {
        if (this.config.debug) {
          console.warn(`⚠️  ${endpoint.name} endpoint error:`, error);
        }
        // Continue to next endpoint
      }
    }

    clearTimeout(timeoutId);
    
    // If all endpoints failed, throw an error
    throw this.createError(
      `Failed to get branch SHA from any endpoint. Tried ${endpoints.length} different endpoints: ${endpoints.map(e => e.name).join(', ')}`,
      'HTTP_ERROR'
    );
  }

  /**
   * Download repository archive (zipball) for a specific ref (tag, branch, or commit SHA)
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param ref - Git reference (tag, branch, or commit SHA) - default: 'master'
   * @returns ArrayBuffer containing the zip file data
   */
  async downloadZipball(
    owner: string,
    repo: string,
    ref: string = 'master'
  ): Promise<ArrayBuffer> {
    if (!owner || !repo || !ref) {
      throw this.createError('Missing required parameters for zipball download', 'INVALID_PARAM');
    }

    // Gitea archive endpoint: /api/v1/repos/{owner}/{repo}/archive/{ref}.zip
    const url = `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/archive/${encodeURIComponent(ref)}.zip`;
    
    const authHeaders = this.getAuthHeaders();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    if (this.config.debug) {
      console.log(`📦 Downloading zipball for ${owner}/${repo}@${ref}`);
      console.log(`📤 Request URL: ${url}`);
    }

    try {
      const response = await fetch(url, {
        method: 'GET',
        headers: {
          ...this.config.headers,
          ...authHeaders,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        if (this.config.debug) {
          console.log(`❌ Zipball download failed: ${response.status}`);
          console.log(`📡 Response: ${errorText}`);
        }
        throw this.createError(
          `Failed to download zipball: ${response.status} ${response.statusText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const arrayBuffer = await response.arrayBuffer();
      
      if (this.config.debug) {
        const sizeMB = (arrayBuffer.byteLength / (1024 * 1024)).toFixed(2);
        console.log(`✅ Downloaded zipball: ${sizeMB} MB`);
      }

      return arrayBuffer;
    } catch (error) {
      clearTimeout(timeoutId);
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError('Request timeout while downloading zipball', 'TIMEOUT');
      }
      throw error;
    }
  }

  /**
   * Create or update a file in a repository
   * Requires authentication (token or username/password)
   * 
   * Uses POST for creating new files and PUT for updating existing files
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param filePath - Path to file in repository
   * @param content - File content
   * @param message - Commit message
   * @param branch - Branch name (default: 'master')
   * @param sha - SHA of existing file (if provided, will use PUT to update; otherwise will check and use POST/PUT accordingly)
   * @returns Commit SHA
   */
  async createOrUpdateFile(
    owner: string,
    repo: string,
    filePath: string,
    content: string,
    message: string,
    branch: string = 'master',
    sha?: string
  ): Promise<string> {
    if (!this.config.token && (!this.config.username || !this.config.password)) {
      throw this.createError(
        'Authentication required for file operations. Provide token or username/password.',
        'AUTH_REQUIRED'
      );
    }

    if (!owner || !repo || !filePath || !content || !message) {
      throw this.createError('Missing required parameters for file operation', 'INVALID_PARAM');
    }

    // Encode content as base64 (Gitea API requirement)
    const contentBase64 = encodeBase64(content);

    // URL encode the file path to handle special characters
    const encodedFilePath = encodeURIComponent(filePath).replace(/%2F/g, '/');
    const url = `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/contents/${encodedFilePath}`;
    
    const authHeaders = this.getAuthHeaders();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Check if file exists to determine if we should use POST (create) or PUT (update)
    let fileExists = false;
    let existingFileSha: string | null = null;
    
    if (!sha) {
      // No SHA provided - check if file exists using GET
      try {
        const checkUrl = `${url}?ref=${branch}`;
        if (this.config.debug) {
          console.log(`🔍 Checking if file exists: ${checkUrl}`);
        }
        
        const checkResponse = await fetch(checkUrl, {
          method: 'GET',
          headers: {
            ...this.config.headers,
            ...authHeaders,
          },
          signal: controller.signal,
        });

        if (checkResponse.ok) {
          const fileData = await checkResponse.json() as any;
          // File exists - extract SHA
          existingFileSha = fileData.sha || null;
          fileExists = true;
          if (this.config.debug) {
            console.log(`✅ File exists with SHA: ${existingFileSha}`);
          }
        } else if (checkResponse.status === 404) {
          // File doesn't exist - will use POST
          fileExists = false;
          if (this.config.debug) {
            console.log(`📄 File does not exist, will create new file`);
          }
        }
      } catch (error) {
        // If check fails, assume file doesn't exist and try POST
        if (this.config.debug) {
          console.warn(`⚠️  Could not check if file exists, assuming new file:`, error);
        }
        fileExists = false;
      }
    } else {
      // SHA provided - file exists, will use PUT
      existingFileSha = sha;
      fileExists = true;
    }

    // Prepare request body
    const body: any = {
      message,
      content: contentBase64,
      branch,
    };

    // Determine HTTP method and SHA requirement
    const isUpdate = fileExists;
    const httpMethod = isUpdate ? 'PUT' : 'POST';
    
    if (isUpdate) {
      // For updates, SHA of the existing file is required
      body.sha = existingFileSha;
      if (this.config.debug) {
        console.log(`📌 Updating existing file with SHA: ${existingFileSha}`);
      }
    } else {
      // For new files, do not include SHA (POST endpoint doesn't require it)
      if (this.config.debug) {
        console.log(`📌 Creating new file (POST, no SHA required)`);
      }
    }

    if (this.config.debug) {
      console.log(`📤 File ${isUpdate ? 'update' : 'create'} request (${httpMethod}):`, url);
      console.log(`📤 Request body:`, JSON.stringify({ ...body, content: '[base64: ' + contentBase64.length + ' chars]' }, null, 2));
    }

    try {
      const response = await fetch(url, {
        method: httpMethod,
        headers: {
          ...this.config.headers,
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (this.config.debug) {
        console.log(`📡 File ${sha ? 'update' : 'create'} response status: ${response.status}`);
      }

      if (!response.ok) {
        let errorText: string;
        let errorDetails: any = null;
        let errorResponseText: string = '';
        try {
          errorResponseText = await response.text();
          try {
            const errorJson = JSON.parse(errorResponseText) as any;
            errorDetails = errorJson;
            // Try to extract meaningful error message from Gitea API response
            if (errorJson.message) {
              errorText = errorJson.message;
            } else if (errorJson.errors && Array.isArray(errorJson.errors) && errorJson.errors.length > 0) {
              errorText = errorJson.errors.map((e: any) => {
                if (typeof e === 'string') return e;
                return e.message || e.field || JSON.stringify(e);
              }).join('; ');
            } else {
              errorText = JSON.stringify(errorJson);
            }
          } catch {
            errorText = errorResponseText;
          }
        } catch {
          errorText = 'Failed to read error response';
        }
        
        // Always log errors (not just when debug is enabled) for better debugging
        console.error(`❌ File operation failed: ${response.status} ${response.statusText}`);
        console.error(`   Error message: ${errorText}`);
        if (errorDetails) {
          console.error(`   Full error details:`, JSON.stringify(errorDetails, null, 2));
        }
        
        // Enhanced debug logging with URL, payload, and response
        if (this.config.debug) {
          console.log(`📤 Request URL: ${url}`);
          console.log(`📤 Request method: PUT`);
          console.log(`📤 Request headers:`, JSON.stringify({
            ...this.config.headers,
            ...authHeaders,
            'Content-Type': 'application/json',
          }, null, 2));
          console.log(`📤 Request body:`, JSON.stringify({ ...body, content: `[base64: ${contentBase64.length} chars]` }, null, 2));
          console.log(`📡 Response status: ${response.status} ${response.statusText}`);
          console.log(`📡 Response headers:`, JSON.stringify(Object.fromEntries([...response.headers as any]), null, 2));
          console.log(`📡 Response body:`, errorResponseText || '(empty)');
        }
        
        throw this.createError(
          `Failed to create/update file: ${response.status} ${response.statusText}. ${errorText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json() as any;
      return data.commit?.sha || data.content?.sha || '';
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `File operation timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }
      
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw Door43ApiError
      }
      
      throw this.createError('Failed to create/update file', 'NETWORK_ERROR');
    }
  }

  /**
   * Get file SHA (required for updates)
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param filePath - Path to file
   * @param branch - Branch name (default: 'master')
   * @returns File SHA or null if file doesn't exist
   */
  async getFileSha(
    owner: string,
    repo: string,
    filePath: string,
    branch: string = 'master'
  ): Promise<string | null> {
    const url = `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/contents/${filePath}?ref=${branch}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers: this.config.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (response.status === 404) {
        if (this.config.debug) {
          console.log(`📤 Request URL: ${url}`);
          console.log(`📤 Request method: GET`);
          console.log(`📡 Response status: 404 (File not found - this is expected for new files)`);
        }
        return null; // File doesn't exist
      }

      if (!response.ok) {
        let errorResponseText: string = '';
        try {
          errorResponseText = await response.text();
        } catch {
          // Ignore
        }
        
        // Enhanced debug logging
        if (this.config.debug) {
          console.log(`📤 Request URL: ${url}`);
          console.log(`📤 Request method: GET`);
          console.log(`📡 Response status: ${response.status} ${response.statusText}`);
          console.log(`📡 Response headers:`, JSON.stringify(Object.fromEntries([...response.headers as any]), null, 2));
          console.log(`📡 Response body:`, errorResponseText || '(empty)');
        }
        
        throw this.createError(
          `Failed to get file SHA: ${response.status} ${response.statusText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json() as any;
      return data.sha || null;
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `Get file SHA timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }
      
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw Door43ApiError
      }
      
      throw this.createError('Failed to get file SHA', 'NETWORK_ERROR');
    }
  }

  /**
   * Create a new branch from an existing reference (branch, tag, or commit)
   * 
   * Uses the Gitea API endpoint: POST /api/v1/repos/{owner}/{repo}/branches
   * 
   * @param owner - Repository owner
   * @param repo - Repository name
   * @param newBranch - Name of the new branch to create
   * @param fromRef - Reference to create branch from (branch name, tag name, or commit SHA) (default: 'master')
   * @returns The created branch name
   */
  async createBranch(
    owner: string,
    repo: string,
    newBranch: string,
    fromRef: string = 'master'
  ): Promise<string> {
    if (!this.config.token && (!this.config.username || !this.config.password)) {
      throw this.createError(
        'Authentication required for branch operations. Provide token or username/password.',
        'AUTH_REQUIRED'
      );
    }

    if (!owner || !repo || !newBranch) {
      throw this.createError('Missing required parameters for branch creation', 'INVALID_PARAM');
    }

    if (this.config.debug) {
      console.log(`🔍 Creating branch '${newBranch}' from '${fromRef}' in ${owner}/${repo}`);
    }

    // Use the correct Gitea API endpoint for creating branches
    // POST /api/v1/repos/{owner}/{repo}/branches
    const createBranchUrl = `${this.config.baseUrl}/api/v1/repos/${owner}/${repo}/branches`;
    const authHeaders = this.getAuthHeaders();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    // Request body format per Gitea API:
    // {
    //   "new_branch_name": "string",  // Name of the new branch
    //   "old_ref_name": "string"      // Branch, tag, or commit to create from
    // }
    const branchBody = {
      new_branch_name: newBranch,
      old_ref_name: fromRef,
    };

    if (this.config.debug) {
      console.log(`📤 Branch creation request:`, createBranchUrl);
      console.log(`📤 Branch creation request body:`, JSON.stringify(branchBody, null, 2));
    }

    try {
      const branchResponse = await fetch(createBranchUrl, {
        method: 'POST',
        headers: {
          ...this.config.headers,
          ...authHeaders,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(branchBody),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (this.config.debug) {
        console.log(`📡 Branch creation response status: ${branchResponse.status}`);
      }

      if (!branchResponse.ok) {
        let errorText: string;
        let errorResponseText: string = '';
        try {
          errorResponseText = await branchResponse.text();
          try {
            const errorJson = JSON.parse(errorResponseText) as any;
            if (errorJson.message) {
              errorText = errorJson.message;
            } else if (errorJson.errors && Array.isArray(errorJson.errors) && errorJson.errors.length > 0) {
              errorText = errorJson.errors.map((e: any) => e.message || JSON.stringify(e)).join('; ');
            } else {
              errorText = JSON.stringify(errorJson);
            }
          } catch {
            errorText = errorResponseText;
          }
        } catch {
          errorText = 'Failed to read error response';
        }

        // Enhanced debug logging
        if (this.config.debug) {
          console.log(`📤 Request URL: ${createBranchUrl}`);
          console.log(`📤 Request method: POST`);
          console.log(`📤 Request body:`, JSON.stringify(branchBody, null, 2));
          console.log(`📡 Response status: ${branchResponse.status} ${branchResponse.statusText}`);
          console.log(`📡 Response headers:`, JSON.stringify(Object.fromEntries([...branchResponse.headers as any]), null, 2));
          console.log(`📡 Response body:`, errorResponseText || '(empty)');
          console.log(`❌ Branch creation failed: ${branchResponse.status} - ${errorText}`);
        }

        // If branch already exists (409 Conflict), that's okay - we can use it
        if (branchResponse.status === 409 && errorText.includes('already exists')) {
          if (this.config.debug) {
            console.log(`ℹ️  Branch already exists, will use it`);
          }
          return newBranch;
        }

        throw this.createError(
          `Failed to create branch: ${branchResponse.status} ${branchResponse.statusText}. ${errorText}`,
          'HTTP_ERROR',
          branchResponse.status
        );
      }

      if (this.config.debug) {
        console.log(`✅ Branch '${newBranch}' created successfully`);
      }

      return newBranch;

    } catch (error) {
      clearTimeout(timeoutId);

      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `Branch creation timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }

      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw Door43ApiError
      }

      throw this.createError('Failed to create branch', 'NETWORK_ERROR');
    }
  }

  /**
   * Create a personal access token using username and password
   * This uses Basic Auth to authenticate and create a token via Gitea API
   * 
   * @param username - Door43 username
   * @param password - Door43 password
   * @param tokenName - Name for the token (default: 'toc-generator')
   * @returns Personal access token
   */
  async createPersonalAccessToken(
    username: string,
    password: string,
    tokenName: string = 'toc-generator'
  ): Promise<string> {
    if (!username || !password) {
      throw this.createError('Username and password are required', 'INVALID_PARAM');
    }

    // Use Basic Auth to create token
    const credentials = encodeBase64(`${username}:${password}`);
    const url = `${this.config.baseUrl}/api/v1/users/${username}/tokens`;

    const body = {
      name: tokenName,
      scopes: ['write:repository', 'read:repository'], // Required scopes for file operations
    };

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          ...this.config.headers,
          'Authorization': `Basic ${credentials}`,
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        const errorText = await response.text();
        throw this.createError(
          `Failed to create token: ${response.status} ${response.statusText}. ${errorText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json() as any;
      
      // Gitea API returns the token in the response
      if (data.sha1) {
        return data.sha1;
      }
      
      // Some Gitea versions return token directly
      if (data.token) {
        return data.token;
      }

      throw this.createError('Token not found in API response', 'INVALID_RESPONSE');
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `Token creation timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }
      
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw Door43ApiError
      }
      
      throw this.createError('Failed to create personal access token', 'NETWORK_ERROR');
    }
  }

  // ==========================================================================
  // REPOSITORY SEARCH
  // ==========================================================================

  /**
   * Search for repositories in Door43
   * 
   * @param query - Search query
   * @param options - Search options
   * @returns Array of matching repositories
   */
  async searchRepositories(
    query: string,
    options?: {
      owner?: string;
      limit?: number;
    }
  ): Promise<Door43Resource[]> {
    if (!query) {
      throw this.createError('Search query is required', 'INVALID_PARAM');
    }

    const params = new URLSearchParams({
      q: query,
      limit: String(options?.limit || 50),
    });

    if (options?.owner) {
      params.append('uid', options.owner);
    }

    const url = `${this.config.baseUrl}/api/v1/repos/search?${params.toString()}`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), this.config.timeout);

    try {
      const response = await fetch(url, {
        headers: this.config.headers,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw this.createError(
          `Repository search failed: ${response.statusText}`,
          'HTTP_ERROR',
          response.status
        );
      }

      const data = await response.json() as any;

      if (!data.ok || !Array.isArray(data.data)) {
        return [];
      }

      return data.data.map((item: any) => this.transformToResource(item));
      
    } catch (error) {
      clearTimeout(timeoutId);
      
      if (error instanceof Error && error.name === 'AbortError') {
        throw this.createError(
          `Repository search timeout after ${this.config.timeout}ms`,
          'TIMEOUT'
        );
      }
      
      if (error instanceof Error && 'code' in error) {
        throw error; // Re-throw Door43ApiError
      }
      
      throw this.createError('Repository search failed', 'NETWORK_ERROR');
    }
  }
}

// ============================================================================
// FACTORY
// ============================================================================

let defaultClient: Door43ApiClient | null = null;

/**
 * Get singleton Door43 API client
 */
export function getDoor43ApiClient(config?: Door43ApiConfig): Door43ApiClient {
  if (!defaultClient) {
    defaultClient = new Door43ApiClient(config);
  }
  return defaultClient;
}

/**
 * Create new Door43 API client (for testing)
 */
export function createDoor43ApiClient(config?: Door43ApiConfig): Door43ApiClient {
  return new Door43ApiClient(config);
}

/**
 * Reset singleton (for testing)
 */
export function resetDoor43ApiClient(): void {
  defaultClient = null;
}
