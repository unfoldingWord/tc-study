#!/usr/bin/env node

/**
 * Catalog CLI - Command-line tool for managing resource catalogs
 * 
 * Demonstrates library-level reusability of:
 * - @bt-synergy/catalog-manager
 * - @bt-synergy/scripture-loader
 * - @bt-synergy/door43-api
 */

import { program } from 'commander'
import chalk from 'chalk'
import ora from 'ora'
import inquirer from 'inquirer'
import { CatalogManager } from '@bt-synergy/catalog-manager'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { Door43ApiClient } from '@bt-synergy/door43-api'
import { FilesystemCatalogAdapter, FilesystemCacheAdapter } from './adapters/index.js'
import * as path from 'path'
import * as os from 'os'

// ============================================================================
// GLOBAL STATE
// ============================================================================

const DEFAULT_DATA_DIR = path.join(os.homedir(), '.catalog-cli')
let catalogManager: CatalogManager

/**
 * Initialize catalog manager with filesystem adapters
 */
function initCatalogManager(dataDir: string = DEFAULT_DATA_DIR) {
  const catalogDir = path.join(dataDir, 'catalog')
  const cacheDir = path.join(dataDir, 'cache')
  
  const catalogAdapter = new FilesystemCatalogAdapter(catalogDir)
  const cacheAdapter = new FilesystemCacheAdapter(cacheDir)
  const door43Client = new Door43ApiClient({ debug: false })
  
  // Create catalog manager with proper typing
  const config: any = {
    catalogAdapter,
    cacheAdapter,
    door43Client,
    debug: false
  }
  
  catalogManager = new CatalogManager(config)
  
  // Register scripture loader
  const scriptureLoader = new ScriptureLoader({
    cacheAdapter: cacheAdapter as any,
    catalogAdapter: catalogAdapter as any,
    door43Client: door43Client as any,
    debug: false
  })
  
  catalogManager.registerResourceType(scriptureLoader)
  
  return { catalogManager, catalogDir, cacheDir }
}

// ============================================================================
// UTILITY FUNCTIONS
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B'
  const k = 1024
  const sizes = ['B', 'KB', 'MB', 'GB']
  const i = Math.floor(Math.log(bytes) / Math.log(k))
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`
}

function formatResourceKey(resource: any): string {
  return `${resource.owner}/${resource.language}/${resource.id || resource.resourceId}`
}

// ============================================================================
// COMMANDS
// ============================================================================

/**
 * Search for resources on Door43
 */
program
  .command('search')
  .description('Search for resources on Door43')
  .option('-l, --language <code>', 'Filter by language code (e.g., en, es)')
  .option('-o, --owner <owner>', 'Filter by owner (e.g., unfoldingWord)')
  .option('-s, --subject <subject>', 'Filter by subject (e.g., Bible, Translation Notes)')
  .option('--limit <number>', 'Limit results', '20')
  .action(async (options) => {
    const { catalogManager } = initCatalogManager()
    const spinner = ora('Searching Door43...').start()
    
    try {
      const door43Client = new Door43ApiClient({ debug: false })
      
      // Build filters
      const filters: any = {}
      if (options.language) filters.lang = options.language
      if (options.owner) filters.owner = options.owner
      if (options.subject) filters.subject = options.subject
      
      // Search
      const results = await door43Client.searchCatalog(filters)
      
      spinner.succeed(`Found ${results.length} resources`)
      
      if (results.length === 0) {
        console.log(chalk.yellow('\nNo resources found. Try different filters.'))
        return
      }
      
      // Display results
      console.log(chalk.bold('\n📦 Search Results:\n'))
      
      const limit = parseInt(options.limit)
      const displayed = results.slice(0, limit)
      
      for (const resource of displayed) {
        const key = formatResourceKey(resource)
        console.log(chalk.cyan(`  ${key}`))
        console.log(chalk.gray(`    ${resource.title || resource.name}`))
        console.log(chalk.gray(`    Subject: ${resource.subject || 'N/A'}`))
        console.log(chalk.gray(`    Version: ${resource.version || resource.release?.tag_name || 'N/A'}`))
        console.log()
      }
      
      if (results.length > limit) {
        console.log(chalk.yellow(`\n... and ${results.length - limit} more. Use --limit to see more.\n`))
      }
      
      console.log(chalk.dim(`\n💡 Tip: Use 'catalog-cli add <owner>/<language>/<resourceId>' to add a resource\n`))
      
    } catch (error) {
      spinner.fail('Search failed')
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * Add resource to catalog
 */
program
  .command('add <resourceKey>')
  .description('Add a resource to the catalog (format: owner/language/resourceId)')
  .option('--no-download', 'Add to catalog without downloading')
  .action(async (resourceKey: string, options) => {
    const { catalogManager } = initCatalogManager()
    const spinner = ora(`Adding ${resourceKey} to catalog...`).start()
    
    try {
      // Parse resource key
      const parts = resourceKey.split('/')
      if (parts.length !== 3) {
        throw new Error('Invalid resource key format. Expected: owner/language/resourceId')
      }
      
      const [owner, language, resourceId] = parts
      
      // Fetch metadata from Door43
      const door43Client = new Door43ApiClient({ debug: false })
      const metadata = await door43Client.getResourceMetadata(owner, language, resourceId)
      
      if (!metadata) {
        throw new Error(`Resource not found: ${resourceKey}`)
      }
      
      // Build full metadata
      const subject = Array.isArray(metadata.subjects) && metadata.subjects.length > 0
        ? metadata.subjects[0]
        : 'Unknown'
      
      const fullMetadata: any = {
        resourceKey,
        server: 'git.door43.org',
        owner,
        language,
        resourceId,
        title: (metadata as any).fullName || (metadata as any).title || resourceId.toUpperCase(),
        subject,
        version: metadata.version || '1.0.0',
        type: subject === 'Bible' || subject === 'Aligned Bible' ? 'scripture' : 'unknown',
        format: 'usfm',
        contentType: 'text/usfm',
        availability: {
          online: true,
          offline: false,
          bundled: false,
          partial: false
        },
        locations: [{
          type: 'network',
          path: `git.door43.org/${owner}/${language}_${resourceId}`,
          priority: 1
        }],
        contentMetadata: {
          ingredients: metadata.ingredients || [],
          downloadedIngredients: [],
          downloadStats: {
            totalFiles: (metadata.ingredients || []).length,
            downloadedFiles: 0,
            totalSize: 0,
            downloadedSize: 0
          }
        },
        catalogedAt: new Date().toISOString()
      }
      
      // Add to catalog
      await catalogManager.addResourceToCatalog(fullMetadata)
      
      spinner.succeed(`Added ${resourceKey} to catalog`)
      
      console.log(chalk.green(`\n✅ Resource added successfully!\n`))
      console.log(chalk.gray(`  Title: ${fullMetadata.title}`))
      console.log(chalk.gray(`  Subject: ${fullMetadata.subject}`))
      console.log(chalk.gray(`  Version: ${fullMetadata.version}`))
      console.log(chalk.gray(`  Files: ${(metadata.ingredients || []).length}`))
      
      // Optionally download
      if (options.download) {
        console.log()
        const { shouldDownload } = await inquirer.prompt([{
          type: 'confirm',
          name: 'shouldDownload',
          message: 'Download all files now?',
          default: false
        }])
        
        if (shouldDownload) {
          const downloadSpinner = ora('Downloading...').start()
          
          await catalogManager.downloadResource(resourceKey, {}, (progress) => {
            downloadSpinner.text = `Downloading... ${progress.percentage.toFixed(0)}% (${progress.message})`
          })
          
          downloadSpinner.succeed('Download complete!')
        }
      }
      
      console.log(chalk.dim(`\n💡 Use 'catalog-cli download ${resourceKey}' to download files\n`))
      
    } catch (error) {
      spinner.fail('Failed to add resource')
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * List resources in catalog
 */
program
  .command('list')
  .description('List all resources in the catalog')
  .option('-o, --offline', 'Show only offline (downloaded) resources')
  .option('-p, --partial', 'Show only partially downloaded resources')
  .action(async (options) => {
    const { catalogManager } = initCatalogManager()
    const spinner = ora('Loading catalog...').start()
    
    try {
      const resources = await catalogManager.searchResources({})
      
      spinner.stop()
      
      if (resources.length === 0) {
        console.log(chalk.yellow('\n📦 Catalog is empty\n'))
        console.log(chalk.dim('💡 Use \'catalog-cli search\' to find resources\n'))
        return
      }
      
      // Filter
      let filtered = resources
      if (options.offline) {
        filtered = resources.filter(r => r.availability?.offline && !r.availability?.partial)
      } else if (options.partial) {
        filtered = resources.filter(r => r.availability?.partial)
      }
      
      console.log(chalk.bold(`\n📦 Catalog (${filtered.length} resources):\n`))
      
      for (const resource of filtered) {
        const key = `${resource.owner}/${resource.language}/${resource.resourceId}`
        const downloadedCount = resource.contentMetadata?.downloadedIngredients?.length || 0
        const totalCount = resource.contentMetadata?.ingredients?.length || 0
        
        let status = chalk.yellow('Not Downloaded')
        if (resource.availability.offline && !resource.availability.partial) {
          status = chalk.green('✓ Complete')
        } else if (resource.availability.partial) {
          status = chalk.blue(`⊙ Partial (${downloadedCount}/${totalCount})`)
        }
        
        console.log(chalk.cyan(`  ${key}`) + ` ${status}`)
        console.log(chalk.gray(`    ${resource.title}`))
        console.log(chalk.gray(`    Subject: ${resource.subject} | Version: ${resource.version}`))
        console.log()
      }
      
      console.log(chalk.dim(`💡 Use 'catalog-cli info <resourceKey>' for details\n`))
      
    } catch (error) {
      spinner.fail('Failed to load catalog')
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * Show resource info and stats
 */
program
  .command('info <resourceKey>')
  .description('Show detailed information about a resource')
  .action(async (resourceKey: string) => {
    const { catalogManager } = initCatalogManager()
    
    try {
      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      
      if (!metadata) {
        console.error(chalk.red(`\n❌ Resource not found: ${resourceKey}\n`))
        process.exit(1)
      }
      
      const stats = await catalogManager.getDownloadStats(resourceKey)
      
      console.log(chalk.bold(`\n📖 ${metadata.title}\n`))
      console.log(chalk.gray(`  Key: ${resourceKey}`))
      console.log(chalk.gray(`  Owner: ${metadata.owner}`))
      console.log(chalk.gray(`  Language: ${metadata.language}`))
      console.log(chalk.gray(`  Subject: ${metadata.subject}`))
      console.log(chalk.gray(`  Version: ${metadata.version}`))
      console.log(chalk.gray(`  Type: ${metadata.type}`))
      console.log(chalk.gray(`  Format: ${metadata.format}`))
      
      if (stats) {
        console.log()
        console.log(chalk.bold('📊 Download Statistics:'))
        console.log(chalk.gray(`  Files: ${stats.downloadedFiles}/${stats.totalFiles}`))
        
        if (stats.totalSize > 0) {
          console.log(chalk.gray(`  Size: ${formatBytes(stats.downloadedSize)}/${formatBytes(stats.totalSize)}`))
        }
        
        if (stats.lastDownload) {
          const date = new Date(stats.lastDownload)
          console.log(chalk.gray(`  Last Download: ${date.toLocaleString()}`))
        }
        
        if (stats.downloadMethod) {
          console.log(chalk.gray(`  Method: ${stats.downloadMethod}`))
        }
        
        const progress = stats.totalFiles > 0 
          ? ((stats.downloadedFiles / stats.totalFiles) * 100).toFixed(1)
          : '0'
        console.log(chalk.gray(`  Progress: ${progress}%`))
      }
      
      // Show ingredients
      const ingredients = metadata.contentMetadata?.ingredients || []
      const downloadedIngredients = metadata.contentMetadata?.downloadedIngredients || []
      
      if (ingredients.length > 0) {
        console.log()
        console.log(chalk.bold('📄 Files:'))
        
        const displayLimit = 10
        const displayed = ingredients.slice(0, displayLimit)
        
        for (const ing of displayed) {
          const isDownloaded = downloadedIngredients.includes(ing.identifier)
          const icon = isDownloaded ? chalk.green('✓') : chalk.gray('○')
          const size = ing.size ? chalk.dim(`(${formatBytes(ing.size)})`) : ''
          console.log(`  ${icon} ${ing.identifier} - ${ing.title} ${size}`)
        }
        
        if (ingredients.length > displayLimit) {
          console.log(chalk.dim(`  ... and ${ingredients.length - displayLimit} more`))
        }
      }
      
      console.log()
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * Download resource (all files)
 */
program
  .command('download <resourceKey>')
  .description('Download all files for a resource')
  .option('-m, --method <method>', 'Download method: individual (default) or zip (faster)', 'individual')
  .action(async (resourceKey: string, options) => {
    const { catalogManager } = initCatalogManager()
    const method = options.method as 'individual' | 'zip'
    
    if (method !== 'individual' && method !== 'zip') {
      console.error(chalk.red(`\n❌ Invalid method: ${method}. Use 'individual' or 'zip'\n`))
      process.exit(1)
    }
    
    const methodLabel = method === 'zip' ? '(ZIP bulk)' : '(individual files)'
    const spinner = ora(`Downloading ${resourceKey} ${methodLabel}...`).start()
    
    try {
      await catalogManager.downloadResource(
        resourceKey,
        { method },
        (progress) => {
          spinner.text = `Downloading ${resourceKey}... ${progress.percentage.toFixed(0)}% (${progress.message})`
        }
      )
      
      spinner.succeed(`Downloaded ${resourceKey}`)
      console.log(chalk.green(`\n✅ All files downloaded successfully using ${method} method!\n`))
      
    } catch (error) {
      spinner.fail('Download failed')
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2)
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`))
      if (error instanceof Error && error.stack) {
        console.error(chalk.gray('\nStack trace:'))
        console.error(chalk.gray(error.stack))
      }
      process.exit(1)
    }
  })

/**
 * Download specific ingredient
 */
program
  .command('download-file <resourceKey> <ingredientId>')
  .description('Download a specific file/ingredient')
  .action(async (resourceKey: string, ingredientId: string) => {
    const { catalogManager } = initCatalogManager()
    const spinner = ora(`Downloading ${ingredientId}...`).start()
    
    try {
      await catalogManager.downloadIngredient(resourceKey, ingredientId, {
        onProgress: (progress) => {
          spinner.text = `Downloading ${ingredientId}... ${progress.toFixed(0)}%`
        }
      })
      
      spinner.succeed(`Downloaded ${ingredientId}`)
      console.log(chalk.green(`\n✅ File downloaded successfully!\n`))
      
    } catch (error) {
      spinner.fail('Download failed')
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * Remove resource from catalog
 */
program
  .command('remove <resourceKey>')
  .description('Remove a resource from the catalog')
  .option('--keep-cache', 'Keep downloaded files in cache')
  .action(async (resourceKey: string, options) => {
    const { catalogManager } = initCatalogManager()
    
    try {
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message: `Remove ${resourceKey} from catalog?`,
        default: false
      }])
      
      if (!confirmed) {
        console.log(chalk.yellow('\nCancelled\n'))
        return
      }
      
      const spinner = ora('Removing...').start()
      
      await catalogManager.removeResource(resourceKey)
      
      spinner.succeed('Removed from catalog')
      console.log(chalk.green(`\n✅ Resource removed successfully!\n`))
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * Export resource package for offline sharing
 */
program
  .command('export <resourceKey>')
  .description('Export a resource as a ZIP package for offline sharing')
  .option('-o, --output <path>', 'Output file path (default: <resourceKey>.zip)')
  .action(async (resourceKey: string, options) => {
    const { catalogManager } = initCatalogManager()
    const jszipMod = await import('jszip')
    const JSZip = ((jszipMod as { default?: unknown }).default ?? jszipMod) as any
    const fs = await import('fs/promises')
    const path = await import('path')
    
    const spinner = ora(`Exporting ${resourceKey}...`).start()
    
    try {
      // 1. Get resource metadata
      const metadata = await catalogManager.getResourceMetadata(resourceKey)
      if (!metadata) {
        throw new Error(`Resource not found: ${resourceKey}`)
      }
      
      // 2. Check if resource is downloaded
      if (!metadata.availability?.offline) {
        spinner.fail('Export failed')
        console.error(chalk.red(`\n❌ Resource not downloaded. Download it first with:\n`))
        console.log(chalk.gray(`   catalog-cli download ${resourceKey} --method zip\n`))
        process.exit(1)
      }
      
      spinner.text = 'Creating ZIP package...'
      
      // 3. Create ZIP
      const zip = new JSZip()
      
      // Add catalog metadata
      zip.file('catalog.json', JSON.stringify(metadata, null, 2))
      
      // 4. Add all cached books
      const booksFolder = zip.folder('books')!
      const downloadedIngredients = metadata.contentMetadata?.downloadedIngredients || []
      
      let addedBooks = 0
      for (const ingredientId of downloadedIngredients) {
        const cacheKey = `${resourceKey}/${ingredientId}`
        
        // Read from filesystem cache
        const cacheDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.catalog-cli', 'cache')
        const resourcePath = resourceKey.replace(/\//g, path.sep)
        const bookPath = path.join(cacheDir, resourcePath, `${ingredientId}.json`)
        
        try {
          const content = await fs.readFile(bookPath, 'utf-8')
          booksFolder.file(`${ingredientId}.json`, content)
          addedBooks++
          
          spinner.text = `Adding books... ${addedBooks}/${downloadedIngredients.length}`
        } catch (error) {
          console.warn(chalk.yellow(`⚠️  Skipped ${ingredientId}: not cached`))
        }
      }
      
      spinner.text = 'Generating ZIP file...'
      
      // 5. Generate ZIP blob
      const zipBlob = await zip.generateAsync({
        type: 'nodebuffer',
        compression: 'DEFLATE',
        compressionOptions: { level: 9 }
      })
      
      // 6. Save to file
      const outputPath = options.output || `${resourceKey.replace(/\//g, '_')}.zip`
      await fs.writeFile(outputPath, zipBlob)
      
      const sizeInMB = (zipBlob.length / 1024 / 1024).toFixed(2)
      
      spinner.succeed(`Exported ${resourceKey}`)
      console.log(chalk.green(`\n✅ Resource package created successfully!\n`))
      console.log(chalk.gray(`  File: ${outputPath}`))
      console.log(chalk.gray(`  Size: ${sizeInMB} MB`))
      console.log(chalk.gray(`  Books: ${addedBooks}`))
      console.log(chalk.dim(`\n💡 Share this file for offline use:\n   catalog-cli import ${outputPath}\n`))
      
    } catch (error) {
      spinner.fail('Export failed')
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2)
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`))
      if (error instanceof Error && error.stack) {
        console.error(chalk.gray('Stack trace:'))
        console.error(chalk.gray(error.stack))
      }
      process.exit(1)
    }
  })

/**
 * Import resource package from ZIP
 */
program
  .command('import <zipFile>')
  .description('Import a resource package from ZIP file')
  .action(async (zipFile: string) => {
    const { catalogManager } = initCatalogManager()
    const jszipMod = await import('jszip')
    const JSZip = ((jszipMod as { default?: unknown }).default ?? jszipMod) as any
    const fs = await import('fs/promises')
    const path = await import('path')
    
    const spinner = ora(`Importing ${zipFile}...`).start()
    
    try {
      // 1. Read ZIP file
      spinner.text = 'Reading ZIP file...'
      const zipData = await fs.readFile(zipFile)
      
      // 2. Load ZIP
      spinner.text = 'Extracting ZIP...'
      const zip = await JSZip.loadAsync(zipData)
      
      // 3. Read catalog metadata
      const catalogFile = zip.files['catalog.json']
      if (!catalogFile) {
        throw new Error('Invalid resource package: missing catalog.json')
      }
      
      const catalogJson = await catalogFile.async('string')
      const metadata = JSON.parse(catalogJson)
      
      spinner.text = `Importing ${metadata.title}...`
      
      // 4. Add to catalog
      await catalogManager.addResourceToCatalog(metadata)
      
      // 5. Extract and cache books
      const bookFiles = Object.keys(zip.files).filter(path => path.startsWith('books/') && path.endsWith('.json'))
      let importedBooks = 0
      
      const cacheDir = path.join(process.env.HOME || process.env.USERPROFILE || '~', '.catalog-cli', 'cache')
      const resourcePath = metadata.resourceKey.replace(/\//g, path.sep)
      const targetDir = path.join(cacheDir, resourcePath)
      
      // Create directory
      await fs.mkdir(targetDir, { recursive: true })
      
      for (const bookPath of bookFiles) {
        const bookFile = zip.files[bookPath]
        const content = await bookFile.async('string')
        const bookName = path.basename(bookPath)
        const targetPath = path.join(targetDir, bookName)
        
        // Write book content
        await fs.writeFile(targetPath, content, 'utf-8')
        
        // Write metadata
        await fs.writeFile(targetPath + '.meta.json', JSON.stringify({
          contentType: 'usfm-json',
          cachedAt: new Date().toISOString(),
          size: content.length,
          format: 'json'
        }, null, 2), 'utf-8')
        
        importedBooks++
        spinner.text = `Importing books... ${importedBooks}/${bookFiles.length}`
      }
      
      spinner.succeed(`Imported ${metadata.title}`)
      console.log(chalk.green(`\n✅ Resource package imported successfully!\n`))
      console.log(chalk.gray(`  Resource: ${metadata.resourceKey}`))
      console.log(chalk.gray(`  Books: ${importedBooks}`))
      console.log(chalk.dim(`\n💡 View details:\n   catalog-cli info ${metadata.resourceKey}\n`))
      
    } catch (error) {
      spinner.fail('Import failed')
      const errorMessage = error instanceof Error ? error.message : JSON.stringify(error, null, 2)
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`))
      if (error instanceof Error && error.stack) {
        console.error(chalk.gray('Stack trace:'))
        console.error(chalk.gray(error.stack))
      }
      process.exit(1)
    }
  })

/**
 * Show catalog stats
 */
program
  .command('stats')
  .description('Show catalog statistics')
  .action(async () => {
    const { catalogManager, catalogDir, cacheDir } = initCatalogManager()
    const spinner = ora('Calculating stats...').start()
    
    try {
      const stats = await catalogManager.getCatalogStats()
      
      spinner.stop()
      
      console.log(chalk.bold('\n📊 Catalog Statistics:\n'))
      console.log(chalk.gray(`  Total Resources: ${stats.totalResources}`))
      console.log(chalk.gray(`  Languages: ${stats.totalLanguages}`))
      console.log(chalk.gray(`  Owners: ${stats.totalOwners}`))
      console.log()
      if ('availableOffline' in stats) {
        console.log(chalk.gray(`  Available Offline: ${stats.availableOffline || 0}`))
      }
      if ('availableOnline' in stats) {
        console.log(chalk.gray(`  Available Online: ${stats.availableOnline || 0}`))
      }
      
      if (Object.keys(stats.bySubject).length > 0) {
        console.log()
        console.log(chalk.bold('By Subject:'))
        for (const [subject, count] of Object.entries(stats.bySubject)) {
          console.log(chalk.gray(`  ${subject}: ${count}`))
        }
      }
      
      if (Object.keys(stats.byLanguage).length > 0) {
        console.log()
        console.log(chalk.bold('By Language:'))
        const languages = Object.entries(stats.byLanguage).slice(0, 5)
        for (const [lang, count] of languages) {
          console.log(chalk.gray(`  ${lang}: ${count}`))
        }
        if (Object.keys(stats.byLanguage).length > 5) {
          console.log(chalk.dim(`  ... and ${Object.keys(stats.byLanguage).length - 5} more`))
        }
      }
      
      console.log()
      console.log(chalk.dim(`Catalog Dir: ${catalogDir}`))
      console.log(chalk.dim(`Cache Dir: ${cacheDir}`))
      console.log()
      
    } catch (error) {
      spinner.fail('Failed to get stats')
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

/**
 * Clear catalog and/or cache
 */
program
  .command('clear')
  .description('Clear catalog and/or cache')
  .option('--catalog', 'Clear catalog only')
  .option('--cache', 'Clear cache only')
  .action(async (options) => {
    const { catalogManager } = initCatalogManager()
    
    try {
      const clearCatalog = options.catalog || (!options.catalog && !options.cache)
      const clearCache = options.cache || (!options.catalog && !options.cache)
      
      const message = clearCatalog && clearCache 
        ? 'Clear both catalog and cache?'
        : clearCatalog
        ? 'Clear catalog (keep cache)?'
        : 'Clear cache (keep catalog)?'
      
      const { confirmed } = await inquirer.prompt([{
        type: 'confirm',
        name: 'confirmed',
        message,
        default: false
      }])
      
      if (!confirmed) {
        console.log(chalk.yellow('\nCancelled\n'))
        return
      }
      
      const spinner = ora('Clearing...').start()
      
      if (clearCatalog && clearCache) {
        await catalogManager.clearAll()
        spinner.succeed('Cleared catalog and cache')
      } else if (clearCache) {
        await catalogManager.clearCache()
        spinner.succeed('Cleared cache')
      } else {
        // Clear catalog only - need to manually call adapter
        const catalogAdapter = (catalogManager as any).catalogAdapter
        await catalogAdapter.clear()
        spinner.succeed('Cleared catalog')
      }
      
      console.log(chalk.green('\n✅ Cleared successfully!\n'))
      
    } catch (error) {
      console.error(chalk.red(`\n❌ Error: ${error}\n`))
      process.exit(1)
    }
  })

// ============================================================================
// MAIN
// ============================================================================

program
  .name('catalog-cli')
  .description('CLI tool for managing resource catalogs and downloads')
  .version('1.0.0')

program.parse()
