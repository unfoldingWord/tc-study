/**
 * Open Bible Stories resource type — markdown stories with image frames (Door43 OBS).
 */

import { defineResourceType, type ResourceTypeDefinition } from '@bt-synergy/resource-types'
import { getDownloadPriority } from '../config/loaderConfig'
import { ObsLoader } from '../loaders/ObsLoader'
import { RESOURCE_TYPE_IDS } from '@bt-synergy/resource-catalog'

/** obsResourceType without its viewer; tc-study adds the viewer. */
export const obsResourceTypeBase: ResourceTypeDefinition = defineResourceType({
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
