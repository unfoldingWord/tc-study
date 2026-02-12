/**
 * Package Builder Engine
 * 
 * Orchestrates the entire package building process:
 * 1. Download resources
 * 2. Parse content
 * 3. Build package structure
 * 4. Compress (optional)
 */

import type { Door43Resource } from '@bt-synergy/door43-api'
import { createDefaultPipeline } from '@bt-synergy/resource-adapters'
import type { DownloadOptions } from '@bt-synergy/resource-adapters'
import { generateManifest } from '@bt-synergy/package-builder'
import type { PackageManifest } from '@bt-synergy/package-builder'
import { ResourceDownloader } from '../downloader'
import { PackageBuilder } from '../builders'
import { ZipCompressor } from '../compressors'
import { MemoryFileSystemAdapter } from '../filesystem'
import type {
  BuildConfig,
  BuildResult,
  ProgressCallback,
  FileSystemAdapter,
  BuildError
} from '../types'

export interface PackageBuildRequest {
  packageName: string
  packageVersion: string
  packageDescription?: string
  resources: Array<{
    resource: Door43Resource
    bookCode?: string
  }>
  languagesInfo?: Map<string, any>
  config?: BuildConfig
  onProgress?: ProgressCallback
}

export class PackageBuilderEngine {
  private downloader: ResourceDownloader
  private builder: PackageBuilder
  private compressor: ZipCompressor
  private filesystem: FileSystemAdapter
  
  constructor(filesystem?: FileSystemAdapter) {
    this.filesystem = filesystem || new MemoryFileSystemAdapter()
    
    // Create pipeline with all adapters
    const pipeline = createDefaultPipeline()
    
    // Initialize components
    this.downloader = new ResourceDownloader(pipeline)
    this.builder = new PackageBuilder(this.filesystem)
    this.compressor = new ZipCompressor()
  }
  
  /**
   * Build a complete resource package
   */
  async buildPackage(request: PackageBuildRequest): Promise<BuildResult> {
    const startTime = Date.now()
    const errors: BuildError[] = []
    const warnings: string[] = []
    
    try {
      // 1. Download and parse all resources
      const downloadRequests = request.resources.map(({ resource, bookCode }) => ({
        resource,
        options: { bookCode, bookName: bookCode } as DownloadOptions
      }))
      
      const contents = await this.downloader.downloadResources(
        downloadRequests,
        request.onProgress
      )
      
      // Track errors
      const successfulContents = contents.filter((content, index) => {
        if (!content.data) {
          errors.push({
            resource: request.resources[index].resource,
            bookCode: request.resources[index].bookCode,
            stage: 'download',
            error: new Error('Failed to download resource')
          })
          return false
        }
        return true
      })
      
      // 2. Generate manifest
      const selectedResources = request.resources.map(r => r.resource)
      const manifest = generateManifest(selectedResources, {
        languageInfo: request.languagesInfo
      })
      
      // Update manifest metadata
      manifest.name = request.packageName
      manifest.version = request.packageVersion
      if (request.packageDescription) {
        manifest.description = request.packageDescription
      }
      
      // 3. Build package
      const files = await this.builder.buildPackage(
        manifest,
        successfulContents,
        request.packageName
      )
      
      // 4. Compress (if requested)
      let outputPath: string | undefined
      const config = request.config || {}
      
      if (config.outputFormat === 'zip') {
        const zipData = await this.compressor.compress(files)
        outputPath = `${request.packageName}.zip`
        await this.filesystem.writeFile(outputPath, zipData)
      }
      
      // 5. Calculate stats
      const totalSize = Array.from(files.values()).reduce((sum, file) => {
        return sum + (typeof file === 'string' ? file.length : (file as ArrayBufferView).byteLength)
      }, 0)
      
      const buildTime = Date.now() - startTime
      
      return {
        success: errors.length === 0,
        manifest,
        outputPath,
        files,
        errors,
        warnings,
        stats: {
          totalResources: request.resources.length,
          successfulResources: successfulContents.length,
          failedResources: errors.length,
          totalSize,
          buildTime
        }
      }
    } catch (error) {
      throw new Error(`Package build failed: ${error instanceof Error ? error.message : 'Unknown error'}`)
    }
  }
  
  /**
   * Quick build from manifest (assumes manifest already generated)
   */
  async buildFromManifest(
    manifest: PackageManifest,
    onProgress?: ProgressCallback
  ): Promise<BuildResult> {
    const startTime = Date.now()
    const errors: BuildError[] = []
    
    // Extract resources from manifest
    const resources = manifest.resources.map(entry => ({
      resource: {
        id: entry.id,
        owner: entry.owner,
        language: entry.language.code,
        // Add other necessary Door43Resource fields
      } as unknown as Door43Resource,
      bookCode: entry.content.books?.[0] // First book if available
    }))
    
    return this.buildPackage({
      packageName: manifest.name,
      packageVersion: manifest.version,
      packageDescription: manifest.description,
      resources,
      onProgress
    })
  }
}
