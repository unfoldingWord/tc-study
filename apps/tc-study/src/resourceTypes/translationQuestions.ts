/**
 * Translation Questions Resource Type Plugin
 * 
 * Handles Translation Questions - comprehension questions and answers
 * for specific Bible passages
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'
import { getDownloadPriority } from '../config/loaderConfig'
import { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
import { asResourceViewer } from './asResourceViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationQuestionsResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS,
  displayName: 'Translation Questions',
  description: 'Comprehension questions and answers for Bible passages to help verify understanding',
  icon: 'MessageCircleQuestion',
  
  // ===== SCOPE / ROLE =====
  contentRole: 'companion',
  companionFor: ['scripture'],

  // ===== DOOR43 MAPPING =====
  subjects: ['TSV Translation Questions'],
  aliases: ['tq', 'questions'],
  // CombinedHelps needs TN or TWL. TQ-only langs (and OBS-TQ-only, e.g. ilo)
  // must not expand the helps language picker.
  includeInLanguageLists: false,
  
  // ===== DATA LAYER =====
  loader: TranslationQuestionsLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 100, // Cache up to 100 books
    debug: false,
  },
  
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS),
  
  // ===== UI LAYER =====
  viewer: asResourceViewer(TranslationQuestionsViewer),
  
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
