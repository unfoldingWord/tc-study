/**
 * SQLite Package Storage Adapter
 * 
 * Native platform implementation of PackageStorageAdapter using SQLite.
 * Uses DatabaseManager and Drizzle ORM for data persistence.
 */

import { eq } from 'drizzle-orm';
import { DatabaseManager } from '../../../db/DatabaseManager';
import { appSettings, panelLayouts, resourcePackages } from '../../../db/schema/packages';
import { passageSets } from '../../../db/schema/passage-sets';
import { PassageSet } from '../../types/passage-sets';
import {
  PackageStorageAdapter,
  PanelLayout,
  ResourcePackage
} from '../../types/resource-package';

export class SQLitePackageStorageAdapter implements PackageStorageAdapter {
  private dbManager: DatabaseManager;
  private isInitialized = false;
  
  constructor() {
    this.dbManager = DatabaseManager.getInstance();
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    // Database is initialized globally, just ensure tables exist
    const db = this.dbManager.getDb();
    if (!db) {
      throw new Error('DatabaseManager not initialized');
    }
    
    this.isInitialized = true;
    console.log('✅ SQLitePackageStorageAdapter initialized');
  }
  
  // ============================================================================
  // PACKAGE CRUD
  // ============================================================================
  
  async savePackage(pkg: ResourcePackage): Promise<void> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
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
      isActive: false, // Will be set via setActivePackageId
      totalSize: pkg.totalSize,
      downloadedAt: pkg.downloadedAt ? Math.floor(pkg.downloadedAt.getTime() / 1000) : undefined,
      createdAt: Math.floor(pkg.createdAt.getTime() / 1000),
      updatedAt: Math.floor(pkg.updatedAt.getTime() / 1000)
    };
    
    // Upsert (insert or update)
    await db
      .insert(resourcePackages)
      .values(packageData)
      .onConflictDoUpdate({
        target: resourcePackages.id,
        set: packageData
      });
    
    console.log(`💾 Package saved: ${pkg.name}`);
  }
  
  async getPackage(id: string): Promise<ResourcePackage | null> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    const result = await db
      .select()
      .from(resourcePackages)
      .where(eq(resourcePackages.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    return this.deserializePackage(result[0]);
  }
  
  async getAllPackages(): Promise<ResourcePackage[]> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    const results = await db.select().from(resourcePackages);
    
    return results.map(row => this.deserializePackage(row));
  }
  
  async deletePackage(id: string): Promise<void> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    await db.delete(resourcePackages).where(eq(resourcePackages.id, id));
    
    console.log(`🗑️ Package deleted: ${id}`);
  }
  
  // ============================================================================
  // ACTIVE PACKAGE MANAGEMENT
  // ============================================================================
  
  async setActivePackageId(id: string): Promise<void> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    // First, set all packages to inactive
    await db.update(resourcePackages).set({ isActive: false });
    
    // Then set the specified package to active
    await db
      .update(resourcePackages)
      .set({ isActive: true })
      .where(eq(resourcePackages.id, id));
    
    // Also store in app_settings for quick lookup
    await db
      .insert(appSettings)
      .values({
        key: 'active_package_id',
        value: id,
        updatedAt: Math.floor(Date.now() / 1000)
      })
      .onConflictDoUpdate({
        target: appSettings.key,
        set: {
          value: id,
          updatedAt: Math.floor(Date.now() / 1000)
        }
      });
    
    console.log(`✅ Active package set: ${id}`);
  }
  
  async getActivePackageId(): Promise<string | null> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    // Try app_settings first (faster)
    const settingResult = await db
      .select()
      .from(appSettings)
      .where(eq(appSettings.key, 'active_package_id'))
      .limit(1);
    
    if (settingResult.length > 0) {
      return settingResult[0].value;
    }
    
    // Fall back to finding isActive package
    const packageResult = await db
      .select()
      .from(resourcePackages)
      .where(eq(resourcePackages.isActive, true))
      .limit(1);
    
    return packageResult.length > 0 ? packageResult[0].id : null;
  }
  
  // ============================================================================
  // PANEL LAYOUT PERSISTENCE
  // ============================================================================
  
  async savePanelLayout(packageId: string, layout: PanelLayout): Promise<void> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    // Save as non-default layout
    await db
      .insert(panelLayouts)
      .values({
        packageId,
        layoutData: JSON.stringify(layout),
        isDefault: false,
        updatedAt: Math.floor(Date.now() / 1000)
      });
    
    console.log(`💾 Panel layout saved for package: ${packageId}`);
  }
  
  async getPanelLayout(packageId: string): Promise<PanelLayout | null> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    // Get the most recent layout for this package
    const result = await db
      .select()
      .from(panelLayouts)
      .where(eq(panelLayouts.packageId, packageId))
      .orderBy(panelLayouts.updatedAt)
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    return JSON.parse(result[0].layoutData);
  }
  
  // ============================================================================
  // PASSAGE SETS
  // ============================================================================
  
  async savePassageSet(set: PassageSet): Promise<void> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    const setData = {
      id: set.id,
      name: set.name,
      description: set.description,
      version: set.version,
      source: 'imported',  // Default to imported
      sourceUrl: undefined,
      data: JSON.stringify(set),
      metadata: set.metadata ? JSON.stringify(set.metadata) : undefined,
      passageCount: set.metadata?.passageCount,
      createdAt: Math.floor(new Date(set.createdAt).getTime() / 1000),
      updatedAt: Math.floor(new Date(set.updatedAt).getTime() / 1000)
    };
    
    await db
      .insert(passageSets)
      .values(setData)
      .onConflictDoUpdate({
        target: passageSets.id,
        set: setData
      });
    
    console.log(`💾 Passage set saved: ${set.name}`);
  }
  
  async getPassageSet(id: string): Promise<PassageSet | null> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    const result = await db
      .select()
      .from(passageSets)
      .where(eq(passageSets.id, id))
      .limit(1);
    
    if (result.length === 0) {
      return null;
    }
    
    return JSON.parse(result[0].data);
  }
  
  async getAllPassageSets(): Promise<PassageSet[]> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    const results = await db.select().from(passageSets);
    
    return results.map(row => JSON.parse(row.data));
  }
  
  async deletePassageSet(id: string): Promise<void> {
    await this.initialize();
    const db = this.dbManager.getDb();
    
    await db.delete(passageSets).where(eq(passageSets.id, id));
    
    console.log(`🗑️ Passage set deleted: ${id}`);
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Deserialize package from database row
   */
  private deserializePackage(row: any): ResourcePackage {
    return {
      id: row.id,
      name: row.name,
      description: row.description,
      version: row.version,
      source: row.source,
      createdAt: new Date(row.createdAt * 1000),
      updatedAt: new Date(row.updatedAt * 1000),
      config: JSON.parse(row.config),
      resources: JSON.parse(row.resources),
      panelLayout: JSON.parse(row.panelLayout),
      passageSetIds: row.passageSetIds ? JSON.parse(row.passageSetIds) : undefined,
      metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
      status: row.status,
      downloadedAt: row.downloadedAt ? new Date(row.downloadedAt * 1000) : undefined,
      totalSize: row.totalSize
    };
  }
}

/**
 * Factory function
 */
export function createSQLitePackageStorage(): PackageStorageAdapter {
  return new SQLitePackageStorageAdapter();
}



