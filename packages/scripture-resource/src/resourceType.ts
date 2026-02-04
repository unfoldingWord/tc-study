/**
 * Scripture Resource Type Definition
 * 
 * Complete resource type with automatic panel communication enhancement.
 * Uses v2.0 API with communication config for zero-boilerplate signal handling.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { 
  VerseNavigationSignal,
  TokenClickSignal,
  TextSelectionSignal,
  ResourceLoadedSignal,
} from '@bt-synergy/resource-signals'
import { ScriptureLoader } from './loader'

// Note: ScriptureViewer is imported from the app during registration
// This is intentional - viewers need app context for navigation, etc.
// The resource type definition is what's important here (v2.0 API with communication config)

export const scriptureResourceType: ResourceTypeDefinition = defineResourceType({
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
  // Note: Viewer is injected during registration from the app
  // See apps/tc-study/src/resourceTypes/scripture/index.ts
  viewer: null as any, // Will be set during registration
  
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
          // The viewer will receive this through its props
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

