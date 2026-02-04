/**
 * Translation Words Links Resource Type Plugin
 * 
 * Handles TSV Translation Words Links - links between words in scripture
 * and their corresponding Translation Words articles
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationWordsLinksLoader } from '@bt-synergy/translation-words-links-loader'
import { WordsLinksViewer } from '../components/resources'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationWordsLinksResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS,
  displayName: 'Translation Words Links',
  description: 'Links between words in scripture and Translation Words articles (TSV format)',
  icon: 'Link',
  
  // ===== DEPENDENCIES =====
  // TWL requires:
  // 1. TW (Translation Words dictionary) from the same language and organization
  // 2. UGNT (Greek NT) - unfoldingWord's Greek New Testament
  // 3. UHB (Hebrew OT) - unfoldingWord's Hebrew Bible
  // These provide the original language texts that TWL references
  dependencies: [
    {
      resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
      sameLanguage: true,
      sameOwner: true,
    },
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
  subjects: ['TSV Translation Words Links'],
  aliases: ['twl', 'words-links', 'translation-words-links'],
  
  // ===== DATA LAYER =====
  loader: TranslationWordsLinksLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50, // Cache up to 50 books
    debug: false,
  },
  
  // Download priority for background downloading
  downloadPriority: 10, // High priority (needed for scripture-words linking)

  
  // ===== UI LAYER =====
  viewer: WordsLinksViewer,
  
  // ===== FEATURES =====
  features: {
    highlighting: true, // Can highlight words that have links
    bookmarking: false,
    search: true,
    navigation: true,
    printing: false,
    export: false,
  },
  
  // ===== SETTINGS =====
  settings: {
    showOriginalWords: {
      type: 'boolean',
      label: 'Show Original Words',
      description: 'Display Hebrew/Greek original words alongside translations',
      default: true,
    },
    groupByCategory: {
      type: 'boolean',
      label: 'Group by Category',
      description: 'Group word links by Key Terms vs Other Words',
      default: false,
    },
  },
  
  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})

// Re-export for convenience
export { WordsLinksViewer } from '../components/resources'


