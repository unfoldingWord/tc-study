/**
 * Resource Packages Schema
 * 
 * Database schema for storing resource packages and their configurations.
 * Used by SQLite adapter on native platforms.
 * IndexedDB on web uses equivalent object stores with same structure.
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Resource packages table
 * Stores package manifests and configurations
 */
export const resourcePackages = sqliteTable('resource_packages', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  source: text('source').notNull(),              // 'default' | 'custom' | 'imported'
  config: text('config').notNull(),               // JSON: PackageConfig
  resources: text('resources').notNull(),         // JSON: PackageResource[]
  panelLayout: text('panel_layout').notNull(),    // JSON: PanelLayout
  passageSetIds: text('passage_set_ids'),         // JSON: string[]
  metadata: text('metadata'),                     // JSON: PackageMetadata
  status: text('status').notNull().default('draft'),
  isActive: integer('is_active', { mode: 'boolean' }).default(false),
  totalSize: integer('total_size'),
  downloadedAt: integer('downloaded_at', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
});

/**
 * Panel layouts table
 * Stores custom panel layouts per package (separate for easier updates)
 */
export const panelLayouts = sqliteTable('panel_layouts', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  packageId: text('package_id').references(() => resourcePackages.id, { onDelete: 'cascade' }).notNull(),
  layoutData: text('layout_data').notNull(),      // JSON: PanelLayout
  isDefault: integer('is_default', { mode: 'boolean' }).default(false),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
});

/**
 * App settings table
 * Stores global app settings like active package ID
 */
export const appSettings = sqliteTable('app_settings', {
  key: text('key').primaryKey(),
  value: text('value').notNull(),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
});



