/**
 * Apply already-loaded catalog membership when a Read pane flips mode.
 * Does not search Door43 or clear the other pane.
 */

import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { isCombinedHelpsId } from '../helps/combinedHelpsIds'
import { addResource, getBaseResourceKey } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { languageCodesMatch } from '../../utils/languageCodeMatch'
import {
  isNotesResourceType,
  isQuestionsResourceType,
  isWordsLinksResourceType,
} from '../../utils/normalizeResourceTypeId'
import type { ReadPanelId, ReadPanelMode } from './readPanelModel'

const SCRIPTURE_TYPES = new Set(['scripture', 'obs'])

export function applyReadModeMembership(
  panelId: ReadPanelId,
  mode: ReadPanelMode,
  languageCode: string | null | undefined,
  textKeys: readonly string[]
): void {
  const lang = languageCode?.trim()
  if (!lang) return
  if (mode === 'helps') {
    addHelpsCompanionMembership(panelId, lang)
    applyCombinedHelpsEnsure(lang, panelId, { forceHelpsPanel: true })
    return
  }
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return
  for (const key of textKeys) {
    const parts = key.split('/')
    if (parts.length < 3 || !languageCodesMatch(parts[1], lang)) continue
    const base = getBaseResourceKey(key)
    const resource = pkg.resources.get(base) ?? pkg.resources.get(key)
    if (!resource) continue
    const type = String(resource.type || '')
    if (!SCRIPTURE_TYPES.has(type)) continue
    addResource(resource, { panelId, allowMultipleInstances: true })
  }
}

/** TQ (and leftover TN/TWL) already in the package — copy onto this helps pane. */
function addHelpsCompanionMembership(panelId: ReadPanelId, languageCode: string): void {
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return
  for (const resource of pkg.resources.values()) {
    const key = resource.key || resource.id
    if (!key || isCombinedHelpsId(key)) continue
    const keyLang = key.includes('/') ? key.split('/')[1] : ''
    const resourceLang = String(resource.languageCode || resource.language || '')
    if (!languageCodesMatch(keyLang || resourceLang, languageCode)) continue
    const type = String(resource.type || '')
    const isHelpsCompanion =
      isQuestionsResourceType(type, 'scripture') ||
      isQuestionsResourceType(type, 'obs') ||
      isNotesResourceType(type, 'scripture') ||
      isNotesResourceType(type, 'obs') ||
      isWordsLinksResourceType(type, 'scripture') ||
      isWordsLinksResourceType(type, 'obs')
    if (!isHelpsCompanion) continue
    addResource(resource, { panelId })
  }
}

/** CombinedHelps / TQ / TN / TWL already on this pane (membership swap succeeded). */
export function panelHasHelpsMembership(panelId: ReadPanelId): boolean {
  const pkg = useWorkspaceStore.getState().currentPackage
  const panel = pkg?.panels.find((p) => p.id === panelId)
  if (!pkg || !panel) return false
  return panel.resourceKeys.some((key) => {
    if (isCombinedHelpsId(key)) return true
    const resource = pkg.resources.get(key) ?? pkg.resources.get(getBaseResourceKey(key))
    if (!resource) return false
    const type = String(resource.type || '')
    return (
      isQuestionsResourceType(type, 'scripture') ||
      isQuestionsResourceType(type, 'obs') ||
      isNotesResourceType(type, 'scripture') ||
      isNotesResourceType(type, 'obs') ||
      isWordsLinksResourceType(type, 'scripture') ||
      isWordsLinksResourceType(type, 'obs')
    )
  })
}
