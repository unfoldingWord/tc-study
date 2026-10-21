/**
 * Translation Questions Resource Type Plugin
 * 
 * Handles Translation Questions - comprehension questions and answers
 * for specific Bible passages
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { translationQuestionsResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/translationQuestions'
import { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
import { asResourceViewer } from './asResourceViewer'

export const translationQuestionsResourceType: ResourceTypeDefinition = defineResourceType({
  ...translationQuestionsResourceTypeBase,
  viewer: asResourceViewer(TranslationQuestionsViewer),
})

// Re-export for convenience
export { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
