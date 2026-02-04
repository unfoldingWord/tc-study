#!/usr/bin/env node

/**
 * BT Synergy Resource Bundler CLI
 * 
 * Bundle and preload resources for web and mobile apps
 */

import { Command } from 'commander'
import { createBundleCommand } from './commands/bundle.js'
import { createListCommand } from './commands/list.js'
import { createCacheCommand } from './commands/cache.js'

const program = new Command()

program
  .name('bt-bundle')
  .description('BT Synergy Resource Bundler - Bundle resources for web and mobile apps')
  .version('1.0.0')

// Add commands
program.addCommand(createBundleCommand())
program.addCommand(createListCommand())
program.addCommand(createCacheCommand())

// Help command
program
  .command('help')
  .description('Show help information')
  .action(() => {
    console.log(`
📦 BT Synergy Resource Bundler

A CLI tool for bundling and preloading Bible translation resources
for web and mobile applications.

🚀 Quick Start:
  bt-bundle list                              # List available resources
  bt-bundle bundle --resources ugnt,uhb       # Bundle Greek NT and Hebrew Bible
  bt-bundle cache --stats                     # Show cache statistics

📚 Commands:
  bundle      Bundle resources for static deployment
  list        List available resources from Door43
  cache       Manage download cache
  help        Show this help

📖 Examples:
  # Bundle original language resources
  bt-bundle bundle --resources ugnt,uhb \\
    --output public/preloaded \\
    --compress --manifest

  # Bundle with config file
  bt-bundle bundle --config bundle-config.json

  # List English resources
  bt-bundle list --language en

  # Clear cache
  bt-bundle cache --clear

🔗 Documentation:
  https://github.com/bt-synergy/bt-synergy/tree/main/packages/resource-bundler

📞 Support:
  https://github.com/bt-synergy/bt-synergy/issues
`)
  })

// Parse arguments
program.parse()
