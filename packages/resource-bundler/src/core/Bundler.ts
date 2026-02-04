/**
 * Resource Bundler - Main orchestrator
 */

import { ResourceSpec, BundleOptions, BundleResult, ResourceResult, BundledResource, BundlerConfig } from '../types/index.js'
import { ResourceDownloader } from './Downloader.js'
import { ResourceProcessor } from './Processor.js'
import { CacheManager } from '../utils/cache.js'
import { logger } from '../utils/logger.js'

export class ResourceBundler {
  private downloader: ResourceDownloader
  private processor: ResourceProcessor
  private cacheManager: CacheManager
  private outputDir: string

  constructor(config: BundlerConfig = {}) {
    const {
      cacheDir = './.bt-cache',
      outputDir = './bundled-resources',
      door43BaseUrl,
      userAgent
    } = config

    this.cacheManager = new CacheManager(cacheDir)
    this.downloader = new ResourceDownloader(this.cacheManager, door43BaseUrl, userAgent)
    this.processor = new ResourceProcessor()
    this.outputDir = outputDir
  }

  /**
   * Bundle resources
   */
  async bundle(specs: ResourceSpec[], options: BundleOptions = {}): Promise<BundleResult> {
    const startTime = Date.now()
    const results: ResourceResult[] = []
    const errors: string[] = []

    // Set logger verbosity
    logger.setVerbose(options.verbose || false)

    logger.info(`🚀 Starting resource bundling`)
    logger.info(`   Resources: ${specs.length}`)
    logger.info(`   Output: ${options.outputDir || this.outputDir}`)
    logger.info(`   Format: ${options.format || 'json'}`)
    logger.info(`   Compress: ${options.compress ? 'yes' : 'no'}`)
    logger.info(`   Parallel: ${options.parallel ? 'yes' : 'no'}`)

    try {
      // Download all resources
      logger.progress('Downloading resources...')
      const downloadResults = await this.downloader.downloadAll(specs, options.parallel)

      // Process each resource
      for (let i = 0; i < specs.length; i++) {
        const spec = specs[i]
        const downloadResult = downloadResults[i]
        const resourceKey = `${spec.owner}/${spec.language}/${spec.resourceId}`

        if (!downloadResult.success) {
          errors.push(`Failed to download ${resourceKey}: ${downloadResult.error}`)
          results.push({
            resourceKey,
            resourceId: spec.resourceId,
            success: false,
            filename: '',
            size: 0,
            duration: 0,
            error: downloadResult.error
          })
          continue
        }

        try {
          logger.progress(`Processing ${spec.resourceId}...`)
          const processStart = Date.now()

          // Process resource
          const processResult = await this.processor.process(spec, downloadResult.filePath)

          if (!processResult.success) {
            errors.push(`Failed to process ${resourceKey}: ${processResult.error}`)
            results.push({
              resourceKey,
              resourceId: spec.resourceId,
              success: false,
              filename: '',
              size: 0,
              duration: Date.now() - processStart,
              error: processResult.error
            })
            continue
          }

          // Export will be handled by exporters
          const duration = Date.now() - processStart
          
          // For now, just track success
          results.push({
            resourceKey,
            resourceId: spec.resourceId,
            success: true,
            filename: `${spec.resourceId}.json`, // Will be updated by exporter
            size: JSON.stringify(processResult.content).length,
            duration
          })

          logger.success(`✓ Processed ${spec.resourceId} (${duration}ms)`)
          if (processResult.metadata.books) {
            logger.info(`   Books: ${processResult.metadata.books}, Chapters: ${processResult.metadata.chapters}, Verses: ${processResult.metadata.verses}`)
          }

        } catch (error: any) {
          errors.push(`Failed to process ${resourceKey}: ${error.message}`)
          results.push({
            resourceKey,
            resourceId: spec.resourceId,
            success: false,
            filename: '',
            size: 0,
            duration: 0,
            error: error.message
          })
        }
      }

      // Calculate totals
      const totalSize = results.reduce((sum, r) => sum + r.size, 0)
      const duration = Date.now() - startTime

      const success = errors.length === 0

      if (success) {
        logger.success(`\n✅ Bundle completed successfully!`)
      } else {
        logger.error(`\n❌ Bundle completed with ${errors.length} error(s)`)
        errors.forEach(err => logger.error(`   ${err}`))
      }

      logger.info(`📊 Summary:`)
      logger.info(`   Total resources: ${results.length}`)
      logger.info(`   Successful: ${results.filter(r => r.success).length}`)
      logger.info(`   Failed: ${results.filter(r => !r.success).length}`)
      logger.info(`   Total size: ${(totalSize / 1024 / 1024).toFixed(2)} MB`)
      logger.info(`   Duration: ${(duration / 1000).toFixed(2)}s`)

      return {
        success,
        resources: results,
        totalSize,
        duration,
        errors
      }

    } catch (error: any) {
      logger.error(`Bundle failed: ${error.message}`)
      return {
        success: false,
        resources: results,
        totalSize: 0,
        duration: Date.now() - startTime,
        errors: [error.message, ...errors]
      }
    }
  }

  /**
   * Clear download cache
   */
  async clearCache(): Promise<void> {
    await this.downloader.clearCache()
  }

  /**
   * Get cache statistics
   */
  async getCacheStats() {
    return await this.downloader.getCacheStats()
  }

  /**
   * Get cache directory path
   */
  getCacheDir(): string {
    return this.cacheManager.getCacheDir()
  }
}
