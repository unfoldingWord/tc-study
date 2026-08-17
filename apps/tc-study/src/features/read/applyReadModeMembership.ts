/**
 * Apply already-loaded catalog membership when a Read pane flips mode.
 * Does not search Door43 or clear the other pane.
 */

import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import { addResource, getBaseResourceKey } from '../workspace/resourceMutations'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
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
    applyCombinedHelpsEnsure(lang, panelId)
    return
  }
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return
  for (const key of textKeys) {
    const parts = key.split('/')
    if (parts.length < 3 || parts[1]?.toLowerCase() !== lang.toLowerCase()) continue
    const base = getBaseResourceKey(key)
    const resource = pkg.resources.get(base) ?? pkg.resources.get(key)
    if (!resource) continue
    const type = String(resource.type || '')
    if (!SCRIPTURE_TYPES.has(type)) continue
    addResource(resource, { panelId, allowMultipleInstances: true })
  }
}
