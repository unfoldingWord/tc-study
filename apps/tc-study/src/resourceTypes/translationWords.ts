/**
 * Translation Words Resource Type Plugin
 * 
 * Handles Translation Words - biblical term definitions organized by category
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationWordsLoader, generateTWIngredients } from '@bt-synergy/translation-words-loader'
import { getDownloadPriority } from '../config/loaderConfig'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationWordsResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.TRANSLATION_WORDS,
  displayName: 'Translation Words',
  description: 'Biblical term definitions organized by category (Key Terms, Names, Other)',
  icon: 'BookText',
  
  // ===== SCOPE / ROLE =====
  contentRole: 'shared',

  // ===== DOOR43 MAPPING =====
  subjects: ['Translation Words'],
  aliases: ['tw', 'words'],
  
  // ===== DATA LAYER =====
  loader: TranslationWordsLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 100, // Cache up to 100 word definitions
    debug: false,
  },
  
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.TRANSLATION_WORDS),
  
  /**
   * Ingredients generator for Translation Words
   * 
   * Generates ingredients dynamically from the repository by:
   * 1. Checking for toc.json first (if available, uses it)
   * 2. Otherwise, using zipball for release tags (fast) or recursive file listing
   * 3. Extracting titles from markdown content
   * 
   * This ensures complete ingredients even when catalog API doesn't provide them.
   */
  ingredientsGenerator: async (door43Resource, door43Client) => {
    const { owner, language, id: resourceId } = door43Resource
    
    // Get the release tag from the Door43 Catalog API response
    // The catalog API response has release.tag_name which is the Git tag (e.g., "v37")
    // Priority: release.tag_name (from catalog API) > master
    const ref = door43Resource.release?.tag_name || 'master'
    
    
    // Use the shared generateTWIngredients function
    // It returns { ingredients, fileCount, method }, we need just ingredients
    const result = await generateTWIngredients({
      owner,
      language,
      resourceId,
      ref,
      door43Client, // Use the provided client (already configured with server)
      debug: true, // Enable debug to see what's happening
    })
    
    
    return result.ingredients
  },
  
  // ===== UI LAYER =====
  // Modal-only: no panel viewer (articles open via EntryViewerRegistry)
  
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
    showRelatedTerms: {
      type: 'boolean',
      label: 'Show Related Terms',
      description: 'Display related terms and see also links',
      default: true,
    },
  },
  
  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})

