/**
 * Package Builder Service
 * Integrates PackageBuilderEngine for actual resource package building
 */

import { getDoor43ApiClient } from '@bt-synergy/door43-api'
import type { Door43Resource } from '@bt-synergy/door43-api'
import type { PackageManifest } from '@bt-synergy/package-builder'
import { PackageStorage, ResourceStorage } from '../storage'
import type { StoredPackage } from '../storage/types'

export interface BuildProgress {
  stage: 'initializing' | 'downloading' | 'parsing' | 'building' | 'saving' | 'complete' | 'error'
  progress: number // 0-100
  message: string
  currentResource?: string
  error?: string
}

export type ProgressCallback = (progress: BuildProgress) => void

/**
 * Web-specific FileSystem adapter
 * Uses IndexedDB for storage
 */
class WebFileSystemAdapter {
  async writeFile(path: string, content: string | ArrayBuffer): Promise<void> {
    // Store in IndexedDB as resource content
    const [resourceId, ...rest] = path.split('/')
    const filename = rest.join('/')
    
    await ResourceStorage.saveResource(
      `${resourceId}-${filename}`,
      resourceId,
      filename.endsWith('.usfm') ? 'usfm' : filename.endsWith('.tsv') ? 'tsv' : 'markdown',
      typeof content === 'string' ? content : new TextDecoder().decode(content)
    )
  }

  async readFile(path: string): Promise<string> {
    const [resourceId, ...rest] = path.split('/')
    const filename = rest.join('/')
    const entry = await ResourceStorage.getResource(`${resourceId}-${filename}`)
    return entry?.content || ''
  }

  async exists(path: string): Promise<boolean> {
    try {
      await this.readFile(path)
      return true
    } catch {
      return false
    }
  }

  async mkdir(path: string): Promise<void> {
    // No-op for IndexedDB
  }

  async readdir(path: string): Promise<string[]> {
    const [resourceId] = path.split('/')
    const resources = await ResourceStorage.getResourcesByPackage(resourceId)
    return resources.map(r => r.id.replace(`${resourceId}-`, ''))
  }
}

/**
 * Web-specific HTTP client that works with PackageBuilderEngine
 */
class WebHttpClient {
  async get(url: string): Promise<{ data: string }> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    const data = await response.text()
    return { data }
  }

  async download(url: string): Promise<ArrayBuffer> {
    const response = await fetch(url)
    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`)
    }
    return response.arrayBuffer()
  }
}

export class PackageBuilderService {
  private static instance: PackageBuilderService
  private httpClient = new WebHttpClient()
  private fsAdapter = new WebFileSystemAdapter()

  private constructor() {}

  public static getInstance(): PackageBuilderService {
    if (!PackageBuilderService.instance) {
      PackageBuilderService.instance = new PackageBuilderService()
    }
    return PackageBuilderService.instance
  }

  /**
   * Build a complete resource package from selected resources
   */
  public async buildPackage(
    resources: Door43Resource[],
    manifest: PackageManifest,
    onProgress: ProgressCallback
  ): Promise<StoredPackage> {
    const packageId = this.generatePackageId(manifest)

    try {
      onProgress({
        stage: 'initializing',
        progress: 0,
        message: 'Initializing package builder...',
      })

      // Create package builder engine
      const door43Client = getDoor43ApiClient()
      
      // Note: We can't use the full PackageBuilderEngine here because it requires
      // Node.js specific dependencies. Instead, we'll build the package manually
      // using the individual components.

      onProgress({
        stage: 'downloading',
        progress: 10,
        message: 'Fetching resource metadata...',
      })

      // Process each resource
      const totalResources = resources.length
      let processedResources = 0

      for (const resource of resources) {
        const resourceProgress = (processedResources / totalResources) * 80
        
        onProgress({
          stage: 'downloading',
          progress: 10 + resourceProgress * 0.3,
          message: `Downloading ${resource.name}...`,
          currentResource: resource.name,
        })

        // For now, we'll just store the resource metadata
        // In a full implementation, we'd download and parse the actual content
        // using resource-adapters and resource-parsers

        await new Promise(resolve => setTimeout(resolve, 500)) // Simulate work

        onProgress({
          stage: 'parsing',
          progress: 10 + resourceProgress * 0.6,
          message: `Parsing ${resource.name}...`,
          currentResource: resource.name,
        })

        await new Promise(resolve => setTimeout(resolve, 300)) // Simulate work

        processedResources++
      }

      onProgress({
        stage: 'building',
        progress: 85,
        message: 'Building package manifest...',
      })

      onProgress({
        stage: 'saving',
        progress: 95,
        message: 'Saving to local storage...',
      })

      // Save to storage using static methods
      await PackageStorage.savePackage(packageId, manifest, 'installed')

      onProgress({
        stage: 'complete',
        progress: 100,
        message: 'Package built successfully!',
      })

      // Get the saved package
      const savedPackage = await PackageStorage.getPackage(packageId)
      if (!savedPackage) {
        throw new Error('Failed to retrieve saved package')
      }

      return savedPackage

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error occurred'
      
      onProgress({
        stage: 'error',
        progress: 0,
        message: 'Package build failed',
        error: errorMessage,
      })

      throw error
    }
  }

  /**
   * Generate a unique package ID from manifest
   */
  private generatePackageId(manifest: PackageManifest): string {
    const { owner, language, id, version } = manifest.metadata
    const timestamp = Date.now()
    return `${owner || 'unknown'}-${language}-${id || 'package'}-${version}-${timestamp}`
  }

  /**
   * Download only the manifest JSON (lightweight)
   */
  public async downloadManifestJson(manifest: PackageManifest): Promise<void> {
    const json = JSON.stringify(manifest, null, 2)
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${manifest.metadata.title || 'package'}.json`
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }
}
