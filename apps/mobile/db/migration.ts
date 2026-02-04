/**
 * Data Migration utility for migrating from legacy databases
 * Handles migration of existing data to the new unified database structure
 */

import * as SQLite from 'expo-sqlite';
import { DatabaseManager } from './DatabaseManager';
import { resources, settings, users, workspaces } from './schema';

export class DataMigration {
  private databaseManager: DatabaseManager;

  constructor() {
    this.databaseManager = DatabaseManager.getInstance();
  }

  /**
   * Migrate data from legacy databases if they exist
   */
  public async migrateFromLegacyDatabases(): Promise<void> {
    try {
      // Check if database manager is initialized
      if (!this.databaseManager.isInitialized()) {
        console.log('ℹ️ Database not initialized, skipping migration');
        return;
      }

      console.log('🔄 Checking for legacy databases to migrate...');

      // Check if legacy databases exist and migrate them
      await this.migrateLegacyUserData();
      await this.migrateLegacyWorkspaceData();
      await this.migrateLegacyResourceData();
      await this.migrateLegacySettings();

      console.log('✅ Legacy database migration completed');
    } catch (error) {
      console.warn('Failed to migrate legacy databases:', error);
      // Don't throw here - migration failure shouldn't prevent app startup
    }
  }

  /**
   * Migrate legacy user data
   */
  private async migrateLegacyUserData(): Promise<void> {
    try {
      // Check if legacy user database exists
      const legacyUserDb = await this.openLegacyDatabase('users.db');
      if (!legacyUserDb) return;

      // Check if the current database has the users table
      const currentDb = this.databaseManager.getSqliteDb();
      const tableExists = await currentDb.getFirstAsync(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='users'"
      );
      
      if (!tableExists) {
        console.log('ℹ️ Users table not found in current database, skipping user migration');
        await legacyUserDb.closeAsync();
        return;
      }

      // Get existing users from legacy database
      const legacyUsers = await legacyUserDb.getAllAsync(
        'SELECT * FROM users WHERE 1=1'
      );

      if (legacyUsers && legacyUsers.length > 0) {
        const db = this.databaseManager.getDb();
        
        // Insert users into new database
        for (const legacyUser of legacyUsers) {
          await db.insert(users).values({
            username: legacyUser.username || `user_${legacyUser.id}`,
            email: legacyUser.email,
            displayName: legacyUser.display_name || legacyUser.name,
            avatar: legacyUser.avatar,
            preferences: legacyUser.preferences ? JSON.stringify(legacyUser.preferences) : null,
          }).onConflictDoNothing();
        }

        console.log(`✅ Migrated ${legacyUsers.length} users from legacy database`);
      }

      await legacyUserDb.closeAsync();
    } catch (error) {
      console.warn('Failed to migrate legacy user data:', error);
    }
  }

  /**
   * Migrate legacy workspace data
   */
  private async migrateLegacyWorkspaceData(): Promise<void> {
    try {
      // Check if legacy workspace database exists
      const legacyWorkspaceDb = await this.openLegacyDatabase('workspaces.db');
      if (!legacyWorkspaceDb) return;

      

      // Get existing workspaces from legacy database
      const legacyWorkspaces = await legacyWorkspaceDb.getAllAsync(
        'SELECT * FROM workspaces WHERE 1=1'
      );

      if (legacyWorkspaces && legacyWorkspaces.length > 0) {
        const db = this.databaseManager.getDb();
        
        // Insert workspaces into new database
        for (const legacyWorkspace of legacyWorkspaces) {
          await db.insert(workspaces).values({
            name: legacyWorkspace.name || 'Default Workspace',
            description: legacyWorkspace.description,
            ownerId: legacyWorkspace.owner_id || 1, // Default to first user
            isDefault: legacyWorkspace.is_default || false,
            settings: legacyWorkspace.settings ? JSON.stringify(legacyWorkspace.settings) : null,
          }).onConflictDoNothing();
        }

        
      }

      await legacyWorkspaceDb.closeAsync();
    } catch (error) {
      console.warn('Failed to migrate legacy workspace data:', error);
    }
  }

  /**
   * Migrate legacy resource data
   */
  private async migrateLegacyResourceData(): Promise<void> {
    try {
      // Check if legacy resource database exists
      const legacyResourceDb = await this.openLegacyDatabase('resources.db');
      if (!legacyResourceDb) return;

      

      // Get existing resources from legacy database
      const legacyResources = await legacyResourceDb.getAllAsync(
        'SELECT * FROM resources WHERE 1=1'
      );

      if (legacyResources && legacyResources.length > 0) {
        const db = this.databaseManager.getDb();
        
        // Insert resources into new database
        for (const legacyResource of legacyResources) {
          await db.insert(resources).values({
            workspaceId: legacyResource.workspace_id || 1, // Default to first workspace
            resourceId: legacyResource.resource_id || `resource_${legacyResource.id}`,
            name: legacyResource.name || 'Unknown Resource',
            type: legacyResource.type || 'unknown',
            language: legacyResource.language || 'en',
            languageDirection: legacyResource.language_direction || 'ltr',
            version: legacyResource.version,
            source: legacyResource.source,
            metadata: legacyResource.metadata ? JSON.stringify(legacyResource.metadata) : null,
            content: legacyResource.content ? JSON.stringify(legacyResource.content) : null,
            isActive: legacyResource.is_active !== undefined ? legacyResource.is_active : true,
            lastAccessed: legacyResource.last_accessed,
          }).onConflictDoNothing();
        }

        
      }

      await legacyResourceDb.closeAsync();
    } catch (error) {
      console.warn('Failed to migrate legacy resource data:', error);
    }
  }

  /**
   * Migrate legacy settings
   */
  private async migrateLegacySettings(): Promise<void> {
    try {
      // Check if legacy settings database exists
      const legacySettingsDb = await this.openLegacyDatabase('settings.db');
      if (!legacySettingsDb) return;

      

      // Get existing settings from legacy database
      const legacySettings = await legacySettingsDb.getAllAsync(
        'SELECT * FROM settings WHERE 1=1'
      );

      if (legacySettings && legacySettings.length > 0) {
        const db = this.databaseManager.getDb();
        
        // Insert settings into new database
        for (const legacySetting of legacySettings) {
          await db.insert(settings).values({
            key: legacySetting.key,
            value: legacySetting.value,
            type: legacySetting.type || 'string',
            category: legacySetting.category || 'general',
            description: legacySetting.description,
            isUserConfigurable: legacySetting.is_user_configurable !== undefined ? legacySetting.is_user_configurable : true,
          }).onConflictDoNothing();
        }

        
      }

      await legacySettingsDb.closeAsync();
    } catch (error) {
      console.warn('Failed to migrate legacy settings:', error);
    }
  }

  /**
   * Try to open a legacy database
   */
  private async openLegacyDatabase(dbName: string): Promise<SQLite.SQLiteDatabase | null> {
    try {
      // Check if the database file exists by trying to open it
      // Use a different name to avoid conflicts with the current database
      const legacyDbName = `legacy_${dbName}`;
      const db = SQLite.openDatabaseSync(legacyDbName);
      
      // Try to query a simple table to see if it exists
      await db.getFirstAsync("SELECT name FROM sqlite_master WHERE type='table' LIMIT 1");
      
      console.log(`📁 Found legacy database: ${legacyDbName}`);
      return db;
    } catch (error) {
      // Database doesn't exist or is empty - this is normal for new installations
      console.log(`ℹ️ No legacy database found: ${dbName}`);
      return null;
    }
  }

  /**
   * Create default data if no legacy data exists
   */
  public async createDefaultData(): Promise<void> {
    try {
      
      
      const db = this.databaseManager.getDb();

      // Create default user
      const defaultUser = await db.insert(users).values({
        username: 'default_user',
        displayName: 'Default User',
        preferences: JSON.stringify({
          theme: 'light',
          language: 'en',
          fontSize: 16
        })
      }).onConflictDoNothing().returning();

      // Create default workspace
      const defaultWorkspace = await db.insert(workspaces).values({
        name: 'My Workspace',
        description: 'Default workspace for Bible translation',
        ownerId: defaultUser[0]?.id || 1,
        isDefault: true,
        settings: JSON.stringify({
          autoSave: true,
          syncEnabled: false
        })
      }).onConflictDoNothing().returning();

      // Create default settings
      const defaultSettings = [
        { key: 'app.theme', value: 'light', type: 'string', category: 'ui' },
        { key: 'app.language', value: 'en', type: 'string', category: 'ui' },
        { key: 'app.fontSize', value: '16', type: 'number', category: 'ui' },
        { key: 'sync.enabled', value: 'false', type: 'boolean', category: 'sync' },
        { key: 'performance.cacheSize', value: '100', type: 'number', category: 'performance' },
      ];

      for (const setting of defaultSettings) {
        await db.insert(settings).values(setting).onConflictDoNothing();
      }

      
    } catch (error) {
      console.error('Failed to create default data:', error);
      throw error;
    }
  }
}

