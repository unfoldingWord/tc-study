/**
 * OBS Translation Questions Resource Type Plugin
 *
 * Thin wrapper around TranslationQuestionsLoader/Viewer for Open Bible
 * Stories. The TQ file (tq_OBS.tsv) follows the same column layout as
 * Bible TQ with chapter:verse mapping to story:frame.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationQuestionsLoader } from '@bt-synergy/translation-questions-loader'
import { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const obsTranslationQuestionsResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.OBS_QUESTIONS,
  displayName: 'OBS Translation Questions',
  description: 'Comprehension questions and answers for OBS stories to help verify understanding',
  icon: 'MessageCircleQuestion',

  // ===== SCOPE / ROLE =====
  contentRole: 'companion',
  companionFor: ['obs'],

  // ===== DOOR43 MAPPING =====
  subjects: ['TSV OBS Translation Questions', 'OBS Translation Questions'],
  aliases: ['obs-tq', 'obs-questions'],

  // ===== DATA LAYER =====
  loader: TranslationQuestionsLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 100,
    debug: false,
  },

  downloadPriority: 27,

  // ===== UI LAYER =====
  viewer: TranslationQuestionsViewer as any,

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
