/**
 * Combined Helps — composition viewer for TN + TWL (and OBS twins).
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { getDownloadPriority } from '../config/loaderConfig'
import { CombinedHelpsViewer } from '../components/resources/CombinedHelpsViewer'
import { CombinedHelpsLoader } from '../lib/loaders/CombinedHelpsLoader'
import { asResourceViewer } from './asResourceViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const COMBINED_HELPS_TYPE_ID = RESOURCE_TYPE_IDS.COMBINED_HELPS
export const OBS_COMBINED_HELPS_TYPE_ID = RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS

export const combinedHelpsResourceType: ResourceTypeDefinition = defineResourceType({
  id: COMBINED_HELPS_TYPE_ID,
  displayName: 'Helps',
  description: 'Combined Translation Notes and Translation Words Links',
  icon: 'Lightbulb',
  contentRole: 'companion',
  companionFor: ['scripture'],
  subjects: ['Combined Helps'],
  aliases: ['combined-helps', 'helps'],
  loader: CombinedHelpsLoader,
  loaderConfig: { enableMemoryCache: false, debug: false },
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.COMBINED_HELPS),
  viewer: asResourceViewer(CombinedHelpsViewer),
  features: {
    highlighting: true,
    bookmarking: false,
    search: false,
    navigation: true,
    printing: false,
    export: false,
  },
  version: '1.0.0',
})

export const obsCombinedHelpsResourceType: ResourceTypeDefinition = defineResourceType({
  id: OBS_COMBINED_HELPS_TYPE_ID,
  displayName: 'OBS Helps',
  description: 'Combined OBS Translation Notes and Translation Words Links',
  icon: 'Lightbulb',
  contentRole: 'companion',
  companionFor: ['obs'],
  subjects: ['OBS Combined Helps'],
  aliases: ['obs-combined-helps', 'obs-helps'],
  loader: CombinedHelpsLoader,
  loaderConfig: { enableMemoryCache: false, debug: false },
  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS),
  viewer: asResourceViewer(CombinedHelpsViewer),
  features: {
    highlighting: true,
    bookmarking: false,
    search: false,
    navigation: true,
    printing: false,
    export: false,
  },
  version: '1.0.0',
})
