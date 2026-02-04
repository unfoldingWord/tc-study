/**
 * Cache command - Manage download cache
 */

import { Command } from 'commander'
import { ResourceBundler } from '../../core/Bundler.js'
import { logger } from '../../utils/logger.js'

export function createCacheCommand(): Command {
  const command = new Command('cache')
    .description('Manage download cache')
    .option('--clear', 'Clear all cached downloads', false)
    .option('--stats', 'Show cache statistics', false)
    .option('--path', 'Show cache directory path', false)
    .action(cacheAction)

  return command
}

async function cacheAction(options: any) {
  try {
    const bundler = new ResourceBundler()

    if (options.clear) {
      logger.progress('Clearing cache...')
      await bundler.clearCache()
      logger.success('Cache cleared')
    }

    if (options.stats) {
      logger.info('💾 Cache Statistics:\n')
      const stats = await bundler.getCacheStats()
      console.log(`   Total files: ${stats.totalFiles}`)
      console.log(`   Total size: ${(stats.totalSize / 1024 / 1024).toFixed(2)} MB`)
      if (stats.oldestFile) {
        console.log(`   Oldest: ${stats.oldestFile}`)
      }
      if (stats.newestFile) {
        console.log(`   Newest: ${stats.newestFile}`)
      }
    }

    if (options.path) {
      logger.info(`📁 Cache directory: ${bundler.getCacheDir()}`)
    }

    if (!options.clear && !options.stats && !options.path) {
      logger.info('Use --clear, --stats, or --path')
      logger.info('Examples:')
      logger.info('  bt-bundle cache --stats    # Show cache info')
      logger.info('  bt-bundle cache --clear    # Clear all cached downloads')
      logger.info('  bt-bundle cache --path     # Show cache location')
    }

  } catch (error: any) {
    logger.error(`Cache operation failed: ${error.message}`)
    process.exit(1)
  }
}
