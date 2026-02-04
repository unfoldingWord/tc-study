/**
 * Template generation utilities
 */

import * as path from 'path'
import { TemplateContext } from '../types'
import { ensureDirectory, writeFile } from './fileSystem'

export async function generateFromTemplate(
  template: string,
  context: TemplateContext
): Promise<string> {
  return template.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return (context as any)[key] || match
  })
}

export async function createPackageStructure(
  targetDir: string,
  context: TemplateContext
): Promise<void> {
  // Create directory structure
  await ensureDirectory(path.join(targetDir, 'src'))
  await ensureDirectory(path.join(targetDir, 'src', 'loader'))
  await ensureDirectory(path.join(targetDir, 'src', 'viewer'))
  await ensureDirectory(path.join(targetDir, 'src', 'signals'))
  await ensureDirectory(path.join(targetDir, 'src', 'types'))
}

export async function generatePackageJson(
  targetDir: string,
  context: TemplateContext
): Promise<void> {
  const packageJson = {
    name: context.packageName,
    version: '0.1.0',
    description: context.description,
    main: 'dist/index.js',
    module: 'dist/index.js',
    types: 'dist/index.d.ts',
    exports: {
      '.': {
        types: './dist/index.d.ts',
        import: './dist/index.js',
        require: './dist/index.js',
      },
    },
    scripts: {
      build: 'tsc',
      dev: 'tsc --watch',
    },
    dependencies: {
      '@bt-synergy/resource-types': 'workspace:*',
      '@bt-synergy/resource-signals': 'workspace:*',
      '@bt-synergy/catalog-manager': 'workspace:*',
    },
    peerDependencies: {
      react: '>=18.0.0',
    },
    devDependencies: {
      '@types/react': '^18.0.0',
      typescript: '^5.3.3',
    },
  }

  await writeFile(
    path.join(targetDir, 'package.json'),
    JSON.stringify(packageJson, null, 2)
  )
}

export async function generateTsConfig(
  targetDir: string,
  context: TemplateContext
): Promise<void> {
  const tsConfig = {
    compilerOptions: {
      target: 'ES2020',
      module: 'ESNext',
      lib: ['ES2020', 'DOM'],
      jsx: 'react',
      declaration: true,
      outDir: './dist',
      rootDir: './src',
      strict: true,
      esModuleInterop: true,
      skipLibCheck: true,
      forceConsistentCasingInFileNames: true,
      moduleResolution: 'bundler',
      resolveJsonModule: true,
      isolatedModules: true,
    },
    include: ['src/**/*'],
    exclude: ['node_modules', 'dist'],
  }

  await writeFile(
    path.join(targetDir, 'tsconfig.json'),
    JSON.stringify(tsConfig, null, 2)
  )
}

export async function generateReadme(
  targetDir: string,
  context: TemplateContext
): Promise<void> {
  const readme = `# ${context.packageName}

${context.description}

## Installation

\`\`\`bash
pnpm add ${context.packageName}
\`\`\`

## Usage

\`\`\`typescript
import { ${context.resourceNameCamel}ResourceType } from '${context.packageName}'

// Register the resource type
resourceTypeRegistry.register(${context.resourceNameCamel}ResourceType)
\`\`\`

## Features

- ✅ Cross-platform support (Web ${context.hasNative ? '+ React Native' : 'only'})
- ✅ Type-safe signal communication
- ✅ Automatic enhancement with panel communication
- ✅ Full TypeScript support

## Resource Type

**ID**: \`${context.resourceNameCamel}\`  
**Display Name**: ${context.resourceName}  
**Subjects**: ${context.subjects.join(', ')}

## Signals

This resource type:
- **Receives**: (Define signals this resource handles)
- **Emits**: (Define signals this resource sends)

See \`src/signals/index.ts\` for signal definitions.

## Development

\`\`\`bash
# Build
pnpm build

# Watch mode
pnpm dev
\`\`\`

## License

MIT © ${context.year}
`

  await writeFile(path.join(targetDir, 'README.md'), readme)
}
