/**
 * Bundle command - Bundle resources for static deployment
 */

import * as fs from 'fs/promises'
import { Command } from 'commander'
import { ResourceBundler } from '../../core/Bundler.js'
import { ResourceProcessor } from '../../core/Processor.js'
import { JSONExporter } from '../../exporters/JSONExporter.js'
import { ManifestGenerator } from '../../exporters/ManifestGenerator.js'
import { ResourceSpec, BundleConfig } from '../../types/index.js'
import { logger } from '../../utils/logger.js'

export function createBundleCommand(): Command {
  const command = new Command('bundle')
    .description('Bundle resources for static deployment')
    .option('-r, --resources <list>', 'Comma-separated list of resource IDs (e.g., ugnt,uhb,ult-en)')
    .option('-c, --config <file>', 'JSON config file with resource specifications')
    .option('-o, --output <dir>', 'Output directory', './bundled-resources')
    .option('-f, --format <type>', 'Export format: json, indexeddb, or both', 'json')
    .option('--compress', 'Compress JSON output with gzip', false)
    .option('--manifest', 'Generate manifest.json file', false)
    .option('--parallel', 'Download resources in parallel', true)
    .option('--verbose', 'Verbose logging', false)
    .action(bundleAction)

  return command
}

async function bundleAction(options: any) {
  try {
    logger.setVerbose(options.verbose)

    // Load resource specs
    let specs: ResourceSpec[]

    if (options.config) {
      // Load from config file
      const configContent = await fs.readFile(options.config, 'utf-8')
      const config: BundleConfig = JSON.parse(configContent)
      specs = config.resources
      options.output = config.output || options.output
      options.format = config.format || options.format
      options.compress = config.compress !== undefined ? config.compress : options.compress
      options.manifest = config.manifest !== undefined ? config.manifest : options.manifest
    } else if (options.resources) {
      // Parse from command line
      specs = parseResourceList(options.resources)
    } else {
      logger.error('Either --resources or --config must be specified')
      process.exit(1)
    }

    logger.info(`\n📦 BT Synergy Resource Bundler`)
    logger.info(`   Resources: ${specs.length}`)
    logger.info(`   Output: ${options.output}`)
    logger.info(``)

    // Create bundler
    const bundler = new ResourceBundler({
      outputDir: options.output
    })

    // Download and process resources
    const bundleResult = await bundler.bundle(specs, {
      parallel: options.parallel,
      verbose: options.verbose
    })

    if (!bundleResult.success) {
      logger.error('\nBundle failed!')
      process.exit(1)
    }

    // Export resources
    if (options.format === 'json' || options.format === 'both') {
      logger.info('\n📤 Exporting to JSON...')
      
      const exporter = new JSONExporter({
        outputDir: options.output,
        compress: options.compress,
        pretty: false
      })

      const processor = new ResourceProcessor()
      const exportResults = []
      const processResults = []

      for (const spec of specs) {
        // Re-download if needed (from cache)
        const downloader = bundler['downloader']
        const downloadResult = await downloader.download(spec)
        
        if (downloadResult.success) {
          const processResult = await processor.process(spec, downloadResult.filePath)
          if (processResult.success) {
            const exportResult = await exporter.exportResource(processResult)
            exportResults.push(exportResult)
            processResults.push(processResult)
            logger.success(`✓ Exported ${processResult.metadata.resourceId} → ${exportResult.filename}`)
          }
        }
      }

      // Generate manifest
      if (options.manifest && exportResults.length > 0) {
        logger.info('\n📋 Generating manifest...')
        const manifestGenerator = new ManifestGenerator()
        await manifestGenerator.generate(options.output, processResults, exportResults)
      }
    }

    logger.success(`\n🎉 Bundle complete!`)
    logger.info(`📁 Output: ${options.output}`)

  } catch (error: any) {
    logger.error(`Bundle failed: ${error.message}`)
    if (options.verbose) {
      console.error(error.stack)
    }
    process.exit(1)
  }
}

/**
 * Parse resource list from command line
 * Format: ugnt,uhb,ult-en,ust-es
 * 
 * Defaults:
 * - ugnt → unfoldingWord/el-x-koine/ugnt
 * - uhb → unfoldingWord/hbo/uhb
 * - ult-{lang} → unfoldingWord/{lang}/ult
 */
function parseResourceList(resourcesStr: string): ResourceSpec[] {
  const items = resourcesStr.split(',').map(s => s.trim())
  const specs: ResourceSpec[] = []

  for (const item of items) {
    const spec = parseResourceId(item)
    if (spec) {
      specs.push(spec)
    }
  }

  return specs
}

function parseResourceId(id: string): ResourceSpec | null {
  // Map common resource IDs
  const commonResources: Record<string, ResourceSpec> = {
    'ugnt': { owner: 'unfoldingWord', language: 'el-x-koine', resourceId: 'ugnt', stage: 'prod' },
    'uhb': { owner: 'unfoldingWord', language: 'hbo', resourceId: 'uhb', stage: 'prod' },
  }

  // Check common resources
  if (commonResources[id]) {
    return commonResources[id]
  }

  // Parse format: resourceId-language (e.g., ult-en, ust-es)
  const match = id.match(/^([a-z]+)-([a-z]{2,3}(?:-[a-z0-9-]+)?)$/i)
  if (match) {
    const [, resourceId, language] = match
    return {
      owner: 'unfoldingWord',
      language,
      resourceId,
      stage: 'prod'
    }
  }

  logger.warn(`Could not parse resource ID: ${id}`)
  return null
}
