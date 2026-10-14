/**
 * Translation Words Links Resource Type Plugin
 * 
 * Handles TSV Translation Words Links - links between words in scripture
 * and their corresponding Translation Words articles
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { translationWordsLinksResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/translationWordsLinks'
import { WordsLinksViewer } from '../components/resources'
import { asResourceViewer } from './asResourceViewer'

export const translationWordsLinksResourceType: ResourceTypeDefinition = defineResourceType({
  ...translationWordsLinksResourceTypeBase,
  viewer: asResourceViewer(WordsLinksViewer),
})

// Re-export for convenience
export { WordsLinksViewer } from '../components/resources'
