/**
 * Translation Notes Resource Type Plugin
 * 
 * Handles TSV Translation Notes - translation guidance for specific phrases in Scripture
 * with links to Translation Academy articles
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationNotesLoader } from '@bt-synergy/translation-notes-loader'
import { getDownloadPriority } from '../config/loaderConfig'
import { TranslationNotesViewer } from '../components/resources/TranslationNotesViewer'
import { asResourceViewer } from './asResourceViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationNotesResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.TRANSLATION_NOTES,
  displayName: 'Translation Notes',
  description: 'Translation guidance for specific phrases with links to Translation Academy (TSV format)',
  icon: 'BookOpen',
  
  // ===== SCOPE / ROLE =====
  contentRole: 'companion',
  companionFor: ['scripture'],

  // ===== DEPENDENCIES =====
  // TN requires:
  // 1. UGNT (Greek NT) - unfoldingWord's Greek New Testament
  // 2. UHB (Hebrew OT) - unfoldingWord's Hebrew Bible
  // These provide the original language texts that TN references
  dependencies: [
    {
      resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
      language: 'el-x-koine', // Koine Greek
      owner: 'unfoldingWord',
    },
    {
      resourceType: RESOURCE_TYPE_IDS.SCRIPTURE,
      language: 'hbo', // Ancient Hebrew
      owner: 'unfoldingWord',
    },
  ],
  
  // ===== DOOR43 MAPPING =====
  subjects: ['TSV Translation Notes'],
  aliases: ['tn', 'notes', 'translation-notes'],
  
  // ===== DATA LAYER =====
  loader: TranslationNotesLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50, // Cache up to 50 books
    debug: false,
  },
  
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.TRANSLATION_NOTES),
 
  // ===== UI LAYER =====
  viewer: asResourceViewer(TranslationNotesViewer),
  
  // ===== FEATURES =====
  features: {
    highlighting: false, // TN doesn't highlight words in scripture
    bookmarking: false,
    search: true,
    navigation: true,
    printing: false,
    export: false,
  },
  
  // ===== SETTINGS =====
  settings: {
    showQuotes: {
      type: 'boolean',
      label: 'Show Quotes',
      description: 'Display the phrase being discussed',
      default: true,
    },
    groupByVerse: {
      type: 'boolean',
      label: 'Group by Verse',
      description: 'Group notes by verse reference',
      default: true,
    },
  },
  
  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})

// Re-export for convenience
export { TranslationNotesViewer } from '../components/resources/TranslationNotesViewer'
