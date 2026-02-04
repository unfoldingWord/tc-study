/**
 * Package Storage Types
 * 
 * Types for managing resource packages (virtual groupings)
 */

// Minimal type declaration for ResourceMetadata (from peer dependency)
// This allows the package to build without importing the entire catalog
interface ResourceMetadata {
  server: string
  owner: string
  language: string
  resourceId: string
  [key: string]: any  // Other metadata fields
}

// ============================================================================
// RESOURCE PACKAGE
// ============================================================================

/**
 * Resource Package - Virtual grouping of resources
 * Contains references to catalog entries, NOT metadata
 */
export interface ResourcePackage {
  // ===== IDENTITY =====
  id: string                    // Unique package ID
  name: string                  // Display name
  description?: string          // What's this package for?
  
  // ===== PACKAGE METADATA =====
  version: string               // Package version
  author?: string               // Package creator
  createdAt: string             // ISO date
  updatedAt?: string            // ISO date
  
  // ===== RESOURCE REFERENCES =====
  resources: PackageResource[]  // References to catalog entries
  
  // ===== UI CONFIGURATION =====
  panelLayout?: PanelLayout     // How to display these resources
  
  // ===== PACKAGE SETTINGS =====
  settings?: PackageSettings
  
  // ===== TAGS & ORGANIZATION =====
  tags?: string[]               // For filtering/searching
  category?: string             // Package category
}

/**
 * Package resource reference
 * Points to a catalog entry + optional overrides
 */
export interface PackageResource {
  // Catalog reference (composite key)
  server: string
  owner: string
  language: string
  resourceId: string
  
  // Optional overrides
  displayName?: string          // Override display name
  required?: boolean            // Is this resource required?
  priority?: number             // Loading priority (1 = highest)
  
  // UI hints
  panel?: string                // Which panel to display in
  minimized?: boolean           // Start minimized?
}

/**
 * Package settings
 */
export interface PackageSettings {
  defaultServer?: string        // Override default server
  defaultOwner?: string         // Override default owner
  defaultLanguage?: string      // Override default language
  offlineEnabled?: boolean      // Can work offline
  autoUpdate?: boolean          // Auto-update resources
}

/**
 * Panel layout configuration
 */
export interface PanelLayout {
  panels: Panel[]
  orientation?: 'horizontal' | 'vertical'
}

/**
 * Panel definition
 */
export interface Panel {
  id: string
  title?: string
  resourceIds: string[]         // References to package resources
  defaultResourceId?: string    // Default selected resource
  minimized?: boolean
  width?: number                // Percentage or pixels
}

// ============================================================================
// PACKAGE MANAGER
// ============================================================================

/**
 * Package manager interface
 */
export interface PackageManager {
  // ===== PACKAGE MANAGEMENT =====
  createPackage(pkg: ResourcePackage): Promise<void>
  getPackage(packageId: string): Promise<ResourcePackage | null>
  listPackages(filters?: PackageFilters): Promise<ResourcePackage[]>
  updatePackage(packageId: string, updates: Partial<ResourcePackage>): Promise<void>
  deletePackage(packageId: string): Promise<void>
  
  // ===== PACKAGE LOADING =====
  loadPackage(packageId: string): Promise<LoadPackageResult>
  canLoadPackage(packageId: string): Promise<CanLoadResult>
  
  // ===== PACKAGE IMPORT/EXPORT =====
  exportPackage(packageId: string): Promise<string>
  importPackage(json: string, options?: ImportOptions): Promise<ResourcePackage>
}

/**
 * Package filters
 */
export interface PackageFilters {
  category?: string
  tags?: string[]
  author?: string
  search?: string               // Search in name/description
}

/**
 * Load package result
 */
export interface LoadPackageResult {
  package: ResourcePackage
  resources: ResourceMetadata[]  // Resolved from catalog
  missing: string[]              // Resources not in catalog
}

/**
 * Can load result
 */
export interface CanLoadResult {
  canLoad: boolean              // Can the package be loaded?
  available: number             // Number of available resources
  missing: number               // Number of missing resources
  missingResources: string[]    // List of missing resource keys
  requiredMissing: string[]     // Required resources that are missing
}

/**
 * Import options
 */
export interface ImportOptions {
  overwrite?: boolean           // Overwrite if exists
  updateId?: boolean            // Generate new ID
  updateTimestamps?: boolean    // Update timestamps
}

// ============================================================================
// PACKAGE STORAGE
// ============================================================================

/**
 * Package storage adapter interface
 */
export interface PackageStorageAdapter {
  // Basic CRUD
  save(pkg: ResourcePackage): Promise<void>
  get(packageId: string): Promise<ResourcePackage | null>
  has(packageId: string): Promise<boolean>
  delete(packageId: string): Promise<void>
  
  // List & query
  getAll(): Promise<ResourcePackage[]>
  query(filters: PackageFilters): Promise<ResourcePackage[]>
  
  // Management
  clear(): Promise<void>
  count(): Promise<number>
}

// ============================================================================
// UTILITIES
// ============================================================================

/**
 * Convert package resource to key string
 */
export function packageResourceToKey(resource: PackageResource): string {
  return `${resource.server}/${resource.owner}/${resource.language}/${resource.resourceId}`
}

/**
 * Parse key string to package resource parts
 */
export function parsePackageResourceKey(key: string): Omit<PackageResource, 'panel' | 'minimized'> | null {
  const parts = key.split('/')
  if (parts.length !== 4) return null
  
  return {
    server: parts[0],
    owner: parts[1],
    language: parts[2],
    resourceId: parts[3],
  }
}
