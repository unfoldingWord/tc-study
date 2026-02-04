/**
 * Create Scripture Resource Type
 * 
 * Factory function to create the scripture resource type with a viewer.
 * This pattern allows the app to provide its own viewer (which needs app context)
 * while the package provides the resource type definition (with v2.0 API).
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { 
  VerseNavigationSignal,
  TokenClickSignal,
  TextSelectionSignal,
  ResourceLoadedSignal,
} from '@bt-synergy/resource-signals'
import { ScriptureLoader } from './loader'
import type { ComponentType } from 'react'
import type { ResourceViewerProps } from '@bt-synergy/catalog-manager'

/**
 * Create scripture resource type with a provided viewer
 * 
 * @param viewer - Viewer component from the app (needs app context)
 * @returns Complete resource type definition with v2.0 API
 * 
 * @example
 * ```typescript
 * // In your app:
 * import { createScriptureResourceType } from '@bt-synergy/scripture-resource'
 * import { ScriptureViewer } from './components/resources/ScriptureViewer'
 * 
 * export const scriptureResourceType = createScriptureResourceType(ScriptureViewer)
 * 
 * // Register it:
 * resourceTypeRegistry.register(scriptureResourceType)
 * ```
 */
export function createScriptureResourceType(
  viewer: ComponentType<ResourceViewerProps>
): ResourceTypeDefinition {
  return defineResourceType({
    // ===== IDENTIFICATION =====
    id: 'scripture',
    displayName: 'Scripture',
    description: 'Bible texts in USFM format with verse-level precision',
    icon: 'Book',
    
    // ===== DOOR43 MAPPING =====
    subjects: [
      'Bible',
      'Aligned Bible',
      'Greek New Testament',
      'Hebrew Old Testament',
    ],
    aliases: ['bible', 'usfm', 'scripture', 'aligned-bible'],
    
    // ===== DATA LAYER =====
    loader: ScriptureLoader,
    loaderConfig: {
      enableMemoryCache: true,
      memoryCacheSize: 50, // Cache up to 50 chapters
      debug: false,
    },
    
    // ===== UI LAYER =====
    viewer,
    
    // ===== COMMUNICATION (v2.0 API) =====
    communication: {
      metadata: {
        type: 'scripture',
        tags: ['bible', 'primary', 'text'],
        category: 'source-text',
      },
      handlers: [
        {
          signalType: 'verse-navigation',
          handler: (signal: VerseNavigationSignal, context) => {
            // Handle incoming verse navigation requests
            console.log('📖 Scripture received verse-navigation:', signal.verse)
          },
        },
      ],
      emits: [
        'verse-navigation',  // When user navigates
        'token-click',       // When word is clicked
        'text-selection',    // When text is selected
        'resource-loaded',   // When content loads
      ],
    },
    
    // ===== FEATURES =====
    features: {
      highlighting: true,
      bookmarking: true,
      search: true,
      navigation: true,
      printing: true,
      export: true,
    },
    
    // ===== SETTINGS =====
    settings: {
      showVerseNumbers: {
        type: 'boolean',
        label: 'Show Verse Numbers',
        description: 'Display verse numbers in the text',
        default: true,
      },
      fontSize: {
        type: 'select',
        label: 'Font Size',
        default: 'medium',
        options: [
          { value: 'small', label: 'Small' },
          { value: 'medium', label: 'Medium' },
          { value: 'large', label: 'Large' },
          { value: 'xlarge', label: 'Extra Large' },
        ],
      },
      showRedLetters: {
        type: 'boolean',
        label: 'Red Letter Edition',
        description: 'Show words of Jesus in red (where available)',
        default: false,
      },
      enableWordLinks: {
        type: 'boolean',
        label: 'Enable Word Links',
        description: 'Make words clickable to send token-click signals',
        default: true,
      },
    },
    
    // ===== METADATA =====
    version: '2.0.0',
    author: 'BT Synergy Team',
    license: 'MIT',
  })
}
