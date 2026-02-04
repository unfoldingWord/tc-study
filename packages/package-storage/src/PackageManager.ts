/**
 * Package Manager Implementation
 * 
 * Manages resource packages and resolves resources from catalog
 */

import type {
  ResourcePackage,
  PackageStorageAdapter,
  PackageFilters,
  LoadPackageResult,
  CanLoadResult,
  ImportOptions,
  PackageManager as IPackageManager,
} from './types/index'
import { packageResourceToKey } from './types/index'

// Minimal type declaration for ResourceCatalog (peer dependency)
interface ResourceCatalog {
  get(server: string, owner: string, language: string, resourceId: string): Promise<any | null>
  has(server: string, owner: string, language: string, resourceId: string): Promise<boolean>
  trackAccess(key: string): Promise<void>
}

/**
 * Package Manager
 * Coordinates between package storage and resource catalog
 */
export class PackageManager implements IPackageManager {
  constructor(
    private storage: PackageStorageAdapter,
    private catalog: ResourceCatalog
  ) {}
  
  // ============================================================================
  // PACKAGE MANAGEMENT
  // ============================================================================
  
  /**
   * Create a new package
   */
  async createPackage(pkg: ResourcePackage): Promise<void> {
    // Validate package
    this.validatePackage(pkg)
    
    // Check if already exists
    const exists = await this.storage.has(pkg.id)
    if (exists) {
      throw new Error(`Package already exists: ${pkg.id}`)
    }
    
    // Set timestamps
    if (!pkg.createdAt) {
      pkg.createdAt = new Date().toISOString()
    }
    
    // Save package
    await this.storage.save(pkg)
  }
  
  /**
   * Get package by ID
   */
  async getPackage(packageId: string): Promise<ResourcePackage | null> {
    return this.storage.get(packageId)
  }
  
  /**
   * List packages with optional filters
   */
  async listPackages(filters?: PackageFilters): Promise<ResourcePackage[]> {
    if (!filters) {
      return this.storage.getAll()
    }
    return this.storage.query(filters)
  }
  
  /**
   * Update package
   */
  async updatePackage(
    packageId: string,
    updates: Partial<ResourcePackage>
  ): Promise<void> {
    const pkg = await this.storage.get(packageId)
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`)
    }
    
    const updated: ResourcePackage = {
      ...pkg,
      ...updates,
      id: pkg.id, // Prevent ID change
      createdAt: pkg.createdAt, // Preserve creation date
      updatedAt: new Date().toISOString(),
    }
    
    // Validate if resources changed
    if (updates.resources) {
      this.validatePackage(updated)
    }
    
    await this.storage.save(updated)
  }
  
  /**
   * Delete package
   */
  async deletePackage(packageId: string): Promise<void> {
    await this.storage.delete(packageId)
  }
  
  // ============================================================================
  // PACKAGE LOADING
  // ============================================================================
  
  /**
   * Load package and resolve resources from catalog
   */
  async loadPackage(packageId: string): Promise<LoadPackageResult> {
    const pkg = await this.storage.get(packageId)
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`)
    }
    
    const resources = []
    const missing = []
    
    // Resolve each resource from catalog
    for (const pkgResource of pkg.resources) {
      const catalogEntry = await this.catalog.get(
        pkgResource.server,
        pkgResource.owner,
        pkgResource.language,
        pkgResource.resourceId
      )
      
      if (catalogEntry) {
        resources.push(catalogEntry)
        
        // Track access in catalog
        await this.catalog.trackAccess(
          `${pkgResource.server}/${pkgResource.owner}/${pkgResource.language}/${pkgResource.resourceId}`
        )
      } else {
        missing.push(packageResourceToKey(pkgResource))
      }
    }
    
    return {
      package: pkg,
      resources,
      missing,
    }
  }
  
  /**
   * Check if package can be loaded
   */
  async canLoadPackage(packageId: string): Promise<CanLoadResult> {
    const pkg = await this.storage.get(packageId)
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`)
    }
    
    let available = 0
    const missing: string[] = []
    const requiredMissing: string[] = []
    
    // Check each resource
    for (const pkgResource of pkg.resources) {
      const exists = await this.catalog.has(
        pkgResource.server,
        pkgResource.owner,
        pkgResource.language,
        pkgResource.resourceId
      )
      
      const key = packageResourceToKey(pkgResource)
      
      if (exists) {
        available++
      } else {
        missing.push(key)
        if (pkgResource.required) {
          requiredMissing.push(key)
        }
      }
    }
    
    return {
      canLoad: requiredMissing.length === 0,
      available,
      missing: missing.length,
      missingResources: missing,
      requiredMissing,
    }
  }
  
  // ============================================================================
  // IMPORT/EXPORT
  // ============================================================================
  
  /**
   * Export package as JSON
   */
  async exportPackage(packageId: string): Promise<string> {
    const pkg = await this.storage.get(packageId)
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`)
    }
    
    return JSON.stringify(pkg, null, 2)
  }
  
  /**
   * Import package from JSON
   */
  async importPackage(
    json: string,
    options: ImportOptions = {}
  ): Promise<ResourcePackage> {
    let pkg: ResourcePackage
    
    try {
      pkg = JSON.parse(json)
    } catch (error) {
      throw new Error(`Invalid JSON: ${error}`)
    }
    
    // Validate package structure
    this.validatePackage(pkg)
    
    // Check if package exists
    const exists = await this.storage.has(pkg.id)
    
    if (exists && !options.overwrite) {
      throw new Error(`Package already exists: ${pkg.id}. Use overwrite option to replace.`)
    }
    
    // Update ID if requested
    if (options.updateId) {
      pkg.id = `${pkg.id}-${Date.now()}`
    }
    
    // Update timestamps if requested
    if (options.updateTimestamps) {
      pkg.createdAt = new Date().toISOString()
      pkg.updatedAt = undefined
    }
    
    // Save package
    await this.storage.save(pkg)
    
    return pkg
  }
  
  // ============================================================================
  // UTILITIES
  // ============================================================================
  
  /**
   * Validate package structure
   */
  private validatePackage(pkg: ResourcePackage): void {
    if (!pkg.id) throw new Error('Package ID is required')
    if (!pkg.name) throw new Error('Package name is required')
    if (!pkg.version) throw new Error('Package version is required')
    if (!pkg.resources || pkg.resources.length === 0) {
      throw new Error('Package must have at least one resource')
    }
    
    // Validate each resource reference
    for (const resource of pkg.resources) {
      if (!resource.server) throw new Error('Resource server is required')
      if (!resource.owner) throw new Error('Resource owner is required')
      if (!resource.language) throw new Error('Resource language is required')
      if (!resource.resourceId) throw new Error('Resource resourceId is required')
    }
  }
}
