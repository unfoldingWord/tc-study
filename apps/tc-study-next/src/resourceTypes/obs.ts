/**
 * Open Bible Stories resource type — markdown stories with image frames (Door43 OBS).
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { getDownloadPriority } from '../config/loaderConfig'
import { ObsViewer } from '../components/resources/ObsViewer'
import { ObsLoader } from '../lib/loaders/ObsLoader'
import { asResourceViewer } from './asResourceViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const obsResourceType: ResourceTypeDefinition = defineResourceType({
  id: RESOURCE_TYPE_IDS.OBS,
  displayName: 'Open Bible Stories',
  description: 'Visual Bible stories in markdown with images (50 stories)',
  icon: 'BookMarked',

  // ===== SCOPE / ROLE =====
  contentRole: 'primary',
  scope: 'obs',

  subjects: ['Open Bible Stories'],
  aliases: ['obs', 'stories', 'open-bible-stories'],

  loader: ObsLoader,
  loaderConfig: {
    debug: false,
  },

  downloadPriority: getDownloadPriority(RESOURCE_TYPE_IDS.OBS),

  viewer: asResourceViewer(ObsViewer),

  features: {
    highlighting: false,
    bookmarking: false,
    search: false,
    navigation: true,
    printing: false,
    export: false,
  },

  settings: {},

  version: '1.0.0',
  author: 'BT Synergy Team',
  license: 'MIT',
})
