import type { ResourceInfo } from '../../contexts/types'
import {
  isNotesResourceType,
  isWordsLinksResourceType,
} from '../../utils/normalizeResourceTypeId'
import {
  COMBINED_HELPS_IDS,
  COMBINED_HELPS_RESOURCE_ID,
  OBS_COMBINED_HELPS_RESOURCE_ID,
  combinedHelpsIdForPanel,
  isCombinedHelpsId,
} from './combinedHelpsIds'
import {
  buildCombinedHelpsResourceInfo,
  findHelpsKeysAmongResources,
  shouldInjectCombinedHelps,
  type HelpsScope,
} from './combinedHelpsInjection'
import { applyDualScopeHelpsPolicy } from './helpsPanelPolicy'

export interface WorkspacePanelLike {
  id: string
  resourceKeys: string[]
  activeIndex: number
}

const SCOPE_IDS: Record<HelpsScope, string> = {
  scripture: COMBINED_HELPS_RESOURCE_ID,
  obs: OBS_COMBINED_HELPS_RESOURCE_ID,
}

/** Original-language codes must never drive CombinedHelps pair selection. */
const ORIGINAL_LANG_CODES = new Set(['el-x-koine', 'hbo', 'und', ''])

/**
 * Ensure CombinedHelps synthetic resources exist when both TN and TWL (or OBS twins)
 * are present; remove/reconcile them when a side drops.
 *
 * Unlock 1 (single tab key space): when CombinedHelps is present for a scope,
 * strip that scope's raw TN/TWL from panel.resourceKeys. TN/TWL remain in the
 * package resource map (helps pointers) but are not panel tab membership.
 * Painted tabs === store keys — no permanent visible→raw index map.
 *
 * activeIndex: preserve the user's visible tab by key. Never unconditionally force
 * panel-2 onto CombinedHelps. Activate CombinedHelps only when the previous active
 * key was stripped (raw TN/TWL) or removed.
 */
export function ensureCombinedHelpsInWorkspace(options: {
  resources: Map<string, ResourceInfo> | Record<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  languageCode?: string
  /** Default panel-2 so existing bootstrap stays green. */
  panelId?: string
}): {
  resources: Map<string, ResourceInfo>
  panels: WorkspacePanelLike[]
  injected: string[]
  removed: string[]
} {
  const resourceMap =
    options.resources instanceof Map
      ? new Map(options.resources)
      : new Map(Object.entries(options.resources))

  const panels = options.panels.map((p) => ({
    ...p,
    resourceKeys: [...(p.resourceKeys || [])],
  }))

  const requested = normalizeGatewayLang(options.languageCode)
  const langCode = requested || guessGatewayLanguage(resourceMap, panels)
  const injected: string[] = []
  const removed: string[] = []

  const targetPanelId = options.panelId || 'panel-2'
  const helpsPanel =
    panels.find((p) => p.id === targetPanelId) ||
    panels.find((p) => p.id === 'panel-2') ||
    panels[1]
  const previousActiveKey =
    helpsPanel && helpsPanel.resourceKeys.length > 0
      ? helpsPanel.resourceKeys[
          clampIndex(helpsPanel.activeIndex, helpsPanel.resourceKeys.length)
        ]
      : null

  for (const scope of ['scripture', 'obs'] as HelpsScope[]) {
    const id = combinedHelpsIdForPanel(SCOPE_IDS[scope], targetPanelId)
    const pair = findHelpsKeysAmongResources(resourceMap.values(), scope, { langCode })

    if (!shouldInjectCombinedHelps(pair)) {
      const hadCombined =
        resourceMap.has(id) || panels.some((p) => p.resourceKeys.includes(id))
      if (hadCombined) {
        resourceMap.delete(id)
        for (const panel of panels) {
          panel.resourceKeys = panel.resourceKeys.filter((k) => k !== id)
        }
        removed.push(id)
        if (helpsPanel && !panelHasPrimaryText(helpsPanel, resourceMap)) {
          restoreHelpsPairKeysToPanel(helpsPanel, resourceMap, pair)
        }
      }
      continue
    }

    const info = buildCombinedHelpsResourceInfo({
      scope,
      languageCode: langCode || 'und',
      tnKey: pair.tnKey,
      twlKey: pair.twlKey,
      id,
    })
    if (!resourceMap.has(id)) {
      resourceMap.set(id, info)
      injected.push(id)
    } else {
      // Keep helps pair pointers fresh when TN/TWL keys change
      resourceMap.set(id, {
        ...resourceMap.get(id)!,
        helpsTnResourceKey: pair.tnKey,
        helpsTwlResourceKey: pair.twlKey,
        languageCode: langCode || resourceMap.get(id)!.languageCode,
        language: langCode || resourceMap.get(id)!.language,
      } as ResourceInfo)
    }

    // Dual scripture (same lang): panel-2 is not always helps — never inject there.
    if (helpsPanel && panelHasPrimaryText(helpsPanel, resourceMap)) {
      helpsPanel.resourceKeys = helpsPanel.resourceKeys.filter((k) => k !== id)
      stripScopedHelpsPeersFromPanels(panels, resourceMap, scope)
      continue
    }

    if (helpsPanel && !helpsPanel.resourceKeys.includes(id)) {
      const insertAt = scope === 'scripture' ? 0 : helpsPanel.resourceKeys.length
      helpsPanel.resourceKeys.splice(insertAt, 0, id)
      if (!injected.includes(id)) injected.push(id)
    }

    // Single tab space: CombinedHelps owns the tab; TN/TWL stay in package only
    stripScopedHelpsPeersFromPanels(panels, resourceMap, scope)
  }

  if (helpsPanel && !panelHasPrimaryText(helpsPanel, resourceMap)) {
    normalizePanel2HelpsOrder(helpsPanel)
    helpsPanel.activeIndex = resolvePanel2ActiveIndex({
      resourceKeys: helpsPanel.resourceKeys,
      resources: resourceMap,
      previousActiveKey,
    })
  }

  return { resources: resourceMap, panels, injected, removed }
}

/** Keep CombinedHelps ids at the front of panel-2 so painted order === store order. */
function normalizePanel2HelpsOrder(panel: WorkspacePanelLike): void {
  const preferred = [COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID].filter((id) =>
    panel.resourceKeys.includes(id)
  )
  if (preferred.length === 0) return
  const rest = panel.resourceKeys.filter((k) => !preferred.includes(k))
  panel.resourceKeys = [...preferred, ...rest]
}

/** Drop scoped TN/TWL from every panel's resourceKeys (package map unchanged). */
function stripScopedHelpsPeersFromPanels(
  panels: WorkspacePanelLike[],
  resources: Map<string, ResourceInfo>,
  scope: HelpsScope
): void {
  for (const panel of panels) {
    panel.resourceKeys = panel.resourceKeys.filter((key) => {
      const type = resources.get(key)?.type
      if (isNotesResourceType(type, scope) || isWordsLinksResourceType(type, scope)) {
        return false
      }
      return true
    })
  }
}

/** When CombinedHelps drops, put remaining pair keys back on panel-2 if present in package. */
function restoreHelpsPairKeysToPanel(
  panel: WorkspacePanelLike,
  resources: Map<string, ResourceInfo>,
  pair: { tnKey?: string; twlKey?: string }
): void {
  for (const key of [pair.tnKey, pair.twlKey]) {
    if (!key || !resources.has(key) || panel.resourceKeys.includes(key)) continue
    panel.resourceKeys.push(key)
  }
}

function resolvePanel2ActiveIndex(options: {
  resourceKeys: string[]
  resources: Map<string, ResourceInfo>
  previousActiveKey: string | null | undefined
}): number {
  const { resourceKeys, resources, previousActiveKey } = options
  if (resourceKeys.length === 0) return 0

  const refs = resourceKeys.map((key) => ({
    key,
    type: resources.get(key)?.type,
  }))
  const policy = applyDualScopeHelpsPolicy(refs)
  const hidden = new Set(policy.hiddenKeys)

  // Preserve prior tab when it is still present and not hidden behind CombinedHelps
  if (
    previousActiveKey &&
    resourceKeys.includes(previousActiveKey) &&
    !hidden.has(previousActiveKey)
  ) {
    return resourceKeys.indexOf(previousActiveKey)
  }

  // Previous tab was stripped/removed — land on policy preferred key (CombinedHelps when present)
  if (policy.activeKey && resourceKeys.includes(policy.activeKey)) {
    return resourceKeys.indexOf(policy.activeKey)
  }

  const firstVisible = resourceKeys.find((k) => !hidden.has(k))
  return firstVisible ? resourceKeys.indexOf(firstVisible) : 0
}

function clampIndex(index: number, length: number): number {
  if (length <= 0) return 0
  if (typeof index !== 'number' || index < 0) return 0
  if (index >= length) return length - 1
  return index
}

/** Scripture/OBS on a panel means it is a text pane — CombinedHelps must not land there. */
function panelHasPrimaryText(
  panel: WorkspacePanelLike,
  resources: Map<string, ResourceInfo>
): boolean {
  return panel.resourceKeys.some((key) => {
    if (isCombinedHelpsId(key)) return false
    const r = resources.get(key) || resources.get(baseKey(key))
    if (!r) return false
    const type = String(r.type || '')
    return type === 'scripture' || type === 'obs'
  })
}

function primaryLang(code: string | undefined | null): string {
  if (!code) return ''
  return String(code).trim().split(/[-_/]/)[0]!.toLowerCase()
}

function normalizeGatewayLang(code: string | undefined | null): string {
  const raw = String(code || '').trim().toLowerCase()
  // Check full codes before segmenting — `el-x-koine` must not become gateway `el`
  if (!raw || ORIGINAL_LANG_CODES.has(raw) || raw.startsWith('el-x-')) return ''
  const lang = primaryLang(raw)
  if (!lang || ORIGINAL_LANG_CODES.has(lang)) return ''
  return lang
}

function resourceLang(r: ResourceInfo): string {
  return normalizeGatewayLang(r.languageCode || r.language)
}

function baseKey(key: string): string {
  return key.replace(/#\d+$/, '')
}

/**
 * Pick the gateway language that should own CombinedHelps when callers omit
 * `languageCode` (panel assign / UGNT hydrate / Studio mutations).
 *
 * Priority:
 * 1. Panel-1 primary scripture/OBS when that language still has a TN+TWL pair
 * 2. Existing CombinedHelps language if that language still has a TN+TWL pair
 * 3. Any language that currently has a complete scripture TN+TWL pair
 * 4. First gateway language among package resources
 */
export function guessGatewayLanguage(
  resources: Map<string, ResourceInfo>,
  panels: WorkspacePanelLike[]
): string {
  const panel1 = panels.find((p) => p.id === 'panel-1') || panels[0]
  if (panel1) {
    for (const key of panel1.resourceKeys) {
      const r = resources.get(key) || resources.get(baseKey(key))
      if (!r) continue
      const id = r.key || r.id || ''
      if (isCombinedHelpsId(id) || COMBINED_HELPS_IDS.has(id)) continue
      const lang = resourceLang(r)
      if (!lang) continue
      const type = String(r.type || '')
      if (type !== 'scripture' && type !== 'obs') continue
      const scope: HelpsScope = type === 'obs' ? 'obs' : 'scripture'
      const pair = findHelpsKeysAmongResources(resources.values(), scope, { langCode: lang })
      if (shouldInjectCombinedHelps(pair)) return lang
    }
  }

  for (const id of [COMBINED_HELPS_RESOURCE_ID, OBS_COMBINED_HELPS_RESOURCE_ID]) {
    const ch = resources.get(id)
    if (!ch) continue
    const lang = resourceLang(ch)
    if (!lang) continue
    const scope: HelpsScope = id === OBS_COMBINED_HELPS_RESOURCE_ID ? 'obs' : 'scripture'
    const pair = findHelpsKeysAmongResources(resources.values(), scope, { langCode: lang })
    if (shouldInjectCombinedHelps(pair)) return lang
  }

  const seen = new Set<string>()
  for (const r of resources.values()) {
    const lang = resourceLang(r)
    if (!lang || seen.has(lang)) continue
    seen.add(lang)
    const pair = findHelpsKeysAmongResources(resources.values(), 'scripture', { langCode: lang })
    if (shouldInjectCombinedHelps(pair)) return lang
  }

  for (const r of resources.values()) {
    const lang = resourceLang(r)
    if (lang) return lang
  }

  return 'und'
}
