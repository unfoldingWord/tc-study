/**
 * Package Manager Service
 * 
 * Manages resource packages including CRUD operations, resource management,
 * and export/import functionality. Platform-agnostic using storage adapters.
 */

import {
  AddResourceOptions,
  CreatePackageInput,
  DiscoveredResource,
  PackageExport,
  PackageOperationOptions,
  PackageStats,
  PackageStatus,
  PackageStorageAdapter,
  PackageValidationResult,
  PanelLayout,
  ResourcePackage,
  ResourceRole,
  ResourceStatus
} from '../../types/resource-package';

/**
 * Generate a unique ID
 */
function generateId(): string {
  return `pkg-${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

export class PackageManager {
  private storageAdapter: PackageStorageAdapter;
  private isInitialized = false;
  
  constructor(storageAdapter: PackageStorageAdapter) {
    this.storageAdapter = storageAdapter;
  }
  
  async initialize(): Promise<void> {
    if (this.isInitialized) return;
    
    if (this.storageAdapter.initialize) {
      await this.storageAdapter.initialize();
    }
    
    this.isInitialized = true;
    console.log('✅ PackageManager initialized');
  }
  
  // ============================================================================
  // PACKAGE CRUD OPERATIONS
  // ============================================================================
  
  /**
   * Create a new package
   */
  async createPackage(input: CreatePackageInput): Promise<ResourcePackage> {
    await this.initialize();
    
    const pkg: ResourcePackage = {
      id: generateId(),
      name: input.name,
      description: input.description,
      version: '1.0.0',
      source: input.source || 'custom',
      createdAt: new Date(),
      updatedAt: new Date(),
      config: {
        defaultServer: input.config?.defaultServer || 'git.door43.org',
        defaultOwner: input.config?.defaultOwner,
        defaultLanguage: input.config?.defaultLanguage,
        offlineEnabled: input.config?.offlineEnabled ?? true,
        autoUpdate: input.config?.autoUpdate ?? true
      },
      resources: input.resources || [],
      panelLayout: input.panelLayout || this.createDefaultPanelLayout(),
      passageSetIds: [],
      status: PackageStatus.DRAFT
    };
    
    await this.storageAdapter.savePackage(pkg);
    console.log(`📦 Package created: ${pkg.name}`);
    
    return pkg;
  }
  
  /**
   * Update an existing package
   */
  async updatePackage(
    id: string,
    updates: Partial<ResourcePackage>,
    options: PackageOperationOptions = {}
  ): Promise<ResourcePackage> {
    await this.initialize();
    
    const existing = await this.storageAdapter.getPackage(id);
    if (!existing) {
      throw new Error(`Package not found: ${id}`);
    }
    
    const updated: ResourcePackage = {
      ...existing,
      ...updates,
      id: existing.id, // Ensure ID doesn't change
      updatedAt: new Date()
    };
    
    // Validate unless skipped
    if (!options.skipValidation) {
      const validation = this.validatePackage(updated);
      if (!validation.valid) {
        throw new Error(`Invalid package: ${validation.errors.join(', ')}`);
      }
    }
    
    await this.storageAdapter.savePackage(updated);
    console.log(`📦 Package updated: ${updated.name}`);
    
    return updated;
  }
  
  /**
   * Delete a package
   */
  async deletePackage(id: string): Promise<void> {
    await this.initialize();
    
    // Check if it's the active package
    const activeId = await this.storageAdapter.getActivePackageId();
    if (activeId === id) {
      throw new Error('Cannot delete active package. Switch to another package first.');
    }
    
    await this.storageAdapter.deletePackage(id);
    console.log(`🗑️ Package deleted: ${id}`);
  }
  
  /**
   * Get a package by ID
   */
  async getPackage(id: string): Promise<ResourcePackage | null> {
    await this.initialize();
    return await this.storageAdapter.getPackage(id);
  }
  
  /**
   * List all packages
   */
  async listPackages(): Promise<ResourcePackage[]> {
    await this.initialize();
    return await this.storageAdapter.getAllPackages();
  }
  
  // ============================================================================
  // RESOURCE MANAGEMENT WITHIN PACKAGE
  // ============================================================================
  
  /**
   * Add a resource to a package
   */
  async addResource(
    packageId: string,
    resource: DiscoveredResource,
    options: AddResourceOptions
  ): Promise<void> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    // Check if resource already exists
    const exists = pkg.resources.some(r =>
      r.resourceId === resource.id &&
      r.language === resource.language &&
      r.owner === resource.owner
    );
    
    if (exists) {
      throw new Error(`Resource ${resource.id} (${resource.language}) already in package`);
    }
    
    // Check for anchor conflicts
    if (options.role === ResourceRole.ANCHOR &&
        pkg.resources.some(r => r.role === ResourceRole.ANCHOR)) {
      throw new Error('Package already has an anchor resource. Change existing anchor first.');
    }
    
    // Add resource
    pkg.resources.push({
      resourceId: resource.id,
      resourceType: resource.type,
      server: resource.server,
      owner: resource.owner,
      language: resource.language,
      version: options.version || resource.version,
      role: options.role,
      panelId: options.panelId,
      order: options.order || pkg.resources.filter(r => r.panelId === options.panelId).length,
      status: ResourceStatus.PENDING
    });
    
    // Update panel layout to include new resource
    const panel = pkg.panelLayout.panels.find(p => p.id === options.panelId);
    if (panel) {
      const panelResourceId = `${resource.id}-${resource.language}`;
      if (!panel.resourceIds.includes(panelResourceId)) {
        panel.resourceIds.push(panelResourceId);
      }
    }
    
    pkg.updatedAt = new Date();
    await this.storageAdapter.savePackage(pkg);
    
    console.log(`➕ Resource added: ${resource.id} to ${pkg.name}`);
  }
  
  /**
   * Remove a resource from a package
   */
  async removeResource(packageId: string, resourceId: string): Promise<void> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    const resourceIndex = pkg.resources.findIndex(r =>
      `${r.resourceId}-${r.language}` === resourceId
    );
    
    if (resourceIndex === -1) {
      throw new Error(`Resource not found in package: ${resourceId}`);
    }
    
    const resource = pkg.resources[resourceIndex];
    
    // Don't allow removing anchor if there are other resources
    if (resource.role === ResourceRole.ANCHOR && pkg.resources.length > 1) {
      throw new Error('Cannot remove anchor resource. Assign a new anchor first.');
    }
    
    // Remove from resources
    pkg.resources.splice(resourceIndex, 1);
    
    // Remove from panel layout
    const panel = pkg.panelLayout.panels.find(p => p.id === resource.panelId);
    if (panel) {
      panel.resourceIds = panel.resourceIds.filter(id => id !== resourceId);
      if (panel.defaultResourceId === resourceId && panel.resourceIds.length > 0) {
        panel.defaultResourceId = panel.resourceIds[0];
      }
    }
    
    pkg.updatedAt = new Date();
    await this.storageAdapter.savePackage(pkg);
    
    console.log(`➖ Resource removed: ${resourceId} from ${pkg.name}`);
  }
  
  /**
   * Move a resource to a different panel
   */
  async moveResourceToPanel(
    packageId: string,
    resourceId: string,
    targetPanelId: string,
    order?: number
  ): Promise<void> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    const resource = pkg.resources.find(r =>
      `${r.resourceId}-${r.language}` === resourceId
    );
    
    if (!resource) {
      throw new Error(`Resource not found in package: ${resourceId}`);
    }
    
    const oldPanelId = resource.panelId;
    
    // Update resource panel assignment
    resource.panelId = targetPanelId;
    resource.order = order ?? pkg.resources.filter(r => r.panelId === targetPanelId).length;
    
    // Update panel layouts
    const oldPanel = pkg.panelLayout.panels.find(p => p.id === oldPanelId);
    const newPanel = pkg.panelLayout.panels.find(p => p.id === targetPanelId);
    
    if (oldPanel) {
      oldPanel.resourceIds = oldPanel.resourceIds.filter(id => id !== resourceId);
      if (oldPanel.defaultResourceId === resourceId && oldPanel.resourceIds.length > 0) {
        oldPanel.defaultResourceId = oldPanel.resourceIds[0];
      }
    }
    
    if (newPanel && !newPanel.resourceIds.includes(resourceId)) {
      newPanel.resourceIds.push(resourceId);
      if (!newPanel.defaultResourceId) {
        newPanel.defaultResourceId = resourceId;
      }
    }
    
    pkg.updatedAt = new Date();
    await this.storageAdapter.savePackage(pkg);
    
    console.log(`🔄 Resource moved: ${resourceId} from ${oldPanelId} to ${targetPanelId}`);
  }
  
  /**
   * Reorder resources within a panel
   */
  async reorderResourcesInPanel(
    packageId: string,
    panelId: string,
    orderedIds: string[]
  ): Promise<void> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    // Update resource orders
    orderedIds.forEach((resourceId, index) => {
      const resource = pkg.resources.find(r =>
        `${r.resourceId}-${r.language}` === resourceId && r.panelId === panelId
      );
      if (resource) {
        resource.order = index;
      }
    });
    
    // Update panel layout
    const panel = pkg.panelLayout.panels.find(p => p.id === panelId);
    if (panel) {
      panel.resourceIds = orderedIds;
    }
    
    pkg.updatedAt = new Date();
    await this.storageAdapter.savePackage(pkg);
    
    console.log(`🔄 Resources reordered in ${panelId}`);
  }
  
  // ============================================================================
  // EXPORT / IMPORT
  // ============================================================================
  
  /**
   * Export a package to shareable format
   */
  async exportPackage(id: string): Promise<PackageExport> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(id);
    if (!pkg) {
      throw new Error(`Package not found: ${id}`);
    }
    
    const exportData: PackageExport = {
      formatVersion: '1.0',
      exportedAt: new Date().toISOString(),
      package: {
        name: pkg.name,
        description: pkg.description,
        version: pkg.version,
        config: pkg.config,
        resources: pkg.resources.map(r => ({
          resourceId: r.resourceId,
          type: r.resourceType,
          server: r.server,
          owner: r.owner,
          language: r.language,
          version: r.version,
          role: r.role,
          panelId: r.panelId,
          order: r.order,
          dependencies: r.dependencies
        })),
        panelLayout: pkg.panelLayout,
        passageSetIds: pkg.passageSetIds,
        metadata: pkg.metadata
      }
    };
    
    console.log(`📤 Package exported: ${pkg.name}`);
    return exportData;
  }
  
  /**
   * Import a package from export format
   */
  async importPackage(data: PackageExport): Promise<ResourcePackage> {
    await this.initialize();
    
    // Validate format version
    if (data.formatVersion !== '1.0') {
      throw new Error(`Unsupported format version: ${data.formatVersion}`);
    }
    
    // Create package from export data
    const pkg: ResourcePackage = {
      id: generateId(),
      name: data.package.name,
      description: data.package.description,
      version: data.package.version,
      source: 'imported',
      createdAt: new Date(),
      updatedAt: new Date(),
      config: data.package.config,
      resources: data.package.resources.map(r => ({
        ...r,
        status: ResourceStatus.PENDING  // Will need to download
      })),
      panelLayout: data.package.panelLayout,
      passageSetIds: data.package.passageSetIds,
      metadata: data.package.metadata,
      status: PackageStatus.DRAFT
    };
    
    // Validate before saving
    const validation = this.validatePackage(pkg);
    if (!validation.valid) {
      throw new Error(`Invalid package: ${validation.errors.join(', ')}`);
    }
    
    await this.storageAdapter.savePackage(pkg);
    console.log(`📥 Package imported: ${pkg.name}`);
    
    return pkg;
  }
  
  // ============================================================================
  // ACTIVE PACKAGE MANAGEMENT
  // ============================================================================
  
  /**
   * Set the active package
   */
  async setActivePackage(id: string): Promise<void> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(id);
    if (!pkg) {
      throw new Error(`Package not found: ${id}`);
    }
    
    await this.storageAdapter.setActivePackageId(id);
    console.log(`✅ Active package: ${pkg.name}`);
  }
  
  /**
   * Get the active package
   */
  async getActivePackage(): Promise<ResourcePackage | null> {
    await this.initialize();
    
    const activeId = await this.storageAdapter.getActivePackageId();
    if (!activeId) {
      return null;
    }
    
    return await this.storageAdapter.getPackage(activeId);
  }
  
  // ============================================================================
  // PANEL LAYOUT MANAGEMENT
  // ============================================================================
  
  /**
   * Save custom panel layout for a package
   */
  async savePanelLayout(packageId: string, layout: PanelLayout): Promise<void> {
    await this.initialize();
    
    // Update package
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    pkg.panelLayout = layout;
    pkg.updatedAt = new Date();
    await this.storageAdapter.savePackage(pkg);
    
    // Also save separately for history
    await this.storageAdapter.savePanelLayout(packageId, layout);
    
    console.log(`💾 Panel layout saved for: ${pkg.name}`);
  }
  
  /**
   * Get panel layout for a package
   */
  async getPanelLayout(packageId: string): Promise<PanelLayout | null> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      return null;
    }
    
    return pkg.panelLayout;
  }
  
  /**
   * Reset panel layout to package default
   */
  async resetPanelLayout(packageId: string): Promise<void> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    // Reset to default layout based on resources
    pkg.panelLayout = this.generateLayoutFromResources(pkg);
    pkg.updatedAt = new Date();
    
    await this.storageAdapter.savePackage(pkg);
    console.log(`🔄 Panel layout reset for: ${pkg.name}`);
  }
  
  // ============================================================================
  // VALIDATION
  // ============================================================================
  
  /**
   * Validate a package
   */
  validatePackage(pkg: ResourcePackage): PackageValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Check basic fields
    if (!pkg.name || pkg.name.trim().length === 0) {
      errors.push('Package name is required');
    }
    
    if (!pkg.config.defaultServer) {
      errors.push('Default server is required');
    }
    
    // Check resources
    if (pkg.resources.length === 0) {
      warnings.push('Package has no resources');
    }
    
    // Check for anchor resource
    const anchorCount = pkg.resources.filter(r => r.role === ResourceRole.ANCHOR).length;
    if (anchorCount === 0 && pkg.resources.length > 0) {
      errors.push('Package must have an anchor resource');
    } else if (anchorCount > 1) {
      errors.push('Package can only have one anchor resource');
    }
    
    // Check panel layout
    if (!pkg.panelLayout || pkg.panelLayout.panels.length === 0) {
      errors.push('Package must have at least one panel');
    }
    
    // Validate panel references
    for (const resource of pkg.resources) {
      const panelExists = pkg.panelLayout.panels.some(p => p.id === resource.panelId);
      if (!panelExists) {
        errors.push(`Resource ${resource.resourceId} references non-existent panel: ${resource.panelId}`);
      }
    }
    
    return {
      valid: errors.length === 0,
      errors,
      warnings
    };
  }
  
  /**
   * Get package statistics
   */
  async getPackageStats(packageId: string): Promise<PackageStats> {
    await this.initialize();
    
    const pkg = await this.storageAdapter.getPackage(packageId);
    if (!pkg) {
      throw new Error(`Package not found: ${packageId}`);
    }
    
    const resourcesByType: any = {};
    const resourcesByLanguage: any = {};
    let cachedSize = 0;
    
    for (const resource of pkg.resources) {
      // Count by type
      resourcesByType[resource.resourceType] = (resourcesByType[resource.resourceType] || 0) + 1;
      
      // Count by language
      resourcesByLanguage[resource.language] = (resourcesByLanguage[resource.language] || 0) + 1;
      
      // Calculate cached size
      if (resource.status === ResourceStatus.CACHED) {
        // Would need to query actual cached size from content storage
        // For now, use estimated size
      }
    }
    
    return {
      totalResources: pkg.resources.length,
      resourcesByType,
      resourcesByLanguage,
      totalSize: pkg.totalSize || 0,
      cachedSize,
      cachedPercentage: pkg.totalSize ? (cachedSize / pkg.totalSize) * 100 : 0
    };
  }
  
  // ============================================================================
  // HELPER METHODS
  // ============================================================================
  
  /**
   * Create default panel layout
   */
  private createDefaultPanelLayout(): PanelLayout {
    return {
      panels: [
        {
          id: 'panel-1',
          title: 'Scripture',
          description: 'Primary scripture reading',
          resourceIds: [],
          defaultResourceId: '',
          visible: true,
          closable: false,
          resizable: true,
          minWidth: 350,
          maxWidth: 800
        },
        {
          id: 'panel-2',
          title: 'Translation Helps',
          description: 'Notes and reference materials',
          resourceIds: [],
          defaultResourceId: '',
          visible: true,
          closable: true,
          resizable: true,
          minWidth: 300,
          maxWidth: 700
        }
      ],
      layoutVersion: '1.0'
    };
  }
  
  /**
   * Generate panel layout from package resources
   */
  private generateLayoutFromResources(pkg: ResourcePackage): PanelLayout {
    const layout = this.createDefaultPanelLayout();
    
    // Assign resources to panels based on their panelId
    for (const resource of pkg.resources) {
      const panel = layout.panels.find(p => p.id === resource.panelId);
      if (panel) {
        const resourceId = `${resource.resourceId}-${resource.language}`;
        if (!panel.resourceIds.includes(resourceId)) {
          panel.resourceIds.push(resourceId);
          if (!panel.defaultResourceId && resource.role === ResourceRole.ANCHOR) {
            panel.defaultResourceId = resourceId;
          }
        }
      }
    }
    
    // Set default resource for panels that don't have one
    for (const panel of layout.panels) {
      if (!panel.defaultResourceId && panel.resourceIds.length > 0) {
        panel.defaultResourceId = panel.resourceIds[0];
      }
    }
    
    return layout;
  }
}

/**
 * Factory function to create PackageManager with platform storage
 */
export function createPackageManager(storageAdapter: PackageStorageAdapter): PackageManager {
  return new PackageManager(storageAdapter);
}



