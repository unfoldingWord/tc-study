#!/usr/bin/env node

/**
 * TOC Generator CLI - Command-line tool for generating Table of Contents files
 * 
 * This tool generates a TOC (ingredients) file for Door43 resources by:
 * 1. Recursively scanning the repository for files
 * 2. Extracting titles from markdown content
 * 3. Building a structured ingredients list
 * 4. Saving the TOC file to the repository
 * 
 * Used as part of the release process to ensure accurate TOC files.
 */

import chalk from 'chalk';
import { program } from 'commander';
import inquirer from 'inquirer';
import ora from 'ora';
import { generateToken, getAuthConfig, getAuthToken, saveTokenToEnv } from './auth.js';
import { getAllGenerators, getGenerator, getGeneratorIds } from './generators/index.js';
import { TocGenerator } from './toc-generator.js';
import type { TocBuilder } from './types.js';

// ============================================================================
// CLI COMMANDS
// ============================================================================

/**
 * Generate TOC for Translation Words resource
 */
program
  .command('generate-tw')
  .description('Generate TOC file for a Translation Words resource')
  .option('-o, --owner <owner>', 'Repository owner (e.g., unfoldingWord)')
  .option('-l, --language <language>', 'Resource language code (e.g., en, es-419)')
  .option('-r, --resource-id <resourceId>', 'Resource ID (e.g., tw)')
  .option('-s, --server <server>', 'Door43 server URL', 'git.door43.org')
  .option('--ref <ref>', 'Git reference to read files from (tag, branch, or commit). Defaults to latest release tag or master')
  .option('--branch <branch>', 'Branch name to create/commit to (default: auto-generated toc-update-YYYYMMDD-HHMMSS)')
  .option('--toc-file <path>', 'Path for TOC file in repository', 'toc.json')
  .option('-u, --username <username>', 'Door43 username (for authentication)')
  .option('-p, --password <password>', 'Door43 password (for authentication)')
  .option('-t, --token <token>', 'Door43 personal access token (preferred over username/password)')
  .option('--debug', 'Enable debug logging')
  .action(async (options) => {
    try {
      // Prompt for required parameters if not provided
      let owner = options.owner;
      let language = options.language;
      let resourceId = options.resourceId;

      if (!owner || !language || !resourceId) {
        const params = await inquirer.prompt([
          {
            type: 'input',
            name: 'owner',
            message: 'Repository owner (e.g., unfoldingWord):',
            when: !owner,
            validate: (input) => input.trim().length > 0 || 'Owner is required',
          },
          {
            type: 'input',
            name: 'language',
            message: 'Resource language code (e.g., en, es-419):',
            when: !language,
            validate: (input) => input.trim().length > 0 || 'Language is required',
          },
          {
            type: 'input',
            name: 'resourceId',
            message: 'Resource ID (e.g., tw):',
            when: !resourceId,
            validate: (input) => input.trim().length > 0 || 'Resource ID is required',
          },
        ]);

        owner = owner || params.owner;
        language = language || params.language;
        resourceId = resourceId || params.resourceId;
      }

      // Get auth config from env or options
      const envAuth = getAuthConfig({
        username: options.username,
        password: options.password,
        token: options.token,
        server: options.server,
      });

      // Prompt for credentials if not provided in env or options
      let username = envAuth.username;
      let password = envAuth.password;
      let token = envAuth.token;

      if (!token && !username) {
        const credentials = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Door43 username:',
            when: !username,
          },
          {
            type: 'password',
            name: 'password',
            message: 'Door43 password:',
            when: !password && !token,
            mask: '*',
          },
          {
            type: 'input',
            name: 'token',
            message: 'Door43 personal access token (optional, preferred):',
            when: !token && !password,
          },
        ]);

        username = username || credentials.username;
        password = password || credentials.password;
        token = token || credentials.token;
      }

      // Get auth token (auto-generate if needed)
      const auth = await getAuthToken({
        username,
        password,
        token,
        server: options.server,
      }, true);

      if (!auth.token && (!auth.username || !auth.password)) {
        console.error(chalk.red('\n❌ Error: Provide either token or username/password\n'));
        console.error(chalk.yellow('💡 Tip: Create a .env file with DOOR43_TOKEN or DOOR43_USERNAME/DOOR43_PASSWORD\n'));
        process.exit(1);
      }

      // Use the resolved auth values
      token = auth.token;
      username = auth.username;
      password = auth.password;

      // Get TOC builder from registry (default to 'tw')
      const generatorInfo = getGenerator('tw');
      if (!generatorInfo) {
        console.error(chalk.red(`\n❌ Error: Translation Words generator not found\n`));
        process.exit(1);
      }
      const tocBuilder: TocBuilder = generatorInfo.builder;

      // Start spinner after credentials are collected
      const spinner = ora('Generating TOC file...').start();

      // Create generator
      const generator = new TocGenerator({
        server: auth.server,
        owner,
        language,
        resourceId,
        ref: options.ref,
        branch: options.branch,
        tocBuilder,
        tocFilePath: options.tocFile,
        username,
        password,
        token,
        debug: options.debug || process.env.DEBUG === '1',
      });

      spinner.text = 'Scanning repository and extracting titles...';

      // Generate TOC
      const result = await generator.generate();

      if (result.success) {
        spinner.succeed('TOC file generated successfully!');
        console.log(chalk.green(`\n✅ Success!\n`));
        console.log(chalk.gray(`  File: ${result.filePath}`));
        console.log(chalk.gray(`  Branch: ${result.branch}`));
        console.log(chalk.gray(`  Ingredients: ${result.ingredientsCount}`));
        if (result.commitSha) {
          console.log(chalk.gray(`  Commit: ${result.commitSha.substring(0, 7)}...`));
        }
        console.log();
        console.log(chalk.yellow(`💡 The TOC file has been committed to branch '${result.branch}'`));
        console.log(chalk.yellow(`   You can now create a pull request to merge it into the main branch.\n`));
      } else {
        spinner.fail('Failed to generate TOC file');
        console.error(chalk.red(`\n❌ Error: ${result.error}\n`));
        process.exit(1);
      }
    } catch (error) {
      // Better error message handling
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.stack && process.env.DEBUG) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else if (typeof error === 'object' && error !== null) {
        const errObj = error as any;
        errorMessage = errObj.message || errObj.error || errObj.toString?.() || JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }
      
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`));
      process.exit(1);
    }
  });

/**
 * Generate TOC with custom builder (for extensibility)
 * This command allows using a custom TOC builder via a callback
 */
program
  .command('generate')
  .description('Generate TOC file with custom builder (for extensibility)')
  .option('-o, --owner <owner>', 'Repository owner')
  .option('-l, --language <language>', 'Resource language code')
  .option('-r, --resource-id <resourceId>', 'Resource ID')
  .option('-s, --server <server>', 'Door43 server URL', 'git.door43.org')
  .option('--ref <ref>', 'Git reference to read files from (tag, branch, or commit). Defaults to latest release tag or master')
  .option('--branch <branch>', 'Branch name to create/commit to (default: auto-generated toc-update-YYYYMMDD-HHMMSS)')
  .option('--toc-file <path>', 'Path for TOC file in repository', 'toc.json')
  .option('-u, --username <username>', 'Door43 username')
  .option('-p, --password <password>', 'Door43 password')
  .option('-t, --token <token>', 'Door43 personal access token')
  .option('--builder <builder>', 'TOC builder type (tw, custom)', 'tw')
  .action(async (options) => {
    try {
      // Prompt for required parameters if not provided
      let owner = options.owner;
      let language = options.language;
      let resourceId = options.resourceId;

      if (!owner || !language || !resourceId) {
        const params = await inquirer.prompt([
          {
            type: 'input',
            name: 'owner',
            message: 'Repository owner:',
            when: !owner,
            validate: (input) => input.trim().length > 0 || 'Owner is required',
          },
          {
            type: 'input',
            name: 'language',
            message: 'Resource language code:',
            when: !language,
            validate: (input) => input.trim().length > 0 || 'Language is required',
          },
          {
            type: 'input',
            name: 'resourceId',
            message: 'Resource ID:',
            when: !resourceId,
            validate: (input) => input.trim().length > 0 || 'Resource ID is required',
          },
        ]);

        owner = owner || params.owner;
        language = language || params.language;
        resourceId = resourceId || params.resourceId;
      }

      // Get auth config from env or options
      const envAuth = getAuthConfig({
        username: options.username,
        password: options.password,
        token: options.token,
        server: options.server,
      });

      // Prompt for credentials if not provided in env or options
      let username = envAuth.username;
      let password = envAuth.password;
      let token = envAuth.token;

      if (!token && !username) {
        const credentials = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Door43 username:',
            when: !username,
          },
          {
            type: 'password',
            name: 'password',
            message: 'Door43 password:',
            when: !password && !token,
            mask: '*',
          },
          {
            type: 'input',
            name: 'token',
            message: 'Door43 personal access token (optional, preferred):',
            when: !token && !password,
          },
        ]);

        username = username || credentials.username;
        password = password || credentials.password;
        token = token || credentials.token;
      }

      // Get auth token (auto-generate if needed)
      const auth = await getAuthToken({
        username,
        password,
        token,
        server: options.server,
      }, true);

      if (!auth.token && (!auth.username || !auth.password)) {
        console.error(chalk.red('\n❌ Error: Provide either token or username/password\n'));
        console.error(chalk.yellow('💡 Tip: Create a .env file with DOOR43_TOKEN or DOOR43_USERNAME/DOOR43_PASSWORD\n'));
        process.exit(1);
      }

      // Use the resolved auth values
      token = auth.token;
      username = auth.username;
      password = auth.password;

      // Get TOC builder from registry
      const generatorInfo = getGenerator(options.builder);
      if (!generatorInfo) {
        console.error(chalk.red(`\n❌ Error: Unknown builder type: ${options.builder}\n`));
        const available = getGeneratorIds().join(', ');
        console.log(chalk.gray(`Available builders: ${available}`));
        console.log();
        process.exit(1);
      }

      // Start spinner after credentials are collected
      const spinner = ora('Generating TOC file...').start();
      const tocBuilder: TocBuilder = generatorInfo.builder;

      // Create generator
      const generator = new TocGenerator({
        server: auth.server,
        owner,
        language,
        resourceId,
        ref: options.ref,
        branch: options.branch,
        tocBuilder,
        tocFilePath: options.tocFile,
        username,
        password,
        token,
        debug: options.debug || process.env.DEBUG === '1',
      });

      spinner.text = 'Scanning repository and extracting titles...';

      // Generate TOC
      const result = await generator.generate();

      if (result.success) {
        spinner.succeed('TOC file generated successfully!');
        console.log(chalk.green(`\n✅ Success!\n`));
        console.log(chalk.gray(`  File: ${result.filePath}`));
        console.log(chalk.gray(`  Branch: ${result.branch}`));
        console.log(chalk.gray(`  Ingredients: ${result.ingredientsCount}`));
        if (result.commitSha) {
          console.log(chalk.gray(`  Commit: ${result.commitSha.substring(0, 7)}...`));
        }
        console.log();
        console.log(chalk.yellow(`💡 The TOC file has been committed to branch '${result.branch}'`));
        console.log(chalk.yellow(`   You can now create a pull request to merge it into the main branch.\n`));
      } else {
        spinner.fail('Failed to generate TOC file');
        console.error(chalk.red(`\n❌ Error: ${result.error}\n`));
        process.exit(1);
      }
    } catch (error) {
      // Better error message handling
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.stack && process.env.DEBUG) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else if (typeof error === 'object' && error !== null) {
        const errObj = error as any;
        errorMessage = errObj.message || errObj.error || errObj.toString?.() || JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }
      
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`));
      process.exit(1);
    }
  });

/**
 * List all available generators
 */
program
  .command('list-generators')
  .description('List all available TOC generators')
  .action(() => {
    const generators = getAllGenerators();
    
    if (generators.length === 0) {
      console.log(chalk.yellow('\nNo generators available\n'));
      return;
    }

    console.log(chalk.bold('\n📦 Available TOC Generators:\n'));
    
    for (const gen of generators) {
      console.log(chalk.cyan(`  ${gen.id}`));
      console.log(chalk.gray(`    ${gen.name}`));
      console.log(chalk.gray(`    ${gen.description}`));
      console.log();
    }
    
    console.log(chalk.dim('💡 Use --builder <id> with the generate command to select a generator\n'));
  });

/**
 * Generate a personal access token from username and password
 */
program
  .command('generate-token')
  .description('Generate a personal access token from username and password')
  .option('-u, --username <username>', 'Door43 username')
  .option('-p, --password <password>', 'Door43 password')
  .option('-s, --server <server>', 'Door43 server URL', 'git.door43.org')
  .option('-n, --name <name>', 'Token name', 'toc-generator')
  .option('--save', 'Save token to .env file')
  .action(async (options) => {
    try {
      // Get credentials from environment or options
      const envAuth = getAuthConfig({
        username: options.username,
        password: options.password,
        server: options.server,
      });

      let username = envAuth.username;
      let password = envAuth.password;

      // Prompt if not provided (stop any spinner first)
      if (!username || !password) {
        const credentials = await inquirer.prompt([
          {
            type: 'input',
            name: 'username',
            message: 'Door43 username:',
            when: !username,
          },
          {
            type: 'password',
            name: 'password',
            message: 'Door43 password:',
            when: !password,
            mask: '*',
          },
        ]);

        username = username || credentials.username;
        password = password || credentials.password;
      }

      if (!username || !password) {
        console.error(chalk.red('\n❌ Error: Username and password are required\n'));
        console.error(chalk.yellow('💡 Tip: Create a .env file with DOOR43_USERNAME and DOOR43_PASSWORD\n'));
        process.exit(1);
      }

      // Start spinner after credentials are collected
      const spinner = ora('Creating personal access token...').start();

      // Generate token
      const token = await generateToken(
        username,
        password,
        envAuth.server || options.server,
        options.name
      );

      spinner.succeed('Token generated successfully!');

      console.log(chalk.green(`\n✅ Personal Access Token:\n`));
      console.log(chalk.cyan(`   ${token}\n`));

      if (options.save) {
        await saveTokenToEnv(token);
        console.log(chalk.green('✅ Token saved to .env file\n'));
      } else {
        console.log(chalk.yellow('💡 Tip: Use --save to save token to .env file\n'));
        console.log(chalk.gray('   Or add this to your .env file:'));
        console.log(chalk.gray(`   DOOR43_TOKEN=${token}\n`));
      }
    } catch (error) {
      // Better error message handling
      let errorMessage: string;
      if (error instanceof Error) {
        errorMessage = error.message;
        if (error.stack && process.env.DEBUG) {
          console.error(chalk.gray('\nStack trace:'));
          console.error(chalk.gray(error.stack));
        }
      } else if (typeof error === 'object' && error !== null) {
        const errObj = error as any;
        errorMessage = errObj.message || errObj.error || errObj.toString?.() || JSON.stringify(error, null, 2);
      } else {
        errorMessage = String(error);
      }
      
      console.error(chalk.red(`\n❌ Error: ${errorMessage}\n`));
      process.exit(1);
    }
  });

// ============================================================================
// MAIN
// ============================================================================

program
  .name('toc-generator')
  .description('CLI tool for generating Table of Contents (ingredients) files for Door43 resources')
  .version('1.0.0');

program.parse();
