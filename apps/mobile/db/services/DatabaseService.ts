/**
 * Database Service - High-level database operations
 * Provides convenient methods for common database operations
 */

import { eq } from 'drizzle-orm';
import { DatabaseManager } from '../DatabaseManager';
import { users, workspaces, resources, settings } from '../schema';

export class DatabaseService {
  private databaseManager: DatabaseManager;

  constructor() {
    this.databaseManager = DatabaseManager.getInstance();
  }

  /**
   * Get database instance
   */
  private getDb() {
    return this.databaseManager.getDb();
  }

  // User operations
  async createUser(userData: {
    username: string;
    email?: string;
    displayName?: string;
    avatar?: string;
    preferences?: Record<string, any>;
  }) {
    const db = this.getDb();
    return await db.insert(users).values({
      ...userData,
      preferences: userData.preferences ? JSON.stringify(userData.preferences) : null,
    }).returning();
  }

  async getUserById(id: number) {
    const db = this.getDb();
    return await db.select().from(users).where(eq(users.id, id)).limit(1);
  }

  async getUserByUsername(username: string) {
    const db = this.getDb();
    return await db.select().from(users).where(eq(users.username, username)).limit(1);
  }

  // Workspace operations
  async createWorkspace(workspaceData: {
    name: string;
    description?: string;
    ownerId: number;
    isDefault?: boolean;
    settings?: Record<string, any>;
  }) {
    const db = this.getDb();
    return await db.insert(workspaces).values({
      ...workspaceData,
      settings: workspaceData.settings ? JSON.stringify(workspaceData.settings) : null,
    }).returning();
  }

  async getWorkspacesByOwner(ownerId: number) {
    const db = this.getDb();
    return await db.select().from(workspaces).where(eq(workspaces.ownerId, ownerId));
  }

  async getDefaultWorkspace() {
    const db = this.getDb();
    return await db.select().from(workspaces).where(eq(workspaces.isDefault, true)).limit(1);
  }

  // Resource operations
  async createResource(resourceData: {
    workspaceId: number;
    resourceId: string;
    name: string;
    type: string;
    language: string;
    languageDirection?: string;
    version?: string;
    source?: string;
    metadata?: Record<string, any>;
    content?: any;
  }) {
    const db = this.getDb();
    return await db.insert(resources).values({
      ...resourceData,
      metadata: resourceData.metadata ? JSON.stringify(resourceData.metadata) : null,
      content: resourceData.content ? JSON.stringify(resourceData.content) : null,
    }).returning();
  }

  async getResourcesByWorkspace(workspaceId: number) {
    const db = this.getDb();
    return await db.select().from(resources).where(eq(resources.workspaceId, workspaceId));
  }

  async getResourceByResourceId(resourceId: string) {
    const db = this.getDb();
    return await db.select().from(resources).where(eq(resources.resourceId, resourceId)).limit(1);
  }

  async updateResourceLastAccessed(id: number) {
    const db = this.getDb();
    return await db.update(resources)
      .set({ lastAccessed: new Date() })
      .where(eq(resources.id, id));
  }

  // Settings operations
  async setSetting(key: string, value: string, type: string = 'string', category: string = 'general') {
    const db = this.getDb();
    return await db.insert(settings).values({
      key,
      value,
      type,
      category,
    }).onConflictDoUpdate({
      target: settings.key,
      set: { value, updatedAt: new Date() }
    });
  }

  async getSetting(key: string) {
    const db = this.getDb();
    const result = await db.select().from(settings).where(eq(settings.key, key)).limit(1);
    return result[0] || null;
  }

  async getSettingsByCategory(category: string) {
    const db = this.getDb();
    return await db.select().from(settings).where(eq(settings.category, category));
  }

  async getAllSettings() {
    const db = this.getDb();
    return await db.select().from(settings);
  }

  // Utility methods
  async getStats() {
    return await this.databaseManager.getStats();
  }

  async isInitialized() {
    return this.databaseManager.isInitialized();
  }
}

