/**
 * OBS Translation Notes Resource Type Plugin
 *
 * Thin wrapper around the standard TranslationNotesLoader/Viewer for
 * Open Bible Stories. The TSV file shape (tn_OBS.tsv) is identical to
 * Bible TN, so no loader changes are needed. Quote/OrigWords already
 * contain literal frame text — no alignment middle layer required.
 *
 * NOTE: The UGNT/UHB dependencies are intentionally omitted here because
 * OBS-TN rows reference gateway-language text directly, not originals.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationNotesLoader } from '@bt-synergy/translation-notes-loader'
import { getDownloadPriority } from '../config/loaderConfig'
import { TranslationNotesViewer } from '../components/resources/TranslationNotesViewer'
import { asResourceViewer } from './asResourceViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const obsTranslationNotesResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.OBS_NOTES,
  displayName: 'OBS Translation Notes',
  description: 'Translation guidance for Open Bible Stories frames (TSV format)',
  icon: 'BookOpen',

  // ===== SCOPE / ROLE =====
  contentRole: 'companion',
  companionFor: ['obs'],

  // ===== DOOR43 MAPPING =====
  // Both prefixed (newer repos) and un-prefixed (older non-en repos) variants
  subjects: ['TSV OBS Translation Notes', 'OBS Translation Notes'],
  aliases: ['obs-tn', 'obs-notes'],

  // ===== DATA LAYER =====
  loader: TranslationNotesLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50,
    debug: false,
  },

  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.OBS_NOTES),

  // ===== UI LAYER =====
  viewer: asResourceViewer(TranslationNotesViewer),

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
    showQuotes: {
      type: 'boolean',
      label: 'Show Quotes',
      description: 'Display the phrase being discussed',
      default: true,
    },
    groupByVerse: {
      type: 'boolean',
      label: 'Group by Frame',
      description: 'Group notes by frame reference',
      default: true,
    },
  },

  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})
