/**
 * 1:1 pane-member entries. Registration ≠ membership.
 * TN/TWL/TW/TA have no pane-member entries (CombinedHelps consumes TN+TWL; TW/TA are modal-only).
 */

import { definePanelEntry, type PanelEntryDefinition } from '@bt-synergy/resource-types'
import { RESOURCE_TYPE_IDS } from './resourceTypeIds'

export const scripturePanelEntry: PanelEntryDefinition = definePanelEntry({
  id: 'primary-scripture',
  displayName: 'Scripture',
  kind: 'pane-member',
  entryType: 'primary-text',
  consumes: [RESOURCE_TYPE_IDS.SCRIPTURE],
  groupId: 'scripture',
})

export const obsPanelEntry: PanelEntryDefinition = definePanelEntry({
  id: 'primary-obs',
  displayName: 'OBS',
  kind: 'pane-member',
  entryType: 'primary-text',
  consumes: [RESOURCE_TYPE_IDS.OBS],
  groupId: 'obs',
})

export const questionsPanelEntry: PanelEntryDefinition = definePanelEntry({
  id: 'questions',
  displayName: 'Questions',
  icon: 'MessageCircleQuestion',
  kind: 'pane-member',
  entryType: 'helps',
  consumes: [RESOURCE_TYPE_IDS.TRANSLATION_QUESTIONS],
  groupId: 'scripture',
})

export const obsQuestionsPanelEntry: PanelEntryDefinition = definePanelEntry({
  id: 'obs-questions',
  displayName: 'OBS Questions',
  icon: 'MessageCircleQuestion',
  kind: 'pane-member',
  entryType: 'helps',
  consumes: [RESOURCE_TYPE_IDS.OBS_QUESTIONS],
  groupId: 'obs',
})
