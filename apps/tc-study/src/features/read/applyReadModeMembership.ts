/**
 * Apply already-loaded catalog membership when a Read pane flips mode.
 * Does not search Door43 or clear the other pane.
 */

import { applyCombinedHelpsEnsure } from '../helps/applyCombinedHelpsEnsure'
import type { HelpsScope } from '../helps/compositionInjection'
import { resolveCompositionForPersistId } from '../helps/resolveCompositionEntry'
import { getActivePanelEntryRegistry } from '../../resourceTypes/activeRegistry'
import { addResource, getBaseResourceKey, projectCurrentWorkspacePanels } from '../workspace/resourceMutations'
import { CATALOG_HYDRATE_BATCH } from '../workspace/resourceWriteOptions'
import { useWorkspaceStore } from '../../lib/stores/workspaceStore'
import { languageCodesMatch } from '../../utils/languageCodeMatch'
import type { ReadPanelId, ReadPanelMode } from './readPanelModel'

const SCRIPTURE_TYPES = new Set(['scripture', 'obs'])

export function applyReadModeMembership(
  panelId: ReadPanelId,
  mode: ReadPanelMode,
  languageCode: string | null | undefined,
  textKeys: readonly string[],
  helpsScope: HelpsScope = 'scripture',
  helpsPaneTypeIds: readonly string[] = []
): void {
  const lang = languageCode?.trim()
  if (!lang) return
  if (mode === 'helps') {
    addHelpsCompanionMembership(
      panelId,
      lang,
      resolveHelpsPaneMemberTypeIds(helpsScope, helpsPaneTypeIds)
    )
    applyCombinedHelpsEnsure(lang, panelId, { forceHelpsPanel: true })
    projectCurrentWorkspacePanels()
    useWorkspaceStore.getState().autoSaveWorkspace()
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
    addResource(resource, { panelId, allowMultipleInstances: true, ...CATALOG_HYDRATE_BATCH })
  }
  applyCombinedHelpsEnsure(lang, panelId)
  projectCurrentWorkspacePanels()
  useWorkspaceStore.getState().autoSaveWorkspace()
}

/** Helps-mode pane-member consumes (TQ, OBS-TQ). Empty arg falls back to the registry. */
function resolveHelpsPaneMemberTypeIds(
  helpsScope: HelpsScope,
  helpsPaneTypeIds: readonly string[]
): readonly string[] {
  if (helpsPaneTypeIds.length > 0) return helpsPaneTypeIds
  return getActivePanelEntryRegistry()?.paneMemberConsumedTypeIdsForHelpsMode(helpsScope) ?? []
}

/** Companion types already in the package — copy helps pane-member types onto this pane. */
function addHelpsCompanionMembership(
  panelId: ReadPanelId,
  languageCode: string,
  helpsPaneTypeIds: readonly string[]
): void {
  if (helpsPaneTypeIds.length === 0) return
  const paneTypes = new Set(helpsPaneTypeIds)
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return
  for (const resource of pkg.resources.values()) {
    const key = resource.key || resource.id
    if (!key || resolveCompositionForPersistId(key)) continue
    const keyLang = key.includes('/') ? key.split('/')[1] : ''
    const resourceLang = String(resource.languageCode || resource.language || '')
    if (!languageCodesMatch(keyLang || resourceLang, languageCode)) continue
    const type = String(resource.type || '')
    if (!paneTypes.has(type)) continue
    addResource(resource, { panelId, ...CATALOG_HYDRATE_BATCH })
  }
}

function resourceMatchesLanguage(
  resource: { key?: string; id?: string; languageCode?: string; language?: string },
  languageCode: string
): boolean {
  const key = resource.key || resource.id || ''
  const keyLang = key.includes('/') ? key.split('/')[1] : ''
  const resourceLang = String(resource.languageCode || resource.language || '')
  return languageCodesMatch(keyLang || resourceLang, languageCode)
}

/** Package already has every registry catalog type for this helps language. */
export function packageHasHelpsCatalogTypes(
  languageCode: string | null | undefined,
  catalogTypeIds: readonly string[]
): boolean {
  const lang = languageCode?.trim()
  if (!lang || catalogTypeIds.length === 0) return false
  const pkg = useWorkspaceStore.getState().currentPackage
  if (!pkg) return false
  const present = new Set<string>()
  for (const resource of pkg.resources.values()) {
    if (!resourceMatchesLanguage(resource, lang)) continue
    present.add(String(resource.type || ''))
  }
  return catalogTypeIds.every((id) => present.has(id))
}

function helpsMembershipMatchesScope(
  key: string,
  type: string,
  helpsScope: HelpsScope,
  helpsPaneTypeIds: readonly string[]
): boolean {
  const composition = resolveCompositionForPersistId(key)
  if (composition) {
    return (composition.scope ?? 'scripture') === helpsScope
  }
  if (helpsPaneTypeIds.length > 0) return helpsPaneTypeIds.includes(type)
  return false
}

/** Any catalog pane type or CombinedHelps already on this pane. */
export function panelHasHelpsMembership(
  panelId: ReadPanelId,
  helpsScope: HelpsScope = 'scripture',
  helpsPaneTypeIds: readonly string[] = []
): boolean {
  const pkg = useWorkspaceStore.getState().currentPackage
  const panel = pkg?.panels.find((p) => p.id === panelId)
  if (!pkg || !panel) return false
  return panel.resourceKeys.some((key) => {
    const resource = pkg.resources.get(key) ?? pkg.resources.get(getBaseResourceKey(key))
    const type = String(resource?.type || '')
    return helpsMembershipMatchesScope(key, type, helpsScope, helpsPaneTypeIds)
  })
}
