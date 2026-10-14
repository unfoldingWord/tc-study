/**
 * Open Bible Stories resource type — markdown stories with image frames (Door43 OBS).
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { obsResourceTypeBase } from '@bt-synergy/resource-pipeline/resourceTypes/obs'
import { ObsViewer } from '../components/resources/ObsViewer'
import { asResourceViewer } from './asResourceViewer'

export const obsResourceType: ResourceTypeDefinition = defineResourceType({
  ...obsResourceTypeBase,
  viewer: asResourceViewer(ObsViewer),
})
