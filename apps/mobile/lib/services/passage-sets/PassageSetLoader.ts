/**
 * Passage Set Loader
 * 
 * Loads passage sets from various sources:
 * - JSON files (local or imported)
 * - Door43/DCS repositories
 * - Bundled passage sets
 */

import { PassageSet } from '../../types/passage-sets';
import { DCSPassageSetInfo, DCSRepoParams, PackageStorageAdapter } from '../../types/resource-package';
import { getDoor43ApiClient } from '@bt-synergy/door43-api';

/**
 * Passage Set Loader Interface
 */
export interface IPassageSetLoader {
  // Load from JSON
  loadFromJSON(jsonContent: string): Promise<PassageSet>;
  loadFromJSONFile(fileUri: string): Promise<PassageSet>;
  
  // Load from DCS repository
  loadFromDCS(repoParams: DCSRepoParams): Promise<PassageSet>;
  searchDCSPassageSets(owner: string, query?: string): Promise<DCSPassageSetInfo[]>;
  
  // Manage loaded sets
  getLoadedSets(): Promise<PassageSet[]>;
  savePassageSet(set: PassageSet): Promise<void>;
  deleteSet(id: string): Promise<void>;
}

export class PassageSetLoader implements IPassageSetLoader {
  private storageAdapter: PackageStorageAdapter;
  
  constructor(storageAdapter: PackageStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }
  
  // ============================================================================
  // LOAD FROM JSON
  // ============================================================================
  
  /**
   * Load passage set from JSON string
   */
  async loadFromJSON(jsonContent: string): Promise<PassageSet> {
    try {
      const data = JSON.parse(jsonContent);
      
      // Validate structure
      this.validatePassageSet(data);
      
      // Convert date strings to Date objects
      const passageSet: PassageSet = {
        ...data,
        createdAt: typeof data.createdAt === 'string' ? data.createdAt : new Date().toISOString(),
        updatedAt: typeof data.updatedAt === 'string' ? data.updatedAt : new Date().toISOString()
      };
      
      console.log(`✅ Loaded passage set from JSON: ${passageSet.name}`);
      return passageSet;
      
    } catch (error) {
      console.error('❌ Failed to parse passage set JSON:', error);
      throw new Error(`Invalid passage set JSON: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Load passage set from JSON file
   * For React Native, this would use expo-file-system or expo-document-picker
   * For web, this would use File API
   */
  async loadFromJSONFile(fileUri: string): Promise<PassageSet> {
    console.log(`📂 Loading passage set from file: ${fileUri}`);
    
    try {
      // Platform-specific file reading
      let jsonContent: string;
      
      if (typeof window !== 'undefined' && window.fetch) {
        // Web platform - use fetch
        const response = await fetch(fileUri);
        jsonContent = await response.text();
      } else {
        // Native platform - would use expo-file-system
        // For now, throw error indicating file picker needed
        throw new Error('File loading requires file picker UI on native platforms');
      }
      
      return await this.loadFromJSON(jsonContent);
      
    } catch (error) {
      console.error('❌ Failed to load passage set file:', error);
      throw error;
    }
  }
  
  // ============================================================================
  // LOAD FROM DCS (Door43 Content Service)
  // ============================================================================
  
  /**
   * Load passage set from DCS repository
   */
  async loadFromDCS(repoParams: DCSRepoParams): Promise<PassageSet> {
    console.log(`🌐 Loading passage set from DCS: ${repoParams.owner}/${repoParams.repo}`);
    
    try {
      const branch = repoParams.branch || 'master';
      const path = repoParams.path || 'passage-set.json';
      
      // Use Door43ApiClient for content fetching
      const client = getDoor43ApiClient();
      const jsonContent = await client.fetchTextContent(
        repoParams.owner,
        repoParams.repo,
        path,
        branch
      );
      
      const passageSet = await this.loadFromJSON(jsonContent);
      
      // Add source metadata
      (passageSet as any).sourceUrl = `https://${repoParams.server}/${repoParams.owner}/${repoParams.repo}`;
      (passageSet as any).source = 'dcs';
      
      console.log(`✅ Loaded from DCS: ${passageSet.name}`);
      return passageSet;
      
    } catch (error) {
      console.error('❌ Failed to load from DCS:', error);
      throw new Error(`Failed to load from DCS: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }
  
  /**
   * Search for passage sets in DCS
   */
  async searchDCSPassageSets(owner: string, query?: string): Promise<DCSPassageSetInfo[]> {
    console.log(`🔍 Searching DCS passage sets for owner: ${owner}`);
    
    try {
      const client = getDoor43ApiClient();
      const results = await client.searchRepositories(query || 'passage-set', {
        owner,
        limit: 50
      });
      
      // Filter for repositories that likely contain passage sets
      const repos = results.filter((repo: any) =>
        repo.name?.includes('passage') || 
        (repo.metadata?.description || '').includes('passage') ||
        repo.name?.includes('curriculum')
      );
      
      const passageSetInfos: DCSPassageSetInfo[] = repos.map((repo: any) => ({
        id: `dcs-${owner}-${repo.name}`,
        name: repo.name,
        description: repo.metadata?.description || '',
        server: 'git.door43.org',
        owner: repo.owner,
        repo: repo.name,
        path: 'passage-set.json',  // Assume standard location
        fileUrl: `https://git.door43.org/${repo.owner}/${repo.name}`,
        lastUpdated: repo.release?.published_at ? new Date(repo.release.published_at) : undefined
      }));
      
      console.log(`✅ Found ${passageSetInfos.length} potential passage set repositories`);
      return passageSetInfos;
      
    } catch (error) {
      console.error('❌ Failed to search DCS:', error);
      return [];
    }
  }
  
  // ============================================================================
  // MANAGE LOADED SETS
  // ============================================================================
  
  /**
   * Get all loaded passage sets
   */
  async getLoadedSets(): Promise<PassageSet[]> {
    return await this.storageAdapter.getAllPassageSets();
  }
  
  /**
   * Save a passage set
   */
  async savePassageSet(set: PassageSet): Promise<void> {
    await this.storageAdapter.savePassageSet(set);
  }
  
  /**
   * Delete a passage set
   */
  async deleteSet(id: string): Promise<void> {
    await this.storageAdapter.deletePassageSet(id);
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Validate passage set structure
   */
  private validatePassageSet(data: any): void {
    if (!data.id) {
      throw new Error('Passage set must have an id');
    }
    if (!data.name) {
      throw new Error('Passage set must have a name');
    }
    if (!data.version) {
      throw new Error('Passage set must have a version');
    }
    if (!data.root || !Array.isArray(data.root)) {
      throw new Error('Passage set must have a root array');
    }
  }
  
  /**
   * Decode base64 content from DCS API
   */
  private decodeBase64(base64: string): string {
    if (typeof window !== 'undefined' && window.atob) {
      // Browser environment
      return window.atob(base64.replace(/\s/g, ''));
    } else {
      // Node environment (for testing)
      return Buffer.from(base64, 'base64').toString('utf-8');
    }
  }
  
  /**
   * Load bundled passage sets (already included in app)
   */
  async loadBundledSets(): Promise<PassageSet[]> {
    const bundledSets: PassageSet[] = [];
    
    try {
      // Load the bundled new-generations-story-sets
      const newGenSets = await import('../../data/passage-sets/new-generations-story-sets.json');
      bundledSets.push(newGenSets as PassageSet);
      
      console.log(`✅ Loaded ${bundledSets.length} bundled passage sets`);
    } catch (error) {
      console.warn('⚠️ Failed to load bundled passage sets:', error);
    }
    
    return bundledSets;
  }
}

/**
 * Factory function
 */
export function createPassageSetLoader(storageAdapter: PackageStorageAdapter): IPassageSetLoader {
  return new PassageSetLoader(storageAdapter);
}



