/**
 * Background Download Manager
 * 
 * Orchestrates background downloading of resources for offline availability.
 * Downloads resources one-by-one based on priority order.
 * Tracks completion status in cache.
 * Resolves and handles dependencies automatically.
 */

import type { ResourceMetadata } from '@bt-synergy/resource-catalog'
import type { ProgressCallback } from '@bt-synergy/resource-types'
import type { ResourceCompletenessChecker } from './ResourceCompletenessChecker'
import { DependencyResolver, type ResolvedResource } from './DependencyResolver'

export interface DownloadTask {
  resourceKey: string
  priority: number
  status: 'pending' | 'downloading' | 'completed' | 'failed'
  progress: number
  message?: string
  error?: string
}

export interface DownloadManagerConfig {
  /** Enable debug logging */
  debug?: boolean
  /** Method to use for downloading (individual, zip, tar) */
  downloadMethod?: 'individual' | 'zip' | 'tar'
  /** Skip resources that are already cached */
  skipExisting?: boolean
}

export interface DownloadProgress {
  currentResource: string | null
  currentResourceProgress: number
  totalResources: number
  completedResources: number
  failedResources: number
  overallProgress: number
  tasks: DownloadTask[]
  // Ingredient-based progress (books/entries within resources)
  totalIngredients?: number
  completedIngredients?: number
  failedIngredients?: number
  currentIngredient?: string // Name of the specific ingredient being processed (e.g., "Matthew", "faith")
}

export class BackgroundDownloadManager {
  private loaderRegistry: any
  private catalogManager: any
  private resourceTypeRegistry: any
  private completenessChecker?: ResourceCompletenessChecker
  private dependencyResolver: DependencyResolver
  private config: Required<DownloadManagerConfig>
  private tasks: Map<string, DownloadTask> = new Map()
  private isDownloading = false
  private onProgressCallback?: (progress: DownloadProgress) => void

  constructor(
    loaderRegistry: any,
    catalogManager: any,
    resourceTypeRegistry: any,
    config?: DownloadManagerConfig,
    completenessChecker?: ResourceCompletenessChecker
  ) {
    this.loaderRegistry = loaderRegistry
    this.catalogManager = catalogManager
    this.resourceTypeRegistry = resourceTypeRegistry
    this.completenessChecker = completenessChecker
    this.config = {
      debug: config?.debug ?? true,
      downloadMethod: config?.downloadMethod ?? 'zip', // Default to zip, will auto-fallback to individual
      skipExisting: config?.skipExisting ?? true,
    }
    
    // Initialize dependency resolver
    this.dependencyResolver = new DependencyResolver(
      catalogManager,
      resourceTypeRegistry,
      completenessChecker,
      config?.debug ?? true
    )
  }

  /**
   * Set progress callback
   */
  onProgress(callback: (progress: DownloadProgress) => void): void {
    this.onProgressCallback = callback
  }

  /**
   * Start background downloading for all resources in the catalog
   * Automatically resolves dependencies and skips already-complete resources
   */
  async downloadAllResources(): Promise<void> {
    if (this.isDownloading) {
      console.warn('⚠️ Download already in progress')
      return
    }

    this.isDownloading = true
    console.log('📦 [BG-DL] 📥 Manager Starting background downloads with dependency resolution...')

    try {
      // Get all resources from catalog
      const resources = await this.catalogManager.getAllResources()
      if (!resources || resources.length === 0) {
        console.log('ℹ️ No resources in catalog to download')
        return
      }

      // Filter out resources without a loader
      const downloadableResources = resources.filter((resource: ResourceMetadata) => {
        const loader = this.loaderRegistry.getLoaderForResource(resource)
        return loader && typeof loader.downloadResource === 'function'
      })

      if (downloadableResources.length === 0) {
        console.log('ℹ️ No downloadable resources found')
        return
      }

      console.log(`📋 Found ${downloadableResources.length} downloadable resources`)

      // Convert to ResolvedResource format with priorities and dependencies
      const resolvedResources: ResolvedResource[] = []
      
      for (const resource of downloadableResources) {
        const resourceType = this.resourceTypeRegistry.get(resource.type)
        const priority = resourceType?.downloadPriority ?? 50
        
        // Resolve dependencies for this resource
        const dependencies = await this.dependencyResolver.resolveDependencies(resource.resourceKey)
        
        resolvedResources.push({
          resourceKey: resource.resourceKey,
          metadata: resource,
          dependencies,
          priority
        })
      }

      // Expand list to include missing dependencies
      console.log('🔍 [BG-DL] Resolving and expanding dependencies...')
      const expandedResources = await this.dependencyResolver.expandWithDependencies(
        resolvedResources,
        this.config.skipExisting
      )

      console.log(`📦 [BG-DL] Expanded to ${expandedResources.length} resources (including dependencies)`)

      // Reorder with dependency resolution (also filters out complete resources)
      const orderedResources = await this.dependencyResolver.reorderWithDependencies(
        expandedResources,
        this.config.skipExisting
      )

      if (orderedResources.length === 0) {
        console.log('✅ [BG-DL] All resources already downloaded')
        return
      }

      console.log(`📥 [BG-DL] Queued ${orderedResources.length} resources for download (after filtering complete)`)

      // Create download tasks
      this.tasks.clear()
      for (const resolved of orderedResources) {
        this.tasks.set(resolved.resourceKey, {
          resourceKey: resolved.resourceKey,
          priority: resolved.priority,
          status: 'pending',
          progress: 0,
        })
      }

      this.notifyProgress()

      // Download each resource sequentially in dependency order
      for (const resolved of orderedResources) {
        // Double-check if resource is already complete before downloading
        if (this.config.skipExisting && this.completenessChecker) {
          const status = await this.completenessChecker.checkResource(resolved.resourceKey)
          if (status.isComplete) {
            console.log(`⏭️  [BG-DL] Skipping ${resolved.resourceKey} (already complete)`)
            const task = this.tasks.get(resolved.resourceKey)
            if (task) {
              task.status = 'completed'
              task.progress = 100
              task.message = 'Already complete'
              this.notifyProgress()
            }
            continue
          }
        }

        await this.downloadResource(resolved.resourceKey)
      }

      console.log('✅ [BG-DL] 📥 Manager All downloads complete')
    } finally {
      this.isDownloading = false
    }
  }

  /**
   * Download a specific resource with intelligent method selection
   */
  async downloadResource(resourceKey: string): Promise<void> {
    const task = this.tasks.get(resourceKey)
    if (!task) {
      console.warn(`⚠️ Task not found for ${resourceKey}`)
      return
    }

    // Update task status
    task.status = 'downloading'
    task.progress = 0
    task.message = 'Starting download...'
    this.notifyProgress()

    try {
      // Get resource metadata
      const metadata = await this.catalogManager.getResourceMetadata(resourceKey)
      if (!metadata) {
        throw new Error(`Resource not found: ${resourceKey}`)
      }

      // Get loader for this resource
      const loader = this.loaderRegistry.getLoaderForResource(metadata)
      if (!loader) {
        throw new Error(`No loader available for ${resourceKey}`)
      }

      if (!loader.downloadResource) {
        throw new Error(`Loader for ${resourceKey} does not support downloadResource()`)
      }

      // ✨ INTELLIGENT METHOD SELECTION
      // If metadata has zipball_url, prefer 'zip' method for faster downloads
      // Otherwise, fall back to 'individual' method or configured default
      let method = this.config.downloadMethod
      if (metadata.release?.zipball_url) {
        method = 'zip'
        console.log(`📦 Using ZIP method for ${resourceKey} (zipball available)`)
      } else {
        method = 'individual'
        console.log(`📄 Using individual method for ${resourceKey} (no zipball)`)
      }

      console.log(`📥 Downloading ${resourceKey} with method: ${method}`)

      // Create progress callback
      const onProgress: ProgressCallback = (progress) => {
        task.progress = progress.percentage
        task.message = progress.message
        this.notifyProgress()
      }

      // Call loader's downloadResource method with intelligent method selection
      await loader.downloadResource(
        resourceKey,
        {
          method,
          skipExisting: this.config.skipExisting,
        },
        onProgress
      )

      // Mark as completed
      task.status = 'completed'
      task.progress = 100
      task.message = 'Download complete'
      this.notifyProgress()

      // ✅ Mark resource as complete in cache metadata
      if (this.completenessChecker) {
        await this.completenessChecker.markComplete(resourceKey, {
          downloadMethod: method,
        })
      }

      console.log(`✅ Downloaded ${resourceKey}`)
    } catch (error) {
      console.error(`❌ Failed to download ${resourceKey}:`, error)
      task.status = 'failed'
      task.error = error instanceof Error ? error.message : String(error)
      task.message = 'Download failed'
      this.notifyProgress()

      // ❌ Mark resource error in cache metadata
      if (this.completenessChecker) {
        await this.completenessChecker.markError(
          resourceKey,
          error instanceof Error ? error.message : String(error)
        )
      }
    }
  }

  /**
   * Get current download progress
   */
  getProgress(): DownloadProgress {
    const tasks = Array.from(this.tasks.values())
    const completed = tasks.filter(t => t.status === 'completed').length
    const failed = tasks.filter(t => t.status === 'failed').length
    const downloading = tasks.find(t => t.status === 'downloading')

    return {
      currentResource: downloading?.resourceKey || null,
      currentResourceProgress: downloading?.progress || 0,
      totalResources: tasks.length,
      completedResources: completed,
      failedResources: failed,
      overallProgress: tasks.length > 0
        ? Math.round(((completed + failed) / tasks.length) * 100)
        : 0,
      tasks,
    }
  }

  /**
   * Check if download is in progress
   */
  isActive(): boolean {
    return this.isDownloading
  }

  /**
   * Cancel all downloads (if possible)
   */
  async cancelDownloads(): Promise<void> {
    console.log('🛑 [BG-DL] 📥 Manager Cancelling downloads...')
    this.isDownloading = false
    
    // Update all pending tasks to cancelled
    for (const task of this.tasks.values()) {
      if (task.status === 'pending' || task.status === 'downloading') {
        task.status = 'failed'
        task.error = 'Cancelled by user'
        task.message = 'Cancelled'
      }
    }
    
    this.notifyProgress()
  }

  /**
   * Notify progress callback
   */
  private notifyProgress(): void {
    if (this.onProgressCallback) {
      this.onProgressCallback(this.getProgress())
    }
  }
}
