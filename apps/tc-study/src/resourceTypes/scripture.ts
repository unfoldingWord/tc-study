/**
 * Scripture Resource Type Plugin
 * 
 * Handles Bible texts in USFM format with verse-level precision
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { scriptureResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/scripture'
import { ScriptureViewer } from '../components/resources/ScriptureViewer/index'
import { asResourceViewer } from './asResourceViewer'

export const scriptureResourceType: ResourceTypeDefinition = defineResourceType({
  ...scriptureResourceTypeBase,
  viewer: asResourceViewer(ScriptureViewer),
})

// Re-export for convenience
export { ScriptureViewer } from '../components/resources/ScriptureViewer'
