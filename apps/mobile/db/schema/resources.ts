/**
 * Resources table schema
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';
import { workspaces } from './workspaces';

export const resources = sqliteTable('resources', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  workspaceId: integer('workspace_id').references(() => workspaces.id),
  resourceId: text('resource_id').notNull(), // External resource identifier
  name: text('name').notNull(),
  type: text('type').notNull(), // 'scripture', 'notes', 'questions', etc.
  language: text('language').notNull(),
  languageDirection: text('language_direction'), // 'ltr' or 'rtl'
  version: text('version'),
  source: text('source'), // URL or file path
  metadata: text('metadata'), // JSON string for additional metadata
  content: text('content'), // Actual resource content (JSON)
  isActive: integer('is_active', { mode: 'boolean' }).default(true),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

