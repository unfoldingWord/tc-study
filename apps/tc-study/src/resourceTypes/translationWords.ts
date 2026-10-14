/**
 * Translation Words Resource Type Plugin
 * 
 * Handles Translation Words - biblical term definitions organized by category
 */

import type { ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { translationWordsResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/translationWords'

// Modal-only: no panel viewer (articles open via EntryViewerRegistry).
export const translationWordsResourceType: ResourceTypeDefinition = translationWordsResourceTypeBase
