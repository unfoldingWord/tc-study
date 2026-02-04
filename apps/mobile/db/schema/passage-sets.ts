/**
 * Passage Sets Schema
 * 
 * Database schema for storing passage sets (reading plans, curricula, etc.).
 * Used by SQLite adapter on native platforms.
 * IndexedDB on web uses equivalent object stores with same structure.
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Passage sets table
 * Stores passage set data and metadata
 */
export const passageSets = sqliteTable('passage_sets', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  description: text('description'),
  version: text('version').notNull().default('1.0.0'),
  source: text('source').notNull(),               // 'bundled' | 'imported' | 'dcs'
  sourceUrl: text('source_url'),                  // URL if from DCS or remote
  data: text('data').notNull(),                   // JSON: PassageSet (full data)
  metadata: text('metadata'),                     // JSON: Additional metadata
  passageCount: integer('passage_count'),         // Total passages in set
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
});

/**
 * Passage set progress table
 * Tracks user progress through passage sets
 */
export const passageSetProgress = sqliteTable('passage_set_progress', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  setId: text('set_id').references(() => passageSets.id, { onDelete: 'cascade' }).notNull(),
  userId: text('user_id'),                        // Optional user ID
  completedPassages: text('completed_passages'),  // JSON: string[] (passage IDs)
  completedGroups: text('completed_groups'),      // JSON: string[] (group IDs)
  currentPassageId: text('current_passage_id'),   // Current/last accessed passage
  progressPercentage: integer('progress_percentage').default(0),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`)
});



