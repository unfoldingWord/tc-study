/**
 * Settings table schema
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

export const settings = sqliteTable('settings', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(),
  value: text('value').notNull(),
  type: text('type').notNull(), // 'string', 'number', 'boolean', 'json'
  category: text('category'), // 'ui', 'performance', 'sync', etc.
  description: text('description'),
  isUserConfigurable: integer('is_user_configurable', { mode: 'boolean' }).default(true),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

