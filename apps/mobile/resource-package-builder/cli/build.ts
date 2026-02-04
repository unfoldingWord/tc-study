#!/usr/bin/env node

/**
 * Resource Package Builder CLI
 * 
 * Command-line interface for building resource packages
 */

import { Command } from 'commander';
import { PackageBuilder } from '../core/PackageBuilder';

const program = new Command();

program
  .name('rpb')
  .description('Resource Package Builder CLI')
  .version('2.0.0');

// Build command
program
  .command('build <package>')
  .description('Build a resource package')
  .option('-o, --output <dir>', 'Output directory')
  .option('--skip-existing', 'Skip resources that already exist')
  .option('--force-update', 'Force update even if resource exists')
  .option('--verbose', 'Enable verbose logging')
  .action(async (packageName, options) => {
    try {
      console.log(`🚀 Building package: ${packageName}`);
      
      const builder = new PackageBuilder();
      const result = await builder.buildPackage(packageName, {
        skipExisting: options.skipExisting,
        forceUpdate: options.forceUpdate,
        verbose: options.verbose
      });

      if (result.success) {
        console.log(`\n🎉 Package built successfully!`);
        console.log(`📁 Output: ${result.outputDir}`);
        console.log(`📊 Resources: ${result.statistics.totalResources}`);
        console.log(`📊 Files: ${result.statistics.totalFiles}`);
        console.log(`📦 Size: ${(result.statistics.totalSize / 1024).toFixed(2)} KB`);
        console.log(`⏱️  Time: ${(result.statistics.buildTime / 1000).toFixed(2)}s`);
        
        // Show cache statistics if verbose
        if (options.verbose) {
          const cacheStats = builder.getCacheStats();
          console.log(`\n💾 Cache Statistics:`);
          console.log(`   Servers: ${cacheStats.servers}`);
          console.log(`   Resources: ${cacheStats.resources}`);
          console.log(`   Configs: ${cacheStats.configs}`);
          console.log(`   Total: ${cacheStats.total}`);
        }
      } else {
        console.error(`\n❌ Build failed:`);
        result.errors.forEach(error => console.error(`  - ${error}`));
        process.exit(1);
      }

    } catch (error: any) {
      console.error(`❌ Build failed:`, error.message);
      process.exit(1);
    }
  });

// List packages command
program
  .command('list-packages')
  .description('List available package configurations')
  .action(async () => {
    try {
      const builder = new PackageBuilder();
      const packages = await builder.listPackages();
      
      console.log('📦 Available packages:');
      if (packages.length === 0) {
        console.log('  No packages found. Create a JSON file in the packages/ directory.');
      } else {
        packages.forEach(pkg => console.log(`  - ${pkg}`));
      }
      
    } catch (error: any) {
      console.error('❌ Failed to list packages:', error.message);
      process.exit(1);
    }
  });

// List resources command
program
  .command('list-resources')
  .description('List available resources')
  .action(async () => {
    try {
      const builder = new PackageBuilder();
      const resources = await builder.listResources();
      
      console.log('📚 Available resources:');
      if (resources.length === 0) {
        console.log('  No resources found.');
      } else {
        resources.forEach(resource => console.log(`  - ${resource}`));
      }
      
    } catch (error: any) {
      console.error('❌ Failed to list resources:', error.message);
      process.exit(1);
    }
  });

// List servers command
program
  .command('list-servers')
  .description('List supported server types and their configuration requirements')
  .action(async () => {
    try {
      const builder = new PackageBuilder();
      const servers = builder.listSupportedServers();
      
      console.log('🖥️  Supported servers:');
      if (servers.length === 0) {
        console.log('  No servers found.');
      } else {
        servers.forEach(server => {
          console.log(`\n  📡 ${server.name} (${server.id})`);
          console.log(`     Required: ${server.requiredFields.join(', ')}`);
          console.log(`     Optional: ${server.optionalFields.join(', ')}`);
        });
      }
      
    } catch (error: any) {
      console.error('❌ Failed to list servers:', error.message);
      process.exit(1);
    }
  });

// Server config command
program
  .command('server-config <server>')
  .description('Show configuration example for a specific server')
  .action(async (serverId) => {
    try {
      const builder = new PackageBuilder();
      const schema = builder.getServerSchema(serverId);
      const example = builder.getServerConfigExample(serverId);
      
      if (!schema) {
        console.error(`❌ Unknown server: ${serverId}`);
        process.exit(1);
      }
      
      console.log(`📡 ${schema.serverName} (${schema.serverId})`);
      console.log(`\n📋 Required fields:`);
      schema.requiredFields.forEach(field => {
        console.log(`  - ${field}: ${schema.fieldDescriptions[field] || 'No description'}`);
      });
      
      console.log(`\n📋 Optional fields:`);
      schema.optionalFields.forEach(field => {
        console.log(`  - ${field}: ${schema.fieldDescriptions[field] || 'No description'}`);
      });
      
      if (example) {
        console.log(`\n💡 Example configuration:`);
        console.log(JSON.stringify(example, null, 2));
      }
      
    } catch (error: any) {
      console.error('❌ Failed to get server config:', error.message);
      process.exit(1);
    }
  });

// Cache management command
program
  .command('cache')
  .description('Manage package builder cache')
  .option('--clear', 'Clear all caches')
  .option('--stats', 'Show cache statistics')
  .action(async (options) => {
    try {
      const builder = new PackageBuilder();
      
      if (options.clear) {
        builder.clearCache();
        console.log('✅ Cache cleared successfully');
      }
      
      if (options.stats) {
        const stats = builder.getCacheStats();
        console.log('💾 Cache Statistics:');
        console.log(`   Servers: ${stats.servers}`);
        console.log(`   Resources: ${stats.resources}`);
        console.log(`   Configs: ${stats.configs}`);
        console.log(`   Total: ${stats.total}`);
      }
      
      if (!options.clear && !options.stats) {
        console.log('Use --clear to clear cache or --stats to show statistics');
      }
      
    } catch (error: any) {
      console.error('❌ Cache operation failed:', error.message);
      process.exit(1);
    }
  });

// Create package command
program
  .command('create-package <name>')
  .description('Create a new package configuration template')
  .option('-d, --description <text>', 'Package description')
  .action(async (name, options) => {
    try {
      const template = {
        name: name,
        version: '1.0.0',
        description: options.description || `Resource package: ${name}`,
        outputDir: `outputs/${name}`,
        server: 'door43',
        config: {
          owner: 'unfoldingWord',
          language: 'en',
          stage: 'prod'
        },
        resources: [
          {
            id: 'uw_lt',
            description: 'Inherits package server and config'
          },
          {
            id: 'uw_tn',
            description: 'Inherits package server and config',
            dependencies: [
              {
                resourceId: 'uw_lt',
                purpose: 'original_quotes',
                required: true
              }
            ]
          }
        ],
        metadata: {
          author: 'Resource Package Builder',
          license: 'MIT'
        }
      };

      const fs = await import('fs/promises');
      const path = await import('path');
      
      const packagesDir = './packages';
      await fs.mkdir(packagesDir, { recursive: true });
      
      const configPath = path.join(packagesDir, `${name}.json`);
      await fs.writeFile(configPath, JSON.stringify(template, null, 2));
      
      console.log(`✅ Created package template: ${name}`);
      console.log(`📝 Edit packages/${name}.json to customize`);
      
    } catch (error: any) {
      console.error('❌ Failed to create package:', error.message);
      process.exit(1);
    }
  });

// Help command
program
  .command('help')
  .description('Show help information')
  .action(() => {
    console.log('📚 Resource Package Builder Help\n');
    console.log('🚀 Quick Start:');
    console.log('  npm run build create-package my-package');
    console.log('  npm run build my-package\n');
    console.log('🖥️  Server Management:');
    console.log('  npm run build list-servers');
    console.log('  npm run build server-config <server>\n');
    console.log('📚 Resource Management:');
    console.log('  npm run build list-resources\n');
    console.log('💾 Cache Management:');
    console.log('  npm run build cache --stats');
    console.log('  npm run build cache --clear\n');
    console.log('👨‍💻 Developer Resources:');
    console.log('  - Developer Guide: DEVELOPER_GUIDE.md');
    console.log('  - Quick Reference: QUICK_REFERENCE.md');
    console.log('  - Server Schemas: core/types/ServerConfig.ts');
    console.log('  - Resource Examples: resources/uw_tn/\n');
    console.log('📞 Support:');
    console.log('  - GitHub Issues: https://github.com/bt-synergy/resource-package-builder/issues');
    console.log('  - GitHub Discussions: https://github.com/bt-synergy/resource-package-builder/discussions');
  });

// Parse command line arguments
program.parse();
