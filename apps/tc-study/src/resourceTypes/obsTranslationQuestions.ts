/**
 * OBS Translation Questions Resource Type Plugin
 *
 * Thin wrapper around TranslationQuestionsLoader/Viewer for Open Bible
 * Stories. The TQ file (tq_OBS.tsv) follows the same column layout as
 * Bible TQ with chapter:verse mapping to story:frame.
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { obsTranslationQuestionsResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/obsTranslationQuestions'
import { TranslationQuestionsViewer } from '../components/resources/TranslationQuestionsViewer'
import { asResourceViewer } from './asResourceViewer'

export const obsTranslationQuestionsResourceType: ResourceTypeDefinition = defineResourceType({
  ...obsTranslationQuestionsResourceTypeBase,
  viewer: asResourceViewer(TranslationQuestionsViewer),
})
