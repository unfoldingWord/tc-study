/**
 * Translation Questions Resource Type Plugin
 * 
 * Handles Translation Questions - comprehension questions and answers
 * for specific Bible passages
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'
import { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationQuestionsResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  displayName: 'Translation Questions',
  description: 'Comprehension questions and answers for Bible passages to help verify understanding',
  icon: 'MessageCircleQuestion',
  
  // ===== DOOR43 MAPPING =====
  subjects: ['TSV Translation Questions'],
  aliases: ['tq', 'questions'],
  
  // ===== DATA LAYER =====
  loader: TranslationQuestionsLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 100, // Cache up to 100 books
    debug: false,
  },
  
  // Download priority for background downloading
  downloadPriority: 25, // Similar to Translation Notes
  
  // ===== UI LAYER =====
  viewer: TranslationQuestionsViewer,
  
  // ===== FEATURES =====
  features: {
    highlighting: false,
    bookmarking: false,
    search: true,
    navigation: true,
    printing: true,
    export: true,
  },
  
  // ===== SETTINGS =====
  settings: {
    showAnswers: {
      type: 'boolean',
      label: 'Show Answers',
      description: 'Display answers automatically or hide them initially',
      default: true,
    },
  },
  
  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})

// Re-export for convenience
export { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
