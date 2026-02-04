/**
 * Resource Locations Schema
 * 
 * Tracks where resource content files are stored across different locations
 * (bundled, phone storage, SD card, web URLs)
 */

import { sql } from 'drizzle-orm';
import { integer, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * Resource locations table
 * Maps resource IDs to their physical storage locations
 */
export const resourceLocations = sqliteTable('resource_locations', {
  resourceId: text('resource_id').primaryKey(),
  locationType: text('location_type').notNull(), // 'bundled' | 'phone' | 'sdcard' | 'web' | 'url'
  locationPath: text('location_path').notNull(),  // Path or URL
  format: text('format').notNull(),               // 'compressed' | 'uncompressed'
  registeredAt: integer('registered_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  lastAccessed: integer('last_accessed', { mode: 'timestamp' }),
  notes: text('notes'),                           // Optional notes about this location
});

/**
 * Package manifests table (new format)
 * Stores the new organization-based package manifests
 * Supports mixing resources from different organizations and languages
 */
export const packageManifests = sqliteTable('package_manifests', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  formatVersion: text('format_version').notNull().default('2.0.0'),
  primaryOrganization: text('primary_organization'),
  primaryLanguage: text('primary_language'),
  organizations: text('organizations'),       // JSON array of all orgs in package
  languages: text('languages'),               // JSON array of all languages in package
  manifestJson: text('manifest_json').notNull(), // Full ResourcePackageManifest as JSON
  status: text('status').notNull().default('draft'),
  createdAt: integer('created_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
  updatedAt: integer('updated_at', { mode: 'timestamp' }).default(sql`(unixepoch())`),
});
