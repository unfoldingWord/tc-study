/**
 * Translation Academy Resource Type Plugin
 * 
 * Handles Translation Academy - training articles for translators organized by manual
 */

import type { ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { translationAcademyResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/translationAcademy'

// Modal-only: no panel viewer (articles open via EntryViewerRegistry).
export const translationAcademyResourceType: ResourceTypeDefinition = translationAcademyResourceTypeBase
