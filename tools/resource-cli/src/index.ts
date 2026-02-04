#!/usr/bin/env node

/**
 * BT-Synergy Resource CLI
 * 
 * CLI tool for generating and managing resource packages
 */

import { Command } from 'commander'
import { createCommand } from './commands/create'
import { preloadCommand } from './commands/preload'
import { logger } from './utils/logger'

const program = new Command()

program
  .name('resource')
  .description('BT-Synergy Resource Package Generator')
  .version('0.1.0')

// Create command
program
  .command('create [name]')
  .description('Create a new resource type (package or app module)')
  .option('-p, --platforms <platforms...>', 'Target platforms (web, native)', ['web'])
  .option('-d, --description <description>', 'Package description')
  .option('-s, --subjects <subjects...>', 'Door43 subjects')
  .option('-l, --location-type <type>', 'Location type: external or internal')
  .option('--skip-install', 'Skip dependency installation')
  .option('--skip-git', 'Skip git initialization')
  .action(async (name, options) => {
    try {
      await createCommand(name, options)
    } catch (error) {
      logger.error((error as Error).message)
      process.exit(1)
    }
  })

// Preload command
program
  .command('preload')
  .description('Fetch Door43 metadata for preloaded resources (metadata-only, content loads on-demand)')
  .option('-o, --output <directory>', 'Output directory', './public/preloaded')
  .option('-r, --resources <resources...>', 'Resources to preload (owner/language/resourceId)')
  .option('-c, --config <file>', 'Config file with resource list')
  .action(async (options) => {
    try {
      await preloadCommand(options)
    } catch (error) {
      logger.error((error as Error).message)
      process.exit(1)
    }
  })

// Parse arguments
program.parse()

// Show help if no command specified
if (!process.argv.slice(2).length) {
  program.outputHelp()
}

