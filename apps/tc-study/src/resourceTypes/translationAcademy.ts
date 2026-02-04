/**
 * Translation Academy Resource Type Plugin
 * 
 * Handles Translation Academy - training articles for translators organized by manual
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { TranslationAcademyLoader, generateTAIngredients } from '@bt-synergy/translation-academy-loader'
import { TranslationAcademyViewer } from '../components/resources/TranslationAcademyViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const translationAcademyResourceType: ResourceTypeDefinition = defineResourceType({
  // ===== IDENTIFICATION =====
  id: RESOURCE_TYPE_IDS.TRANSLATION_ACADEMY,
  displayName: 'Translation Academy',
  description: 'Training articles for translators organized by manual (Translate, Checking, Process, Intro)',
  icon: 'GraduationCap',
  
  // ===== DOOR43 MAPPING =====
  subjects: ['Translation Academy'],
  aliases: ['ta', 'academy'],
  
  // ===== DATA LAYER =====
  loader: TranslationAcademyLoader,
  loaderConfig: {
    enableMemoryCache: true,
    memoryCacheSize: 50, // Cache up to 50 article contents
    debug: false,
  },
  
  // Download priority for background downloading
  downloadPriority: 30, // Less critical than scripture and words
  
  /**
   * Ingredients generator for Translation Academy
   * 
   * Generates ingredients dynamically from the repository by:
   * 1. Checking for toc.json first (if available, uses it)
   * 2. Otherwise, using zipball for release tags (fast) or recursive file listing
   * 3. Extracting titles from markdown content
   * 
   * This ensures complete ingredients even when catalog API doesn't provide them.
   */
  ingredientsGenerator: async (door43Resource: any, door43Client: any) => {
    const { owner, language, id: resourceId } = door43Resource
    
    // Get the release tag from the Door43 Catalog API response
    // The catalog API response has release.tag_name which is the Git tag (e.g., "v37")
    // Priority: release.tag_name (from catalog API) > master
    const ref = door43Resource.release?.tag_name || 'master'
    
    console.log(`🔍 TA Ingredients Generator - Resource info:`, {
      owner,
      language,
      resourceId,
      releaseTag: door43Resource.release?.tag_name,
      releaseObject: door43Resource.release,
      version: door43Resource.version,
      selectedRef: ref,
      hasRelease: !!door43Resource.release
    })
    
    // Use the shared generateTAIngredients function
    // It returns { ingredients, fileCount, method }, we need just ingredients
    const result = await generateTAIngredients({
      owner,
      language,
      resourceId,
      ref,
      door43Client, // Use the provided client (already configured with server)
      debug: true, // Enable debug to see what's happening
    })
    
    console.log(`🔨 TA Ingredients generation result:`, {
      ingredientCount: result.ingredients?.length || 0,
      fileCount: result.fileCount,
      method: result.method,
      sample: result.ingredients?.slice(0, 3)
    })
    
    return result.ingredients
  },
  
  // ===== UI LAYER =====
  viewer: TranslationAcademyViewer,
  
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
    showRelatedArticles: {
      type: 'boolean',
      label: 'Show Related Articles',
      description: 'Display related articles and see also links',
      default: true,
    },
    showQuestions: {
      type: 'boolean',
      label: 'Show Questions',
      description: 'Display the question that each article answers',
      default: true,
    },
  },
  
  // ===== METADATA =====
  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})

// Re-export for convenience
export { TranslationAcademyViewer } from '../components/resources/TranslationAcademyViewer'
