/**
 * Code templates for resource generation
 */

import { TemplateContext } from '../types'

export function generateIndexTemplate(context: TemplateContext): string {
  return `/**
 * ${context.packageName}
 * 
 * ${context.description}
 */

export { ${context.resourceNameCamel}ResourceType } from './resourceType'
export { ${context.resourceNamePascal}Loader } from './loader'
${context.hasWeb ? `export { ${context.resourceNamePascal}Viewer } from './viewer/${context.resourceNamePascal}Viewer${context.hasNative ? '.web' : ''}'\n` : ''}${context.hasNative ? `export { ${context.resourceNamePascal}ViewerNative } from './viewer/${context.resourceNamePascal}Viewer.native'\n` : ''}export type { ${context.resourceNamePascal}Resource, ${context.resourceNamePascal}LoaderConfig } from './types'
export * from './signals'
`
}

export function generateResourceTypeTemplate(context: TemplateContext): string {
  const viewerImport = context.hasWeb && context.hasNative
    ? `import { ${context.resourceNamePascal}Viewer } from './viewer/${context.resourceNamePascal}Viewer.web'
import { ${context.resourceNamePascal}ViewerNative } from './viewer/${context.resourceNamePascal}Viewer.native'`
    : context.hasNative
    ? `import { ${context.resourceNamePascal}ViewerNative as ${context.resourceNamePascal}Viewer } from './viewer/${context.resourceNamePascal}Viewer.native'`
    : `import { ${context.resourceNamePascal}Viewer } from './viewer/${context.resourceNamePascal}Viewer'`

  const viewerDefinition = context.hasWeb && context.hasNative
    ? `  viewer: {
    web: ${context.resourceNamePascal}Viewer,
    native: ${context.resourceNamePascal}ViewerNative,
  },`
    : `  viewer: ${context.resourceNamePascal}Viewer,`

  return `/**
 * ${context.resourceName} Resource Type Definition
 */

import { defineResourceType } from '@bt-synergy/resource-types'
import { ${context.resourceNamePascal}Loader } from './loader'
${viewerImport}

export const ${context.resourceNameCamel}ResourceType = defineResourceType({
  // Identification
  id: '${context.resourceNameCamel}',
  displayName: '${context.resourceName}',
  description: '${context.description}',
  
  // Door43 subjects
  subjects: ${JSON.stringify(context.subjects)},
  
  // Data layer
  loader: ${context.resourceNamePascal}Loader,
  
  // UI layer
${viewerDefinition}
  
  // Communication (optional)
  communication: {
    metadata: {
      type: '${context.resourceNameCamel}',
      tags: [], // Add tags for filtering
    },
    handlers: [
      // Define signal handlers here
      // Example:
      // {
      //   signalType: 'verse-navigation',
      //   handler: (signal, context) => {
      //     // Handle signal
      //   }
      // }
    ],
    emits: [
      // List signals this resource emits
      // Example: 'token-click', 'verse-navigation'
    ],
  },
  
  // Features
  features: {
    highlighting: false,
    bookmarking: false,
    search: false,
    navigation: false,
  },
  
  // Metadata
  version: '0.1.0',
  author: 'BT-Synergy Team',
  license: 'MIT',
})
`
}

export function generateLoaderTemplate(context: TemplateContext): string {
  return `/**
 * ${context.resourceName} Loader
 * 
 * Handles loading and caching of ${context.resourceName} resources
 */

import type { ResourceLoader } from '@bt-synergy/catalog-manager'
import type { ${context.resourceNamePascal}Resource, ${context.resourceNamePascal}LoaderConfig } from '../types'

export class ${context.resourceNamePascal}Loader implements ResourceLoader {
  private config: ${context.resourceNamePascal}LoaderConfig
  
  constructor(config: ${context.resourceNamePascal}LoaderConfig) {
    this.config = config
  }
  
  /**
   * Load a ${context.resourceName} resource by ID
   */
  async load(resourceId: string): Promise<${context.resourceNamePascal}Resource> {
    // TODO: Implement resource loading logic
    // 1. Check cache
    // 2. Fetch from network if needed
    // 3. Parse and validate data
    // 4. Cache result
    
    throw new Error('${context.resourceNamePascal}Loader.load() not implemented')
  }
  
  /**
   * Load a specific book or section
   */
  async loadBook(resourceId: string, bookId: string): Promise<any> {
    // TODO: Implement book loading if applicable
    throw new Error('${context.resourceNamePascal}Loader.loadBook() not implemented')
  }
  
  /**
   * Preload a resource (cache only, no return)
   */
  async preload(resourceId: string): Promise<void> {
    // TODO: Implement preloading logic
  }
  
  /**
   * Clear cache for a resource
   */
  async clearCache(resourceId: string): Promise<void> {
    // TODO: Implement cache clearing
  }
  
  /**
   * Get cache status for a resource
   */
  async getCacheStatus(resourceId: string): Promise<{
    cached: boolean
    size?: number
    lastUpdated?: Date
  }> {
    // TODO: Implement cache status check
    return { cached: false }
  }
}
`
}

export function generateViewerTemplate(context: TemplateContext, platform: 'web' | 'native'): string {
  const isWeb = platform === 'web'
  const importReact = isWeb 
    ? `import React from 'react'`
    : `import React from 'react'
import { View, Text, StyleSheet } from 'react-native'`

  const component = isWeb
    ? `  return (
    <div className="p-4">
      <h1 className="text-2xl font-bold mb-4">{resource.title || '${context.resourceName}'}</h1>
      <div className="text-gray-600">
        Resource ID: {resource.id}
      </div>
      
      {/* TODO: Implement ${context.resourceName} viewer UI */}
      <div className="mt-4 p-4 bg-yellow-50 border border-yellow-200 rounded">
        <p className="text-yellow-800">
          Viewer not implemented yet. See src/viewer/${context.resourceNamePascal}Viewer${isWeb ? '' : '.native'}.tsx
        </p>
      </div>
    </div>
  )`
    : `  return (
    <View style={styles.container}>
      <Text style={styles.title}>{resource.title || '${context.resourceName}'}</Text>
      <Text style={styles.subtitle}>Resource ID: {resource.id}</Text>
      
      {/* TODO: Implement ${context.resourceName} viewer UI */}
      <View style={styles.placeholder}>
        <Text style={styles.placeholderText}>
          Viewer not implemented yet. See src/viewer/${context.resourceNamePascal}Viewer.native.tsx
        </Text>
      </View>
    </View>
  )`

  const isNative = platform === 'native'
  const styles = isNative
    ? `

const styles = StyleSheet.create({
  container: {
    padding: 16,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  subtitle: {
    fontSize: 14,
    color: '#666',
  },
  placeholder: {
    marginTop: 16,
    padding: 16,
    backgroundColor: '#FEF3C7',
    borderRadius: 8,
  },
  placeholderText: {
    color: '#92400E',
  },
})`
    : ''

  const viewerSuffix = isNative ? 'Native' : ''
  const platformLabel = isNative ? 'React Native' : 'Web'
  
  return `/**
 * ${context.resourceName} Viewer (${platformLabel})
 */

${importReact}
import type { EnhancedViewerProps } from '@bt-synergy/resource-types'

export const ${context.resourceNamePascal}Viewer${viewerSuffix}: React.FC<EnhancedViewerProps> = ({
  resource,
  settings,
  sendSignal,
  sendToPanel,
  sendToResource,
  resourceId,
}) => {
${component}
}${styles}
`
}

export function generateTypesTemplate(context: TemplateContext): string {
  return `/**
 * ${context.resourceName} Types
 */

/**
 * ${context.resourceName} resource data structure
 */
export interface ${context.resourceNamePascal}Resource {
  id: string
  title: string
  language: string
  version: string
  
  // TODO: Add resource-specific fields
  content?: any
  metadata?: any
}

/**
 * Loader configuration
 */
export interface ${context.resourceNamePascal}LoaderConfig {
  cacheAdapter: any
  catalogAdapter: any
  door43Client: any
  
  // Custom config options
  enableMemoryCache?: boolean
  memoryCacheSize?: number
  debug?: boolean
}
`
}

export function generateSignalsTemplate(context: TemplateContext): string {
  return `/**
 * ${context.resourceName} Custom Signals
 * 
 * Define custom signals specific to this resource type.
 * For standard signals, import from @bt-synergy/resource-signals
 */

import type { BaseSignal } from '@bt-synergy/resource-panels'

// Example custom signal
export interface ${context.resourceNamePascal}NavigationSignal extends BaseSignal {
  type: '${context.resourceNameCamel}-navigation'
  // Add signal-specific fields
  target: string
}

// Export all custom signal types
export type ${context.resourceNamePascal}Signals = ${context.resourceNamePascal}NavigationSignal
`
}

// ===== INTERNAL APP MODULE TEMPLATES =====

/**
 * Generate index.ts for internal app resource type
 */
export function generateInternalIndexTemplate(context: TemplateContext): string {
  return `/**
 * ${context.resourceName} Resource Type
 * 
 * ${context.description}
 * 
 * This is an internal resource type definition for this app.
 * It will be auto-discovered and registered by the resource type registry.
 */

export { ${context.resourceNameCamel}ResourceType } from './resourceType'
`
}

/**
 * Generate resourceType.ts for internal app resource type
 */
export function generateInternalResourceTypeTemplate(context: TemplateContext): string {
  return `/**
 * ${context.resourceName} Resource Type Definition
 * 
 * IMPORTANT: You need to create the viewer component in your app's
 * components directory and import it here.
 * 
 * Example:
 *   import { ${context.resourceNamePascal}Viewer } from '@/components/resources/${context.resourceNamePascal}Viewer'
 */

import { defineResourceType } from '@bt-synergy/resource-types'
import type { ResourceTypeDefinition } from '@bt-synergy/resource-types'
import {
  VerseNavigationSignal,
  TokenClickSignal,
  // Import other standard signals as needed
} from '@bt-synergy/resource-signals'

// TODO: Import your viewer component
// import { ${context.resourceNamePascal}Viewer } from '@/components/resources/${context.resourceNamePascal}Viewer'

// TODO: If you need a custom loader, create it and import it
// For now, we'll use a placeholder
class ${context.resourceNamePascal}Loader {
  async load(resourceId: string) {
    throw new Error('${context.resourceNamePascal}Loader not implemented')
  }
}

/**
 * ${context.resourceName} Resource Type Definition
 * 
 * This follows the "Definitions in Packages, Viewers in Apps" pattern,
 * where the resource type definition lives here but the viewer component
 * lives in the app's components directory.
 */
export const ${context.resourceNameCamel}ResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: '${context.resourceNameCamel}',
  displayName: '${context.resourceName}',
  description: '${context.description}',
  icon: 'FileText', // Update with appropriate Lucide icon name
  
  // ===== DOOR43 MAPPING =====
  subjects: ${JSON.stringify(context.subjects)},
  aliases: ['${context.resourceNameCamel}'],
  
  // ===== DATA LAYER =====
  loader: ${context.resourceNamePascal}Loader,
  loaderConfig: {
    // Add loader configuration
    debug: false,
  },
  
  // ===== UI LAYER =====
  // TODO: Uncomment and update when you've created the viewer component
  // viewer: ${context.resourceNamePascal}Viewer,
  
  // ===== FEATURES =====
  features: {
    highlighting: false,
    bookmarking: false,
    search: false,
    navigation: false,
    printing: false,
    export: false,
  },
  
  // ===== INTER-PANEL COMMUNICATION =====
  communication: {
    metadata: {
      type: '${context.resourceNameCamel}',
      tags: [], // Add tags for filtering
    },
    handlers: [
      // Example: Handle verse navigation signals
      // {
      //   signalType: VerseNavigationSignal.type,
      //   handler: (signal, context) => {
      //     console.log(\`[${context.resourceName} \${context.resourceId}] Received verse-navigation:\`, signal)
      //     // Your viewer should handle the navigation
      //   },
      // },
    ],
    emits: [
      // List signals this resource emits
      // Example: TokenClickSignal.type, VerseNavigationSignal.type
    ],
  },
  
  // ===== SETTINGS =====
  settings: {
    // Add resource-specific settings
    // Example:
    // fontSize: {
    //   type: 'select',
    //   label: 'Font Size',
    //   default: 'medium',
    //   options: [
    //     { value: 'small', label: 'Small' },
    //     { value: 'medium', label: 'Medium' },
    //     { value: 'large', label: 'Large' },
    //   ],
    // },
  },
  
  // ===== METADATA =====
  version: '0.1.0',
  author: 'BT-Synergy Team',
  license: 'MIT',
})
`
}

