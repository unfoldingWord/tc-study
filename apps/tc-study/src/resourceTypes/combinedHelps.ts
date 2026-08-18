/**
 * Combined Helps — composition panel entries for TN + TWL (and OBS twins).
 * Not Door43 resources. Persist instance ids stay `__combined-helps__` /
 * `__combined-helps-obs__`. Both are entryType `helps` (not a third mode).
 */

import { definePanelEntry, type PanelEntryDefinition } from '@bt-synergy/resource-types'
import { CombinedHelpsViewer } from '../components/resources/CombinedHelpsViewer'
import {
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
} from '../features/helps/combinedHelpsIds'
import { asResourceViewer } from './asResourceViewer'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const COMBINED_HELPS_TYPE_ID = RESOURCE_TYPE_IDS.COMBINED_HELPS
export const OBS_COMBINED_HELPS_TYPE_ID = RESOURCE_TYPE_IDS.OBS_COMBINED_HELPS

export const combinedHelpsPanelEntry: PanelEntryDefinition = definePanelEntry({
  id: COMBINED_HELPS_TYPE_ID,
  displayName: 'Helps',
  icon: 'NotebookText',
  kind: 'composition',
  entryType: 'helps',
  consumes: [RESOURCE_TYPE_IDS.TRANSLATION_NOTES, RESOURCE_TYPE_IDS.TRANSLATION_WORDS_LINKS],
  viewer: asResourceViewer(CombinedHelpsViewer),
  groupId: 'scripture',
  scope: 'scripture',
  injectWhen: 'any',
  persistId: COMBINED_HELPS_RESOURCE_ID,
})

export const obsCombinedHelpsPanelEntry: PanelEntryDefinition = definePanelEntry({
  id: OBS_COMBINED_HELPS_TYPE_ID,
  displayName: 'OBS Helps',
  icon: 'NotebookText',
  kind: 'composition',
  entryType: 'helps',
  consumes: [RESOURCE_TYPE_IDS.OBS_NOTES, RESOURCE_TYPE_IDS.OBS_WORDS_LINKS],
  viewer: asResourceViewer(CombinedHelpsViewer),
  groupId: 'obs',
  scope: 'obs',
  injectWhen: 'any',
  persistId: OBS_COMBINED_HELPS_RESOURCE_ID,
})

/** @deprecated Use combinedHelpsPanelEntry */
export const combinedHelpsComposition = combinedHelpsPanelEntry
/** @deprecated Use obsCombinedHelpsPanelEntry */
export const obsCombinedHelpsComposition = obsCombinedHelpsPanelEntry
