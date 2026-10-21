/**
 * Translation Notes Resource Type Plugin
 * 
 * Handles TSV Translation Notes - translation guidance for specific phrases in Scripture
 * with links to Translation Academy articles
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { translationNotesResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/translationNotes'
import { TranslationNotesViewer } from '../components/resources/TranslationNotesViewer'
import { asResourceViewer } from './asResourceViewer'

export const translationNotesResourceType: ResourceTypeDefinition = defineResourceType({
  ...translationNotesResourceTypeBase,
  viewer: asResourceViewer(TranslationNotesViewer),
})

// Re-export for convenience
export { TranslationNotesViewer } from '../components/resources/TranslationNotesViewer'
