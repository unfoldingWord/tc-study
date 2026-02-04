/**
 * Create command - Generate a new resource package
 */

import * as path from 'path'
import * as fs from 'fs'
import prompts from 'prompts'
import { CreateCommandOptions, Platform, TemplateContext, LocationType } from '../types'
import { logger } from '../utils/logger'
import {
  ensureDirectory,
  writeFile,
  fileExists,
  toKebabCase,
  toPascalCase,
  toCamelCase,
  getPackageName,
} from '../utils/fileSystem'
import {
  createPackageStructure,
  generatePackageJson,
  generateTsConfig,
  generateReadme,
} from '../utils/templateGenerator'
import {
  generateIndexTemplate,
  generateResourceTypeTemplate,
  generateLoaderTemplate,
  generateViewerTemplate,
  generateTypesTemplate,
  generateSignalsTemplate,
  generateInternalIndexTemplate,
  generateInternalResourceTypeTemplate,
} from '../templates'

/**
 * Detect if we're running from within an app directory
 */
function detectAppDirectory(cwd: string): string | null {
  // Check if we're in apps/tc-study or similar
  const packageJsonPath = path.join(cwd, 'package.json')
  
  if (fs.existsSync(packageJsonPath)) {
    try {
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'))
      // Check if this is a BT-Synergy app
      if (packageJson.name && 
          (packageJson.name.startsWith('@bt-synergy/') || 
           packageJson.name === 'tc-study' ||
           cwd.includes(path.join('apps', 'tc-study')))) {
        // Also check if src/resourceTypes directory exists
        const resourceTypesDir = path.join(cwd, 'src', 'resourceTypes')
        if (fs.existsSync(resourceTypesDir)) {
          return cwd
        }
      }
    } catch (err) {
      // Ignore parse errors
    }
  }
  
  // Check parent directories
  const parentDir = path.dirname(cwd)
  if (parentDir !== cwd) {
    return detectAppDirectory(parentDir)
  }
  
  return null
}

export async function createCommand(
  nameArg: string | undefined,
  options: Partial<CreateCommandOptions>
): Promise<void> {
  logger.title('Create BT-Synergy Resource Type')

  // Detect if we're in an app directory
  const appDirectory = detectAppDirectory(process.cwd())
  const canCreateInternal = appDirectory !== null

  // Get location type
  let locationType = options.locationType
  if (!locationType) {
    const choices = [
      {
        title: 'External Package',
        description: 'Standalone @bt-synergy/my-resource-resource package',
        value: 'external' as LocationType,
      },
    ]

    if (canCreateInternal) {
      choices.push({
        title: 'Internal App Module',
        description: 'Resource type in apps/tc-study/src/resourceTypes/',
        value: 'internal' as LocationType,
      })
    }

    const response = await prompts({
      type: 'select',
      name: 'locationType',
      message: 'Where should this resource type be created?',
      choices,
      initial: canCreateInternal ? 1 : 0,
    })

    if (!response.locationType) {
      logger.error('Location type is required')
      process.exit(1)
    }

    locationType = response.locationType
  }

  // Get resource name
  let name = nameArg
  if (!name) {
    const response = await prompts({
      type: 'text',
      name: 'name',
      message: 'Resource name (e.g., "translation-notes"):',
      validate: (value: string) => {
        if (!value) return 'Resource name is required'
        if (!/^[a-z0-9-]+$/.test(value)) {
          return 'Name must be lowercase with hyphens only'
        }
        return true
      },
    })

    if (!response.name) {
      logger.error('Resource name is required')
      process.exit(1)
    }

    name = response.name
  }

  // Get platforms
  let platforms = options.platforms || []
  if (platforms.length === 0) {
    const response = await prompts({
      type: 'multiselect',
      name: 'platforms',
      message: 'Select platforms:',
      choices: [
        { title: 'Web (React DOM)', value: 'web', selected: true },
        { title: 'Native (React Native)', value: 'native' },
      ],
      min: 1,
    })

    if (!response.platforms || response.platforms.length === 0) {
      logger.error('At least one platform is required')
      process.exit(1)
    }

    platforms = response.platforms
  }

  // Get description
  let description = options.description
  if (!description) {
    const response = await prompts({
      type: 'text',
      name: 'description',
      message: 'Description:',
      initial: `${toPascalCase(name!)} resource type for BT-Synergy`,
    })

    description = response.description || `${toPascalCase(name!)} resource type`
  }

  // Get Door43 subjects
  let subjects = options.subjects || []
  if (subjects.length === 0) {
    const response = await prompts({
      type: 'list',
      name: 'subjects',
      message: 'Door43 subjects (comma-separated):',
      initial: toPascalCase(name!),
      separator: ',',
    })

    subjects = response.subjects || [toPascalCase(name!)]
  }

  // Build context
  const isExternal = locationType === 'external'
  const context: TemplateContext = {
    packageName: getPackageName(name!),
    resourceName: toPascalCase(name!),
    resourceNamePascal: toPascalCase(name!),
    resourceNameCamel: toCamelCase(name!),
    description: description!,
    subjects: subjects,
    hasWeb: platforms.includes('web') || platforms.includes('both'),
    hasNative: platforms.includes('native') || platforms.includes('both'),
    isExternal,
    year: new Date().getFullYear(),
  }

  // Determine target directory
  let targetDir: string
  if (isExternal) {
    // External: packages/my-resource-resource/
    targetDir = path.join(process.cwd(), 'packages', `${toKebabCase(name!)}-resource`)
  } else {
    // Internal: apps/tc-study/src/resourceTypes/myResource/
    if (!appDirectory) {
      logger.error('Cannot create internal resource: not in an app directory')
      process.exit(1)
    }
    targetDir = path.join(appDirectory, 'src', 'resourceTypes', toCamelCase(name!))
  }

  logger.section('Configuration')
  logger.dim(`  Type: ${isExternal ? 'External Package' : 'Internal App Module'}`)
  logger.dim(`  Name: ${context.resourceName}`)
  if (isExternal) {
    logger.dim(`  Package: ${context.packageName}`)
  }
  logger.dim(`  Platforms: ${platforms.join(', ')}`)
  logger.dim(`  Subjects: ${subjects.join(', ')}`)
  logger.dim(`  Target: ${targetDir}`)

  // Check if directory exists
  if (fileExists(targetDir)) {
    const response = await prompts({
      type: 'confirm',
      name: 'overwrite',
      message: `Directory ${targetDir} already exists. Overwrite?`,
      initial: false,
    })

    if (!response.overwrite) {
      logger.warning('Cancelled')
      process.exit(0)
    }
  }

  // Generate package
  logger.section(`Generating ${isExternal ? 'package' : 'resource type'}...`)

  try {
    if (isExternal) {
      // ===== EXTERNAL PACKAGE =====
      // Step 1: Create directory structure
      logger.step(1, 7, 'Creating directory structure...')
      await createPackageStructure(targetDir, context)

      // Step 2: Generate package.json
      logger.step(2, 7, 'Generating package.json...')
      await generatePackageJson(targetDir, context)

      // Step 3: Generate tsconfig.json
      logger.step(3, 7, 'Generating tsconfig.json...')
      await generateTsConfig(targetDir, context)

      // Step 4: Generate README
      logger.step(4, 7, 'Generating README.md...')
      await generateReadme(targetDir, context)

      // Step 5: Generate source files
      logger.step(5, 7, 'Generating source files...')

      // index.ts
      await writeFile(
        path.join(targetDir, 'src', 'index.ts'),
        generateIndexTemplate(context)
      )

      // resourceType.ts
      await writeFile(
        path.join(targetDir, 'src', 'resourceType.ts'),
        generateResourceTypeTemplate(context)
      )

      // loader/index.ts
      await writeFile(
        path.join(targetDir, 'src', 'loader', 'index.ts'),
        generateLoaderTemplate(context)
      )

      // types/index.ts
      await writeFile(
        path.join(targetDir, 'src', 'types', 'index.ts'),
        generateTypesTemplate(context)
      )

      // signals/index.ts
      await writeFile(
        path.join(targetDir, 'src', 'signals', 'index.ts'),
        generateSignalsTemplate(context)
      )

      // Step 6: Generate viewer(s)
      logger.step(6, 7, 'Generating viewer components...')

      if (context.hasWeb) {
        const suffix = context.hasNative ? '.web' : ''
        await writeFile(
          path.join(targetDir, 'src', 'viewer', `${context.resourceNamePascal}Viewer${suffix}.tsx`),
          generateViewerTemplate(context, 'web')
        )
      }

      if (context.hasNative) {
        await writeFile(
          path.join(targetDir, 'src', 'viewer', `${context.resourceNamePascal}Viewer.native.tsx`),
          generateViewerTemplate(context, 'native')
        )
      }

      // Step 7: Done!
      logger.step(7, 7, 'Package created successfully!')
    } else {
      // ===== INTERNAL APP MODULE =====
      const totalSteps = 3
      
      // Step 1: Create directory
      logger.step(1, totalSteps, 'Creating directory...')
      await ensureDirectory(targetDir)

      // Step 2: Generate index.ts
      logger.step(2, totalSteps, 'Generating index.ts...')
      await writeFile(
        path.join(targetDir, 'index.ts'),
        generateInternalIndexTemplate(context)
      )

      // Step 3: Generate resourceType.ts
      logger.step(3, totalSteps, 'Generating resourceType.ts...')
      await writeFile(
        path.join(targetDir, 'resourceType.ts'),
        generateInternalResourceTypeTemplate(context)
      )

      logger.step(totalSteps, totalSteps, 'Resource type created successfully!')
    }

    // Success message
    logger.section('✨ Success!')
    if (isExternal) {
      logger.success(`Created ${context.packageName} at ${targetDir}`)

      logger.section('Next steps:')
      logger.dim(`  1. cd ${path.relative(process.cwd(), targetDir)}`)
      logger.dim(`  2. Implement loader logic in src/loader/index.ts`)
      logger.dim(`  3. Implement viewer UI in src/viewer/`)
      logger.dim(`  4. Define signals in src/signals/index.ts`)
      logger.dim(`  5. Build: pnpm build`)
      logger.dim(`  6. Register in your app:`)
      logger.dim(`     import { ${context.resourceNameCamel}ResourceType } from '${context.packageName}'`)
      logger.dim(`     resourceTypeRegistry.register(${context.resourceNameCamel}ResourceType)`)

      if (!options.skipInstall) {
        logger.section('Install dependencies?')
        const response = await prompts({
          type: 'confirm',
          name: 'install',
          message: 'Run bun install?',
          initial: true,
        })

        if (response.install) {
          logger.info('Installing dependencies...')
          const { execSync } = require('child_process')
          try {
            execSync('bun install', { stdio: 'inherit', cwd: process.cwd() })
            logger.success('Dependencies installed')
          } catch (error) {
            logger.warning('Failed to install dependencies. Run "bun install" manually.')
          }
        }
      }
    } else {
      logger.success(`Created ${context.resourceName} resource type at ${path.relative(appDirectory!, targetDir)}`)

      logger.section('Next steps:')
      logger.dim(`  1. Implement the viewer component in your app's components directory`)
      logger.dim(`  2. Update resourceType.ts to pass the viewer component`)
      logger.dim(`  3. The resource type will be auto-discovered and registered`)
      logger.dim(`  4. See ${path.join(targetDir, 'resourceType.ts')} for details`)
    }
  } catch (error) {
    logger.error(`Failed to create package: ${(error as Error).message}`)
    throw error
  }
}

