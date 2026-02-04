/**
 * Storage Service for Workspace Database
 * 
 * Provides storage functionality for the main workspace database.
 * Used by components that need storage access outside of WorkspaceContext
 * but want to store data in the same database as the main app.
 * 
 * Uses platform-specific storage (SQLite on native, IndexedDB on web).
 */

import { ResourceContent, ResourceMetadata, StorageAdapter } from '../../types/context';
import { createPlatformStorageAdapter } from './PlatformStorageFactory';

class StorageService {
  private storageAdapter: StorageAdapter | null = null;
  private initPromise: Promise<void> | null = null;

  async initialize(): Promise<void> {
    if (this.initPromise) {
      return this.initPromise;
    }

    this.initPromise = this._initialize();
    return this.initPromise;
  }

  private async _initialize(): Promise<void> {
    if (this.storageAdapter) {
      return;
    }

    
    this.storageAdapter = createPlatformStorageAdapter();
    if ('initialize' in this.storageAdapter && typeof this.storageAdapter.initialize === 'function') {
      await this.storageAdapter.initialize();
    }
    
  }

  async saveResourceMetadata(metadata: ResourceMetadata): Promise<void> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.saveResourceMetadata(metadata);
  }

  async saveResourceContent(content: ResourceContent): Promise<void> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.saveResourceContent(content);
  }

  async getExistingResourceKeys(): Promise<string[]> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getAllResourceKeys();
  }

  async getExistingContentKeys(): Promise<string[]> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getAllContentKeys();
  }

  async getExistingMetadataWithVersions(): Promise<Map<string, {version: string, lastUpdated: Date}>> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getMetadataVersions();
  }

  async getResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getResourceMetadata(server, owner, language);
  }

  async getResourceContent(key: string): Promise<ResourceContent | null> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getResourceContent(key);
  }

  async listResourceMetadata(server: string, owner: string, language: string): Promise<ResourceMetadata[]> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getResourceMetadata(server, owner, language);
  }

  async deleteResource(resourceKey: string): Promise<void> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    // Not directly available in StorageAdapter interface
    console.warn('deleteResource not implemented in current adapter');
  }

  async clearAllData(): Promise<void> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    await this.storageAdapter.clearAllContent();
  }

  async getStorageInfo(): Promise<any> {
    await this.initialize();
    if (!this.storageAdapter) {
      throw new Error('Storage adapter not initialized');
    }
    return this.storageAdapter.getStorageInfo();
  }
}

// Singleton instance
const storageService = new StorageService();

export { storageService };
export type { ResourceContent, ResourceMetadata };

