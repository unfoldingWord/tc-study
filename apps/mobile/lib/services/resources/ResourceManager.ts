/**
 * Resource Manager Implementation
 * 
 * The orchestration layer that coordinates between Storage and Resource Adapters.
 * Implements intelligent caching, fallback logic, and error recovery.
 */

import {
    AdapterConfig,
    BookOrganizedAdapter,
    EntryOrganizedAdapter,
    ResourceAdapter,
    ResourceContent,
    ResourceError,
    ResourceManager,
    ResourceMetadata,
    ResourceType,
    StorageAdapter,
    StorageInfo
} from '../../types/context';

import { ProcessedContent } from '../../types/processed-content';

export class ResourceManagerImpl implements ResourceManager {
  private storageAdapter: StorageAdapter | null = null;
  private resourceAdapters: ResourceAdapter[] = [];
  private metadataToAdapter: Map<string, ResourceAdapter> = new Map(); // resourceId -> adapter
  private isInitialized = false;
  private offlineMode = false; // Offline mode flag
  
  // Configuration
  private config = {
    defaultTimeout: 30000,
    maxRetryAttempts: 3,
    retryDelay: 1000,
    cacheExpiryHours: 24,
    enableContentValidation: true
  };

  /**
   * Initialize the Resource Manager with storage and resource adapters
   */
  async initialize(storageAdapter: StorageAdapter, resourceAdapters: ResourceAdapter[]): Promise<void> {
    
    
    this.storageAdapter = storageAdapter;
    
    // Initialize storage if needed
    if ('initialize' in storageAdapter && typeof storageAdapter.initialize === 'function') {
      await storageAdapter.initialize();
    }
    
    // Register resource adapters
    this.resourceAdapters = resourceAdapters;
    
    this.isInitialized = true;
    
    // Offline mode disabled - using network for resources
    this.setOfflineMode(false);
    
  }

  /**
   * Enable offline mode - only use cached data, no network fetching
   */
  setOfflineMode(enabled: boolean): void {
    this.offlineMode = enabled;
    console.log(`🔌 Offline mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
  }

  /**
   * Check if offline mode is enabled
   */
  isOffline(): boolean {
    return this.offlineMode;
  }

  /**
   * Get resource metadata (checks storage first, then fetches from adapters)
   */
  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]> {
    this.ensureInitialized();
    
    
    
    try {
      // Step 1: Check storage for cached metadata
      
      const cachedMetadata = await this.storageAdapter!.getResourceMetadata(server, owner, language);
      
      
      if (cachedMetadata.length > 0) {
        // Populate metadataToAdapter mapping for cached metadata
        for (const metadata of cachedMetadata) {
          const compatibleAdapter = this.resourceAdapters.find(adapter => 
            adapter.resourceType === metadata.type && adapter.resourceId === metadata.id
          );
          if (compatibleAdapter) {
            this.metadataToAdapter.set(metadata.id, compatibleAdapter);
          }
        }
      }

      // If offline mode is enabled, return only cached data
      if (this.offlineMode) {
        if (cachedMetadata.length > 0) {
          console.log(`🔌 Offline mode: Using ${cachedMetadata.length} cached metadata records`);
          return cachedMetadata;
        } else {
          console.warn(`🔌 Offline mode: No cached metadata found for ${server}/${owner}/${language}`);
          return [];
        }
      }
      
      if (cachedMetadata.length > 0) {
        
        
        // Check if we have metadata for all registered adapters
        const adapterResourceTypes = this.resourceAdapters.map(adapter => adapter.resourceType);
        const cachedResourceTypes = cachedMetadata.map(meta => meta.type);
        const missingTypes = adapterResourceTypes.filter(type => !cachedResourceTypes.includes(type));
        
        if (missingTypes.length > 0) {
          
        } else {
          // Check if cached metadata has valid types
          const hasInvalidTypes = cachedMetadata.some(meta => !meta.type || !Object.values(ResourceType).includes(meta.type));
          if (hasInvalidTypes) {
            
            
          } else {
            // Check if metadata is still fresh (within 24 hours)
            const isMetadataFresh = cachedMetadata.every(meta => {
              const ageHours = (Date.now() - meta.lastUpdated.getTime()) / (1000 * 60 * 60);
              return ageHours < this.config.cacheExpiryHours;
            });
            
            if (isMetadataFresh) {
              
              
              // Populate metadataToAdapter mapping for cached metadata
              for (const metadata of cachedMetadata) {
                const compatibleAdapter = this.resourceAdapters.find(adapter => 
                  adapter.resourceType === metadata.type && adapter.resourceId === metadata.id
                );
                if (compatibleAdapter) {
                  this.metadataToAdapter.set(metadata.id, compatibleAdapter);
                  
                }
              }
              
              return cachedMetadata;
            } else {
              
            }
          }
        }
      }
      
      // Step 2: Fetch fresh metadata from all available adapters (with stale fallback)
      const freshMetadata: ResourceMetadata[] = [];
      
      for (const adapter of this.resourceAdapters) {
        try {
          
          
          const adapterMetadata = await this.fetchWithRetry(
            () => adapter.getResourceMetadata(server, owner, language),
            `${adapter.resourceType} metadata`
          );
          
          // Check if we have better TOC data in cached metadata
          let tocToUse = adapterMetadata.toc || {};
          const cachedAdapterMetadata = cachedMetadata?.find(meta => 
            meta.type === adapter.resourceType && meta.id === adapter.resourceId
          );
          
          if (cachedAdapterMetadata && cachedAdapterMetadata.toc?.books && cachedAdapterMetadata.toc.books.length > 0) {
            const freshBookCount = adapterMetadata.toc?.books?.length || 0;
            const cachedBookCount = cachedAdapterMetadata.toc.books.length;
            
            if (cachedBookCount > freshBookCount) {
              
              tocToUse = cachedAdapterMetadata.toc;
            }
          }
          
          // Convert to full ResourceMetadata format
          const fullMetadata: ResourceMetadata = {
            id: adapterMetadata.id, // Use the actual resource ID from the adapter (ult, glt, ulb)
            server,
            owner,
            language,
            type: adapter.resourceType,
            title: adapterMetadata.title,
            description: adapterMetadata.description || '',
            name: `${adapter.resourceType}-${language}`,
            version: adapterMetadata.version,
            lastUpdated: new Date(),
            available: adapterMetadata.available,
            toc: tocToUse,
            isAnchor: adapter.resourceType === ResourceType.SCRIPTURE && adapter.resourceId === 'literal-text'
          };
          
          // Store the adapter reference for content fetching
          this.metadataToAdapter.set(fullMetadata.id, adapter);
          
          
          freshMetadata.push(fullMetadata);
          
          
        } catch (error) {
          console.warn(`⚠️ Failed to fetch metadata from ${adapter.resourceType} adapter, checking for stale fallback:`, error);
          
          // Try to find stale cached metadata for this adapter
          const staleMetadata = cachedMetadata?.find(meta => 
            meta.type === adapter.resourceType && meta.id === adapter.resourceId
          );
          
          if (staleMetadata) {
            
            
            // Update the stale metadata with fresh timestamp
            const refreshedMetadata: ResourceMetadata = {
              ...staleMetadata,
              lastUpdated: new Date()
            };
            
            // Store the adapter reference for content fetching
            this.metadataToAdapter.set(refreshedMetadata.id, adapter);
            
            
            freshMetadata.push(refreshedMetadata);
            
          } else {
            console.warn(`❌ No stale fallback available for ${adapter.resourceType} adapter`);
            // Continue with other adapters
          }
        }
      }
      
      // Step 3: Save fresh metadata to storage
      if (freshMetadata.length > 0) {
        
        await this.storageAdapter!.saveResourceMetadata(freshMetadata);
                
      }
      
      // Step 4: Return fresh metadata, or fall back to cached if available
      return freshMetadata.length > 0 ? freshMetadata : cachedMetadata;
      
    } catch (error) {
      console.error(`❌ Failed to get resource metadata:`, error);
      throw new ResourceError(`Failed to get resource metadata: ${error instanceof Error ? error.message : 'Unknown error'}`, 'METADATA_FETCH_FAILED');
    }
  }

  /**
   * Get or fetch metadata for a specific adapter using its configured parameters
   */
  async getOrFetchMetadataForAdapter(
    adapter: ResourceAdapter, 
    server: string, 
    owner: string, 
    language: string
  ): Promise<ResourceMetadata | null> {
    this.ensureInitialized();

    

    try {
      // Step 1: Check storage for cached metadata
      const cachedMetadata = await this.storageAdapter!.getResourceMetadata(server, owner, language);
      
      // If offline mode is enabled, return only cached metadata
      if (this.offlineMode) {
        const cachedAdapterMetadata = cachedMetadata.find(meta => 
          meta.type === adapter.resourceType && meta.id === adapter.resourceId
        );
        
        if (cachedAdapterMetadata) {
          console.log(`🔌 Offline mode: Using cached metadata for ${adapter.resourceId}`);
          this.metadataToAdapter.set(cachedAdapterMetadata.id, adapter);
          return cachedAdapterMetadata;
        } else {
          console.warn(`🔌 Offline mode: No cached metadata found for ${adapter.resourceId}`);
          return null;
        }
      }
      const existingMappingId = Array.from(this.metadataToAdapter.entries())
        .find(([_, mappedAdapter]) => mappedAdapter === adapter)?.[0];
      
      let cachedAdapterMetadata = null;
      if (existingMappingId) {
        // Use the existing mapping for this specific adapter
        cachedAdapterMetadata = cachedMetadata.find(meta => meta.id === existingMappingId);
        
      } else {
        // Look for metadata that matches this adapter's preferred resource IDs
        // For scripture adapters, check their resourceIds array (e.g., ['ult', 'glt', 'ulb'] or ['ust', 'gst'])
        if (adapter.resourceType === 'scripture' && 'resourceIds' in adapter) {
          const resourceIds = (adapter as any).resourceIds as string[];
          // Find metadata that matches any of this adapter's resource IDs, in priority order
          for (const resourceId of resourceIds) {
            cachedAdapterMetadata = cachedMetadata.find(meta => 
              meta.type === adapter.resourceType && meta.id === resourceId
            );
            if (cachedAdapterMetadata) {
              
              break;
            }
          }
          
          if (!cachedAdapterMetadata) {
            
            
          }
        } else {
          // For non-scripture adapters, look for exact match first, then any of the same type
          cachedAdapterMetadata = cachedMetadata.find(meta => 
            meta.id === adapter.resourceId && meta.type === adapter.resourceType
          ) || cachedMetadata.find(meta => meta.type === adapter.resourceType);
          
          
        }
      }

      if (cachedAdapterMetadata) {
        // Check if metadata is fresh
        const ageHours = (Date.now() - cachedAdapterMetadata.lastUpdated.getTime()) / (1000 * 60 * 60);
        const ageMinutes = (Date.now() - cachedAdapterMetadata.lastUpdated.getTime()) / (1000 * 60);
        
        // Consider metadata fresh if:
        // 1. It's within the normal cache expiry (24 hours), OR
        // 2. It was updated within the last 5 minutes (indicating it came from bundled assets)
        const isFresh = ageHours < this.config.cacheExpiryHours || ageMinutes < 5;
        
        if (isFresh) {
          console.log(`✅ Using cached metadata for ${adapter.resourceId} (age: ${ageMinutes.toFixed(1)} minutes)`);
          
          // Map the metadata to adapter
          this.metadataToAdapter.set(cachedAdapterMetadata.id, adapter);
          return cachedAdapterMetadata;
        } else {
          console.log(`⚠️ Cached metadata for ${adapter.resourceId} is stale (age: ${ageHours.toFixed(1)} hours), fetching fresh...`);
        }
      }

      // Step 2: Try to fetch fresh metadata from the specific adapter
      
      
      try {
        const freshAdapterMetadata = await this.fetchWithRetry(
          () => adapter.getResourceMetadata(server, owner, language),
          `${adapter.resourceType} metadata`
        );
        
        // Check if we have better TOC data in cached metadata
        let tocToUse = freshAdapterMetadata.toc || {};
        if (cachedAdapterMetadata && cachedAdapterMetadata.toc?.books && cachedAdapterMetadata.toc.books.length > 0) {
          const freshBookCount = freshAdapterMetadata.toc?.books?.length || 0;
          const cachedBookCount = cachedAdapterMetadata.toc.books.length;
          
          if (cachedBookCount > freshBookCount) {
            
            tocToUse = cachedAdapterMetadata.toc;
          }
        }
        
        // Convert to full ResourceMetadata format
        const fullMetadata: ResourceMetadata = {
          id: freshAdapterMetadata.id, // Use the actual resource ID from the adapter (ult, glt, ulb)
          server,
          owner,
          language,
          type: adapter.resourceType,
          title: freshAdapterMetadata.title,
          description: freshAdapterMetadata.description || '',
          name: `${adapter.resourceType}-${language}`,
          version: freshAdapterMetadata.version,
          lastUpdated: new Date(),
          available: freshAdapterMetadata.available,
          toc: tocToUse,
          isAnchor: false // Will be set by ResourceConfigProcessor if needed
        };
        
        
        
        // Map the metadata to adapter
        this.metadataToAdapter.set(fullMetadata.id, adapter);
        
        // Save to storage
        await this.storageAdapter!.saveResourceMetadata([fullMetadata]);
        
        
        return fullMetadata;
        
      } catch (fetchError) {
        // Step 3: Fallback to stale cached data if fetch fails
        if (cachedAdapterMetadata) {
          
          
          // Update the stale metadata with fresh timestamp
          const refreshedMetadata: ResourceMetadata = {
            ...cachedAdapterMetadata,
            lastUpdated: new Date() // Refresh timestamp to prevent future staleness
          };
          
          // Map the metadata to adapter
          this.metadataToAdapter.set(refreshedMetadata.id, adapter);
          
          // Save refreshed metadata to storage
          await this.storageAdapter!.saveResourceMetadata([refreshedMetadata]);
          
          
          return refreshedMetadata;
        } else {
          // No cached data available, re-throw the error
          console.error(`❌ No cached fallback available for ${adapter.resourceId}`);
          throw fetchError;
        }
      }
    } catch (error) {
      console.error(`❌ Failed to get metadata for adapter ${adapter.resourceId}:`, error);
      return null;
    }
  }

  /**
   * Register metadata-to-adapter mapping for resources processed externally
   * This is used when ResourceConfigProcessor fetches metadata directly from adapters
   */
  registerMetadataMapping(metadata: ResourceMetadata, adapter: ResourceAdapter): void {
    this.metadataToAdapter.set(metadata.id, adapter);
    
  }

  /**
   * Get or fetch content (main orchestration method)
   * Implements the core caching strategy: Storage -> Adapter -> Save
   */
  async getOrFetchContent(key: string, resourceType: ResourceType): Promise<ProcessedContent | null> {
    this.ensureInitialized();
    
    
    
    try {
      // Step 1: Check if content exists in storage
      
      const cachedContent = await this.storageAdapter!.getResourceContent(key);
    
      // If offline mode is enabled, return only cached content
      if (this.offlineMode) {
        if (cachedContent) {
          console.log(`🔌 Offline mode: Using cached content for ${key}`);
          return cachedContent.content;
        } else {
          console.warn(`🔌 Offline mode: No cached content found for ${key}`);
          return null;
        }
      }
      
      if (cachedContent && !this.isExpired(cachedContent)) {
        // Step 1.5: SHA-aware change detection optimization
        const resourceAdapter = this.resourceAdapters.find(adapter => adapter.resourceType === resourceType);
        if (resourceAdapter?.hasContentChanged && resourceAdapter.getCurrentSha) {
          const { server, owner, language, contentId } = this.parseKey(key);
          
          try {
            const hasChanged = await resourceAdapter.hasContentChanged(server, owner, language, contentId, cachedContent.sourceSha);
            
            if (!hasChanged) {
              
              return cachedContent.content;
            } else {
              
            }
          } catch (error) {
            console.warn(`⚠️ SHA check failed, using cached content:`, error);
            return cachedContent.content;
          }
        } else {

          return cachedContent.content;
        }
      }
      
      if (cachedContent) {
        
      } else {
        
      }
      
      // Step 2: Use appropriate resource adapter to fetch from external source
      const parsedKey = this.parseKey(key);
      
      
      // Find the adapter that produced this resource's metadata
      let resourceAdapter = this.metadataToAdapter.get(parsedKey.resourceId);
      
      
      // Fallback to finding by resource type if no specific mapping exists
      if (!resourceAdapter) {
        
        
        // First try to find an adapter whose resourceId matches the parsed resourceId
        resourceAdapter = this.resourceAdapters.find(adapter => 
          adapter.resourceType === resourceType && adapter.resourceId === parsedKey.resourceId
        );
        
        // If still not found, try to find an adapter whose resourcePriority includes the resourceId
        if (!resourceAdapter) {
          resourceAdapter = this.resourceAdapters.find(adapter => 
            adapter.resourceType === resourceType && 
            (adapter as any).resourcePriority?.includes(parsedKey.resourceId)
          );
        }
        
        // NO FINAL FALLBACK - each adapter should only handle its own resource types
        if (resourceAdapter) {
          
        } else {
          
        }
      } else {
        
      }
      
      if (!resourceAdapter) {
        const availableAdapters = this.resourceAdapters
          .filter(adapter => adapter.resourceType === resourceType)
          .map(adapter => `${adapter.resourceId} (${(adapter as any)?.resourcePriority?.join(', ') || 'unknown'})`)
          .join(', ');
        
        throw new ResourceError(
          `No compatible adapter found for resourceId '${parsedKey.resourceId}' with resourceType '${resourceType}'. ` +
          `Available adapters: ${availableAdapters}`, 
          'ADAPTER_NOT_FOUND'
        );
      }
      
      // Step 3: Try to fetch and process content with retry logic
      try {
        const processedContent = await this.fetchContentWithRetry(resourceAdapter, key);
        
        // Step 4: Validate content if enabled
        if (this.config.enableContentValidation) {
          this.validateContent(processedContent, key);
        }
        
        // Step 5: Save to storage for offline use (with SHA information)
        const { server, owner, language, resourceId, contentId } = parsedKey;
        const currentSha = resourceAdapter.getCurrentSha?.(server, owner, language, contentId);
        
        // Use the resourceId from the parsed key since we already have the correct adapter
        const actualResourceId = resourceId;
        
        const contentToSave: ResourceContent = {
          key,
          resourceKey: `${server}/${owner}/${language}/${actualResourceId}`,
          resourceId: actualResourceId, // Use the actual resource ID from metadata (ult, glt, ulb)
          server,
          owner,
          language,
          type: resourceType,
          bookCode: resourceAdapter.organizationType === 'book' ? contentId : undefined,
          articleId: resourceAdapter.organizationType === 'entry' ? contentId : undefined,
          content: processedContent,
          lastFetched: new Date(),
          cachedUntil: this.calculateCacheExpiry(),
          checksum: this.calculateChecksum(processedContent),
          size: this.calculateContentSize(processedContent),
          // SHA-based change detection
          sourceSha: currentSha,
          sourceCommit: (processedContent as { metadata?: { sourceCommit?: string } }).metadata?.sourceCommit
        };
        
        await this.storageAdapter!.saveResourceContent(contentToSave);
        return processedContent;
        
      } catch (fetchError) {
        // Step 3.5: Fallback to stale cached content if fetch fails
        if (cachedContent) {
          
          
          // Update the stale content with fresh timestamps
          const refreshedContent: ResourceContent = {
            ...cachedContent,
            lastFetched: new Date(),
            cachedUntil: this.calculateCacheExpiry()
          };
          
          // Save refreshed content to storage
          await this.storageAdapter!.saveResourceContent(refreshedContent);
          
          
          return cachedContent.content;
        } else {
          // No cached data available, re-throw the error
          console.error(`❌ No cached fallback available for ${key}`);
          throw fetchError;
        }
      }
      
    } catch (error) {
      // Final fallback to cached content if available, even if expired
      const finalCachedContent = await this.storageAdapter!.getResourceContent(key);
      if (finalCachedContent) {
        console.warn(`⚠️ Using final expired cache fallback for ${key} due to error, refreshing timestamps:`, error);
        
        // Update the expired content with fresh timestamps
        const refreshedContent: ResourceContent = {
          ...finalCachedContent,
          lastFetched: new Date(),
          cachedUntil: this.calculateCacheExpiry()
        };
        
        // Save refreshed content to storage
        await this.storageAdapter!.saveResourceContent(refreshedContent);
        
        
        return finalCachedContent.content;
      }
      
      console.error(`❌ Failed to get content for ${key}:`, error);
      throw error;
    }
  }

  /**
   * Preload multiple content items (batch operation)
   */
  async preloadContent(keys: string[], resourceType: ResourceType): Promise<void> {
    
    
    const promises = keys.map(key => 
      this.getOrFetchContent(key, resourceType).catch(error => {
        console.warn(`⚠️ Failed to preload ${key}:`, error);
        return null;
      })
    );
    
    await Promise.all(promises);
    
  }

  /**
   * Clear expired content from storage
   */
  async clearExpiredContent(): Promise<void> {
    this.ensureInitialized();
    await this.storageAdapter!.clearExpiredContent();
    
  }

  /**
   * Invalidate specific content from cache
   */
  async invalidateCache(key: string): Promise<void> {
    this.ensureInitialized();
    
    // For now, we'll implement this by deleting the content
    // In a full implementation, we could mark it as invalid
    const transaction = await this.storageAdapter!.beginTransaction();
    await transaction.delete(key);
    await transaction.commit();
    
    
  }

  /**
   * Get storage information
   */
  async getStorageInfo(): Promise<StorageInfo> {
    this.ensureInitialized();
    return await this.storageAdapter!.getStorageInfo();
  }

  // ============================================================================
  // PRIVATE HELPER METHODS
  // ============================================================================

  private ensureInitialized(): void {
    if (!this.isInitialized || !this.storageAdapter) {
      throw new ResourceError('ResourceManager not initialized', 'NOT_INITIALIZED');
    }
  }

  private async fetchContentWithRetry(adapter: ResourceAdapter, key: string): Promise<ProcessedContent> {
    const config = this.getAdapterConfig(adapter);
    let lastError: Error;
    
    for (let attempt = 1; attempt <= config.retryAttempts; attempt++) {
      try {
        const { server, owner, language, contentId } = this.parseKey(key);
        
        
        
        // Use appropriate method based on organization type
        if (adapter.organizationType === 'book') {
          const bookAdapter = adapter as BookOrganizedAdapter;
          const bookContent = await this.timeoutPromise(
            bookAdapter.getBookContent(server, owner, language, contentId),
            config.timeout || this.config.defaultTimeout
          );
          
          // Wrap the book content in ProcessedContent structure based on resource type
          return this.wrapBookContent(bookContent, adapter.resourceType);
        } else {
          const entryAdapter = adapter as EntryOrganizedAdapter;
          return await this.timeoutPromise(
            entryAdapter.getEntryContent(server, owner, language, contentId),
            config.timeout || this.config.defaultTimeout
          );
        }
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ Attempt ${attempt} failed:`, error);
        
        if (attempt < config.retryAttempts) {
          const delay = config.retryDelay * attempt; // Exponential backoff
          
          await this.delay(delay);
        }
      }
    }
    
    throw new ResourceError(`Failed to fetch ${key} after ${config.retryAttempts} attempts: ${lastError!.message}`, 'FETCH_FAILED');
  }

  private async fetchWithRetry<T>(operation: () => Promise<T>, description: string): Promise<T> {
    let lastError: Error;
    
    for (let attempt = 1; attempt <= this.config.maxRetryAttempts; attempt++) {
      try {
        return await this.timeoutPromise(operation(), this.config.defaultTimeout);
      } catch (error) {
        lastError = error as Error;
        console.warn(`⚠️ ${description} attempt ${attempt} failed:`, error);
        
        if (attempt < this.config.maxRetryAttempts) {
          await this.delay(this.config.retryDelay * attempt);
        }
      }
    }
    
    throw new ResourceError(`Failed ${description} after ${this.config.maxRetryAttempts} attempts: ${lastError!.message}`, 'FETCH_FAILED');
  }

  private parseKey(key: string): { server: string; owner: string; language: string; resourceId: string; contentId: string } {
    // Parse key format: {server}/{owner}/{language}/{resourceId}/{content_id}
    const parts = key.split('/');
    if (parts.length < 5) {
      throw new ResourceError(`Invalid key format: ${key}`, 'INVALID_KEY');
    }
    
    const server = parts[0];
    const owner = parts[1];
    const language = parts[2];
    const resourceId = parts[3];
    
    // For academy resources (ta) and translation words (tw), the contentId includes the category and article
    // e.g., git.door43.org/unfoldingWord/en/ta/translate/figs-abstractnouns
    // contentId should be "translate/figs-abstractnouns"
    // e.g., git.door43.org/unfoldingWord/en/tw/bible/other/cry
    // contentId should be "bible/other/cry"
    let contentId: string;
    if ((resourceId === 'ta' || resourceId === 'tw') && parts.length >= 6) {
      // Academy/Words resource: join remaining parts as category/article-id
      contentId = parts.slice(4).join('/');
    } else {
      // Book-based resource: just the book code
      contentId = parts[4];
    }
    
    return {
      server,
      owner,
      language,
      resourceId,
      contentId
    };
  }

  private getAdapterConfig(adapter: ResourceAdapter): AdapterConfig & { retryAttempts: number; timeout: number; retryDelay: number } {
    // Get adapter's configuration or use defaults
    return {
      timeout: this.config.defaultTimeout,
      retryAttempts: this.config.maxRetryAttempts,
      retryDelay: this.config.retryDelay,
      fallbackOptions: [],
      processingCapabilities: []
    };
  }

  private isExpired(content: ResourceContent): boolean {
    if (!content.cachedUntil) return false;
    return Date.now() > content.cachedUntil.getTime();
  }

  private calculateCacheExpiry(): Date {
    return new Date(Date.now() + (this.config.cacheExpiryHours * 60 * 60 * 1000));
  }

  private calculateChecksum(content: ProcessedContent): string {
    // Simple checksum based on content size and structure
    const contentStr = JSON.stringify(content);
    let hash = 0;
    for (let i = 0; i < contentStr.length; i++) {
      const char = contentStr.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash).toString(16);
  }

  private calculateContentSize(content: ProcessedContent): number {
    return JSON.stringify(content).length;
  }

  private validateContent(content: ProcessedContent, key: string): void {
    if (!content) {
      throw new ResourceError(`Content is null or undefined for ${key}`, 'INVALID_CONTENT');
    }
    
    // Basic validation - ensure content has expected structure
    if (typeof content !== 'object') {
      throw new ResourceError(`Content is not an object for ${key}`, 'INVALID_CONTENT');
    }
    
    
  }

  /**
   * Wrap book-organized content into ProcessedContent structure
   */
  private wrapBookContent(bookContent: any, resourceType: ResourceType): ProcessedContent {
    switch (resourceType) {
      case ResourceType.NOTES:
        // bookContent is ProcessedNotes from Door43NotesAdapter
        return { notes: bookContent };
      
      case ResourceType.SCRIPTURE:
        // bookContent is ProcessedScripture (OptimizedScripture)
        return { chapters: bookContent.chapters };
      
      case ResourceType.QUESTIONS:
        // bookContent is ProcessedQuestions
        return { questions: bookContent };
      
      case ResourceType.WORDS_LINKS:
        // bookContent is ProcessedWordsLinks
        return { wordsLinks: bookContent };
      
      default:
        // For unknown types, return as-is (might be already ProcessedContent)
        console.warn(`Unknown resource type for book content wrapping: ${resourceType}`);
        return bookContent as ProcessedContent;
    }
  }

  private async timeoutPromise<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });
    
    return Promise.race([promise, timeoutPromise]);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Export factory function for easy instantiation
export const createResourceManager = (): ResourceManager => {
  return new ResourceManagerImpl();
};
