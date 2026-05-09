/**
 * OBS Translation Words Links Resource Type Plugin
 *
 * Thin wrapper around TranslationWordsLinksLoader/WordsLinksViewer for
 * Open Bible Stories. The TWL file (twl_OBS.tsv) has the same columns
 * as Bible TWL. OrigWords contains literal frame text; TW links use
 * the same rc:// scheme pointing to the shared Translation Words dictionary.
 *
 * NOTE: UGNT/UHB dependencies are omitted — OBS rows reference gateway
 * text directly. The shared TW dictionary (contentRole='shared') is still
 * needed and resolved implicitly via existing TWL dependency logic.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationWordsLinksLoader } from '@bt-synergy/translation-words-links-loader'
import { WordsLinksViewer } from '../components/resources'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const obsTranslationWordsLinksResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.OBS_WORDS_LINKS,
  displayName: 'OBS Translation Words Links',
  description: 'Links between OBS frame words and Translation Words articles (TSV format)',
  icon: 'Link',

  // ===== SCOPE / ROLE =====
  contentRole: 'companion',
  companionFor: ['obs'],

  // ===== DEPENDENCIES =====
  // OBS TWL resources are often English source materials owned by a GL organization
  // (e.g., es-419_gl/en/obs-twl). Their TW dependency should only require the same
  // language (e.g., unfoldingWord/en/tw), NOT the same owner, since the GL org does
  // not host its own English TW dictionary.
  dependencies: [
    {
      resourceType: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
      sameLanguage: true,
    },
  ],

  // ===== DOOR43 MAPPING =====
  subjects: ['TSV OBS Translation Words Links', 'OBS Translation Words Links'],
  aliases: ['obs-twl', 'obs-words-links'],

  // ===== DATA LAYER =====
  loader: TranslationWordsLinksLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50,
    debug: false,
  },

  downloadPriority: 12,

  // ===== UI LAYER =====
  viewer: WordsLinksViewer as any,

  // ===== FEATURES =====
  features: {
    highlighting: false,
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
      description: 'Display the original words alongside translations',
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
