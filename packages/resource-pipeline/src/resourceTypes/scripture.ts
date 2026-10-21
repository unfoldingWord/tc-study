/**
 * Scripture Resource Type Plugin
 * 
 * Handles Bible texts in USFM format with verse-level precision
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { ScriptureLoader } from '@bt-synergy/scripture-loader'
import { getDownloadPriority } from '../config/loaderConfig'
import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'

/** scriptureResourceType without its viewer; tc-study adds the viewer. */
export const scriptureResourceTypeBase: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.SCRIPTURE,
  displayName: 'Scripture',
  description: 'Bible texts in USFM format with verse-level precision',
  icon: 'Book',

  // ===== SCOPE / ROLE =====
  contentRole: 'primary',
  scope: 'scripture',
  
  // ===== DOOR43 MAPPING =====
  subjects: [
    'Bible',
    'Aligned Bible',
    'Greek New Testament',
    'Hebrew Old Testament',
  ],
  // UGNT/UHB are injected globally — not gateway language-list rows.
  languageListSubjects: ['Bible', 'Aligned Bible'],
  aliases: ['bible', 'usfm', 'scripture', 'aligned-bible'],
  
  // ===== DATA LAYER =====
  loader: ScriptureLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50, // Cache up to 50 chapters
    debug: true, // Enable debug logging to troubleshoot issues
    // USJ-only process path. Cache SoT: scripture-usj:
  },
  
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.SCRIPTURE),
  
  // Note: No ingredientsGenerator needed - Door43 catalog API provides book lists
  // If ingredients are missing, that indicates a problem with Door43 data
  
  // ===== UI LAYER =====
  
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
  },
  
  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})

// Re-export for convenience
