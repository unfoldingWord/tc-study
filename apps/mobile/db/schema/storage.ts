/**
 * Storage schema for resource content and metadata
 * Compatible with the existing StorageAdapter interface
 */

import { sql } from 'drizzle-orm';
import { index, integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Resource metadata table
 * Stores metadata for all resources (scripture, notes, questions, etc.)
 */
export const resourceMetadata = sqliteTable('resource_metadata', {
  // Primary key - composite key for uniqueness
  resourceKey: text('resource_key').primaryKey(), // server/owner/language/id
  
  // Core metadata fields
  id: text('id').notNull(), // Resource identifier (ult, ust, tn, ta, etc.)
  server: text('server').notNull(), // Source server (door43.org)
  owner: text('owner').notNull(), // Resource owner (unfoldingword)
  language: text('language').notNull(), // Language code (en, es, fr)
  type: text('type').notNull(), // Resource type (scripture, notes, words, academy)
  
  // Display information
  title: text('title').notNull(), // Display title
  description: text('description'), // Resource description
  name: text('name').notNull(), // Internal name (used as panel resource ID)
  
  // Version and status
  version: text('version').notNull(), // Resource version
  lastUpdated: integer('last_updated', { mode: 'timestamp' }).notNull(), // Last modification date
  available: integer('available', { mode: 'boolean' }).notNull().default(true), // Availability status
  isAnchor: integer('is_anchor', { mode: 'boolean' }).notNull().default(false), // Whether this is the anchor resource
  
  // Structured data (stored as JSON)
  toc: text('toc'), // Table of contents (JSON string)
  
  // Language metadata
  languageDirection: text('language_direction'), // 'rtl' | 'ltr'
  languageTitle: text('language_title'), // Human-readable language name
  languageIsGL: integer('language_is_gl', { mode: 'boolean' }), // Gateway Language flag
  
  // SHA-based change detection
  commitSha: text('commit_sha'), // Git commit SHA for the entire resource
  fileHashes: text('file_hashes'), // File-level SHA hashes (JSON string)
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => ({
  // Indexes for efficient querying
  serverOwnerLanguageIdx: index('idx_resource_metadata_server_owner_language')
    .on(table.server, table.owner, table.language),
  typeIdx: index('idx_resource_metadata_type').on(table.type),
  nameIdx: index('idx_resource_metadata_name').on(table.name),
  anchorIdx: index('idx_resource_metadata_anchor').on(table.isAnchor),
}));

/**
 * Resource content table
 * Stores actual content data for resources
 */
export const resourceContent = sqliteTable('resource_content', {
  // Primary key - unique content identifier
  key: text('key').primaryKey(), // Full path identifier
  
  // Foreign key to metadata
  resourceKey: text('resource_key').notNull(), // Links to resource_metadata.resourceKey
  
  // Content identification
  resourceId: text('resource_id').notNull(), // Reference to metadata
  server: text('server').notNull(), // Source server
  owner: text('owner').notNull(), // Resource owner
  language: text('language').notNull(), // Language code
  type: text('type').notNull(), // Resource category
  
  // Content-specific identifiers
  bookCode: text('book_code'), // Book code (for scripture/notes)
  articleId: text('article_id'), // Article ID (for academy)
  
  // Content data
  content: text('content').notNull(), // Actual content data (JSON string)
  
  // Caching information
  lastFetched: integer('last_fetched', { mode: 'timestamp' }).notNull(), // When content was last retrieved
  cachedUntil: integer('cached_until', { mode: 'timestamp' }), // Cache expiration
  checksum: text('checksum'), // Content integrity hash
  size: integer('size').notNull(), // Content size in bytes
  
  // SHA-based change detection
  sourceSha: text('source_sha'), // SHA of the source file (from Door43)
  sourceCommit: text('source_commit'), // Git commit SHA when content was fetched
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
}, (table) => ({
  // Indexes for efficient querying
  resourceKeyIdx: index('idx_resource_content_resource_key').on(table.resourceKey),
  resourceIdTypeIdx: index('idx_resource_content_resource_id_type')
    .on(table.resourceId, table.type),
  bookCodeIdx: index('idx_resource_content_book_code').on(table.bookCode),
  cachedUntilIdx: index('idx_resource_content_cached_until').on(table.cachedUntil),
  serverOwnerLanguageIdx: index('idx_resource_content_server_owner_language')
    .on(table.server, table.owner, table.language),
  sourceShaIdx: index('idx_resource_content_source_sha').on(table.sourceSha),
}));

/**
 * Storage statistics table
 * Tracks storage usage and cleanup information
 */
export const storageStats = sqliteTable('storage_stats', {
  id: integer('id').primaryKey({ autoIncrement: true }),
  key: text('key').notNull().unique(), // 'global' for overall stats
  
  // Statistics
  totalSize: integer('total_size').notNull().default(0), // Total storage used in bytes
  itemCount: integer('item_count').notNull().default(0), // Number of content items
  lastCleanup: integer('last_cleanup', { mode: 'timestamp' }).default(sql`(unixepoch())`), // Last cleanup time
  
  // Timestamps
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});

