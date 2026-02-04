/**
 * List command - List available resources from Door43
 */

import { Command } from 'commander'
import { logger } from '../../utils/logger.js'

export function createListCommand(): Command {
  const command = new Command('list')
    .description('List available resources from Door43')
    .option('-l, --language <code>', 'Filter by language (e.g., en, el-x-koine)')
    .option('-o, --owner <name>', 'Filter by owner (e.g., unfoldingWord)')
    .option('-t, --type <type>', 'Filter by resource type (scripture, words, etc.)')
    .action(listAction)

  return command
}

async function listAction(options: any) {
  try {
    logger.info('📚 Common Resources Available:\n')

    const resources = [
      {
        id: 'ugnt',
        language: 'el-x-koine',
        owner: 'unfoldingWord',
        title: 'unfoldingWord® Greek New Testament',
        type: 'scripture'
      },
      {
        id: 'uhb',
        language: 'hbo',
        owner: 'unfoldingWord',
        title: 'unfoldingWord® Hebrew Bible',
        type: 'scripture'
      },
      {
        id: 'ult',
        language: 'en',
        owner: 'unfoldingWord',
        title: 'unfoldingWord® Literal Text',
        type: 'scripture'
      },
      {
        id: 'ust',
        language: 'en',
        owner: 'unfoldingWord',
        title: 'unfoldingWord® Simplified Text',
        type: 'scripture'
      },
      {
        id: 'tw',
        language: 'en',
        owner: 'unfoldingWord',
        title: 'unfoldingWord® Translation Words',
        type: 'words'
      },
      {
        id: 'twl',
        language: 'en',
        owner: 'unfoldingWord',
        title: 'unfoldingWord® Translation Words Links',
        type: 'words-links'
      }
    ]

    // Apply filters
    let filtered = resources

    if (options.language) {
      filtered = filtered.filter(r => r.language === options.language)
    }

    if (options.owner) {
      filtered = filtered.filter(r => r.owner === options.owner)
    }

    if (options.type) {
      filtered = filtered.filter(r => r.type === options.type)
    }

    // Display results
    if (filtered.length === 0) {
      logger.warn('No resources found matching the filters')
      return
    }

    for (const resource of filtered) {
      console.log(`📖 ${resource.title}`)
      console.log(`   ID: ${resource.id}`)
      console.log(`   Language: ${resource.language}`)
      console.log(`   Owner: ${resource.owner}`)
      console.log(`   Type: ${resource.type}`)
      console.log(``)
    }

    logger.info(`Total: ${filtered.length} resource(s)`)
    logger.info(`\n💡 To bundle resources, use:`)
    logger.info(`   bt-bundle bundle --resources ${filtered.map(r => r.id).slice(0, 3).join(',')}`)

  } catch (error: any) {
    logger.error(`List failed: ${error.message}`)
    process.exit(1)
  }
}
