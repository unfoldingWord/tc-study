/**
 * IndexedDB Package Storage Adapter
 * 
 * Web platform implementation of PackageStorageAdapter using IndexedDB.
 * Mirrors SQLite structure for cross-platform compatibility.
 */

import { PassageSet } from '../../types/passage-sets';
import {
  PackageStorageAdapter,
  PanelLayout,
  ResourcePackage
} from '../../types/resource-package';

const DB_NAME = 'bt-synergy-packages';
const DB_VERSION = 1;

const STORES = {
  PACKAGES: 'resource_packages',
  LAYOUTS: 'panel_layouts',
  PASSAGE_SETS: 'passage_sets',
  SETTINGS: 'app_settings'
};

export class IndexedDBPackageStorageAdapter implements PackageStorageAdapter {
  private db: IDBDatabase | null = null;
  private isInitialized = false;
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      
      request.onerror = () => {
        console.error('❌ Failed to open IndexedDB for packages:', request.error);
        reject(new Error(`Failed to open IndexedDB: ${request.error?.message}`));
      };
      
      request.onsuccess = () => {
        this.db = request.result;
        this.isInitialized = true;
        console.log('✅ IndexedDBPackageStorageAdapter initialized');
        resolve();
      };
      
      request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        this.createObjectStores(db);
      };
    });
  }
  
  private createObjectStores(db: IDBDatabase): void {
    // Resource packages store
    if (!db.objectStoreNames.contains(STORES.PACKAGES)) {
      const packageStore = db.createObjectStore(STORES.PACKAGES, { keyPath: 'id' });
      packageStore.createIndex('source', 'source', { unique: false });
      packageStore.createIndex('status', 'status', { unique: false });
      packageStore.createIndex('isActive', 'isActive', { unique: false });
    }
    
    // Panel layouts store
    if (!db.objectStoreNames.contains(STORES.LAYOUTS)) {
      const layoutStore = db.createObjectStore(STORES.LAYOUTS, { autoIncrement: true });
      layoutStore.createIndex('packageId', 'packageId', { unique: false });
    }
    
    // Passage sets store
    if (!db.objectStoreNames.contains(STORES.PASSAGE_SETS)) {
      const passageSetStore = db.createObjectStore(STORES.PASSAGE_SETS, { keyPath: 'id' });
      passageSetStore.createIndex('source', 'source', { unique: false });
    }
    
    // App settings store
    if (!db.objectStoreNames.contains(STORES.SETTINGS)) {
      db.createObjectStore(STORES.SETTINGS, { keyPath: 'key' });
    }
  }
  
  // ============================================================================
  // PACKAGE CRUD
  // ============================================================================
  
  async savePackage(pkg: ResourcePackage): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PACKAGES], 'readwrite');
      const store = transaction.objectStore(STORES.PACKAGES);
      
      const packageData = {
        id: pkg.id,
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        source: pkg.source,
        config: JSON.stringify(pkg.config),
        resources: JSON.stringify(pkg.resources),
        panelLayout: JSON.stringify(pkg.panelLayout),
        passageSetIds: pkg.passageSetIds ? JSON.stringify(pkg.passageSetIds) : undefined,
        metadata: pkg.metadata ? JSON.stringify(pkg.metadata) : undefined,
        status: pkg.status,
        isActive: false,
        totalSize: pkg.totalSize,
        downloadedAt: pkg.downloadedAt?.getTime(),
        createdAt: pkg.createdAt.getTime(),
        updatedAt: pkg.updatedAt.getTime()
      };
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        console.log(`💾 Package saved: ${pkg.name}`);
        resolve();
      };
      
      store.put(packageData);
    });
  }
  
  async getPackage(id: string): Promise<ResourcePackage | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PACKAGES], 'readonly');
      const store = transaction.objectStore(STORES.PACKAGES);
      const request = store.get(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        resolve(this.deserializePackage(request.result));
      };
    });
  }
  
  async getAllPackages(): Promise<ResourcePackage[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PACKAGES], 'readonly');
      const store = transaction.objectStore(STORES.PACKAGES);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const packages = request.result.map(row => this.deserializePackage(row));
        resolve(packages);
      };
    });
  }
  
  async deletePackage(id: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PACKAGES], 'readwrite');
      const store = transaction.objectStore(STORES.PACKAGES);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        console.log(`🗑️ Package deleted: ${id}`);
        resolve();
      };
      
      store.delete(id);
    });
  }
  
  // ============================================================================
  // ACTIVE PACKAGE MANAGEMENT
  // ============================================================================
  
  async setActivePackageId(id: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PACKAGES, STORES.SETTINGS], 'readwrite');
      const packageStore = transaction.objectStore(STORES.PACKAGES);
      const settingsStore = transaction.objectStore(STORES.SETTINGS);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        console.log(`✅ Active package set: ${id}`);
        resolve();
      };
      
      // Update all packages to inactive
      const getAllRequest = packageStore.getAll();
      getAllRequest.onsuccess = () => {
        const packages = getAllRequest.result;
        packages.forEach(pkg => {
          pkg.isActive = pkg.id === id;
          packageStore.put(pkg);
        });
      };
      
      // Store in settings
      settingsStore.put({
        key: 'active_package_id',
        value: id,
        updatedAt: Date.now()
      });
    });
  }
  
  async getActivePackageId(): Promise<string | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.SETTINGS], 'readonly');
      const store = transaction.objectStore(STORES.SETTINGS);
      const request = store.get('active_package_id');
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        resolve(request.result?.value || null);
      };
    });
  }
  
  // ============================================================================
  // PANEL LAYOUT PERSISTENCE
  // ============================================================================
  
  async savePanelLayout(packageId: string, layout: PanelLayout): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.LAYOUTS], 'readwrite');
      const store = transaction.objectStore(STORES.LAYOUTS);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        console.log(`💾 Panel layout saved for package: ${packageId}`);
        resolve();
      };
      
      store.add({
        packageId,
        layoutData: JSON.stringify(layout),
        isDefault: false,
        updatedAt: Date.now()
      });
    });
  }
  
  async getPanelLayout(packageId: string): Promise<PanelLayout | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.LAYOUTS], 'readonly');
      const store = transaction.objectStore(STORES.LAYOUTS);
      const index = store.index('packageId');
      const request = index.getAll(packageId);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const layouts = request.result;
        if (layouts.length === 0) {
          resolve(null);
          return;
        }
        
        // Get the most recent layout
        const latest = layouts.sort((a, b) => b.updatedAt - a.updatedAt)[0];
        resolve(JSON.parse(latest.layoutData));
      };
    });
  }
  
  // ============================================================================
  // PASSAGE SETS
  // ============================================================================
  
  async savePassageSet(set: PassageSet): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PASSAGE_SETS], 'readwrite');
      const store = transaction.objectStore(STORES.PASSAGE_SETS);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        console.log(`💾 Passage set saved: ${set.name}`);
        resolve();
      };
      
      store.put({
        id: set.id,
        name: set.name,
        description: set.description,
        version: set.version,
        source: 'imported',
        data: JSON.stringify(set),
        metadata: set.metadata ? JSON.stringify(set.metadata) : undefined,
        passageCount: set.metadata?.passageCount,
        createdAt: new Date(set.createdAt).getTime(),
        updatedAt: new Date(set.updatedAt).getTime()
      });
    });
  }
  
  async getPassageSet(id: string): Promise<PassageSet | null> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PASSAGE_SETS], 'readonly');
      const store = transaction.objectStore(STORES.PASSAGE_SETS);
      const request = store.get(id);
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        if (!request.result) {
          resolve(null);
          return;
        }
        resolve(JSON.parse(request.result.data));
      };
    });
  }
  
  async getAllPassageSets(): Promise<PassageSet[]> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PASSAGE_SETS], 'readonly');
      const store = transaction.objectStore(STORES.PASSAGE_SETS);
      const request = store.getAll();
      
      request.onerror = () => reject(request.error);
      request.onsuccess = () => {
        const sets = request.result.map(row => JSON.parse(row.data));
        resolve(sets);
      };
    });
  }
  
  async deletePassageSet(id: string): Promise<void> {
    await this.initialize();
    if (!this.db) throw new Error('Database not initialized');
    
    return new Promise((resolve, reject) => {
      const transaction = this.db!.transaction([STORES.PASSAGE_SETS], 'readwrite');
      const store = transaction.objectStore(STORES.PASSAGE_SETS);
      
      transaction.onerror = () => reject(transaction.error);
      transaction.oncomplete = () => {
        console.log(`🗑️ Passage set deleted: ${id}`);
        resolve();
      };
      
      store.delete(id);
    });
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Deserialize package from IndexedDB entry
   */
  private deserializePackage(row: any): ResourcePackage {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      source: row.source,
      createdAt: new Date(row.createdAt),
      updatedAt: new Date(row.updatedAt),
      config: JSON.parse(row.config),
      resources: JSON.parse(row.resources),
      panelLayout: JSON.parse(row.panelLayout),
      passageSetIds: row.passageSetIds ? JSON.parse(row.passageSetIds) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      status: row.status,
      downloadedAt: row.downloadedAt ? new Date(row.downloadedAt) : undefined,
      totalSize: row.totalSize
    };
  }
}

/**
 * Factory function
 */
export function createIndexedDBPackageStorage(): PackageStorageAdapter {
  return new IndexedDBPackageStorageAdapter();
}



